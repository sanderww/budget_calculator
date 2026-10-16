// Pairs an existing number (or formatted amount) input with a range slider
// placed right after it. The input stays the source of truth: dragging the
// slider writes the input's value and fires its 'input' event, so whatever
// already listens to the input (persist, re-render) runs unchanged. Typing in
// the input moves the slider. Values outside [min, max] stay valid in the
// input; the slider just sits at its end.
//
// Returns sync(), which moves the slider to the input's current value. Call it
// after setting input.value from code (a programmatic set fires no event).
export function attachSlider(input, { min, max, step, label, parse = parseFloat, format = String }) {
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.className = 'param-range w-full mt-1.5';
    range.dataset.sliderFor = input.id;
    if (label) range.setAttribute('aria-label', label);
    input.insertAdjacentElement('afterend', range);

    const sync = () => {
        const v = parse(input.value);
        if (Number.isFinite(v)) range.value = String(Math.min(max, Math.max(min, v)));
    };
    range.addEventListener('input', () => {
        input.value = format(Number(range.value));
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.addEventListener('input', sync);
    sync();
    return sync;
}
