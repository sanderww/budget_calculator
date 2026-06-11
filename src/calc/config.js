// Config sharing: public-parameter whitelist and config JSON parse/generate.

export const PUBLIC_PARAMS = new Set([
    'life_expectancy',
    'lump_sum_drawdown_return_pct',
    'withdrawal_rate_pct',
    'cpi_pct',
    'return_discretionary_pct',
    'return_tfsa_pct',
    'return_crypto_pct',
    'return_ra_pct',
    'offshore_discretionary_pct',
    'offshore_tfsa_pct',
    'zar_depreciation_pct',
    'ra_savings_component_pct',
    'nominal_return_pct',
]);

export function parseConfigJSON(text) {
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_e) {
        return {};
    }
}

export function generateConfigJSON(map, opts) {
    const wantPublic = !!(opts && opts.public);
    const keys = Object.keys(map || {})
        .filter(k => PUBLIC_PARAMS.has(k) === wantPublic)
        .sort();
    const filtered = {};
    keys.forEach(k => { filtered[k] = map[k]; });
    return JSON.stringify(filtered, null, 2);
}
