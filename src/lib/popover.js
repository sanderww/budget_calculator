// Shared accessible popover: a trigger button toggles a panel. Used for help
// text and for the per-tab overflow (⋯) menus.
// Markup contract: <button data-popover-trigger aria-controls="panel-id">
// and <div id="panel-id" class="hidden">. Add data-popover-menu to the panel
// to close it after any button inside it is clicked.

export function initPopover(trigger, panel) {
    const isOpen = () => !panel.classList.contains('hidden');
    const set = (open) => {
        panel.classList.toggle('hidden', !open);
        trigger.setAttribute('aria-expanded', String(open));
    };
    set(false);

    trigger.addEventListener('click', () => set(!isOpen()));
    document.addEventListener('click', (e) => {
        if (!isOpen()) return;
        if (trigger.contains(e.target) || panel.contains(e.target)) return;
        set(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !isOpen()) return;
        set(false);
        trigger.focus();
    });
    if (panel.hasAttribute('data-popover-menu')) {
        panel.addEventListener('click', (e) => {
            if (e.target.closest('button')) set(false);
        });
    }
    return { open: () => set(true), close: () => set(false), isOpen };
}

export function initPopovers(root = document) {
    root.querySelectorAll('[data-popover-trigger]').forEach((trigger) => {
        const panel = document.getElementById(trigger.getAttribute('aria-controls'));
        if (panel) initPopover(trigger, panel);
    });
}
