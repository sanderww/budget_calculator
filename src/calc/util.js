// Shared utilities: record id generation and XIRR.

// Internal id helper used by CSV row parsers
export const generateRecordId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function xirr(cashFlows, guess = 0.1) {
    const xnpv = (rate) => cashFlows.reduce((sum, item) => {
        const days = (item.date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
        return sum + item.amount / Math.pow(1 + rate, days / 365);
    }, 0);

    let rate = guess;
    for (let i = 0; i < 20; i++) {
        const fValue = xnpv(rate);
        if (Math.abs(fValue) < 1) break;

        const derivative = cashFlows.reduce((sum, item) => {
            const days = (item.date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
            return sum - (days / 365) * item.amount / Math.pow(1 + rate, (days / 365) + 1);
        }, 0);

        const newRate = rate - fValue / derivative;
        if (Math.abs(newRate - rate) < 0.0001) { rate = newRate; break; }
        rate = newRate;
    }
    return rate;
}
