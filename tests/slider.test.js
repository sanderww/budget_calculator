// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachSlider } from '../src/lib/slider.js';
import { parseAmount, fmtAmountInput } from '../src/lib/format.js';

describe('attachSlider', () => {
    let input;
    beforeEach(() => {
        document.body.innerHTML = '<div><input type="number" id="age" value="65"><p id="hint"></p></div>';
        input = document.getElementById('age');
    });

    it('inserts a labelled range right after the input, at its value', () => {
        attachSlider(input, { min: 50, max: 75, step: 1, label: 'Retirement age' });
        const range = input.nextElementSibling;
        expect(range.type).toBe('range');
        expect(range.getAttribute('aria-label')).toBe('Retirement age');
        expect(range.dataset.sliderFor).toBe('age');
        expect(range.value).toBe('65');
        expect(range.nextElementSibling.id).toBe('hint');
    });

    it('dragging writes the input and fires its input event', () => {
        const onInput = vi.fn(() => input.value);
        input.addEventListener('input', onInput);
        attachSlider(input, { min: 50, max: 75, step: 1 });
        const range = input.nextElementSibling;
        range.value = '60';
        range.dispatchEvent(new Event('input'));
        expect(input.value).toBe('60');
        expect(onInput).toHaveBeenCalledTimes(1);
        expect(onInput.mock.results[0].value).toBe('60');
    });

    it('typing moves the slider, clamped to its range; the input keeps the exact value', () => {
        attachSlider(input, { min: 50, max: 75, step: 1 });
        const range = input.nextElementSibling;
        input.value = '70';
        input.dispatchEvent(new Event('input'));
        expect(range.value).toBe('70');
        input.value = '90';
        input.dispatchEvent(new Event('input'));
        expect(range.value).toBe('75');
        expect(input.value).toBe('90');
    });

    it('sync() follows a programmatic set; unparseable values leave the slider alone', () => {
        const sync = attachSlider(input, { min: 50, max: 75, step: 1 });
        const range = input.nextElementSibling;
        input.value = '55';
        sync();
        expect(range.value).toBe('55');
        input.value = '';
        sync();
        expect(range.value).toBe('55');
    });

    it('works with formatted amount inputs', () => {
        document.body.innerHTML = '<input type="text" id="amt" value="10,000">';
        const amt = document.getElementById('amt');
        attachSlider(amt, { min: 0, max: 50000, step: 500, parse: parseAmount, format: fmtAmountInput });
        const range = amt.nextElementSibling;
        expect(range.value).toBe('10000');
        range.value = '12500';
        range.dispatchEvent(new Event('input'));
        expect(amt.value).toBe('12,500');
        expect(parseAmount(amt.value)).toBe(12500);
    });
});
