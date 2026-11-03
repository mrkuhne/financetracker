# Plan 4 – Investing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Invest tab shows each month how much to invest and how to split it across bonds, ETFs, stocks and crypto. Each type has its own page saying what to buy, where (MBH or Revolut) and why. A "Bought it" button records the purchase, and the portfolio shows its value and return in HUF with daily prices.

**Architecture:**
- **Numbers:** the suggested amount, the split (new money only, toward the profile targets), positions and valuation are pure functions in `src/domain/invest.ts`.
- **Money movements:** a buy or sell is a normal `Transaction` with the new kinds `invest_buy` / `invest_sell`, linked from an `InvestmentTransaction`.
  - `invest_buy` lowers the account balance and this month's allowance through `MonthlyAllowance.investmentMinor`. That field is now the month's actual buys; the old up-front `monthly_investment_amount` deduction is removed.
  - Neither kind counts as expense or income in the history averages.
- **Positions:** a `Holding` stores only identity: type, catalog product, platform. Quantity and cost are always derived from its `InvestmentTransaction`s, so deleting one can never leave a stale total.
- **Products:** concrete products come from a hand-checked catalog in code.
- **Prices:**
  - ETF, stock and crypto prices come from a new backend function `quotes`, which reads Yahoo's public chart endpoint server-side, so no key or CORS issue. Prices are cached daily in `PriceQuote` and refreshed when Invest opens.
  - Bond value is accrued from the purchase amount and rate.
- **AI:** one cached `InvokeLLM` call per month writes the explanations and picks catalog products. A pure normalizer drops anything that is not in the catalog.

**Tech Stack:** As Plans 1–3 (Vite + React + TypeScript, prototype CSS, `@base44/sdk`, Vitest, Deno backend functions). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-plan-4-investing-design.md` (binding), extending `docs/superpowers/specs/2026-11-01-finance-tracker-design.md` §5, §6.4, §6.7, §7. UI: `docs/prototype/finance-tracker-prototype.html` screens `invest`, `invest-empty`, `allocation`, `holding`.

**Builds on:** Plans 1–3, shipped and deployed on `main`.

## Global Constraints

- Everything in Plans 1–3's Global Constraints still holds:
  - English UI, HUF base, `Europe/Budapest`.
  - Integer minor units (HUF × 100), `YYYY-MM-DD` dates, `YYYY-MM` months.
  - RLS `created_by_id` on every user entity.
  - Prototype look and copy.
- Git: work directly on `main`, commit and push without asking, run `npm test` before every push (`CLAUDE.md`).
- **Deploys** (`npm run deploy`, `base44 entities push`) touch production. The controller asks the user in chat once per deploy step and never hands them to subagents.
- **Numbers are computed by code; the AI only interprets.** Every amount on screen comes from `src/domain/`, never from AI text.
- **Products only from the catalog** (`src/features/invest/catalog.ts`). No screen and no AI output may name a product, rate or fee that is not in it. Every product row on screen shows "Check the current terms before you buy."
- Every recommending screen (Invest card, type page) shows: "Educational, not personal financial advice. You decide."
- The app never suggests selling, whether to rebalance or to time the market (spec §2 anti-goals).
- **A suggestion never touches the allowance.** Only a recorded buy (`invest_buy`) lowers it, by exactly the amount entered (spec §4.1).
- Buys and sells are paid from or into `checking` or `cash` accounts only, never `savings` or `investment` (spec §4.5).
- `invest_buy` / `invest_sell` are never counted as expense or income in `completeMonthTotals`, the averages, the emergency target or month close income (spec §4.5).
- AI input: aggregated amounts, the split, the profile, emergency status, portfolio totals per type, and catalog rows. No transactions, account names, SMS or notes (§7). `model: 'claude-sonnet-5'`, one call per user action or per month, never on render.
- Tunable constants live in one exported object `INVEST_RULES` in `src/domain/invest.ts`, with the values given in Task 3.

## Review Focus

1. **No complete month of data yet.** This is the user's real state today. The card must say "Track one full month first" and must not show 0 Ft, `NaN` or a split. A manual Settings amount still works. → `suggestInvestment` tests in Task 3.
2. **The MBH SMS for the same debit arrives before or after the "Bought it" tap.** Either way exactly one transaction exists, and it is an `invest_buy`, never an extra expense. → Task 6 matching tests.
3. **The price fetch fails, or a holding has no quote yet.** Its value falls back to cost and shows "Price not updated". The portfolio total stays a number. → `holdingValue` / `portfolioSummary` tests in Task 3.
4. **Selling more than you hold, or a sell on a holding bought without a quantity.** More than the held quantity (or held cost, when no quantity) is rejected with a message. → `planSell` tests in Task 6.
5. **A tiny monthly amount** (e.g. 5 000 Ft) or an amount below the bond minimum. No type is suggested below its minimum ticket, the parts always add up to the amount, and the folded types are listed as "too small this month". → `splitInvestment` tests in Task 3.
6. **The AI answers with a product id from another type, an unknown id, or empty text.** That type falls back to the catalog default and the template text, and the numbers stay. → `normalizeInvestAdvice` tests in Task 7.

---

## File Structure

```
base44/entities/
  holding.jsonc                 NEW  Holding (identity only)
  investment-transaction.jsonc  NEW  InvestmentTransaction
  price-quote.jsonc             NEW  PriceQuote (daily cache)
  transaction.jsonc             MOD  kind enum + invest_buy, invest_sell
  user.jsonc                    MOD  + risk_profile, risk_checkin_at, invest_cache
base44/functions/quotes/
  entry.ts  logic.ts  logic.test.ts   NEW  POST {symbols} -> latest prices from Yahoo chart API
src/
  domain/
    types.ts                    MOD  TxnKind, AssetType, Holding, InvestmentTxn, PriceQuote, RiskProfile, InvestCache, Settings fields
    balances.ts (+test)         MOD  invest_sell adds, invest_buy subtracts
    allowance.ts (+test)        MOD  investmentMinor = month's invest_buy total
    guide.ts (+test)            MOD  step 4 done = invested in this or last month
    invest.ts (+test)           NEW  INVEST_RULES, suggestion, split, positions, valuation, drop, check-in
  data/
    investments.ts              NEW  holdings, investment txns, quotes CRUD; recordBuy / recordSell / deleteInvestmentTxn
    quotes.ts                   NEW  refreshQuotes (cache + function call)
    settings.ts                 MOD  risk_profile defaults; get/save invest cache
    export.ts (+test)           MOD  holdings, investment_transactions in export
  app/
    smsConversion.ts (+test)    MOD  matchInvestTxnForSms
    runConvertSms.ts            MOD  link a late SMS to an existing invest_buy
  features/invest/
    catalog.ts (+test)          NEW  checked product catalog
    record.ts (+test)           NEW  planBuy, findSmsCandidates, planSell
    investAi.ts (+test)         NEW  schema, prompt, normalizeInvestAdvice, investCacheKey, templateText
    useInvestData.ts            NEW  home data + holdings + inv txns + quotes + fx -> InvestModel
    InvestScreen.tsx            NEW  /invest (empty state, month card, portfolio, check-in)
    AssetTypeScreen.tsx         NEW  /invest/type/:type
    BuySheet.tsx                NEW  "Bought it" sheet
    HoldingScreen.tsx           NEW  /invest/holding/:id (value, return, history, sell, delete, drop note)
    SellSheet.tsx               NEW
  features/transactions/        MOD  TransactionsScreen / TransactionForm: invest labels, read-only invest rows
  features/home/HomeScreen.tsx  MOD  invest labels in Recent
  features/home/AllowanceBreakdown.tsx  MOD  "Invested this month"
  features/settings/SettingsScreen.tsx  MOD  risk profile; amount label "Suggested amount (optional)"
  features/shell/TabBar.tsx     MOD  + Invest tab
  App.tsx, index.css            MOD  routes; prototype invest CSS (.alloc, .legend, .holding rows)
```

---

### Task 1: Entities, types and data layer

**Files:**
- Create: `base44/entities/holding.jsonc`, `base44/entities/investment-transaction.jsonc`, `base44/entities/price-quote.jsonc`, `src/data/investments.ts` (CRUD part only)
- Modify: `base44/entities/transaction.jsonc`, `base44/entities/user.jsonc`, `src/domain/types.ts`, `src/data/settings.ts`, `src/data/export.ts`, `src/data/export.test.ts`

**Interfaces:**
- Produces (types):
  ```ts
  export type TxnKind = 'expense' | 'income' | 'transfer_out' | 'transfer_in' | 'invest_buy' | 'invest_sell';
  export type AssetType = 'bond' | 'etf' | 'stock' | 'crypto';
  export type RiskProfile = 'cautious' | 'balanced' | 'bold';
  export type Platform = 'mbh' | 'revolut' | 'other';
  export interface Holding {
    id: string; asset_type: AssetType; product_id: string; name: string; ticker: string | null;
    platform: Platform; platform_name: string | null; currency: string; bond_rate_pct: number | null;
  }
  export interface InvestmentTxn {
    id: string; holding_id: string; side: 'buy' | 'sell'; amount_huf_minor: number;
    quantity: number | null; price: number | null; currency: string; date: ISODate;
    account_id: string; transaction_id: string;
  }
  export interface PriceQuote { id: string; ticker: string; price: number; currency: string; as_of: ISODate }
  export interface InvestCache { key: string; intro: string; per_type: Record<AssetType, { text: string; product_id: string }>; generated_at: string }
  // Settings gains:
  risk_profile: RiskProfile;          // default 'cautious'
  risk_checkin_at: ISODate | null;    // default null
  ```
- Produces (data, `src/data/investments.ts`): `listHoldings(): Promise<Holding[]>`, `createHolding(h: Omit<Holding,'id'>)`, `updateHolding(id, patch)`, `deleteHolding(id)`, `listInvestmentTxns(): Promise<InvestmentTxn[]>`, `createInvestmentTxn(t)`, `deleteInvestmentTxnRow(id)`, `listQuotes(tickers: string[]): Promise<PriceQuote[]>`, `upsertQuote(q: Omit<PriceQuote,'id'>): Promise<void>` (one row per ticker; update when it exists). `src/data/settings.ts`: `getInvestCache(): Promise<InvestCache | null>`, `saveInvestCache(c: InvestCache): Promise<void>`.
- `ExportData` gains `holdings`, `investment_transactions`.

- [ ] **Step 1: Write the entities.**
  - Copy the shape of `savings-goal.jsonc` and its standard RLS block.
  - Enums exactly as the types above. `quantity`, `price`, `ticker`, `platform_name` and `bond_rate_pct` are nullable (`["number","null"]` / `["string","null"]`).
  - `transaction.jsonc` kind enum gains `invest_buy`, `invest_sell`.
  - `user.jsonc` gains `risk_profile` (string enum), `risk_checkin_at` (`["string","null"]`, format date) and `invest_cache` (`["object","null"]`).
- [ ] **Step 2: Add the types and the data module.**
  - Use the `recurring.ts` pattern (`KEYS`, `NULLABLE`, `pick`, `stripNulls`).
  - `DEFAULT_SETTINGS` gains `risk_profile: 'cautious'` and `risk_checkin_at: null`. `getSettings` falls back to `'cautious'` for an unknown `risk_profile` value.
  - `getInvestCache` returns null unless `key` and `intro` are strings and `per_type` is an object.
- [ ] **Step 3: Extend the export test, run it, see it fail.** The "includes version, exported_at and all collections" test passes `holdings: []` and `investment_transactions: []` and asserts that both keys exist.
  Run: `npx vitest run src/data/export.test.ts` — Expected: FAIL.
- [ ] **Step 4: Extend `ExportData` / `exportAllJson`.** Run the test — Expected: PASS. Run `npx tsc --noEmit` — Expected: errors only where a `switch`/label on `TxnKind` must now handle the new kinds. Leave those for Task 2 if they are in files Task 2 lists; otherwise fix them here.
- [ ] **Step 5: Commit** — `git commit -m "feat: holding, investment transaction and price quote entities and data layer"`

---

### Task 2: The ledger knows investments

**Files:**
- Modify: `src/domain/balances.ts` (+test), `src/domain/allowance.ts` (+test), `src/domain/guide.ts` (+test), `src/features/plan/GuideScreen.tsx`, `src/features/plan/PlanScreen.tsx`, `src/features/home/AllowanceBreakdown.tsx`, `src/features/home/HomeScreen.tsx`, `src/features/transactions/TransactionsScreen.tsx`, `src/features/transactions/TransactionForm.tsx`, `src/features/transactions/txLogic.ts` (+test)

**Interfaces:**
- Consumes: `TxnKind` from Task 1.
- Produces:
  - `MonthlyAllowance.investmentMinor` = the sum of `amount_huf_minor` of the month's `invest_buy` txns. `computeMonthlyAllowance` no longer reads `settings.monthly_investment_amount_minor`.
  - `GuideInput.monthlyInvestmentMinor` is replaced by `investedRecently: boolean`.
  - `export const isInvest = (t: Txn) => t.kind === 'invest_buy' || t.kind === 'invest_sell'` in `allowance.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `balances.test.ts` › `invest_buy subtracts and invest_sell adds`: opening 100 000 minor, buy 30 000, sell 10 000 → `balanceMinor === 80_000`.
  - `allowance.test.ts` › `investment comes from recorded buys, not the setting`: settings `monthly_investment_amount_minor: 5_000_000`, one recurring income of 60 000 000 and one `invest_buy` of 2_000_000 in the month → `investmentMinor === 2_000_000`, `freeMinor === 58_000_000`.
  - `allowance.test.ts` › `an invest_sell is not income`: a 1_000_000 `invest_sell` leaves `oneOffIncomeMinor` 0 and `freeMinor` unchanged.
  - `allowance.test.ts` › `an invest_buy is not day-to-day spend`: `spentMinor` excludes it.
  - `planning.test.ts` › `completeMonthTotals ignores investment txns`: a full month with an expense of 100, an `invest_buy` of 500 and an `invest_sell` of 700 → `expensesMinor === 100`, `incomeMinor === 0`.
  - `guide.test.ts`: step 4 is done when `investedRecently` is true, and not done when it is false, even if a monthly amount is set.
  - `txLogic.test.ts`: `signedHuf` (the Activity day total) returns `-x` for `invest_buy` and `+x` for `invest_sell`.

  Run: `npx vitest run src/domain src/features/transactions` — Expected: the new tests FAIL.
- [ ] **Step 2: Implement.**
  - `computeMonthlyAllowance`: `investmentMinor = sum(inMonth.filter(t => t.kind === 'invest_buy').map(t => t.amount_huf_minor))`.
  - `balances.ts`: add `invest_sell` to the adding branch.
  - `guide.ts`: step 4's `done` becomes `i.investedRecently`.
  - `GuideScreen` / `PlanScreen` pass `investedRecently` = any `invest_buy` dated in the current or the previous month (compute it from `home.txns`).
  - `guideAi.ts`: keeps `investmentMinor` for its prompt line. Pass this month's `investmentMinor` from the allowance.
- [ ] **Step 3: Labels.**
  - In `HomeScreen` Recent and `TransactionsScreen`, `invest_buy` shows "Invested · {note}" with "−", and `invest_sell` shows "Sold · {note}" with "+".
  - `TransactionForm` opens an invest txn read-only. It keeps the source line, swaps the form for the text "Investment. Change it from Invest.", and offers no Save and no Delete.
  - `AllowanceBreakdown`: the line label becomes "Invested this month".
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — Expected: all PASS, no errors.
- [ ] **Step 5: Commit** — `git commit -m "feat: investment buys lower the allowance only when recorded; sells and buys stay out of averages"`

---

### Task 3: Investing math

**Files:**
- Create: `src/domain/invest.ts`, `src/domain/invest.test.ts`

**Interfaces:**
- Consumes: `AssetType`, `RiskProfile`, `Holding`, `InvestmentTxn`, `PriceQuote` (Task 1).
- Produces:
  ```ts
  export const ASSET_TYPES: AssetType[] = ['bond', 'etf', 'stock', 'crypto'];
  export const INVEST_RULES = {
    shareBeforeEmergency: 0.25, shareAfterEmergency: 0.6,
    profiles: { cautious: { bond: 0.5, etf: 0.35, stock: 0.08, crypto: 0.07 },
                balanced: { bond: 0.35, etf: 0.45, stock: 0.12, crypto: 0.08 },
                bold:     { bond: 0.15, etf: 0.45, stock: 0.25, crypto: 0.15 } },
    minTicketMinor: { bond: 1_000_000, etf: 200_000, stock: 200_000, crypto: 200_000 },
    roundToMinor: 100_000,           // suggestions round down to 1 000 Ft
    bigDropRatio: -0.15,             // value at least 15% under cost
    checkinAfterMonths: 3,
  } as const;
  export type Suggestion =
    | { kind: 'no_data' }
    | { kind: 'nothing_spare' }
    | { kind: 'amount'; amountMinor: number; source: 'computed' | 'setting'; emergencyDone: boolean };
  export function suggestInvestment(i: {
    trackedMonths: number; avgIncomeMinor: number; avgExpensesMinor: number; savingsTargetMinor: number;
    freeBeforeInvestMinor: number; emergencyDone: boolean; settingMinor: number | null;
  }): Suggestion;
  export interface Split { parts: Record<AssetType, number>; tooSmall: AssetType[] }
  export function splitInvestment(amountMinor: number, profile: RiskProfile, valueByType: Record<AssetType, number>): Split;
  export interface Position { holding: Holding; quantity: number | null; costMinor: number; firstBuy: ISODate | null }
  export function positionOf(holding: Holding, txns: InvestmentTxn[]): Position;
  export interface Valuation { valueMinor: number; costMinor: number; gainMinor: number; gainRatio: number | null; priced: boolean }
  export function holdingValue(p: Position, quote: PriceQuote | null, hufPerUnit: number | null, today: ISODate): Valuation;
  export interface PortfolioSummary { valueMinor: number; costMinor: number; gainMinor: number; gainRatio: number | null; byType: Record<AssetType, number>; unpriced: number }
  export function portfolioSummary(vals: { type: AssetType; v: Valuation }[]): PortfolioSummary;
  export function isBigDrop(v: Valuation): boolean;
  export function checkinDue(i: { profile: RiskProfile; firstBuy: ISODate | null; lastCheckin: ISODate | null; today: ISODate }): boolean;
  export function monthCard(suggestedMinor: number, investedThisMonthMinor: number): { suggestedMinor: number; investedMinor: number; leftMinor: number };
  ```

- [ ] **Step 1: Write the failing tests** (`invest.test.ts`):
  - `suggestInvestment`:
    - `trackedMonths: 0, settingMinor: null` → `{ kind: 'no_data' }`.
    - `trackedMonths: 0, settingMinor: 4_000_000` → `amount 4_000_000, source 'setting'`.
    - Income 60 000 000, expenses 40 000 000, savings 5 000 000, free 30 000 000, emergency not done → surplus 15 000 000 × 0.25 = 3 750 000 → rounded down to `3_700_000`, `source 'computed'`.
    - Same with emergency done → 15 000 000 × 0.6 = `9_000_000`.
    - Free 8 000 000 (below the surplus), emergency done → 8 000 000 × 0.6 = `4_800_000`.
    - Surplus ≤ 0 → `{ kind: 'nothing_spare' }`.
    - A computed amount that rounds to 0 → `nothing_spare`.
  - `splitInvestment`:
    - Empty portfolio, cautious, 10 000 000 → bond 5 000 000, etf 3 500 000, stock 800 000, crypto 700 000; `tooSmall` empty; the parts sum to 10 000 000.
    - New money goes to the laggards: valueByType `{ bond: 0, etf: 10_000_000, stock: 0, crypto: 0 }`, cautious, 4 000 000 → `etf === 0`, and bond gets the biggest part.
    - Tiny amount: cautious, 500 000 → bond (min 1 000 000) folded, `tooSmall` contains `'bond'`, no non-zero part below its minimum, and the sum is 500 000.
    - Never negative, whatever the holdings.
  - `positionOf`:
    - Two buys (qty 1 and 2, amounts 10 000 / 22 000) and one sell (qty 1, amount 12 000) → `quantity === 2`. The cost drops pro rata (32 000 × 2/3 = 21 333, rounded) and `firstBuy` is the earliest buy date.
    - Buys without a quantity → `quantity null`; a sell lowers the cost by its amount, floored at 0.
  - `holdingValue`:
    - A quote of 100 EUR, qty 2, hufPerUnit 400 → value 80 000 HUF = `8_000_000` minor, `priced: true`.
    - No quote → value = cost, `priced: false`.
    - Bond 1 000 000 minor at 6.5% held 365 days → `1_065_000`; 0 days → cost.
    - Cost 0 → `gainRatio null`.
  - `portfolioSummary`: the totals add up, and `unpriced` counts the `priced: false` items.
  - `isBigDrop`: true at −15%, false at −14.9%.
  - `checkinDue`:
    - false before 3 months after `firstBuy`, true after.
    - false when `lastCheckin` is within 3 months.
    - Always false for `'bold'` or a null `firstBuy`.
  - `monthCard(5_000_000, 6_000_000)` → `leftMinor 0` (never negative).

  Run: `npx vitest run src/domain/invest.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 2: Implement `src/domain/invest.ts`.**
  - **Split:** target per type = `(total + amount) × weight`; deficit = `max(0, target − value)`; each part = `amount × deficit / Σdeficit`, floored to whole forints (multiples of 100 minor). The remainder goes to the biggest part.
  - **Folding:** then repeatedly fold the smallest non-zero part below its `minTicketMinor` into the biggest part, recording it in `tooSmall`. If even the single remaining part is below its minimum, keep it; the UI says "too small this month".
  - **Bonds:** accrue simply: `cost × (1 + rate/100 × days/365)`, rounded.
- [ ] **Step 3: Run the tests** — Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat: investing math: suggestion, split with new money, positions and valuation"`

---

### Task 4: Product catalog

**Files:**
- Create: `src/features/invest/catalog.ts`, `src/features/invest/catalog.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CatalogProduct {
    id: string; type: AssetType; name: string; where: Platform[]; summary: string; risk: 'low' | 'medium' | 'high';
    quote_symbol: string | null;     // Yahoo chart symbol; null for bonds
    quote_currency: string | null;   // currency of quote_symbol
    rate_pct: number | null;         // bonds: indicative yearly rate at checked_at
    min_minor: number | null; source_url: string; checked_at: ISODate;
  }
  export const CATALOG: CatalogProduct[];
  export const TYPE_INFO: Record<AssetType, { title: string; what: string; where_note: string }>;
  export function productsFor(type: AssetType): CatalogProduct[];   // catalog order = preference order
  export function defaultProduct(type: AssetType): CatalogProduct;
  export function findProduct(id: string): CatalogProduct | null;
  ```

- [ ] **Step 1: Research and fill the catalog.** Use WebSearch/WebFetch on official pages only: Magyar Államkincstár / `allampapir.hu`, MBH Bank, Revolut help pages, the ETF issuer.
  - At least one product per type, at most three.
  - **Bonds:** the Hungarian retail government bond(s) currently on sale that can be bought through MBH Bank (or the Treasury), with the current indicative rate and minimum.
  - **ETF:** one or two broad world-index UCITS ETFs that Revolut lists for EEA customers.
  - **Stocks:** one or two large, well-known companies that Revolut lists (an educational example, not a tip). Prefer one that MBH's brokerage also offers if that is verifiable.
  - **Crypto:** Bitcoin and Ethereum on Revolut.
  - `where` contains only platforms the source confirms. Each row's `source_url` is the page that confirms it, and `checked_at` is today.
  - `TYPE_INFO.what`: 2–3 beginner sentences per type. `where_note`: where to buy it and that MBH/Revolut were checked.
  - If a type is truly not available on MBH or Revolut, use `where: ['other']` and say in `where_note` which provider and that it needs a new account.
  - Note every fact you could not confirm in your report, not in code.
- [ ] **Step 2: Write `catalog.test.ts`.** Every type has ≥ 1 product; ids are unique; `source_url` starts with `https://`; `checked_at` matches `YYYY-MM-DD`; non-bond products have `quote_symbol` and `quote_currency`; bonds have `rate_pct` > 0 and `quote_symbol` null; `defaultProduct(t).type === t`.
  Run: `npx vitest run src/features/invest/catalog.test.ts` — Expected: PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat: checked investment product catalog"`

---

### Task 5: Prices — `quotes` function and client refresh

**Files:**
- Create: `base44/functions/quotes/entry.ts`, `base44/functions/quotes/logic.ts`, `base44/functions/quotes/logic.test.ts`, `src/data/quotes.ts`

**Interfaces:**
- Consumes: `upsertQuote`, `listQuotes` (Task 1); `getHufPerUnit` (existing `src/data/fx.ts`).
- Produces:
  - Function `quotes`: `POST { symbols: string[] }` (1–20 symbols, each matching `/^[A-Za-z0-9.\-=^]{1,20}$/`) → `{ quotes: { symbol: string; price: number; currency: string; as_of: string }[]; failed: string[] }`.
    - It requires a signed-in user: `createClientFromRequest(req).auth.me()` must succeed, else 401.
    - `logic.ts`: `validateSymbols(body: unknown): string[] | null`, `parseChart(symbol: string, json: unknown): { price: number; currency: string; as_of: string } | null` (reads `chart.result[0].meta.regularMarketPrice`, `.currency` and `.regularMarketTime` → ISO date in `Europe/Budapest`), `chartUrl(symbol: string): string` = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`.
  - Client: `refreshQuotes(symbols: string[], today: ISODate): Promise<PriceQuote[]>` in `src/data/quotes.ts`. It returns the cached quotes. It calls `base44.functions.invoke('quotes', { symbols: stale })` only for symbols whose cached `as_of` is before `today` or missing, upserts the results, and swallows errors (it keeps the old cache and logs).

- [ ] **Step 1: Write `logic.test.ts`** in the style of `base44/functions/ingest-sms/logic.test.ts`:
  - `validateSymbols({symbols: ['VWCE.DE','BTC-EUR']})` returns both.
  - Rejected: an empty list, 21 symbols, `'a b'`, a non-array.
  - `parseChart` on a minimal fixture `{chart:{result:[{meta:{regularMarketPrice:101.5,currency:'EUR',regularMarketTime:1793700000}}]}}` → price 101.5, currency `'EUR'`, `as_of` the Budapest date.
  - `parseChart` → null for `{chart:{result:null,error:{}}}` and for a non-positive price.
  Run: `npx vitest run base44/functions/quotes` — Expected: FAIL.
- [ ] **Step 2: Implement `logic.ts` and `entry.ts`.** `entry.ts` fetches each symbol sequentially, puts a symbol in `failed` on a non-200 or a parse failure, and logs only the symbol and status.
- [ ] **Step 3: Implement `src/data/quotes.ts`.**
- [ ] **Step 4: Local check.**
  - Start `base44 dev` (`.claude/launch.json`, Deno on PATH).
  - Call the local function route with a signed-in dev session, per the `base44-deploy-gotchas` memory: `/api/apps/{app_id}/functions/quotes` with a `Base44-App-Id` header and the dev token.
  - Expected: prices for one ETF symbol and `BTC-EUR` from the catalog. If Yahoo blocks the server (non-200 for every symbol), report it as BLOCKED with the status. Do not switch providers on your own.
- [ ] **Step 5: Run** `npx vitest run` — PASS. **Commit** — `git commit -m "feat: quotes function and daily price cache"`

---

### Task 6: Recording buys and sells (with the MBH SMS)

**Files:**
- Create: `src/features/invest/record.ts`, `src/features/invest/record.test.ts`
- Modify: `src/data/investments.ts` (orchestration), `src/app/smsConversion.ts` (+test), `src/app/runConvertSms.ts`

**Interfaces:**
- Consumes: `positionOf` (Task 3), `findProduct` (Task 4), the CRUD from Task 1, `createTransaction` / `updateTransaction` / `deleteTransaction` (existing).
- Produces:
  ```ts
  export interface BuyInput { productId: string; amountMinor: number; quantity: number | null; price: number | null;
    date: ISODate; platform: Platform; platformName: string | null; accountId: string; bondRatePct: number | null }
  export function payableAccounts(accounts: Account[]): Account[];   // non-archived checking/cash
  export function validateBuy(i: BuyInput, accounts: Account[]): string | null;  // error copy or null
  export function findSmsCandidates(i: { accountId: string; amountMinor: number; date: ISODate }, txns: Txn[], accounts: Account[]): Txn[];
  export function planSell(position: Position, i: { amountMinor: number; quantity: number | null }): string | null;
  // src/app/smsConversion.ts
  export function matchInvestTxnForSms(planned: Omit<Txn,'id'>, txns: Txn[]): Txn | null;
  // src/data/investments.ts
  export async function recordBuy(i: BuyInput, linkTxnId: string | null): Promise<void>;
  export async function recordSell(holding: Holding, i: { amountMinor: number; quantity: number | null; price: number | null; date: ISODate; accountId: string }): Promise<void>;
  export async function deleteInvestmentTxn(t: InvestmentTxn): Promise<void>;  // also deletes its Transaction; deletes the Holding when no txns remain
  ```

- [ ] **Step 1: Write the failing tests.**
  - `record.test.ts`:
    - `payableAccounts` drops savings, investment and archived accounts.
    - `validateBuy` rejects: amount ≤ 0 ("Enter the amount you paid"), a savings account ("Pay from a current account or cash"), an unknown product.
    - `findSmsCandidates`:
      - Returns `source 'sms'` expenses on the same account with `amount_minor === amountMinor` and a date within ±3 days, with no `recurring_rule_id`.
      - Excludes non-SMS rows, other accounts, other amounts, day +4 and rows already `invest_buy`.
      - Returns [] when the account has no `sms_sender`.
    - `planSell`:
      - Quantity 2 held, sell quantity 3 → "You hold 2". Quantity sell on a no-quantity position → error.
      - Amount sell above cost on a no-quantity position → "You hold {cost} at cost".
      - A valid sell → null.
  - `smsConversion.test.ts` › `matchInvestTxnForSms`:
    - An `invest_buy` on the same account, same `amount_minor`, `sms_message_id` null and a date ±3 days is returned for a planned SMS expense.
    - null for a planned income, an `invest_buy` that already has an `sms_message_id`, another account, or day ±4.

  Run: `npx vitest run src/features/invest src/app` — Expected: FAIL.
- [ ] **Step 2: Implement the pure functions.**
- [ ] **Step 3: Implement the orchestration** in `src/data/investments.ts`.
  - **`recordBuy`:**
    1. Find or create the Holding by (`product_id`, `platform`).
    2. With a `linkTxnId`, update that transaction: `kind 'invest_buy'`, `category_id null`, `needs_review false`, note = product name. Otherwise create an `invest_buy` transaction: `source 'manual'`, HUF via `toHufMinor`, note = product name.
    3. Create the `InvestmentTxn` pointing at it.
    4. If step 3 fails after step 2 created a transaction, delete that transaction (no orphan money movement).
  - **`recordSell`:** mirror image with `invest_sell`. There is no SMS linking for credits.
- [ ] **Step 4: Hook the late SMS** in `runConvertSms.ts`.
  - Before `createTransaction`, when the planned txn is an expense, load the txns of that account in date ±3 (`listTransactions`) and call `matchInvestTxnForSms`.
  - On a match: `updateTransaction(match.id, { sms_message_id: msg.id })`, `markSmsConverted(msg.id, match.id)`, and skip creating.
  - Run `npx vitest run` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: record investment buys and sells; MBH SMS links to the buy instead of a new expense"`

---

### Task 7: AI explanations

**Files:**
- Create: `src/features/invest/investAi.ts`, `src/features/invest/investAi.test.ts`

**Interfaces:**
- Consumes: `Split`, `Suggestion`, `PortfolioSummary` (Task 3); `CATALOG`, `productsFor`, `defaultProduct` (Task 4); `invokeLlm` (existing); `InvestCache` (Task 1).
- Produces:
  ```ts
  export const INVEST_SCHEMA: object;   // { intro: string, bond|etf|stock|crypto: { text: string, product_id: string } }
  export interface InvestFacts { month: YearMonth; amountMinor: number; split: Split; profile: RiskProfile; emergencyDone: boolean; summary: PortfolioSummary }
  export function buildInvestPrompt(f: InvestFacts): string;
  export function normalizeInvestAdvice(raw: unknown): { intro: string; per_type: Record<AssetType, { text: string; product_id: string }> } | null;
  export function investCacheKey(f: InvestFacts): string;   // month|amount|parts|profile|emergencyDone|cost per type
  export function templateText(type: AssetType, f: InvestFacts): string;   // no-AI fallback built from TYPE_INFO + numbers
  ```

- [ ] **Step 1: Write the failing tests.**
  - `buildInvestPrompt` contains the amount and each part formatted as Ft, the profile, the "educational, never certain, never suggest selling" instruction, and every catalog `id` with its `type`. It contains no account name and no transaction note (pass facts only).
  - `normalizeInvestAdvice`:
    - A product id from another type → that type's `defaultProduct` id.
    - An unknown id → default.
    - Empty or whitespace text → `templateText` is used by the caller, signalled by `text: ''`.
    - Text over 600 chars is cut at the last sentence end before 600.
    - A non-object, or a missing intro → null.
  - `investCacheKey` changes when the amount, any part, the profile or `emergencyDone` changes. It does not change when only the value (prices) changes.

  Run: `npx vitest run src/features/invest/investAi.test.ts` — Expected: FAIL.
- [ ] **Step 2: Implement.** Follow `src/features/plan/guideAi.ts` for structure.
- [ ] **Step 3: Run the tests** — PASS. **Commit** — `git commit -m "feat: investment explanations prompt, normalizer and cache key"`

---

### Task 8: Invest tab, month card, type pages and "Bought it"

**Files:**
- Create: `src/features/invest/useInvestData.ts`, `src/features/invest/InvestScreen.tsx`, `src/features/invest/AssetTypeScreen.tsx`, `src/features/invest/BuySheet.tsx`
- Modify: `src/features/shell/TabBar.tsx`, `src/App.tsx`, `src/index.css`, `src/features/settings/SettingsScreen.tsx`

**Interfaces:**
- Consumes: everything above; `useHomeData`, `buildPlanningModel`, `allocateGoals` / `emergencyTargetMinor` (the same "emergency done" test as `guide.ts` step 2).
- Produces: `useInvestData(): { data: InvestModel | null; failed: boolean; reload(): void }`, where
  ```ts
  export interface InvestModel {
    home: HomeData; holdings: Holding[]; txns: InvestmentTxn[]; positions: Position[];
    valuations: Map<string, Valuation>; summary: PortfolioSummary; suggestion: Suggestion; split: Split | null;
    card: ReturnType<typeof monthCard> | null; emergencyDone: boolean; checkinDue: boolean;
  }
  ```
  - `freeBeforeInvestMinor` = this month's `freeMinor + investmentMinor`.
  - Quotes come from `refreshQuotes` for the catalog symbols of held products. FX comes via `getHufPerUnit(quote.currency, today)`; a failed rate counts as unpriced.

- [ ] **Step 1: Routes and tab.**
  - Tab "Invest" (icon `chart`) after Plan, roots `['/invest']`.
  - Routes: `/invest`, `/invest/type/:type` (an invalid type redirects to `/invest`), and `/invest/holding/:id` (placeholder until Task 9).
- [ ] **Step 2: `InvestScreen`**, following the prototype's `invest` and `invest-empty`.
  - **No holdings:** the "You have no investments yet" card.
  - **The month card:**
    - `no_data` → "Track one full month first. Then you'll get a monthly suggestion." plus a link to Settings to set an amount.
    - `nothing_spare` → "Nothing spare this month after savings."
    - Otherwise "Suggested {amount} · invested {y} · {left} left this month", the four split rows (each tappable to its type page, "too small this month" on folded types), the AI intro (cached; template while loading or when the AI fails), and the disclaimer.
  - **Portfolio** (when holdings exist): value, return in Ft and %, a bar of the split against the profile targets, holdings rows (name · platform · value), and "Price not updated" where unpriced.
  - **Check-in banner** when `checkinDue`: "How did the ups and downs feel?" with "Calm, try bolder" (sets the next profile, and `risk_checkin_at` = today) and "Keep it as is" (sets `risk_checkin_at` only).
- [ ] **Step 3: AI call rule.**
  - On opening Invest with a suggestion amount: if `getInvestCache()?.key === investCacheKey(facts)`, use the cache.
  - Otherwise call `invokeLlm` once (guarded by a ref so a re-render never calls twice), normalize, and save.
  - A failure shows the template texts and a "Refresh" button. No auto-retry.
- [ ] **Step 4: `AssetTypeScreen`.**
  - `TYPE_INFO[type].what`, this month's part, and the chosen product (from the AI cache, else `defaultProduct`).
  - The product block shows `where`, `summary`, `risk`, the bond rate and minimum, and "Check the current terms before you buy." The source link opens in a new tab.
  - Below: what you already hold of this type, the AI text (or template), the disclaimer, and the "Bought it" button.
- [ ] **Step 5: `BuySheet`.**
  - Fields: product (prefilled, changeable within the type), amount in HUF (prefilled with this type's part), quantity and price (optional), date (today), platform (prefilled with the product's first `where`; "Other" shows a name field), and pay-from account (`payableAccounts`, default first). Bonds also get a rate, prefilled from the catalog.
  - On save, run `findSmsCandidates`:
    - one candidate → link it silently;
    - several → the sheet asks "Which bank message is this?" with radio rows (date · amount) plus "None of these";
    - none → create.
  - Then `recordBuy`, wait for the reloaded state to contain the new InvestmentTxn (8 s fallback, the Plan 3 pattern), and close.
  - The button is disabled while saving.
- [ ] **Step 6: Settings.**
  - Add the risk profile segmented control (Cautious / Balanced / Bold).
  - Relabel the amount "Monthly investment (optional)". Its help text: "Leave empty to get a suggestion. It comes out of your allowance only when you record a buy."
- [ ] **Step 7: Browser check (controller does it, local dev).**
  - With a throwaway dev account, at phone width, check:
    - the empty state and the `no_data` card;
    - setting an amount in Settings → card with a split;
    - a type page, then a buy from a checking account → the holding appears;
    - the Home allowance drops by exactly the amount;
    - Activity shows "Invested ·".
  - Then `npx tsc --noEmit` and `npx vitest run`.
- [ ] **Step 8: Commit** — `git commit -m "feat: Invest tab with monthly suggestion, type pages and recording a buy"`

---

### Task 9: Holding page, selling, deleting and the drop note

**Files:**
- Create: `src/features/invest/HoldingScreen.tsx`, `src/features/invest/SellSheet.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `useInvestData`, `planSell`, `recordSell`, `deleteInvestmentTxn`, `isBigDrop`, `findProduct`.

- [ ] **Step 1: `HoldingScreen`**, following the prototype's `holding` screen.
  - Name, type, platform, value, cost, and return in Ft and %.
  - Quantity when known, and "Price from {as_of}" or "Price not updated". For bonds: "Estimated from the {rate}% yearly rate".
  - The buy/sell history, newest first. Each row has a delete control with in-page confirmation ("Delete this buy? Its money movement is removed too.") → `deleteInvestmentTxn`.
  - After the last txn is deleted, go back to `/invest`.
- [ ] **Step 2: Drop note.** When `isBigDrop`, show the card "{type title} often swings like this." Its copy, fixed per type in `TYPE_INFO` (add a `drop_note` field in `catalog.ts`): normal for this type, selling after a fall locks the loss in, and decide calmly. No "sell" or "buy more" suggestion.
- [ ] **Step 3: `SellSheet`.**
  - Fields: amount received, quantity (optional, required when the position has a quantity), price (optional), date, and the account it arrived in (`payableAccounts`).
  - `planSell` errors are shown inline. `recordSell` then waits for state, the same as the buy.
- [ ] **Step 4: Browser check (controller, local dev):**
  - Sell part of the test holding → the value and the account balance update, and the Home allowance does not go up.
  - Delete a buy → its Activity row is gone and the allowance comes back.
  - Force a drop by editing a quote in dev, and check that the note shows.
- [ ] **Step 5: Run** `npx vitest run`, `npx tsc --noEmit`. **Commit** — `git commit -m "feat: holding page with sell, delete and a calm note on big drops"`

---

### Task 10: Deploy and live check (controller only)

- [ ] **Step 1:** Ask the user in chat. On a yes: `npx base44 entities push --yes`, then `npm run deploy`. The deploy now includes the `quotes` function.
- [ ] **Step 2: Live checks in the signed-in browser pane, at phone width:**
  1. The Invest tab shows the `no_data` card for the real account.
  2. Set a temporary Settings amount → card, split and AI intro. Reopening makes no new InvokeLLM call (check the network list).
  3. On a type page, record a test buy from a checking account → the holding is listed; `quotes` returns a live price (network 200) or "Price not updated" is shown.
  4. The Home allowance drops by exactly the buy.
  5. Sell part of it, then delete everything.
- [ ] **Step 3:** Clean up every test row this check created: InvestmentTxn, Holding, Transaction, PriceQuote. Restore the Settings amount to empty and clear `invest_cache`.
- [ ] **Step 4:** Update the `base44-deploy-gotchas` memory with what the live check showed: Yahoo from a Base44 function, and function auth through `functions.invoke`.
