# Tab Refresh Icons — Design Spec

**Date:** 2026-03-27
**Status:** Approved

## Overview

Add a small refresh icon button next to each tab label in the navigation bar. Clicking it re-runs all calculations for that tab, giving the user confidence that displayed numbers are accurate.

## HTML Changes

Each of the three tab `<button>` elements in the nav bar is modified:
- The tab label text is wrapped in a `<span>`
- A small inline `<button>` with a circular arrow SVG (16×16) is added after the label span
- The inner button has IDs: `refresh-budget`, `refresh-investment`, `refresh-debt`
- The inner button calls `event.stopPropagation()` to prevent double-firing of the parent tab click handler; the refresh handler itself calls `switchTab(name)` before recalculating

Example structure:
```html
<button id="tab-budget" ...>
  <span>Budget Calculator</span>
  <button id="refresh-budget" ...>
    <!-- circular arrow SVG -->
  </button>
</button>
```

## CSS Changes

A hover + rotation animation for the refresh icon:
```css
.refresh-icon {
  transition: transform 0.3s;
  color: #94a3b8; /* slate-400 */
}
.refresh-icon:hover {
  color: #475569; /* slate-600 */
  transform: rotate(180deg);
}
```

## JS Changes

Three click event listeners added near the existing tab click handlers (around line 795):

| Button ID         | Functions called                                          |
|-------------------|-----------------------------------------------------------|
| `refresh-budget`  | `calculateAndDisplaySummary()`, `renderBudget()`          |
| `refresh-investment` | `renderFullInvestmentUI()`, `updatePerformanceDisplay()` |
| `refresh-debt`    | `calculateDebtProjection()`, `renderRepayments()`         |

Each handler calls `event.stopPropagation()` to prevent the parent tab button from also firing, then calls `switchTab(name)` followed by the calculation functions.

## Behaviour

- Icons are always visible on all three tabs (not just the active one)
- Clicking an icon on an inactive tab switches to that tab AND refreshes it
- On click, the icon rotates 180° (CSS transition) as visual feedback
- No loading state needed — recalculations are synchronous and near-instant

## Out of Scope

- Auto-refresh on tab switch
- Refresh animation loop / spinner
- Any changes to the save/load sidebar buttons
