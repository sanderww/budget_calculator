# Future Cost → Provision Conversion

**Date:** 2026-08-11
**Status:** Approved design, pending implementation
**Tab:** Budget → Future Costs / Provisions

## Context

Future costs and provisions are modelled almost identically. Both are dynamic
list items with a description, an amount and a date; they differ only in their
CSV type (`costfuturecost` vs `provision`) and in how `calculateBudgetSummary`
treats them:

- **Provisions** are subtracted from **Net savings now** — money treated as
  already spent for planning purposes.
- **Future costs** are subtracted only from **Net savings on [target date]**,
  and only when the cost's date falls on or before that target date.

A future cost therefore represents an expense the user is still saving toward.
Once its date passes, one of two things has actually happened:

1. **The money was saved.** It is now genuinely set aside and should reduce
   Net savings now — i.e. it has become a provision. This is the user's
   example: "once car money for year 2 has been saved for, it needs to become
   a provision."
2. **The money was spent.** The savings balance already reflects the spend and
   the row is simply finished — it should be deleted.

There is currently no way to perform (1) other than deleting the future cost
and hand-retyping it as a provision.

## Goal

Give the user a one-click way to move a past-due future cost into Provisions,
carrying its description, amount and date across unchanged.

Explicitly **not** a goal: automating the move. Because outcome (2) above is
just as common as (1), the app cannot infer which happened from the date alone.
An automatic conversion would silently misclassify every spent cost as saved
money and wrongly depress Net savings now. The decision stays with the user.

## Behaviour

### The convert button

- Each future-cost row gains a second button beside the existing trash icon:
  an arrow (`→`), titled **"Move to provisions"**.
- The button is **only active on rows whose date is strictly before today**.
  On all other rows the button still occupies its grid cell but renders
  `invisible`, so every row's trash icon stays vertically aligned. This
  mirrors the existing treatment of the crypto BTC field in
  `createRowElement`, which uses the same `invisible` technique.
- Its presence doubles as the visual cue that a row is past due and needs a
  decision: convert (money saved) or delete (money spent).

### What a click does

1. The row is removed from `budgetData.futureCosts`.
2. The **same** row — same `id`, `description`, `amount` and `date` — is
   appended to `budgetData.provisions`. The original date is deliberately
   preserved, so the provision stays identifiable as "the car saving that was
   due 2027-09-01".
3. The budget re-renders and auto-saves, via the same `renderBudget()` +
   `debouncedSave('transactions_budget', …)` path already used by add and
   remove.

No confirmation dialog. The button only appears where the action is
meaningful, and recovery is short (delete the provision, re-add the cost).

### Effect on the summary figures

Converting is **net-neutral on Net savings on [date]** and **reduces Net
savings now** by the row's amount.

This follows from the existing formulas rather than from any new arithmetic. A
past-dated future cost already satisfies `cost.date <= target date` for every
future target, so it was already inside `relevantFutureCosts`. After
conversion it leaves that sum and enters `totalProvisions`, which is deducted
from `currentNetAmount` — and `futureNetAmount` is derived from
`currentNetAmount`, so the future figure is unchanged. The now figure drops.

That is the intended meaning: money that was hypothetical is now committed.

## Implementation

### `src/calc/budget.js` — the state transition

```js
convertFutureCostToProvision(budgetData, id, today = new Date())
    → { …budgetData, futureCosts, provisions }
```

A pure function. On success it returns a **new** budget-data object with new
`futureCosts` and `provisions` arrays — the input object and its arrays are
never mutated. When the move is not permitted it returns the input object
**by reference**, so callers can cheaply detect a no-op with `!==`. The move
is refused when:

- no row in `futureCosts` carries that `id`; or
- the row's date is blank or unparseable (`Date.parse` → `NaN`); or
- the row's date is not strictly before `today`.

Keeping the rule in one pure function means the button's enabled state and the
click handler's guard cannot disagree — both call the same predicate.

### `src/calc/budget.js` — the shared predicate

```js
isPastDue(date, today = new Date()) → boolean
```

True only for a parseable date strictly before `today`, with both sides
normalised to local midnight so a row dated today is never past due (a cost
"due today" still reads as pending). Exported through the `src/calculations.js`
barrel alongside the rest.

### `src/lib/rows.js` — the button

`createRowElement` gains one option, `convertible`, a predicate
`(item) => boolean`. When supplied, a `convert-btn` button is appended before
the remove button, carrying the `invisible` class when the predicate returns
false. When the option is absent no cell is emitted at all, so debts,
provisions, investment transactions and debt repayments are untouched.

### `src/app/budget.js` — the wiring

- `createFutureCostItem` passes `convertible: (item) => isPastDue(item.date)`
  and widens its grid from `1fr 1fr 1fr auto` to `1fr 1fr 1fr auto auto`.
- The existing `futureCostList` click listener intercepts `.convert-btn`
  before delegating to `handleListChange`, calls
  `convertFutureCostToProvision`, then re-renders and auto-saves.

`handleListChange` is shared by all three budget lists and is not modified;
the convert branch lives in the future-cost listener alone, since it is the
only list where the action exists.

## Edge cases

| Case | Behaviour |
|---|---|
| Blank date | Not convertible; button invisible. |
| Unparseable date | Not convertible; button invisible. |
| Date exactly today | Not convertible — strictly-before. |
| Row deleted between render and click | `convertFutureCostToProvision` finds no matching id and returns the data unchanged. |
| Converted row's position in Provisions | Appended at the end. Provisions are unsorted today and stay that way; only Future Costs are date-sorted. |

## Testing

`convertFutureCostToProvision` and `isPastDue` are pure, so both are unit
tested in `tests/calculations.test.js` with no DOM:

- `isPastDue` — yesterday true, today false, tomorrow false, blank false,
  garbage false.
- Happy path — the row leaves `futureCosts` and appears in `provisions` with
  every field intact, and neither array changes length by more than one.
- Rejections — unknown id, blank date, today's date and a future date all
  return the data unchanged.
- The summary consequence — feed the pre- and post-conversion data through
  `calculateBudgetSummary` and assert that `currentNetAmount` drops by exactly
  the row's amount while `futureNetAmount` is unchanged.

The button's rendering (present, and `invisible` on non-past-due rows) is
covered in `tests/rows.test.js`, which already runs under happy-dom.

## Documentation

Both spec documents are updated as part of the work, per the project rules:
`docs/specs/core-requirements.md` (the Future Cost / Provision domain
definitions gain the conversion relationship) and
`docs/specs/functional-requirements.md` (§1.3 and §1.4 gain the button, its
past-due rule and its effect on the summary figures).
