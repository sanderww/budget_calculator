// Retirement tab: two-pot RA projection, TFSA/lump-sum/annuity maths, and the retirement snapshot.

// ============================================================================
// Retirement Tab
// ============================================================================

export const RETIREMENT_CONSTANTS = {
    RA_ACCESS_AGE: 55,
    DUTCH_PENSION_AGE: 68,
    DUTCH_PENSION_EUR_MONTHLY: 900,
    TFSA_ANNUAL_CAP: 46_000,
    TFSA_LIFETIME_CAP: 500_000,
    RA_DEDUCTION_CAP: 430_000,
    DE_MINIMIS: 360_000,
    LIVING_ANNUITY_THRESHOLD: 150_000,
    LUMP_SUM_TAX_FREE: 550_000,
    SAVINGS_POT_SPLIT: 0.33,
    RETIREMENT_POT_SPLIT: 0.67,
    SAVINGS_POT_MIN_WITHDRAWAL: 2_000,
};

export function fvGrow(pv, annualRatePct, months) {
    const m = Math.max(0, Number(months) || 0);
    const rate = Number(annualRatePct) || 0;
    if (rate === 0 || m === 0) return Number(pv) || 0;
    const r = Math.pow(1 + rate / 100, 1 / 12) - 1;
    return (Number(pv) || 0) * Math.pow(1 + r, m);
}

export function realValue(nominal, cpiPct, years) {
    const cpi = Number(cpiPct) || 0;
    const y = Number(years) || 0;
    if (cpi === 0 || y === 0) return Number(nominal) || 0;
    return (Number(nominal) || 0) / Math.pow(1 + cpi / 100, y);
}

export function monthsToAge(dob, targetAge, today = new Date()) {
    if (!dob) return 0;
    const dobDate = (dob instanceof Date) ? dob : new Date(dob);
    if (Number.isNaN(dobDate.getTime())) return 0;
    const target = new Date(dobDate);
    target.setFullYear(dobDate.getFullYear() + Number(targetAge || 0));
    const months = (target.getFullYear() - today.getFullYear()) * 12
                 + (target.getMonth() - today.getMonth());
    return Math.max(0, months);
}

export function lumpSumTax(amount) {
    const a = Number(amount) || 0;
    if (a <= 550_000) return 0;
    if (a <= 770_000) return (a - 550_000) * 0.18;
    if (a <= 1_155_000) return 39_600 + (a - 770_000) * 0.27;
    return 143_550 + (a - 1_155_000) * 0.36;
}

function _grow(pv, annualRatePct, months, monthlyContrib = 0) {
    const m = Math.max(0, Number(months) || 0);
    const rate = Number(annualRatePct) || 0;
    const principal = Number(pv) || 0;
    const contrib = Number(monthlyContrib) || 0;
    if (m === 0) return principal;
    if (rate === 0) return principal + contrib * m;
    const r = Math.pow(1 + rate / 100, 1 / 12) - 1;
    const grown = principal * Math.pow(1 + r, m);
    if (contrib === 0) return grown;
    const annuity = contrib * (Math.pow(1 + r, m) - 1) / r;
    return grown + annuity;
}

export function raFutureValueTwoPot({
    vestedToday = 0,
    savingsToday = 0,
    retirementToday = 0,
    annualRatePct = 0,
    extraMonthly = 0,
    months = 0,
    savingsPotAnnualWithdrawal = 0,
    taxRatePct = 18,
    offshorePct = 0,
    zarDeprePct = 0,
}) {
    const m = Math.max(0, Math.floor(Number(months) || 0));
    const extra = Math.max(0, Number(extraMonthly) || 0);
    const savingsContribMonthly = extra * RETIREMENT_CONSTANTS.SAVINGS_POT_SPLIT;
    const retirementContribMonthly = extra * RETIREMENT_CONSTANTS.RETIREMENT_POT_SPLIT;

    let vestedFV = _grow(vestedToday, annualRatePct, m);
    let retirementFV = _grow(retirementToday, annualRatePct, m, retirementContribMonthly);

    let savingsFV = Number(savingsToday) || 0;
    let totalWithdrawnGross = 0;
    const yearsFull = Math.floor(m / 12);
    const monthsRemainder = m % 12;
    const wd = Math.max(0, Number(savingsPotAnnualWithdrawal) || 0);
    for (let y = 0; y < yearsFull; y++) {
        savingsFV = _grow(savingsFV, annualRatePct, 12, savingsContribMonthly);
        if (wd > 0) {
            const taken = Math.min(wd, savingsFV);
            savingsFV -= taken;
            totalWithdrawnGross += taken;
        }
    }
    if (monthsRemainder > 0) {
        savingsFV = _grow(savingsFV, annualRatePct, monthsRemainder, savingsContribMonthly);
    }

    let total = vestedFV + savingsFV + retirementFV;
    const off = Math.max(0, Number(offshorePct) || 0);
    const dep = Number(zarDeprePct) || 0;
    if (off > 0 && dep !== 0 && total > 0) {
        const offshoreShare = total * (off / 100);
        const localShare = total - offshoreShare;
        const offshoreGrown = offshoreShare * Math.pow(1 + dep / 100, m / 12);
        const newTotal = localShare + offshoreGrown;
        const scale = newTotal / total;
        vestedFV *= scale;
        savingsFV *= scale;
        retirementFV *= scale;
        total = newTotal;
    }

    const tax = Math.max(0, Math.min(100, Number(taxRatePct) || 0)) / 100;
    const totalWithdrawnNet = totalWithdrawnGross * (1 - tax);
    return {
        vested: vestedFV,
        savings: savingsFV,
        retirement: retirementFV,
        total,
        savingsPotWithdrawnGross: totalWithdrawnGross,
        savingsPotWithdrawnNet: totalWithdrawnNet,
        savingsPotTaxPaid: totalWithdrawnGross - totalWithdrawnNet,
    };
}

export function tfsaLifetimeContributions(transactions = []) {
    const cap = RETIREMENT_CONSTANTS.TFSA_LIFETIME_CAP;
    const contributed = transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const clamped = Math.max(0, contributed);
    const remaining = Math.max(0, cap - clamped);
    const percentUsed = cap > 0 ? Math.min(100, (clamped / cap) * 100) : 0;
    return { contributed, lifetimeCap: cap, remaining, percentUsed };
}

export function tfsaFutureValue({
    currentValue = 0,
    annualRatePct = 0,
    monthsToRetirement = 0,
    optEnabled = false,
    transactions = [],
}, today = new Date()) {
    const months = Math.max(0, Math.floor(Number(monthsToRetirement) || 0));
    let fv = fvGrow(currentValue, annualRatePct, months);
    if (!optEnabled || months === 0) return fv;

    // SA tax year: 1 March → end Feb. February = month 1, March = month 2.
    const taxYearStart = (today.getMonth() >= 2)
        ? new Date(today.getFullYear(), 2, 1)
        : new Date(today.getFullYear() - 1, 2, 1);

    const lifetimeContributed = (transactions || [])
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const thisYearContrib = (transactions || [])
        .filter(t => t.date && new Date(t.date) >= taxYearStart)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    let lifetimeRemaining = Math.max(0, RETIREMENT_CONSTANTS.TFSA_LIFETIME_CAP - lifetimeContributed);
    if (lifetimeRemaining === 0) return fv;

    const thisYearRemaining = Math.max(0, RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP - thisYearContrib);

    // Months until end of current tax year (end Feb of next year, equivalently start of next March).
    const nextTaxYearStart = new Date(taxYearStart.getFullYear() + 1, 2, 1);
    const monthsToTaxYearEnd = Math.max(0,
        (nextTaxYearStart.getFullYear() - today.getFullYear()) * 12
        + (nextTaxYearStart.getMonth() - today.getMonth()));

    if (thisYearRemaining > 0) {
        const topUp = Math.min(thisYearRemaining, lifetimeRemaining);
        fv += fvGrow(topUp, annualRatePct, months);
        lifetimeRemaining -= topUp;
    }

    const yearsAvailable = months > monthsToTaxYearEnd
        ? Math.max(0, Math.floor((months - monthsToTaxYearEnd - 1) / 12) + 1)
        : 0;
    const yearsByCap = Math.floor(lifetimeRemaining / RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP);
    const fullYears = Math.min(yearsByCap, yearsAvailable);
    for (let y = 0; y < fullYears; y++) {
        const monthsRemaining = months - monthsToTaxYearEnd - y * 12;
        if (monthsRemaining < 0) break;
        fv += fvGrow(RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP, annualRatePct, monthsRemaining);
        lifetimeRemaining -= RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP;
    }

    if (lifetimeRemaining > 0 && lifetimeRemaining < RETIREMENT_CONSTANTS.TFSA_ANNUAL_CAP) {
        const monthsRemaining = months - monthsToTaxYearEnd - fullYears * 12;
        if (monthsRemaining >= 0) {
            fv += fvGrow(lifetimeRemaining, annualRatePct, monthsRemaining);
        }
    }

    return fv;
}

export function raCommutationLumpSum(raPot, commuteThird) {
    if (!commuteThird) return { gross: 0, tax: 0, net: 0 };
    const gross = (Number(raPot) || 0) / 3;
    const tax = lumpSumTax(gross);
    return { gross, tax, net: gross - tax };
}

export function raMonthlyIncome(raPot, withdrawalRatePct, taxRatePct, commuteThird) {
    const pot = Number(raPot) || 0;
    if (pot < RETIREMENT_CONSTANTS.DE_MINIMIS) {
        return { gross: 0, net: 0, fullCommutation: true };
    }
    const annuitisedPot = commuteThird ? pot * 2 / 3 : pot;
    const rate = (Number(withdrawalRatePct) || 0) / 100;
    const tax = Math.max(0, Math.min(100, Number(taxRatePct) || 0)) / 100;
    const gross = annuitisedPot * rate / 12;
    const net = gross * (1 - tax);
    return { gross, net, fullCommutation: false };
}

export function projectLivingAnnuityDepletion(
    annuitisedPot, annualReturnPct, withdrawalRatePct, retirementAge,
    horizonAge = 95,
    threshold = RETIREMENT_CONSTANTS.LIVING_ANNUITY_THRESHOLD
) {
    let pot = Number(annuitisedPot) || 0;
    const rate = Number(annualReturnPct) || 0;
    const wdRate = (Number(withdrawalRatePct) || 0) / 100;
    if (pot <= 0) return null;
    const r = (rate === 0) ? 0 : Math.pow(1 + rate / 100, 1 / 12) - 1;
    const monthlyDrawdownRate = wdRate / 12;
    const startAge = Math.max(0, Math.floor(Number(retirementAge) || 0));
    const endAge = Math.max(startAge, Math.floor(Number(horizonAge) || 95));
    for (let age = startAge; age < endAge; age++) {
        for (let m = 0; m < 12; m++) {
            const drawdown = pot * monthlyDrawdownRate;
            pot = pot * (1 + r) - drawdown;
            if (pot < threshold) {
                return {
                    ageAtThreshold: age + (m + 1) / 12,
                    potAtThreshold: Math.max(0, pot),
                    canCommute: true,
                    commutationTax: lumpSumTax(Math.max(0, pot)),
                };
            }
        }
    }
    return null;
}

const RETIREMENT_DEFAULT_PARAMS = {
    dob: '1985-08-08',
    retirement_age: 65,
    life_expectancy: 95,
    lump_sum_drawdown_return_pct: 6,
    withdrawal_rate_pct: 4,
    cpi_pct: 5,
    show_real_terms: 1,
    effective_tax_rate_pct: 18,

    return_discretionary_pct: 10,
    return_tfsa_pct: 10,
    return_crypto_pct: 7,
    return_ra_pct: 10,

    offshore_discretionary_pct: 0,
    offshore_tfsa_pct: 0,
    zar_depreciation_pct: 2,

    opt_include_discretionary: 1,
    opt_include_tfsa: 1,
    opt_include_crypto: 1,

    ra_commute_third: 1,
    ra_savings_component_pct: 33,
    ra_vested_balance: 0,
    opt_savings_pot_withdrawal_enabled: 0,
    opt_savings_pot_withdrawal_annual: 0,

    opt_dutch_enabled: 0,
    opt_dutch_eur_zar: 20,
    opt_dutch_age: 68,
    opt_dutch_eur_monthly: 900,
    opt_tfsa_enabled: 0,
    opt_ra_monthly_enabled: 0,
    opt_ra_monthly_amount: 10_000,
    opt_house_enabled: 0,
    opt_house_value: 2_000_000,
    opt_inheritance_enabled: 0,
    opt_inheritance_eur: 0,
    opt_bond_enabled: 0,
    opt_bond_balance: 0,
};

export function getDefaultRetirementParams() {
    return { ...RETIREMENT_DEFAULT_PARAMS };
}

export function parseRetirementCSV(text) {
    const params = { ...RETIREMENT_DEFAULT_PARAMS };
    const rows = (text || '').split('\n').map(r => r.trim()).filter(r => r !== '');
    rows.forEach(row => {
        const cols = row.split(',').map(s => s.trim());
        if (cols[0] !== 'param') return;
        const key = cols[1];
        const raw = cols[2];
        if (!key || raw === undefined) return;
        if (key === 'dob') {
            params[key] = raw;
            return;
        }
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) params[key] = v;
    });
    return params;
}

export function calculateRetirementSnapshot({
    params,
    discretionaryToday = 0,
    tfsaToday = 0,
    cryptoToday = 0,
    tfsaTransactions = [],
    raPotToday = 0,
    raAnnualContributionLast12 = 0,
}, today = new Date()) {
    const p = { ...RETIREMENT_DEFAULT_PARAMS, ...(params || {}) };
    const ageNow = (() => {
        const dob = new Date(p.dob);
        if (Number.isNaN(dob.getTime())) return null;
        const ms = today - dob;
        return ms <= 0 ? 0 : ms / (365.25 * 24 * 60 * 60 * 1000);
    })();

    const dutchAge = Number(p.opt_dutch_age) || RETIREMENT_CONSTANTS.DUTCH_PENSION_AGE;
    const dutchEurMonthly = Number(p.opt_dutch_eur_monthly) || 0;

    const monthsToRetirement = monthsToAge(p.dob, p.retirement_age, today);
    const monthsTo55 = monthsToAge(p.dob, RETIREMENT_CONSTANTS.RA_ACCESS_AGE, today);
    const monthsTo68 = monthsToAge(p.dob, dutchAge, today);

    const yearsToRet = monthsToRetirement / 12;
    const yearsTo55 = monthsTo55 / 12;
    const yearsTo68 = monthsTo68 / 12;

    // Vested today (clamped to RA pot)
    const vestedToday = Math.max(0, Math.min(Number(p.ra_vested_balance) || 0, raPotToday));
    const postSep2024 = Math.max(0, raPotToday - vestedToday);
    const savingsToday = postSep2024 * RETIREMENT_CONSTANTS.SAVINGS_POT_SPLIT;
    const retirementToday = postSep2024 * RETIREMENT_CONSTANTS.RETIREMENT_POT_SPLIT;

    const extraMonthly = (p.opt_ra_monthly_enabled ? Number(p.opt_ra_monthly_amount) || 0 : 0);
    const savingsWd = (p.opt_savings_pot_withdrawal_enabled ? Number(p.opt_savings_pot_withdrawal_annual) || 0 : 0);

    // Two-phase RA projection: extras + savings-pot withdrawals run only until retirement_age,
    // then the pot grows passively for any remaining months to the target snapshot age.
    const _projectRa = (monthsTarget, includeExtras = true) => {
        const t = Math.max(0, Math.floor(Number(monthsTarget) || 0));
        const monthsContrib = Math.min(t, monthsToRetirement);
        const monthsPassive = Math.max(0, t - monthsToRetirement);
        const phase1 = raFutureValueTwoPot({
            vestedToday, savingsToday, retirementToday,
            annualRatePct: p.return_ra_pct,
            extraMonthly: includeExtras ? extraMonthly : 0,
            months: monthsContrib,
            savingsPotAnnualWithdrawal: includeExtras ? savingsWd : 0,
            taxRatePct: p.effective_tax_rate_pct,
        });
        if (monthsPassive === 0) return phase1;
        const phase2 = raFutureValueTwoPot({
            vestedToday: phase1.vested,
            savingsToday: phase1.savings,
            retirementToday: phase1.retirement,
            annualRatePct: p.return_ra_pct,
            extraMonthly: 0, months: monthsPassive,
            savingsPotAnnualWithdrawal: 0,
            taxRatePct: p.effective_tax_rate_pct,
        });
        // Carry the phase-1 withdrawal totals (no withdrawals occur in passive phase).
        return {
            vested: phase2.vested,
            savings: phase2.savings,
            retirement: phase2.retirement,
            total: phase2.total,
            savingsPotWithdrawnGross: phase1.savingsPotWithdrawnGross,
            savingsPotWithdrawnNet: phase1.savingsPotWithdrawnNet,
            savingsPotTaxPaid: phase1.savingsPotTaxPaid,
        };
    };

    const raAtRetirement = _projectRa(monthsToRetirement);
    const raAt55 = _projectRa(monthsTo55);
    const raAt68 = _projectRa(monthsTo68);
    // "Current" RA (no extras, no withdrawals) — for the side-by-side comparison at age 55.
    const raAt55Current = _projectRa(monthsTo55, /* includeExtras */ false);

    // Discretionary / TFSA / Crypto FV at any target age (passive — no contributions in current spec).
    // Each fund is gated by its `opt_include_*` flag — when unchecked, the fund is treated as
    // unavailable at retirement and contributes 0 to every snapshot age.
    const incDisc = (p.opt_include_discretionary === 0 || p.opt_include_discretionary === false) ? 0 : 1;
    const incTfsa = (p.opt_include_tfsa === 0 || p.opt_include_tfsa === false) ? 0 : 1;
    const incCrypto = (p.opt_include_crypto === 0 || p.opt_include_crypto === false) ? 0 : 1;
    const fvAt = (months) => ({
        discretionary: incDisc * fvGrow(discretionaryToday, p.return_discretionary_pct, months),
        tfsa: incTfsa * tfsaFutureValue({
            currentValue: tfsaToday,
            annualRatePct: p.return_tfsa_pct,
            monthsToRetirement: months,
            optEnabled: !!p.opt_tfsa_enabled,
            transactions: tfsaTransactions,
        }, today),
        tfsaCurrent: incTfsa * fvGrow(tfsaToday, p.return_tfsa_pct, months),
        crypto: incCrypto * fvGrow(cryptoToday, p.return_crypto_pct, months),
    });
    const liquid55 = fvAt(monthsTo55);
    const liquid68 = fvAt(monthsTo68);
    const liquidAtRet = fvAt(monthsToRetirement);

    // Optional lump-sum components.
    const dutchEurZar = Number(p.opt_dutch_eur_zar) || 0;
    const inheritanceZar = (p.opt_inheritance_enabled ? (Number(p.opt_inheritance_eur) || 0) * dutchEurZar : 0);
    const houseSale = (p.opt_house_enabled ? Number(p.opt_house_value) || 0 : 0);
    const bondPayoff = (p.opt_bond_enabled ? Number(p.opt_bond_balance) || 0 : 0);

    const commute = !!p.ra_commute_third;
    const commutation55 = raCommutationLumpSum(raAt55.total, commute);
    const commutationRet = raCommutationLumpSum(raAtRetirement.total, commute);

    // De minimis at 55: when the RA pot at 55 is below R360k the law requires full commutation
    // regardless of the ra_commute_third flag. Show the net full-pot lump sum so the snapshot
    // reflects the money that is actually accessible, not zero.
    const ra55DeMinimis = raAt55.total > 0 && raAt55.total < RETIREMENT_CONSTANTS.DE_MINIMIS
        && commutation55.net === 0;
    const commutation55Net = ra55DeMinimis
        ? Math.max(0, raAt55.total - lumpSumTax(raAt55.total))
        : commutation55.net;

    // Lump-sum totals
    const projectedFundsAtRet =
        liquidAtRet.discretionary + liquidAtRet.tfsa + liquidAtRet.crypto
        + commutationRet.net
        + raAtRetirement.savingsPotWithdrawnNet
        + houseSale + inheritanceZar
        - bondPayoff;
    const projectedFunds55 =
        liquid55.discretionary + liquid55.tfsa + liquid55.crypto
        + commutation55Net
        + raAt55.savingsPotWithdrawnNet
        + houseSale + inheritanceZar
        - bondPayoff;
    const currentFunds55 =
        liquid55.discretionary + liquid55.tfsaCurrent + liquid55.crypto
        + (ra55DeMinimis ? commutation55Net : 0);
    const projectedFunds68 =
        liquid68.discretionary + liquid68.tfsa + liquid68.crypto
        + commutation55Net  // commutation taken at 55
        + raAt55.savingsPotWithdrawnNet
        + houseSale + inheritanceZar
        - bondPayoff;

    // Monthly income
    const monthly55Projected = raMonthlyIncome(raAt55.total, p.withdrawal_rate_pct, p.effective_tax_rate_pct, commute);
    const monthly55Current = raMonthlyIncome(raAt55Current.total, p.withdrawal_rate_pct, p.effective_tax_rate_pct, false);
    const monthlyAtRetirement = (p.retirement_age < RETIREMENT_CONSTANTS.RA_ACCESS_AGE)
        ? { gross: 0, net: 0, fullCommutation: false }
        : raMonthlyIncome(raAtRetirement.total, p.withdrawal_rate_pct, p.effective_tax_rate_pct, commute);

    const dutchMonthlyZAR = (p.opt_dutch_enabled ? dutchEurMonthly * dutchEurZar : 0);
    const tax = Math.max(0, Math.min(100, Number(p.effective_tax_rate_pct) || 0)) / 100;
    const dutchMonthlyNet = dutchMonthlyZAR * (1 - tax);

    // Living-annuity depletion: walk the annuitised pot from when drawdown actually starts
    // (max(retirement_age, 55)) forward through the horizon.
    const drawdownStartAge = Math.max(p.retirement_age, RETIREMENT_CONSTANTS.RA_ACCESS_AGE);
    const annuitisedAtDrawdownStart = (() => {
        const pot = (p.retirement_age >= RETIREMENT_CONSTANTS.RA_ACCESS_AGE)
            ? raAtRetirement.total
            : raAt55.total;
        return commute ? pot * 2 / 3 : pot;
    })();
    const depletion = projectLivingAnnuityDepletion(
        annuitisedAtDrawdownStart, p.return_ra_pct, p.withdrawal_rate_pct,
        drawdownStartAge
    );

    // Pot used for "monthly income at 68" snapshot:
    //  - retAge <= 55: drawdown started at 55, snapshot uses raAt55 (constant withdrawal rate).
    //  - 55 < retAge < 68: drawdown started at retAge, pot at 68 = raAt68 (passive growth from retAge to 68).
    //  - retAge >= 68: no drawdown yet at 68; closest equivalent is the pot at retirement_age.
    const potForIncomeAt68 = (() => {
        if (p.retirement_age <= RETIREMENT_CONSTANTS.RA_ACCESS_AGE) return raAt55.total;
        if (p.retirement_age < dutchAge) return raAt68.total;
        return raAtRetirement.total;
    })();
    const monthly68Projected = (() => {
        if (depletion && depletion.ageAtThreshold <= dutchAge) {
            // Pot has run out / commuted before age 68.
            return { gross: dutchMonthlyZAR, net: dutchMonthlyNet, fullCommutation: false };
        }
        const ra68 = raMonthlyIncome(potForIncomeAt68, p.withdrawal_rate_pct, p.effective_tax_rate_pct, commute);
        return {
            gross: ra68.gross + dutchMonthlyZAR,
            net: ra68.net + dutchMonthlyNet,
            fullCommutation: ra68.fullCommutation,
        };
    })();

    // Real-terms deflation if requested.
    const deflate = (n, years) => p.show_real_terms ? realValue(n, p.cpi_pct, years) : n;

    // Lump-sum monthly drawdown: PMT-style annuity that depletes the at-retirement lump
    // sum exactly to zero at age `life_expectancy`, assuming the residual continues to
    // earn `lump_sum_drawdown_return_pct` (annual, compounded monthly).
    //   monthly rate r = (1 + R)^(1/12) - 1
    //   PMT = PV * r / (1 - (1 + r)^-N)
    // Falls back to PV / N when r is 0 (or near zero).
    const lifeExpectancy = Math.max(p.retirement_age, Number(p.life_expectancy) || 0);
    const monthsLumpDrawdown = Math.max(0, Math.round((lifeExpectancy - p.retirement_age) * 12));
    const lumpSumDrawdownReturnPct = Number(p.lump_sum_drawdown_return_pct) || 0;
    const lumpSumMonthlyNominal = (() => {
        if (monthsLumpDrawdown <= 0 || projectedFundsAtRet <= 0) return 0;
        const monthlyRate = Math.pow(1 + lumpSumDrawdownReturnPct / 100, 1 / 12) - 1;
        if (Math.abs(monthlyRate) < 1e-9) return projectedFundsAtRet / monthsLumpDrawdown;
        return projectedFundsAtRet * monthlyRate / (1 - Math.pow(1 + monthlyRate, -monthsLumpDrawdown));
    })();
    const maxMonthly55Nominal = monthly55Projected.net + lumpSumMonthlyNominal;
    const maxMonthly68Nominal = monthly68Projected.net + lumpSumMonthlyNominal;

    return {
        ageNow,
        monthsToRetirement, monthsTo55, monthsTo68,
        yearsToRet, yearsTo55, yearsTo68,
        params: p,
        ra: {
            vestedToday, savingsToday, retirementToday,
            atRetirement: raAtRetirement,
            at55: raAt55,
            at68: raAt68,
            commutationAtRetirement: commutationRet,
            commutationAt55: commutation55,
            depletion,
            extraMonthly,
            annualContributionLast12: raAnnualContributionLast12,
            deductionCapHeadroom: Math.max(0, RETIREMENT_CONSTANTS.RA_DEDUCTION_CAP - raAnnualContributionLast12),
        },
        liquid: { at55: liquid55, at68: liquid68, atRetirement: liquidAtRet },
        lumpSum: {
            current55: deflate(currentFunds55, yearsTo55),
            projected55: deflate(projectedFunds55, yearsTo55),
            projected68: deflate(projectedFunds68, yearsTo68),
            atRetirement: deflate(projectedFundsAtRet, yearsToRet),
            houseSale, inheritanceZar, bondPayoff,
            ra55Commutation: commutation55,
            ra55IsDeMinimis: ra55DeMinimis,
            raCommutationAtRetirement: commutationRet,
        },
        monthly: {
            current55: { gross: deflate(monthly55Current.gross, yearsTo55), net: deflate(monthly55Current.net, yearsTo55), fullCommutation: monthly55Current.fullCommutation },
            projected55: { gross: deflate(monthly55Projected.gross, yearsTo55), net: deflate(monthly55Projected.net, yearsTo55), fullCommutation: monthly55Projected.fullCommutation },
            projected68: { gross: deflate(monthly68Projected.gross, yearsTo68), net: deflate(monthly68Projected.net, yearsTo68), fullCommutation: monthly68Projected.fullCommutation },
            atRetirement: { gross: deflate(monthlyAtRetirement.gross, yearsToRet), net: deflate(monthlyAtRetirement.net, yearsToRet), fullCommutation: monthlyAtRetirement.fullCommutation },
            dutchMonthlyZAR: deflate(dutchMonthlyZAR, yearsTo68),
            dutchMonthlyNet: deflate(dutchMonthlyNet, yearsTo68),
            lumpSumDrawdown: deflate(lumpSumMonthlyNominal, yearsToRet),
            maxAt55: deflate(maxMonthly55Nominal, yearsTo55),
            maxAt68: deflate(maxMonthly68Nominal, yearsTo68),
            lumpSumDrawdownMonths: monthsLumpDrawdown,
            lumpSumDrawdownReturnPct,
            lifeExpectancy,
        },
    };
}
