// @vitest-environment happy-dom
// Switching between real and sample data (UX-0.5, functional §8). fetch is
// stubbed: no request leaves the process. The save name used here is a probe
// name ("probe"), so the two possible keys are /api/save/probe (real mode)
// and /api/save/test_probe (sample mode); the tests assert which one the
// stubbed fetch received.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let persistence;
let dataMode;
let undoToast;
let posts;
let failPosts;

const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        posts.push({ url, body: opts.body, testHeader: opts.headers?.['X-Test-Mode'] });
        return failPosts ? { ok: false, status: 500 } : { ok: true };
    }
    return { ok: true, text: async () => '' };
});

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<span role="status" aria-live="polite"><button id="save-status" type="button"></button></span>';
    posts = [];
    failPosts = false;
    persistence = await import('../src/app/persistence.js');
    undoToast = await import('../src/lib/undo-toast.js');
    dataMode = await import('../src/app/data-mode.js');
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    persistence.setTestMode(true);
});

const noLoad = async () => {};

describe('switchDataMode: pending saves are flushed in the mode they were queued in', () => {
    it('a save queued in real mode goes to the real key before switching to sample data', async () => {
        persistence.setTestMode(false);
        persistence.debouncedSave('probe', () => 'real-csv');
        const loadModes = [];
        await dataMode.switchDataMode({ loadAll: async () => { loadModes.push(persistence.isTestMode()); } });
        expect(posts).toEqual([{ url: '/api/save/probe', body: 'real-csv', testHeader: undefined }]);
        expect(persistence.isTestMode()).toBe(true);
        expect(loadModes).toEqual([true]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(posts).toHaveLength(1); // the debounce timer was cleared, nothing fires later
    });

    it('a save queued in sample mode goes to the test_ key before switching to real data', async () => {
        persistence.setTestMode(true);
        persistence.debouncedSave('probe', () => 'sample-csv');
        await dataMode.switchDataMode({ loadAll: noLoad });
        expect(posts).toEqual([{ url: '/api/save/test_probe', body: 'sample-csv', testHeader: 'true' }]);
        expect(persistence.isTestMode()).toBe(false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(posts).toHaveLength(1);
    });

    it('refuses to switch while a save has failed, and the chip asks for a retry first', async () => {
        persistence.setTestMode(true);
        failPosts = true;
        await persistence.saveToServer('probe', () => 'x');
        const loadAll = vi.fn(noLoad);
        const switched = await dataMode.switchDataMode({ loadAll });
        expect(switched).toBe(false);
        expect(persistence.isTestMode()).toBe(true);
        expect(loadAll).not.toHaveBeenCalled();
        const chip = document.getElementById('save-status');
        expect(chip.textContent).toMatch(/retry/i);
        expect(chip.disabled).toBe(false);
    });

    it('refuses to switch when the flushed save itself fails', async () => {
        persistence.setTestMode(true);
        failPosts = true;
        persistence.debouncedSave('probe', () => 'x');
        const loadAll = vi.fn(noLoad);
        expect(await dataMode.switchDataMode({ loadAll })).toBe(false);
        expect(persistence.isTestMode()).toBe(true);
        expect(loadAll).not.toHaveBeenCalled();
        // The retry still targets the mode the save was queued in.
        failPosts = false;
        posts = [];
        await persistence.retryFailedSaves();
        expect(posts.map(p => p.url)).toEqual(['/api/save/test_probe']);
    });

    it('flushPendingSaves sends the queued save immediately with the current mode', async () => {
        persistence.setTestMode(true);
        persistence.debouncedSave('probe', () => 'now');
        await persistence.flushPendingSaves();
        expect(posts.map(p => p.url)).toEqual(['/api/save/test_probe']);
        await vi.advanceTimersByTimeAsync(2000);
        expect(posts).toHaveLength(1);
    });
});

describe('switchDataMode: undo toast', () => {
    it('dismisses an open undo toast before switching', async () => {
        persistence.setTestMode(true);
        const onUndo = vi.fn();
        undoToast.showUndoToast({ message: 'Deleted "x"', onUndo });
        expect(document.getElementById('undo-toast').hidden).toBe(false);
        await dataMode.switchDataMode({ loadAll: noLoad });
        expect(document.getElementById('undo-toast').hidden).toBe(true);
        expect(onUndo).not.toHaveBeenCalled();
    });
});

describe('switchDataMode: a failed load', () => {
    it('reverts the flag and reloads the original mode', async () => {
        persistence.setTestMode(false);
        const loadModes = [];
        const onModeChange = vi.fn();
        const loadAll = vi.fn(async () => {
            loadModes.push(persistence.isTestMode());
            if (loadModes.length === 1) throw new Error('sample load failed');
        });
        const switched = await dataMode.switchDataMode({ loadAll, onModeChange });
        expect(switched).toBe(false);
        expect(persistence.isTestMode()).toBe(false);
        expect(loadModes).toEqual([true, false]); // sample attempt, then real reload
        expect(onModeChange).toHaveBeenCalledTimes(2);
        // Saving still works after a clean reload.
        persistence.debouncedSave('probe', () => 'ok');
        await vi.advanceTimersByTimeAsync(1000);
        expect(posts.map(p => p.url)).toEqual(['/api/save/probe']);
    });

    it('blocks all saves and shows an error when the reload also fails', async () => {
        persistence.setTestMode(true);
        const loadAll = vi.fn(async () => { throw new Error('offline'); });
        expect(await dataMode.switchDataMode({ loadAll })).toBe(false);
        expect(persistence.isTestMode()).toBe(true);
        expect(loadAll).toHaveBeenCalledTimes(2);
        const chip = document.getElementById('save-status');
        expect(chip.textContent).toMatch(/reload the page/i);
        expect(chip.disabled).toBe(true);
        // Memory may hold a mix of both modes: nothing is written any more.
        persistence.debouncedSave('probe', () => 'mixed');
        await vi.advanceTimersByTimeAsync(1000);
        await persistence.saveToServer('probe', () => 'mixed');
        expect(posts).toEqual([]);
        expect(chip.textContent).toMatch(/reload the page/i);
    });

    it('ignores a second toggle while a switch is in progress', async () => {
        persistence.setTestMode(true);
        let release;
        const loadAll = vi.fn(() => new Promise((r) => { release = r; }));
        const first = dataMode.switchDataMode({ loadAll });
        expect(await dataMode.switchDataMode({ loadAll })).toBe(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(loadAll).toHaveBeenCalledTimes(1);
        release();
        expect(await first).toBe(true);
        expect(persistence.isTestMode()).toBe(false);
    });
});
