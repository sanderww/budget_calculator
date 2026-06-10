// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderPerformancePanel } from '../src/app/perf-panel.js';
import { fmtZAR } from '../src/format.js';

const makeEls = () => {
    const el = () => document.createElement('div');
    return { invested: el(), gain: el(), ann: el(), money: el(),
             savingsGain: el(), netVsSavings: el(), tax: el(), netAfterTax: el() };
};

describe('renderPerformancePanel', () => {
    let els;
    beforeEach(() => { els = makeEls(); });

    it('renders the zero state when nothing is invested', () => {
        renderPerformancePanel({ totalInvested: 0 }, els, { fmt: fmtZAR });
        expect(els.gain.textContent).toBe('0.00%');
        expect(els.gain.className).toBe('font-bold text-slate-800');
        expect(els.netVsSavings.className).toBe('font-bold text-slate-800');
        expect(els.tax.textContent).toBe('R 0.00');
    });

    it('mutes net-vs-savings when mutedNet is set (discretionary)', () => {
        renderPerformancePanel({ totalInvested: 0 }, els, { fmt: fmtZAR, mutedNet: true });
        expect(els.netVsSavings.className).toBe('font-medium text-slate-400');
    });

    it('renders positive returns in green with a leading plus', () => {
        renderPerformancePanel({
            totalInvested: 100, percentageReturn: 10, absoluteReturn: 10,
            annualizedReturn: 12.5, savingsGain: 6, netVsSavings: 4,
            estimatedTax: 0, netVsSavingsAfterTax: 4,
        }, els, { fmt: fmtZAR });
        expect(els.gain.textContent).toBe('+10.00%');
        expect(els.gain.className).toBe('font-bold text-green-600');
        expect(els.ann.textContent).toBe('+12.50%');
        expect(els.netVsSavings.className).toBe('font-bold text-green-600');
        expect(els.savingsGain.textContent.startsWith('+')).toBe(true);
    });

    it('renders negative returns in red and N/A annualized in slate', () => {
        renderPerformancePanel({
            totalInvested: 100, percentageReturn: -5, absoluteReturn: -5,
            annualizedReturn: null, savingsGain: 6, netVsSavings: -11,
            estimatedTax: 2, netVsSavingsAfterTax: -13,
        }, els, { fmt: fmtZAR });
        expect(els.gain.className).toBe('font-bold text-red-600');
        expect(els.ann.textContent).toBe('N/A');
        expect(els.ann.className).toBe('font-bold text-slate-400');
        expect(els.netVsSavings.className).toBe('font-bold text-red-500');
        expect(els.tax.textContent).toBe(`-${fmtZAR(2)}`);
    });

    it('tolerates absent optional elements', () => {
        expect(() => renderPerformancePanel({ totalInvested: 0 },
            { gain: document.createElement('div') }, { fmt: fmtZAR })).not.toThrow();
    });
});
