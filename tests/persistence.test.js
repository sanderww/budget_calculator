// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveToServer, retryFailedSaves, setTestMode } from '../src/app/persistence.js';

const okRes = { ok: true };
const failRes = { ok: false, status: 500 };

describe('retryFailedSaves', () => {
    beforeEach(() => {
        document.body.innerHTML = '<button id="save-status"></button>';
        setTestMode(true); // test_* keys only
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

    const urls = (fetchMock) => fetchMock.mock.calls.map(c => c[0]);

    it('re-sends only the names that failed', async () => {
        const fetchMock = vi.fn(async (url) => url.endsWith('test_budget') ? failRes : okRes);
        vi.stubGlobal('fetch', fetchMock);
        await saveToServer('budget', () => 'b');
        await saveToServer('investments', () => 'i');
        expect(document.getElementById('save-status').textContent).toContain('Save failed');
        fetchMock.mockClear();
        await retryFailedSaves();
        expect(urls(fetchMock)).toEqual(['/api/save/test_budget']);
    });

    it('a success clears the failure and the chip', async () => {
        let fail = true;
        const fetchMock = vi.fn(async () => (fail ? failRes : okRes));
        vi.stubGlobal('fetch', fetchMock);
        await saveToServer('debt', () => 'd');
        fail = false;
        await retryFailedSaves();
        expect(document.getElementById('save-status').textContent).toBe('All changes saved');
        fetchMock.mockClear();
        await retryFailedSaves();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('#save-status markup', () => {
    it('is a real button inside a polite live region (the button keeps its role)', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
        document.body.innerHTML = html.slice(html.indexOf('<header'), html.indexOf('</header>') + 9);
        const chip = document.getElementById('save-status');
        expect(chip.tagName).toBe('BUTTON');
        expect(chip.hasAttribute('role')).toBe(false);
        expect(chip.parentElement.getAttribute('role')).toBe('status');
        expect(chip.parentElement.getAttribute('aria-live')).toBe('polite');
    });
});
