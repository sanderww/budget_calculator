# Budget Calculator Requirement Specification

## 1. Overview
The **South African Budget Calculator** is a personal finance dashboard designed to help users manage their budget, track investments, and calculate debt repayment scenarios. It is a single-page HTML application utilizing Local Storage or CSV files for data persistence and Tailwind CSS for styling.

## 2. Functional Modules

The application consists of three main modules (tabs):
1.  **Budget Calculator**
2.  **Investment Tracker**
3.  **Debt Calculator**

---

## 3. Budget Calculator

### 3.1 Inputs
*   **Savings**: Current total savings amount.
*   **Debts**: List of debt items (Description, Amount).
*   **Provisions**: List of provision items (Description, Amount, Date [Optional]).
*   **Future Costs**: List of anticipated future costs (Description, Amount, Date [Optional]).
*   **Available Money**: Amount of money available at the end of the month for allocation.
*   **Future Date**: Target date for "Future Net Amount" calculation.
*   **Allocation Percentages**:
    *   Mortgage Repayment (%)
    *   EFT (%)
    *   Crypto (%)

### 3.2 Calculations

#### 3.2.1 Net Amount Calculations
*   **Current Net Amount**:
    $$ \text{Current Net} = \text{Savings} - \sum(\text{Debts}) - \sum(\text{Provisions}) $$
*   **Future Net Amount**:
    $$ \text{Future Net} = \text{Current Net} - \sum(\text{Future Costs where Date } \le \text{Target Date}) $$

#### 3.2.2 Monthly Savings Target
Calculates the monthly savings required to reach a non-negative Future Net Amount by the target date.

1.  **Calculate Months Remaining**:
    $$ \text{Days} = \text{Target Date} - \text{Today} $$
    $$ \text{Months} = \lceil \text{Days} / 30 \rceil $$
    (If Months < 1, defaults to 1)

2.  **Calculate Target**:
    *   **Case A**: Future Net Amount < 0 (Deficit)
        $$ \text{Target} = |\text{Future Net Amount}| / \text{Months} $$
    *   **Case B**: Future Net Amount < Current Net Amount (Spending Capital)
        $$ \text{Target} = (\text{Current Net} - \text{Future Net}) / \text{Months} $$
    *   **Case C**: Current Net < 0 AND Future Net >= 0 (Recovering from Debt)
        $$ \text{Target} = (|\text{Current Net}| + \text{Future Net}) / \text{Months} $$

#### 3.2.3 Monthly Allocation
Allocates `Available Money` after satisfying the `Monthly Savings Target`.

1.  **Remaining Money**:
    $$ \text{Remaining} = \text{Available Money} - \text{Monthly Savings Target} $$
2.  **Validation**:
    *   Allocations must sum to <= 100%.
    *   Remaining Money must be >= 0.
3.  **Allocations**:
    *   $$ \text{Mortgage Allocation} = (\text{Remaining} \times \text{Mortgage \%}) / 100 $$
    *   $$ \text{EFT Allocation} = (\text{Remaining} \times \text{EFT \%}) / 100 $$
    *   $$ \text{Crypto Allocation} = (\text{Remaining} \times \text{Crypto \%}) / 100 $$

### 3.3 Outputs
*   Money Saved / Recovered summary.
*   Breakdown of totals (Savings, Debts, Provisions, Future Costs).
*   Visual indication (Green/Red) for positive/negative net amounts.
*   Detailed allocation breakdown (Required Savings + Percentage allocations).

---

## 4. Investment Tracker

### 4.1 Inputs
*   **Transactions**: List of investment events.
    *   Date
    *   Description
    *   Amount
    *   Account Type (Discretionary, TFSA, Crypto)
*   **Current Values**: Manually entered current total value for each account type.

### 4.2 Calculations

#### 4.2.1 Performance Metrics (Per Type)
*   **Total Invested**:
    $$ \sum(\text{Transaction Amounts for Type}) $$
*   **Absolute Gain/Loss**:
    $$ \text{Gain} \% = \left( \frac{\text{Current Value} - \text{Total Invested}}{\text{Total Invested}} \right) \times 100 $$
    $$ \text{Gain Amount} = \text{Current Value} - \text{Total Invested} $$

#### 4.2.2 Annualized Return (Approximate Time-Weighted)
Calculates the Compound Annual Growth Rate (CAGR) based on the "average age" of the money invested.

1.  **Weighted Age Sum**:
    $$ \sum (\text{Transaction Amount} \times (\text{Today} - \text{Transaction Date in Days})) $$
2.  **Average Age (Years)**:
    $$ \text{Years Held} = \frac{\text{Weighted Age Sum}}{\text{Total Invested} \times 365.25} $$
3.  **Annualized Return**:
    *   Only calculated if `Years Held > 0.1` and `Total Invested > 0` and `Current Value / Total Invested > 0`.
    $$ \text{CAGR} \% = \left[ \left( \frac{\text{Current Value}}{\text{Total Invested}} \right)^{\frac{1}{\text{Years Held}}} - 1 \right] \times 100 $$

---

## 5. Debt Calculator

### 5.1 Inputs
*   **Loan Parameters**:
    *   Total Loan Amount (Principal)
    *   Total Monthly Repayment
    *   Monthly Service Fee
    *   Interest Rate (%)
    *   Next Payment Date
*   **Extra Repayments**: List of one-off extra payments (Date, Amount).

### 5.2 Calculations & Simulation

The calculators uses a forward-simulation model to compare a **Baseline** scenario (no extra payments) vs an **Actual** scenario (with extra payments).

#### 5.2.1 Initialization (Back-Calculation)
Because the user enters the *current* balance and *next* payment date, but extra repayments might have happened in the past relative to the "Start Date" of the simulation, the system first standardizes the "Start Date".

1.  **Determine Simulation Start**: Earliest of (`Next Payment Date` adjusted to 1st of month) OR (`Earliest Extra Repayment Date` adjusted to 1st of month).
2.  **Reverse Simulation**: Calculates the principal at `Simulation Start` by working backwards from the `Current Principal` at `Next Payment Date`.
    $$ \text{PrevBal} = \frac{\text{CurrentBal} + \text{EffectiveRepayment} + \text{MonthlyExtras}}{1 + \text{MonthlyRate}} $$

#### 5.2.2 Forward Simulation
Iterates month-by-month for both Baseline and Actual scenarios until Balance <= 10.

*   **Monthly Interest**: $ \text{Balance} \times \frac{\text{Rate}}{1200} $
*   **Monthly Fees**: Adds `Service Fee` to total cost.
*   **Payment**:
    *   Baseline: `Total Repayment - Service Fee`
    *   Actual: `Total Repayment - Service Fee + Any Extra Repayments in that Month`
*   **New Balance**: $ \text{Balance} + \text{Interest} - \text{Payment} $

#### 5.2.3 Metrics
*   **Money Saved**:
    $$ (\text{Total Interest}_{\text{Base}} + \text{Total Fees}_{\text{Base}}) - (\text{Total Interest}_{\text{Actual}} + \text{Total Fees}_{\text{Actual}}) $$
*   **Net Return (Cash)**:
    $$ \text{Money Saved} - \sum(\text{Extra Repayments}) $$
    *This represents the pure profit over and above the capital put in.*
*   **Time Reduced**: Difference in months between Baseline end date and Actual end date.

#### 5.2.4 Annualized Yield (XIRR)
Calculates the internal rate of return for the extra payments.

*   **Cash Flow Outflows**: Extra Repayments (Negative amounts) at their specific dates.
*   **Cash Flow Inflows**: The "saved" monthly repayments during the period where the loan is paid off in the Actual scenario but would still be active in the Baseline scenario.
    *   *Amount*: `Total Repayment`
    *   *Dates*: Monthly from `Actual End Date + 1 month` to `Baseline End Date`.
*   **Calculation**: Uses Newton-Raphson method to solve for `Rate` in the XNPV equation:
    $$ \sum \frac{\text{CashFlow}_i}{(1 + \text{Rate})^{\frac{\text{Days}_i}{365}}} = 0 $$

### 5.3 Outputs
*   **Interest/Fees Saved**
*   **Total Extra Paid**
*   **Net Return (Cash)**
*   **Annualized Yield (%)** - Equivalent investment return of the extra payments.
*   **Time Reduced**
*   **New Expected End Date** vs **Original End Date**.

---

## 6. Data Persistence (CSV Formats)

### 6.1 Budget CSV (`calulator_data.csv`)
Columns: `type`, `description`, `amount`, `date`
Types: `savings`, `debt`, `provision`, `costfuturecost`

### 6.2 Investments CSV (`investments.csv`)
Columns: `Date`, `Description`, `amount`, `account type`
Special Rows: `current_value` type for storing current balances.

### 6.3 Debt CSV (`debt.csv`)
Columns: `Date`, `Description`, `Amount`
Special Rows: `param` type in first column to store Loan Details (principal, repayment, service_fee, interest_rate, next_payment).
