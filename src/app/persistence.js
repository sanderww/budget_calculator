// Test-mode switching, server save helpers, and the shared config layer.
import { parseConfigJSON, generateConfigJSON } from '../calculations.js';

let testMode = false;
export const isTestMode = () => testMode;
export const setTestMode = (v) => { testMode = !!v; };

export const dbPath = (filename) => testMode ? `db/test/${filename}` : `db/${filename}`;
// name -> { timer, csvFn } of debounced saves that have not fired yet.
const _saveTimers = {};
// Saves that have been sent and not yet answered.
const _inFlight = new Set();
// Set when a failed data-mode switch could leave a mix of real and sample
// data in memory. While set, nothing is written and the chip asks for a reload.
let _savesBlocked = false;
// Set while a data-mode switch reloads every dataset. An edit made in that
// window changes data that is about to be replaced, so its save is dropped.
let _savesSuspended = false;
export const suspendSaves = (on) => { _savesSuspended = !!on; };
const _savesClosed = () => _savesBlocked || _savesSuspended;

export const debouncedSave = (name, csvFn, delayMs = 800) => {
    if (_savesClosed()) return;
    clearTimeout(_saveTimers[name]?.timer);
    const timer = setTimeout(() => {
        delete _saveTimers[name];
        saveToServer(name, csvFn);
    }, delayMs);
    _saveTimers[name] = { timer, csvFn };
};

// Header chip reflecting the auto-save state. Failures stay visible (as a
// "Save failed - Retry" button) until the next successful save so the user
// can't miss a write that never landed.
let _pendingSaves = 0;
const _failedSaves = new Map(); // name -> csvFn of saves that failed since their last success
const SAVE_STATUS = {
    saving:        { text: 'Saving…', tone: 'border-slate-200 text-slate-500' },
    saved:         { text: 'All changes saved', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    error:         { text: '⚠ Save failed — Retry', retry: true },
    'retry-first': { text: '⚠ Save failed — Retry before switching data', retry: true },
    blocked:       { text: '⚠ Data failed to load — reload the page', tone: 'border-red-200 bg-red-50 text-red-600' },
};
const RETRY_TONE = 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer';
export const setSaveStatus = (state) => {
    const el = document.getElementById('save-status');
    if (!el) return;
    if (_savesBlocked) state = 'blocked';
    const { text, tone, retry = false } = SAVE_STATUS[state];
    el.disabled = !retry;
    el.textContent = text;
    el.className = `flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${retry ? RETRY_TONE : tone}`;
};

const _send = async (name, csvFn) => {
    const csv = csvFn();
    // Read the mode once, before any await, so a save always lands in the
    // mode it was sent from.
    const mode = testMode;
    _pendingSaves++;
    setSaveStatus('saving');
    try {
        const headers = { 'Content-Type': 'text/csv' };
        if (mode) headers['X-Test-Mode'] = 'true';
        const res = await fetch(`/api/save/${mode ? `test_${name}` : name}`, {
            method: 'POST',
            headers,
            body: csv
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        _failedSaves.delete(name);
    } catch (err) {
        _failedSaves.set(name, csvFn);
        console.error(`Failed to save ${name}:`, err);
    } finally {
        _pendingSaves--;
        if (_pendingSaves <= 0) setSaveStatus(_failedSaves.size ? 'error' : 'saved');
    }
};

export const saveToServer = (name, csvFn) => {
    if (_savesClosed()) return Promise.resolve();
    const p = _send(name, csvFn);
    _inFlight.add(p);
    p.finally(() => _inFlight.delete(p));
    return p;
};

// Re-send every save that failed since its last success.
export const retryFailedSaves = () =>
    Promise.all([..._failedSaves].map(([name, csvFn]) => saveToServer(name, csvFn)));

export const hasFailedSaves = () => _failedSaves.size > 0;

// Send every debounced save now (reading its data and key in the current
// mode) and wait for every save in flight. Loops because an edit made while
// waiting queues a new save. Called before the data mode changes.
export const flushPendingSaves = async () => {
    while (Object.keys(_saveTimers).length || _inFlight.size) {
        const queued = Object.entries(_saveTimers).map(([name, { timer, csvFn }]) => {
            clearTimeout(timer);
            delete _saveTimers[name];
            return saveToServer(name, csvFn);
        });
        await Promise.all([...queued, ..._inFlight]);
    }
};

// Stop all writes for the rest of the page's life (see _savesBlocked).
export const blockSaves = () => {
    _savesBlocked = true;
    Object.entries(_saveTimers).forEach(([name, { timer }]) => {
        clearTimeout(timer);
        delete _saveTimers[name];
    });
    setSaveStatus('blocked');
};

// Single source of truth for every param-style value (config.public.json +
// config.private.json). Callers must always go through getConfigMap() —
// loadConfigFromServer replaces the object. A missing file reads as empty; a
// fetch that fails outright rejects (after resetting the map).
let configMap = {};
export const getConfigMap = () => configMap;

export const loadConfigFromServer = async () => {
    try {
        const [pubRes, privRes] = await Promise.all([
            fetch(dbPath('config.public.json'), { cache: 'no-store' }),
            fetch(dbPath('config.private.json'), { cache: 'no-store' }),
        ]);
        const pubText  = pubRes.ok  ? await pubRes.text()  : '';
        const privText = privRes.ok ? await privRes.text() : '';
        configMap = { ...parseConfigJSON(pubText), ...parseConfigJSON(privText) };
    } catch (err) {
        // Rethrown so a data-mode switch can revert (functional §8).
        configMap = {};
        throw err;
    }
};

export const persistConfig = () => {
    debouncedSave('config_public',
        () => generateConfigJSON(configMap, { public: true }));
    debouncedSave('config_private',
        () => generateConfigJSON(configMap, { public: false }));
};

export const setConfig = (key, value) => {
    configMap[key] = value;
    persistConfig();
};

export const unsetConfig = (key) => {
    delete configMap[key];
    persistConfig();
};
