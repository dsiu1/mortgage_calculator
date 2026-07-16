# Mortgage &amp; Solar Simulators

Two single-page simulators, ported from a Google Sheet, hosted on GitHub Pages.
Everything runs in the browser — no data leaves your machine.

**[Open the simulators →](https://dsiu1.github.io/mortgage_calculator/)**

Pick a tab: **Mortgage** amortizes a loan and charts the balance descending to
zero; **Solar** models a panel install and charts cumulative cash flow to
payback.

## Mortgage

Enter a loan amount, term, and rate, and the calculator produces a monthly
amortization schedule, a balance-descent chart, and summary totals for
payment, interest, and total paid.

**Rate type**

- **Fixed** — one annual rate for the life of the loan.
- **Variable · Ramp** — the rate starts at a base and steps up by a fixed
  amount every _N_ months (this mirrors the source spreadsheet's behavior).
- **Variable · Band** — an expected rate plus a best-case and worst-case
  rate, computed as three separate runs and shown as a shaded band on the
  chart.

**Extra payments**

Add a lump sum against a specific loan year (e.g. "¥2,000,000 in year 5").
Extra payments reduce the balance immediately, which lowers every future
payment — the payoff date doesn't change.

**The core rule (from the source sheet):** the payment is recomputed every
month as `PMT(current monthly rate, months remaining, current balance)`. Since
each payment re-amortizes whatever's left over whatever term remains, the loan
always finishes exactly on schedule — rate changes and extra payments move the
_payment amount_, never the payoff date. Month's interest is simply
`beginning balance × (annual rate / 100 / 12)`.

This math lives in [`src/mortgage.ts`](src/mortgage.ts), is pure/
framework-free, and is unit-tested against the source spreadsheet's real
numbers in [`src/mortgage.test.ts`](src/mortgage.test.ts).

A loan comparison feature (side-by-side scenarios) is planned but not yet
built; the code is structured so it can slot in later.

## Solar

Enter the system cost, capacity, and your tariffs, and the simulator produces a
year-by-year cash and energy table, a cumulative cash-flow chart marked at
payback, and headline figures for payback, year-1 savings, and net position.

Each year _n_ of the horizon:

```
buy rate    = starting rate × (1 + buy inflation)^(n-1)
sell rate   = sell rate × (1 - sell degradation)^(n-1)
generation  = capacity × 1200 kWh × (1 - panel degradation)^(n-1)
self-used   = MIN(usage, generation)
sold        = MAX(0, generation - self-used)
cost w/o    = buy rate × usage
cost w/     = (usage - self-used) × buy rate - sold × sell rate
savings     = cost w/o - cost w/
cumulative  = previous cumulative + savings     (year 0 = -system cost)
```

**The two rates move independently.** Buy inflation lifts the grid price you
pay; the export tariff decays on its own curve via sell degradation. The source
sheet inflated the buy rate and held the sell rate flat, which
`sell degradation = 0` (the default) reproduces exactly.

**Cost with solar can go negative** — when export credit exceeds the remaining
bill, the "cost" is income. That's the sheet's behaviour and it's intentional.

**Battery capacity is an input but doesn't move the result.** The sheet lists
it as an assumption and never references it in a formula. The model assumes
generation is used on site up to your usage — storage is what makes that
plausible — but it doesn't size the battery. It's kept in the UI so the app
states the same assumptions the sheet does, and it's labelled as inert.

### Departures from the sheet

The sheet clipped self-consumption at `generation × 0.8`. That input is gone:
generation is used on site up to usage, and only the true surplus is sold. For
the sheet's own assumptions this is a **no-op** — `6480 × 0.8 = 5184` still
exceeded the 4100 kWh usage, so the `MIN` clipped at usage either way, and the
tests still reconcile row-for-row against the sheet. It only diverges for
systems too small to cover usage, where the old ratio would have thrown away
generation the house could have used.

This math lives in [`src/solar.ts`](src/solar.ts), is pure/framework-free, and
is unit-tested row-for-row against the sheet's "Solar Simulation" tab in
[`src/solar.test.ts`](src/solar.test.ts).

## Getting started

Requires [Node.js](https://nodejs.org/) 22+ and npm.

```bash
npm install          # install dependencies
npm run dev           # build + watch, served at http://localhost:5555
npm test              # run the test suite (vitest)
npm run typecheck     # tsc --noEmit
```

### Project layout

```
src/mortgage.ts       core amortization math (pure, unit-tested)
src/mortgage.test.ts  vitest suite, reconciled against the source spreadsheet
src/solar.ts          core solar payback math (pure, unit-tested)
src/solar.test.ts     vitest suite, reconciled against the source spreadsheet
src/ui.ts             entry point + tabs + mortgage DOM wiring, theme toggle
src/solar-ui.ts       solar DOM wiring: assumptions, chart, year-by-year table
src/ui-common.ts      shared DOM/formatting/segmented-control helpers
src/ui-common.test.ts vitest suite for the money formatters
src/styles.css        styling (light/dark themes)
index.html            entry point
build.mjs             esbuild build/dev-server script
.github/workflows/     CI + GitHub Pages deploy
```

## Build process

Production assets are bundled with [esbuild](https://esbuild.github.io/) via
`npm run build`, which outputs static HTML/CSS/JS into `dist/`. There's no
runtime framework — `src/ui.ts` is bundled directly to `dist/app.js`, and
`index.html` / `src/styles.css` are copied alongside it.

On every push to `main`, [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
runs the test suite and type-check, builds `dist/`, and publishes it as a
GitHub Pages artifact. A build that fails tests or type-checking does not
deploy.

## Where it's hosted

The site is deployed automatically to **GitHub Pages** at
[dsiu1.github.io/mortgage_calculator](https://dsiu1.github.io/mortgage_calculator/),
via the Actions workflow above (Pages source: GitHub Actions). Every merge to
`main` re-deploys the live site.
