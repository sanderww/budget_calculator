// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showUndoToast, UNDO_TOAST_MS } from '../src/lib/undo-toast.js';

describe('showUndoToast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.runAllTimers();
        vi.useRealTimers();
    });

    it('renders a polite status region with the message and an Undo button', () => {
        showUndoToast({ message: 'Deleted "Rent"', onUndo: () => {} });
        const toast = document.getElementById('undo-toast');
        expect(toast.parentElement).toBe(document.body);
        expect(toast.getAttribute('role')).toBe('status');
        expect(toast.getAttribute('aria-live')).toBe('polite');
        expect(toast.textContent).toContain('Deleted "Rent"');
        expect(toast.querySelector('button').textContent).toBe('Undo');
    });
    it('does not take focus', () => {
        showUndoToast({ message: 'm', onUndo: () => {} });
        expect(document.activeElement).toBe(document.body);
    });
    it('calls onUndo once and hides', () => {
        const onUndo = vi.fn();
        showUndoToast({ message: 'm', onUndo });
        document.querySelector('#undo-toast button').click();
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(document.getElementById('undo-toast').hidden).toBe(true);
    });
    it('hides after 8 seconds', () => {
        expect(UNDO_TOAST_MS).toBe(8000);
        showUndoToast({ message: 'm', onUndo: () => {} });
        vi.advanceTimersByTime(7999);
        expect(document.getElementById('undo-toast').hidden).toBe(false);
        vi.advanceTimersByTime(1);
        expect(document.getElementById('undo-toast').hidden).toBe(true);
    });
    it('a later delete replaces the toast and restarts the timer', () => {
        const first = vi.fn();
        const second = vi.fn();
        showUndoToast({ message: 'first', onUndo: first });
        vi.advanceTimersByTime(5000);
        showUndoToast({ message: 'second', onUndo: second });
        expect(document.querySelectorAll('#undo-toast')).toHaveLength(1);
        vi.advanceTimersByTime(5000);
        const toast = document.getElementById('undo-toast');
        expect(toast.hidden).toBe(false);
        expect(toast.textContent).toContain('second');
        toast.querySelector('button').click();
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});
