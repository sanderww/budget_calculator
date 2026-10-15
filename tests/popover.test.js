// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { initPopover, initPopovers } from '../src/lib/popover.js';

describe('popover', () => {
    let trigger, panel;
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="t" data-popover-trigger aria-controls="p">?</button>
            <div id="p" class="hidden"><button id="item">Item</button></div>
            <div id="outside"></div>`;
        trigger = document.getElementById('t');
        panel = document.getElementById('p');
        initPopovers();
    });

    it('starts closed and toggles with aria-expanded', () => {
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        trigger.click();
        expect(panel.classList.contains('hidden')).toBe(false);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        trigger.click();
        expect(panel.classList.contains('hidden')).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on Escape', () => {
        trigger.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(panel.classList.contains('hidden')).toBe(true);
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on outside click but not on inside click', () => {
        trigger.click();
        document.getElementById('item').click();
        expect(panel.classList.contains('hidden')).toBe(false);
        document.getElementById('outside').click();
        expect(panel.classList.contains('hidden')).toBe(true);
    });

    it('menu panels close after an item is clicked', () => {
        panel.setAttribute('data-popover-menu', '');
        const t2 = document.createElement('button');
        initPopover(t2, panel);
        t2.click();
        document.getElementById('item').click();
        expect(panel.classList.contains('hidden')).toBe(true);
    });
});
