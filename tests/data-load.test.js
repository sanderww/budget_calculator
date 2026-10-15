// @vitest-environment happy-dom
// Loading and importing data across the real/sample switch (functional §8),
// driven through the real page markup and controllers. fetch is stubbed and
// test mode is on, so only test_ save keys are ever used; the CSVs below are
// sample-shaped, never the real files.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../src/charts/chart_retirement.js', () => ({
    renderRetirementScenarioCharts: () => {},
}));

const html = readFileSync(resolve(process.cwd(), 'src/budget_calculator.html'), 'utf8');
const bodyOpen = html.indexOf('<body');
const body = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '');

const INV_CSV = 'Date,Description,amount,account type,crypto_value\n'
    + '01-01-2025,Example ETF,5000,TFSA,\n';
const DEBT_CSV = 'Date,Description,Amount\n2025-05-31,Extra Repayment,4000\n';
const RA_CSV = '2025-03-01,Contribution,1000\n';
const RET_CSV = 'param,retirement_age,60\n';

let persistence;
let inv;
let debt;
let ra;
let undoToast;
let saves;
let offline;
let missing;

const fetchMock = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
        saves.push({ url, body: opts.body });
        return { ok: true };
    }
    if (offline) throw new TypeError('Failed to fetch');
    const u = String(url);
    if (missing.some(m => u.endsWith(m))) return { ok: false, status: 404, text: async () => '' };
    if (u.endsWith('transactions/investments.csv')) return { ok: true, text: async () => INV_CSV };
    if (u.endsWith('transactions/debt.csv')) return { ok: true, text: async () => DEBT_CSV };
    if (u.endsWith('transactions/ra.csv')) return { ok: true, text: async () => RA_CSV };
    return { ok: true, text: async () => '' };
});

beforeAll(async () => {
    document.body.innerHTML = body;
    persistence = await import('../src/app/persistence.js');
    persistence.setTestMode(true);
    undoToast = await import('../src/lib/undo-toast.js');
    inv = await import('../src/app/investments.js');
    debt = await import('../src/app/debt.js');
    ra = await import('../src/app/ra.js');
    await import('../src/app/retirement.js');
});

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    saves = [];
    offline = false;
    missing = [];
    persistence.setTestMode(true);
});

afterEach(async () => {
    offline = false;
    await persistence.flushPendingSaves();
    expect(saves.every(s => s.url.startsWith('/api/save/test_'))).toBe(true);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Loaders report failures so a data-mode switch can revert', () => {
    it('loadConfigFromServer rejects when the config cannot be fetched', async () => {
        offline = true;
        await expect(persistence.loadConfigFromServer()).rejects.toThrow();
    });

    it('loadInvestmentCSVFromServer rejects when the file cannot be fetched', async () => {
        offline = true;
        await expect(inv.loadInvestmentCSVFromServer()).rejects.toThrow();
    });

    it('a missing investments file clears the transactions of the previous mode', async () => {
        await inv.loadInvestmentCSVFromServer();
        expect(inv.getInvestmentData().transactions).toHaveLength(1);
        missing = ['transactions/investments.csv'];
        await inv.loadInvestmentCSVFromServer();
        expect(inv.getInvestmentData().transactions).toEqual([]);
        expect(inv.getInvestmentData().currentValues).toEqual({ Discretionary: 0, TFSA: 0, Crypto: 0 });
    });

    it('loadDebtCSVFromServer rejects when the file cannot be fetched', async () => {
        offline = true;
        await expect(debt.loadDebtCSVFromServer()).rejects.toThrow();
    });

    it('loadRaCSVFromServer rejects when the file cannot be fetched', async () => {
        offline = true;
        await expect(ra.loadRaCSVFromServer()).rejects.toThrow();
        expect(ra.getRaState().transactions).toEqual([]);
    });
});

describe('Import CSV dismisses an open undo toast', () => {
    const openToast = () => {
        const onUndo = vi.fn();
        undoToast.showUndoToast({ message: 'Deleted "x"', onUndo });
        expect(document.getElementById('undo-toast').hidden).toBe(false);
        return onUndo;
    };
    const pickerFor = (csv) => async () => [{ getFile: async () => new File([csv], 'import.csv') }];
    // RA and Retirement build a hidden <input type="file">; capture it.
    const captureFileInput = () => {
        const create = document.createElement.bind(document);
        const box = {};
        vi.spyOn(document, 'createElement').mockImplementation((tag, ...rest) => {
            const el = create(tag, ...rest);
            if (tag === 'input') {
                box.input = el;
                el.click = () => {};
            }
            return el;
        });
        return box;
    };
    const chooseFile = (input, csv) =>
        input.onchange({ target: { files: [new File([csv], 'import.csv')] } });
    const toastHidden = () => document.getElementById('undo-toast').hidden;

    it('Investments', async () => {
        const onUndo = openToast();
        vi.stubGlobal('showOpenFilePicker', pickerFor(INV_CSV));
        document.getElementById('load-inv-csv').click();
        await vi.waitFor(() => expect(toastHidden()).toBe(true));
        expect(onUndo).not.toHaveBeenCalled();
    });

    it('Debt', async () => {
        const onUndo = openToast();
        vi.stubGlobal('showOpenFilePicker', pickerFor(DEBT_CSV));
        document.getElementById('load-debt-csv').click();
        await vi.waitFor(() => expect(toastHidden()).toBe(true));
        expect(onUndo).not.toHaveBeenCalled();
    });

    it('RA', async () => {
        const onUndo = openToast();
        const box = captureFileInput();
        document.getElementById('load-ra-csv').click();
        chooseFile(box.input, RA_CSV);
        await vi.waitFor(() => expect(toastHidden()).toBe(true));
        expect(onUndo).not.toHaveBeenCalled();
    });

    it('Retirement', async () => {
        const onUndo = openToast();
        const box = captureFileInput();
        document.getElementById('ret-load-csv').click();
        chooseFile(box.input, RET_CSV);
        await vi.waitFor(() => expect(toastHidden()).toBe(true));
        expect(onUndo).not.toHaveBeenCalled();
    });
});
