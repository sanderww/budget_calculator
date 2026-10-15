// Switching between real data and sample data (functional §8).
//
// Every save reads its data and its save key when it is sent, so nothing that
// belongs to one mode may still be waiting when the mode flips:
//   1. the undo toast is dismissed (its Undo would write into the new mode);
//   2. every debounced save is sent now, in the old mode, and awaited;
//   3. the switch is refused while any save has failed, because a retry
//      after the switch would send the other mode's data;
//   4. only then does the flag flip and every dataset reload.
// While the datasets reload, saves are suspended: an edit in that window
// changes data that is about to be replaced.
// If the new mode fails to load, the flag reverts and the original mode is
// reloaded; if that fails too, memory may hold a mix of both modes, so all
// saves are blocked until the page is reloaded.
import { isTestMode, setTestMode, flushPendingSaves, hasFailedSaves,
         setSaveStatus, blockSaves, suspendSaves } from './persistence.js';
import { hideUndoToast } from '../lib/undo-toast.js';

let switching = false;

export async function switchDataMode({ loadAll, onModeChange = () => {} }) {
    if (switching) return false;
    switching = true;
    try {
        hideUndoToast();
        await flushPendingSaves();
        // No await between this check and setTestMode: no edit can slip in.
        if (hasFailedSaves()) {
            setSaveStatus('retry-first');
            return false;
        }
        const original = isTestMode();
        suspendSaves(true);
        setTestMode(!original);
        onModeChange();
        try {
            await loadAll();
            return true;
        } catch (err) {
            console.error('Data mode load failed, reverting:', err);
            setTestMode(original);
            onModeChange();
            try {
                await loadAll();
            } catch (reloadErr) {
                console.error('Reloading the original data failed:', reloadErr);
                blockSaves();
            }
            return false;
        }
    } finally {
        suspendSaves(false);
        switching = false;
    }
}
