// Test-mode switching, server save helpers, and the shared config layer.
import { parseConfigJSON, generateConfigJSON } from '../calculations.js';

let testMode = false;
export const isTestMode = () => testMode;
export const setTestMode = (v) => { testMode = !!v; };

export const dbPath = (filename) => testMode ? `db/test/${filename}` : `db/${filename}`;
const saveKey = (name) => testMode ? `test_${name}` : name;

const _saveTimers = {};
export const debouncedSave = (name, csvFn, btnId, delayMs = 800) => {
    clearTimeout(_saveTimers[name]);
    _saveTimers[name] = setTimeout(() => saveToServer(name, csvFn, btnId), delayMs);
};

// Header chip reflecting the auto-save state. Failures stay visible until the
// next successful save so the user can't miss a write that never landed.
let _pendingSaves = 0;
let _saveFailed = false;
const _setSaveStatus = (state) => {
    const el = document.getElementById('save-status');
    if (!el) return;
    const base = 'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium';
    if (state === 'saving') {
        el.textContent = 'Saving…';
        el.className = `${base} border-slate-200 text-slate-500`;
    } else if (state === 'saved') {
        el.textContent = 'All changes saved';
        el.className = `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
    } else if (state === 'error') {
        el.textContent = '⚠ Save failed';
        el.className = `${base} border-red-200 bg-red-50 text-red-600`;
    }
};

export const saveToServer = async (name, csvFn, btnId) => {
    const csv = csvFn();
    _pendingSaves++;
    _setSaveStatus('saving');
    try {
        const headers = { 'Content-Type': 'text/csv' };
        if (testMode) headers['X-Test-Mode'] = 'true';
        const res = await fetch(`/api/save/${saveKey(name)}`, {
            method: 'POST',
            headers,
            body: csv
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        _saveFailed = false;
        if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = 'Saved!';
                setTimeout(() => btn.innerHTML = orig, 1500);
            }
        }
    } catch (err) {
        _saveFailed = true;
        console.error(`Failed to save ${name}:`, err);
    } finally {
        _pendingSaves--;
        if (_pendingSaves <= 0) _setSaveStatus(_saveFailed ? 'error' : 'saved');
    }
};

// Single source of truth for every param-style value (config.public.json +
// config.private.json). Callers must always go through getConfigMap() —
// loadConfigFromServer replaces the object.
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
        console.error('Failed to load config:', err);
        configMap = {};
    }
};

export const persistConfig = () => {
    debouncedSave('config_public',
        () => generateConfigJSON(configMap, { public: true }),
        null);
    debouncedSave('config_private',
        () => generateConfigJSON(configMap, { public: false }),
        null);
};

export const setConfig = (key, value) => {
    configMap[key] = value;
    persistConfig();
};

export const unsetConfig = (key) => {
    delete configMap[key];
    persistConfig();
};
