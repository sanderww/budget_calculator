// A single bottom-of-viewport toast offering Undo after a delete.
// One element is appended to <body> and reused: a new delete replaces the
// previous toast. The Undo button is focusable but never steals focus.

export const UNDO_TOAST_MS = 8000;

let toastEl = null;
let timer = null;

const hide = () => {
    clearTimeout(timer);
    timer = null;
    if (toastEl) toastEl.hidden = true;
};

export function showUndoToast({ message, onUndo }) {
    if (!toastEl || !toastEl.isConnected) {
        toastEl = document.createElement('div');
        toastEl.id = 'undo-toast';
        toastEl.className = 'undo-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastEl);
    }
    clearTimeout(timer);

    const text = document.createElement('span');
    text.className = 'undo-toast-message';
    text.textContent = message;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'undo-toast-btn';
    btn.textContent = 'Undo';
    btn.addEventListener('click', () => {
        hide();
        onUndo();
    });

    toastEl.replaceChildren(text, btn);
    toastEl.hidden = false;
    timer = setTimeout(hide, UNDO_TOAST_MS);
}
