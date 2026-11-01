# Plan 1 – Foundation & Money Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, installable PWA on Base44 where the user logs in, keeps accounts and transactions (manual entry, transfers, recurring items), and sees a trustworthy weekly and monthly allowance with month-end close, plus a full data export.

**Architecture:** Base44 `backend-and-client` template (Vite + React + Tailwind frontend hosted by Base44, Base44 entities with RLS as the database). All money logic (allowance, recurrence, month close) lives in pure, unit-tested TypeScript in `src/domain/`. A thin `src/data/` layer wraps the Base44 SDK, and `src/features/` holds the screens. Plan 1 needs no backend functions: recurring items are materialized on app start, idempotently.

**Tech Stack:** Base44 CLI + `@base44/sdk`, React 19, Vite, TypeScript (strict), Tailwind + the template's `components/ui`, `react-router-dom`, `vite-plugin-pwa`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-finance-tracker-design.md` (§2, §3, §4, §5, §6.1, §6.3, §6.4, and the data export from §3/§8)

**Plan roadmap (each its own plan, written after the previous one ships):**
1. **This plan:** foundation, accounts, transactions, recurring, allowance, month close, export.
2. SMS ingestion via iOS Shortcuts (§6.2): ApiKey, `ingestSms` function, review queue.
3. Purchase planner + savings goals + smart-money guide (§6.5, §6.6).
4. Investments (§6.7).
5. News, morning digest, Web Push (§6.8).
6. AI assistant (§6.9).

## Global Constraints

- UI language: **English**. Base currency: **HUF**. Timezone default: `Europe/Budapest`.
- Single user now, multi-user ready: **every user-owned entity** has RLS `create: true`, `read/update/delete: {"created_by_id": "{{user.id}}"}`. Never filter by user in client code instead of RLS.
- Money is stored as **integer minor units** (`*_minor`, HUF ×100, EUR cents). Every amount carries `currency`; every transaction and rule also stores `amount_huf_minor`. Aggregation uses only `amount_huf_minor`.
- Dates are **`YYYY-MM-DD` strings** (`format: "date"`) in the user's timezone; months are `YYYY-MM`. No `Date` arithmetic across timezones in domain code.
- Week starts **Monday**.
- Numbers come from deterministic code; nothing in this plan calls an LLM.
- Mobile-first layout for iPhone; quick add must save an expense in 2–3 taps.
- No secrets in git. `.superpowers/` stays ignored.
- Node ≥ 20.19.0 (Base44 CLI requirement).

## Review Focus

1. **Overspent mid-month:** monthly remaining shows the true negative number, but weekly budget portions are clamped at 0, never negative or nonsensical → test in Task 4.
2. **Recurring items on day 29–31:** a monthly rule starting 31 Jan lands on 28 Feb / 31 Mar / 30 Apr; a yearly 29 Feb rule lands on 28 Feb in non-leap years → tests in Task 3.
3. **Foreign-currency transactions:** an EUR expense counts by its `amount_huf_minor`, and editing amount or currency recalculates the HUF value → test in Task 4 (domain) and a manual check in Task 9.
4. **App not opened for weeks:** on next open each missed recurring occurrence is created exactly once, and reopening creates no duplicates → tests in Task 3 (`dueOccurrences`) and Task 10.
5. **Several unclosed months** (app not opened in December): months close oldest first, and an overspend deficit chains into the next month's free amount → test in Task 5.

---

## File Structure

```
base44/
  config.jsonc, .app.jsonc            (from template)
  auth/config.jsonc                   email/password + Google enabled
  entities/
    User.jsonc                        custom settings fields
    Account.jsonc  Category.jsonc  Transaction.jsonc
    RecurringRule.jsonc  FxRate.jsonc  MonthClose.jsonc
src/
  domain/                             pure logic, no SDK imports
    types.ts                          shared domain types
    money.ts      money.test.ts
    dates.ts      dates.test.ts
    recurrence.ts recurrence.test.ts
    allowance.ts  allowance.test.ts
    monthClose.ts monthClose.test.ts
    balances.ts   balances.test.ts
  data/                               SDK wrappers, one file per entity
    client.ts  accounts.ts  categories.ts  transactions.ts
    recurring.ts  settings.ts  fx.ts  fx.test.ts  monthCloses.ts  export.ts
  features/
    auth/AuthGate.tsx
    shell/AppShell.tsx  shell/TabBar.tsx
    home/HomeScreen.tsx  home/AllowanceBreakdown.tsx  home/MonthClosePrompt.tsx
    transactions/TransactionsScreen.tsx  transactions/QuickAddSheet.tsx  transactions/TransactionForm.tsx
    accounts/AccountsScreen.tsx
    recurring/RecurringScreen.tsx
    settings/SettingsScreen.tsx
  app/startup.ts                      seed categories, materialize recurring, find months to close
  App.tsx  main.tsx
public/icons/  icon-192.png  icon-512.png  apple-touch-icon-180.png
vite.config.ts                        + vite-plugin-pwa
```

---

### Task 1: Scaffold the Base44 project with TypeScript, Vitest, and docs MCP

**Files:**
- Create: everything from `base44 create` (template `backend-and-client`) in the repo root
- Create: `tsconfig.json`, `vitest.config.ts` (or a `test` block in `vite.config.ts`), `src/domain/.gitkeep`
- Modify: `src/**/*.jsx` → `.tsx`, `src/api/base44Client.js` → `src/data/client.ts`, `.gitignore` (merge, keep `.superpowers/`)
- Delete: `base44/entities/task.jsonc` and any example Task UI

**Interfaces:**
- Produces: `src/data/client.ts` exporting `base44` (the configured SDK client); path alias `@/` → `src/`; `npm test` runs `vitest run`; `npm run build` type-checks and builds.

- [ ] **Step 1:** Check `node -v` ≥ 20.19.0; `npm install -g base44@latest`; `base44 login`.
- [ ] **Step 2:** Run `base44 create finance-tracker --path . --template backend-and-client`. If the CLI refuses a non-empty directory, create in `./_scaffold` with the same flags, move its contents (including dotfiles, excluding `.git`) into the root, and delete `_scaffold`. Merge `.gitignore` so `.superpowers/` stays ignored.
- [ ] **Step 3:** Convert to TypeScript: add `typescript`, `@types/react`, `@types/react-dom`; `tsconfig.json` with `"strict": true`, `"jsx": "react-jsx"`, `paths` `@/*` → `src/*`; rename source files; move the SDK client to `src/data/client.ts`. Add `vitest` with `npm test` = `vitest run`.
- [ ] **Step 4:** Remove the example Task entity and UI. Add `site.serveCommand` (`npm run dev`) to `base44/config.jsonc` if the template didn't, so `base44 dev` starts both processes.
- [ ] **Step 5:** Add the docs MCP for future sessions: `claude mcp add --transport http base44-docs https://docs.base44.com/mcp`.
- [ ] **Step 6: Verify.** `npm run build` → succeeds with no type errors. `npm test` → "No test files found" (passes with `--passWithNoTests`). `base44 dev` → backend on `http://localhost:4400`, the frontend serves a blank app shell without console errors.
- [ ] **Step 7: Commit** `chore: scaffold Base44 React app with TypeScript and Vitest`.

---

### Task 2: Domain types, money, and dates

**Files:**
- Create: `src/domain/types.ts`, `src/domain/money.ts`, `src/domain/dates.ts`
- Test: `src/domain/money.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type ISODate = string;   // 'YYYY-MM-DD'
  export type YearMonth = string; // 'YYYY-MM'
  export type TxnKind = 'expense' | 'income' | 'transfer_out' | 'transfer_in';
  export interface Txn {
    id: string; account_id: string; kind: TxnKind;
    amount_minor: number; currency: string; amount_huf_minor: number;
    category_id: string | null; date: ISODate; note?: string;
    source: 'manual' | 'sms' | 'recurring'; needs_review: boolean;
    recurring_rule_id: string | null; transfer_pair_id: string | null;
  }
  export interface RecurringRule {
    id: string; name: string; kind: 'expense' | 'income';
    amount_minor: number; currency: string; amount_huf_minor: number;
    category_id: string | null; account_id: string;
    frequency: 'weekly' | 'monthly' | 'yearly';
    start_date: ISODate; end_date: ISODate | null;
    last_materialized_date: ISODate | null; active: boolean;
  }
  export interface Settings {
    base_currency: 'HUF'; monthly_savings_target_minor: number;
    monthly_investment_amount_minor: number | null; emergency_fund_months: number;
    week_start: 'monday'; digest_time: string; timezone: string;
  }
  export interface MonthClose {
    id: string; month: YearMonth; final_remaining_minor: number; deficit_minor: number;
    leftover_action: 'transferred' | 'kept' | 'none'; transfer_pair_id: string | null;
  }
  export interface Account {
    id: string; name: string; type: 'checking' | 'savings' | 'cash' | 'investment';
    currency: string; opening_balance_minor: number; is_default: boolean;
    is_savings_target: boolean; archived: boolean;
  }
  ```
- Produces (`money.ts`): `toMinor(major: number): number`, `fromMinor(minor: number): number`, `toHufMinor(amountMinor: number, hufPerUnit: number): number` (rounds half away from zero), `formatMoney(minor: number, currency: string): string` (HUF without decimals, others with 2).
- Produces (`dates.ts`): `todayInTz(tz: string, now?: Date): ISODate`, `addDays(d: ISODate, n: number): ISODate`, `monthOf(d: ISODate): YearMonth`, `daysInMonth(m: YearMonth): number`, `firstDay(m: YearMonth): ISODate`, `lastDay(m: YearMonth): ISODate`, `nextMonth(m: YearMonth): YearMonth`, `prevMonth(m: YearMonth): YearMonth`, `weekStart(d: ISODate): ISODate` (Monday), `daysBetweenInclusive(a: ISODate, b: ISODate): number`, `compareDates(a, b): number`.

- [ ] **Step 1: Write failing tests**
  ```ts
  // money.test.ts
  expect(toMinor(285000)).toBe(28_500_000);
  expect(toHufMinor(1_000, 395.5)).toBe(395_500);          // 10.00 EUR → 3 955 Ft
  expect(formatMoney(28_500_000, 'HUF').replace(/\s/g, ' ')).toBe('285 000 Ft');
  expect(formatMoney(1_050, 'EUR')).toMatch(/10[.,]50/);
  // dates.test.ts
  expect(todayInTz('Europe/Budapest', new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  expect(weekStart('2026-11-04')).toBe('2026-11-02');
  expect(weekStart('2026-11-02')).toBe('2026-11-02');
  expect(weekStart('2026-11-08')).toBe('2026-11-02');
  expect(daysInMonth('2028-02')).toBe(29);
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(prevMonth('2026-01')).toBe('2025-12');
  expect(daysBetweenInclusive('2026-11-02', '2026-11-30')).toBe(29);
  ```
- [ ] **Step 2:** `npx vitest run src/domain` → FAIL (modules missing).
- [ ] **Step 3:** Implement. `formatMoney` uses `Intl.NumberFormat('hu-HU', { style: 'currency', currency })`; date math on UTC-noon `Date` objects internally so DST never shifts a day.
- [ ] **Step 4:** `npx vitest run src/domain` → PASS.
- [ ] **Step 5: Commit** `feat(domain): money and date helpers`.

---

### Task 3: Recurrence

**Files:**
- Create: `src/domain/recurrence.ts`
- Test: `src/domain/recurrence.test.ts`

**Interfaces:**
- Consumes: `RecurringRule`, `ISODate`, the date helpers.
- Produces: `occurrencesInRange(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[]` (inclusive; ignores `active` and `last_materialized_date`), `dueOccurrences(rule: RecurringRule, today: ISODate): ISODate[]` (active rules only; dates in `(last_materialized_date ?? day before start_date, today]`).

The anchor is always `start_date`: monthly = same day-of-month as the start, clamped to the month's last day; yearly = same month/day, 29 Feb → 28 Feb in non-leap years; weekly = every 7 days from the start. `end_date` is inclusive.

- [ ] **Step 1: Write failing tests**
  ```ts
  const base = { /* valid RecurringRule */ active: true, end_date: null, last_materialized_date: null };
  // monthly clamp
  expect(occurrencesInRange({ ...base, frequency: 'monthly', start_date: '2026-01-31' }, '2026-02-01', '2026-04-30'))
    .toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  // weekly
  expect(occurrencesInRange({ ...base, frequency: 'weekly', start_date: '2026-11-02' }, '2026-11-01', '2026-11-30'))
    .toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  // yearly leap
  expect(occurrencesInRange({ ...base, frequency: 'yearly', start_date: '2024-02-29' }, '2025-01-01', '2025-12-31'))
    .toEqual(['2025-02-28']);
  // range before start, end_date respected
  expect(occurrencesInRange({ ...base, frequency: 'monthly', start_date: '2026-12-10' }, '2026-11-01', '2026-11-30')).toEqual([]);
  expect(occurrencesInRange({ ...base, frequency: 'monthly', start_date: '2026-01-10', end_date: '2026-03-10' }, '2026-01-01', '2026-12-31'))
    .toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  // due: catch-up after weeks offline, and idempotent bound
  const salary = { ...base, frequency: 'monthly' as const, start_date: '2026-09-10' };
  expect(dueOccurrences(salary, '2026-11-12')).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
  expect(dueOccurrences({ ...salary, last_materialized_date: '2026-11-10' }, '2026-11-12')).toEqual([]);
  expect(dueOccurrences({ ...salary, active: false }, '2026-11-12')).toEqual([]);
  ```
- [ ] **Step 2:** `npx vitest run src/domain/recurrence.test.ts` → FAIL.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Run again → PASS.
- [ ] **Step 5: Commit** `feat(domain): recurrence occurrences and due dates`.

---

### Task 4: Allowance (monthly + weekly)

**Files:**
- Create: `src/domain/allowance.ts`
- Test: `src/domain/allowance.test.ts`

**Interfaces:**
- Consumes: `Txn`, `RecurringRule`, `Settings`, `occurrencesInRange`, the date helpers.
- Produces:
  ```ts
  export interface MonthlyAllowance {
    month: YearMonth;
    recurringIncomeMinor: number; oneOffIncomeMinor: number; recurringExpensesMinor: number;
    savingsTargetMinor: number; investmentMinor: number; previousDeficitMinor: number;
    freeMinor: number; spentMinor: number; remainingMinor: number;
  }
  export interface WeeklyAllowance {
    weekStart: ISODate; weekEnd: ISODate; budgetMinor: number; spentMinor: number; remainingMinor: number;
  }
  export function computeMonthlyAllowance(i: {
    month: YearMonth; rules: RecurringRule[]; txns: Txn[]; settings: Settings; previousDeficitMinor: number;
  }): MonthlyAllowance;
  export function computeWeeklyAllowance(i: {
    today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; previousDeficitMinor: number;
  }): WeeklyAllowance;
  ```

**Definitions (spec §6.4 with its marked decisions):**
- `recurringIncomeMinor` / `recurringExpensesMinor` = Σ rule `amount_huf_minor` × occurrences in the month (all active rules, whether materialized or not).
- `oneOffIncomeMinor` = Σ `income` txns in the month with `recurring_rule_id === null`.
- `investmentMinor` = `monthly_investment_amount_minor ?? 0` (the Plan 4 suggestion replaces the 0).
- `freeMinor` = recurringIncome + oneOffIncome − recurringExpenses − savingsTarget − investment − previousDeficit.
- `spentMinor` = Σ `expense` txns in the month with `recurring_rule_id === null`, from **any** account. Transfers never count.
- `remainingMinor` = free − spent (may be negative).
- Weekly: for each month M touched by the week Mon–Sun: `portion(M) = max(0, floor(remainingAtWeekStart(M) × daysOfWeekInM / daysFrom(max(weekStart, firstDay(M)))ToEndOfM))`, where `remainingAtWeekStart(M)` = free(M) − spent(M) on dates before `max(weekStart, firstDay(M))`. A next month's portion uses `previousDeficitMinor = 0` (unknown until close). `budget` = Σ portions, `spent` = Σ non-recurring expenses dated within the week, `remaining` = budget − spent.

- [ ] **Step 1: Write failing tests** (fixture: settings savings 100 000 Ft, investment 30 000 Ft; rules: salary income 600 000 Ft monthly from 2026-01-10, rent expense 200 000 Ft monthly from 2026-01-01, Netflix 5 000 Ft monthly from 2026-01-15; all amounts ×100 in code)
  ```ts
  const txns = [
    expense('2026-11-02', 15_000_00),                        // groceries
    expense('2026-11-03', 10_000_00),                        // dining
    income('2026-11-20', 20_000_00),                         // one-off bonus
    expense('2026-11-01', 200_000_00, { recurring_rule_id: 'rent' }), // materialized rent: not counted again
    transferOut('2026-11-05', 50_000_00), transferIn('2026-11-05', 50_000_00), // ignored
    expense('2026-11-06', 1_000_00, { currency: 'EUR', amount_minor: 2_53, amount_huf_minor: 1_000_00 }), // EUR counted by HUF value
  ];
  const nov = computeMonthlyAllowance({ month: '2026-11', rules, txns, settings, previousDeficitMinor: 0 });
  expect(nov.freeMinor).toBe(285_000_00);   // 620 000 − 205 000 − 100 000 − 30 000
  expect(nov.spentMinor).toBe(26_000_00);   // 15 000 + 10 000 + 1 000
  expect(nov.remainingMinor).toBe(259_000_00);
  expect(computeMonthlyAllowance({ month: '2026-11', rules, txns, settings, previousDeficitMinor: 40_000_00 }).freeMinor)
    .toBe(245_000_00);

  const wk = computeWeeklyAllowance({ today: '2026-11-04', rules, txns, settings, previousDeficitMinor: 0 });
  expect(wk).toEqual({ weekStart: '2026-11-02', weekEnd: '2026-11-08',
    budgetMinor: 6_879_310, spentMinor: 26_000_00, remainingMinor: 6_879_310 - 26_000_00 });
  // 28 500 000 × 7 / 29 = 6 879 310 (floor)

  // cross-month week: Mon 30 Nov → Sun 6 Dec
  const cross = computeWeeklyAllowance({ today: '2026-11-30', rules, txns, settings, previousDeficitMinor: 0 });
  expect(cross.budgetMinor).toBe(25_900_000 + 5_129_032);
  // Nov: 28 500 000 − 2 600 000 spent before 30 Nov, 1 of 1 day; Dec: free 26 500 000 × 6 / 31 floored

  // overspent: portion clamps at 0, monthly remaining stays negative
  const broke = [...txns, expense('2026-11-10', 400_000_00)];
  expect(computeMonthlyAllowance({ month: '2026-11', rules, txns: broke, settings, previousDeficitMinor: 0 }).remainingMinor)
    .toBe(-141_000_00);
  expect(computeWeeklyAllowance({ today: '2026-11-16', rules, txns: broke, settings, previousDeficitMinor: 0 }).budgetMinor).toBe(0);
  ```
- [ ] **Step 2:** `npx vitest run src/domain/allowance.test.ts` → FAIL.
- [ ] **Step 3:** Implement per the definitions above.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(domain): weekly and monthly allowance`.

---

### Task 5: Month close and account balances

**Files:**
- Create: `src/domain/monthClose.ts`, `src/domain/balances.ts`
- Test: `src/domain/monthClose.test.ts`, `src/domain/balances.test.ts`

**Interfaces:**
- Consumes: `computeMonthlyAllowance`, `MonthClose`, `Account`, `Txn`.
- Produces:
  - `monthsToClose(today: ISODate, earliestDataMonth: YearMonth | null, closes: MonthClose[]): YearMonth[]` – every month strictly before `monthOf(today)` and ≥ `earliestDataMonth` without a close record, oldest first.
  - `closeOutcome(a: MonthlyAllowance): { leftoverMinor: number; deficitMinor: number }` – leftover = max(0, remaining), deficit = max(0, −remaining).
  - `previousDeficit(month: YearMonth, closes: MonthClose[]): number` – `deficit_minor` of the close for `prevMonth(month)`, or 0.
  - `accountBalanceMinor(account: Account, txns: Txn[]): number` – opening + income − expense + transfer_in − transfer_out, using `amount_minor` (the account's currency).

- [ ] **Step 1: Write failing tests**
  ```ts
  expect(monthsToClose('2027-01-15', '2026-11', [])).toEqual(['2026-11', '2026-12']);
  expect(monthsToClose('2027-01-15', '2026-11', [close('2026-11')])).toEqual(['2026-12']);
  expect(monthsToClose('2026-11-15', null, [])).toEqual([]);
  expect(closeOutcome({ ...a, remainingMinor: 259_000_00 })).toEqual({ leftoverMinor: 259_000_00, deficitMinor: 0 });
  expect(closeOutcome({ ...a, remainingMinor: -40_000_00 })).toEqual({ leftoverMinor: 0, deficitMinor: 40_000_00 });
  // chained: November overspent by 40 000 → December free reduced
  expect(previousDeficit('2026-12', [close('2026-11', { deficit_minor: 40_000_00 })])).toBe(40_000_00);
  expect(accountBalanceMinor(acct({ opening_balance_minor: 100_000_00 }),
    [income(..., 600_000_00), expense(..., 200_000_00), transferOut(..., 50_000_00)])).toBe(450_000_00);
  ```
- [ ] **Step 2:** Run `npx vitest run src/domain` → FAIL on the new files.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(domain): month close and balances`.

---

### Task 6: Entities with RLS, data layer, FX rates, category seed

**Files:**
- Create: `base44/entities/{User,Account,Category,Transaction,RecurringRule,FxRate,MonthClose}.jsonc`
- Create: `src/data/{accounts,categories,transactions,recurring,settings,fx,monthCloses}.ts`
- Test: `src/data/fx.test.ts`

**Interfaces:**
- Consumes: domain types (Task 2), `base44` client (Task 1).
- Produces (each file exports async functions over `base44.entities.<Name>`):
  - `accounts.ts`: `listAccounts(): Promise<Account[]>`, `createAccount(a: Omit<Account,'id'>)`, `updateAccount(id, patch)`.
  - `categories.ts`: `listCategories(): Promise<Category[]>`, `ensureDefaultCategories(): Promise<void>` (bulkCreate the defaults only if the list is empty). `Category = { id; name; kind: 'expense'|'income'; icon: string; monthly_budget_minor: number | null }`.
  - `transactions.ts`: `listTransactions(range: { from: ISODate; to: ISODate }): Promise<Txn[]>`, `listAllTransactions(): Promise<Txn[]>`, `createTransaction(t: Omit<Txn,'id'>)`, `updateTransaction(id, patch)`, `deleteTransaction(id)` (deletes the partner leg when `transfer_pair_id` is set), `createTransfer(i: { fromAccountId; toAccountId; amountMinor; currency; date; note? }): Promise<string>` (two legs sharing a generated `transfer_pair_id`, returns it), `earliestTransactionMonth(): Promise<YearMonth | null>`.
  - `recurring.ts`: `listRules()`, `createRule`, `updateRule`, `deleteRule`.
  - `settings.ts`: `getSettings(): Promise<Settings>` (from `base44.auth.me()`, applying defaults), `updateSettings(patch: Partial<Settings>)` (`base44.auth.updateMe`).
  - `fx.ts`: `getHufPerUnit(currency: string, date: ISODate, fetchFn = fetch): Promise<number>` – 1 for HUF; otherwise the `FxRate` cache, else `GET https://api.frankfurter.dev/v1/{date}?from={currency}&to=HUF` → `rates.HUF`, cached as `FxRate { pair: '{CUR}HUF', date, rate }`.
  - `monthCloses.ts`: `listMonthCloses()`, `createMonthClose(c: Omit<MonthClose,'id'>)`.

Entity notes: every user-owned entity carries the Global Constraints RLS block. `User.jsonc` holds only the custom `Settings` fields (no redefinition of built-ins; no `required`). Field names equal the domain type names. Enums as `string` + `enum`. Default categories (expense): Groceries, Dining out, Transport, Housing, Utilities, Subscriptions, Health, Shopping, Entertainment, Travel, Gifts, Other; (income): Salary, Bonus, Other income.

- [ ] **Step 1: Write failing tests** for `getHufPerUnit` with an injected `fetchFn` and the cache functions mocked (`vi.mock('@/data/client')`):
  ```ts
  expect(await getHufPerUnit('HUF', '2026-11-01', fetchSpy)).toBe(1);   // no fetch
  expect(fetchSpy).not.toHaveBeenCalled();
  // cache miss → fetch → cache write
  fetchSpy.mockResolvedValue(json({ rates: { HUF: 395.5 } }));
  expect(await getHufPerUnit('EUR', '2026-11-02', fetchSpy)).toBe(395.5);
  expect(fetchSpy).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/2026-11-02?from=EUR&to=HUF');
  // cache hit → no fetch
  ```
- [ ] **Step 2:** `npx vitest run src/data/fx.test.ts` → FAIL.
- [ ] **Step 3:** Write the entity files and data modules; implement `fx.ts`.
- [ ] **Step 4:** `npx vitest run` → PASS. `base44 entities push` (against the dev app) → all seven entities accepted.
- [ ] **Step 5: Commit** `feat(data): entities with RLS, SDK data layer, FX cache`.

---

### Task 7: Auth gate, app shell, PWA

**Files:**
- Create: `src/features/auth/AuthGate.tsx`, `src/features/shell/AppShell.tsx`, `src/features/shell/TabBar.tsx`, `src/app/startup.ts`, `public/icons/*`
- Modify: `src/App.tsx`, `src/main.tsx`, `vite.config.ts`, `base44/auth/config.jsonc`, `index.html`

**Interfaces:**
- Consumes: `ensureDefaultCategories`, `getSettings`.
- Produces: routes `/` (Home), `/transactions`, `/recurring`, `/accounts`, `/settings`, rendered inside `AppShell` with a bottom `TabBar` (Home, Transactions, Recurring, Settings; Accounts reachable from Settings and Home). `runStartup(): Promise<StartupResult>` in `startup.ts`, extended in Tasks 10 and 11; in this task it only calls `ensureDefaultCategories()`.

- [ ] **Step 1:** Enable auth methods: `base44 auth password-login` on and Google social login on (or edit `base44/auth/config.jsonc`), then `base44 auth push`.
- [ ] **Step 2:** `AuthGate`: on mount `base44.auth.isAuthenticated()`; if false → `base44.auth.redirectToLogin(window.location.href)`; while checking, show a spinner; when authenticated, run `runStartup()` once, then render children. Logout lives in Settings.
- [ ] **Step 3:** PWA: `vite-plugin-pwa` with `registerType: 'autoUpdate'`, manifest `{ name: 'Finance Tracker', short_name: 'Finance', display: 'standalone', start_url: '/', background_color, theme_color, icons 192/512 maskable }`; precache only the app shell; **no runtime caching of Base44 API calls**. `index.html`: `apple-touch-icon` (180), `apple-mobile-web-app-capable`, `viewport-fit=cover`; layout honors `env(safe-area-inset-*)`. Reference config: `/Users/mrkuhne/Applications/Personal/Mezo/mezo/frontend/vite.config.ts`.
- [ ] **Step 4: Verify locally.** `base44 dev`; in the browser pane at mobile viewport (375×812): the login redirect works, after login the tab bar shows, the categories exist (`Category.list()` in the console returns 15). `npm run build` → the output contains `manifest.webmanifest` and `sw.js`.
- [ ] **Step 5: Verify on the iPhone (spec §8 spike 1).** `base44 deploy`, then `base44 site open` → the user opens the URL in Safari on the iPhone, Add to Home Screen, launches from the icon. Expected: it opens standalone (no Safari chrome), login works **inside** the standalone app (email/password and Google), and after force-quitting and reopening it is still logged in. If the Google redirect leaves standalone mode or loses the session, record the finding in the spec §8 and keep email/password as the documented login.
- [ ] **Step 6: Commit** `feat: auth gate, app shell, installable PWA`.

---

### Task 8: Accounts and settings screens

**Files:**
- Create: `src/features/accounts/AccountsScreen.tsx`, `src/features/settings/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `listAccounts/createAccount/updateAccount`, `accountBalanceMinor`, `listAllTransactions`, `getSettings/updateSettings`, `formatMoney`.

- [ ] **Step 1:** Accounts: list with current balance (in account currency) and archived toggle; create/edit form (name, type, currency HUF/EUR/USD/GBP, opening balance, default). Exactly one default account: setting a new default clears the old one. Exactly one `savings` account is the month-close target (`is_savings_target`): the first savings account created gets it, and the user can move it to another one.
- [ ] **Step 2:** Settings: monthly savings target, monthly investment amount (empty = not set), emergency fund months (default 6), timezone (default `Europe/Budapest`), link to Accounts, Logout.
- [ ] **Step 3: Verify** in the browser pane (375×812): create "MBH" (checking, HUF, default), "Revolut" (checking, HUF), "Savings" (savings, savings target); balances show the opening amounts; settings persist after reload.
- [ ] **Step 4: Commit** `feat: accounts and settings screens`.

---

### Task 9: Transactions – quick add, list, edit, transfers

**Files:**
- Create: `src/features/transactions/TransactionsScreen.tsx`, `QuickAddSheet.tsx`, `TransactionForm.tsx`

**Interfaces:**
- Consumes: transactions data API, `listCategories`, `listAccounts`, `getHufPerUnit`, `toMinor`, `toHufMinor`, `formatMoney`.
- Produces: `<QuickAddSheet open onClose />`, opened by a floating "+" button rendered by `AppShell` on every tab.

- [ ] **Step 1:** QuickAddSheet: the amount field is focused on open with a numeric keypad (`inputMode="decimal"`); below it the 6 most recently used expense categories as chips (one tap selects **and saves** when the amount is filled); the "More" chip opens the full list; the default account and today's date are preselected, with an expense/income toggle and an optional note behind "Details". Save computes `amount_huf_minor` via `getHufPerUnit(currency, date)`.
- [ ] **Step 2:** TransactionsScreen: grouped by day, newest first, current month by default with month navigation; `needs_review` items highlighted; tap → TransactionForm (edit all fields, delete with confirm). Editing amount, currency, or date recomputes `amount_huf_minor`. A "Transfer" mode in the form calls `createTransfer`; deleting either leg removes both.
- [ ] **Step 3: Verify** in the browser pane (375×812): amount → category chip saves an expense in 2 taps after typing; add a 10 EUR expense → the list shows 10,00 € with its HUF value; edit it to 20 EUR → the HUF value doubles (Review Focus 3); transfer MBH → Savings 50 000 Ft → both balances change, deleting one leg removes both.
- [ ] **Step 4: Commit** `feat: quick add, transaction list, transfers`.

---

### Task 10: Recurring rules and materialization

**Files:**
- Create: `src/features/recurring/RecurringScreen.tsx`
- Modify: `src/app/startup.ts`
- Test: `src/app/startup.test.ts`

**Interfaces:**
- Consumes: recurring data API, `dueOccurrences`, `createTransaction`, `listTransactions`, `getHufPerUnit`.
- Produces: `materializeRecurring(today: ISODate, deps: { listRules; listTransactions; createTransaction; updateRule; getHufPerUnit }): Promise<number>` (returns the number of created txns), called from `runStartup()`.

For each due date: skip if a txn with that `recurring_rule_id` and `date` already exists (guards against two tabs racing); otherwise create it (`source: 'recurring'`, HUF value at that date); then set `last_materialized_date` to the last due date.

- [ ] **Step 1: Write failing tests** with in-memory fakes for `deps`:
  ```ts
  // salary from 2026-09-10, never materialized, today 2026-11-12
  expect(await materializeRecurring('2026-11-12', deps)).toBe(3);
  expect(store.txns.map(t => t.date)).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
  expect(store.rules[0].last_materialized_date).toBe('2026-11-10');
  expect(await materializeRecurring('2026-11-12', deps)).toBe(0);           // reopen: no duplicates
  // pre-existing txn for 2026-10-10 (other tab) → only 2 created
  ```
- [ ] **Step 2:** `npx vitest run src/app/startup.test.ts` → FAIL.
- [ ] **Step 3:** Implement `materializeRecurring`, wire it into `runStartup()`, build RecurringScreen (list grouped income/expense with the monthly total; create/edit/deactivate; fields: name, kind, amount, currency, category, account, frequency, start date, optional end date).
- [ ] **Step 4:** `npx vitest run` → PASS. In the browser pane: add salary (monthly, start two months ago) → after reload the transactions list shows the past occurrences exactly once.
- [ ] **Step 5: Commit** `feat: recurring rules with idempotent materialization`.

---

### Task 11: Home – allowance, breakdown, month-close prompt

**Files:**
- Create: `src/features/home/HomeScreen.tsx`, `AllowanceBreakdown.tsx`, `MonthClosePrompt.tsx`
- Modify: `src/app/startup.ts`

**Interfaces:**
- Consumes: `computeMonthlyAllowance`, `computeWeeklyAllowance`, `monthsToClose`, `closeOutcome`, `previousDeficit`, `createMonthClose`, `createTransfer`, `earliestTransactionMonth`, `listMonthCloses`, `accountBalanceMinor`.
- Produces: `runStartup()` now also returns `pendingCloses: YearMonth[]`.

- [ ] **Step 1:** HomeScreen: two large cards on top, **"Left this week"** (weekly remaining, with "of X" budget) and **"Left this month"** (monthly remaining, with "of X" free); negative values in red. Below them: total balance across non-archived accounts (HUF value), `needs_review` count, the last 5 transactions. Tapping a card opens AllowanceBreakdown showing every term of the §6.4 formula as a labeled line (income recurring, income one-off, recurring expenses, savings target, investment, last month's overspend, spent so far, and per-day portions for the week).
- [ ] **Step 2:** MonthClosePrompt: for each pending month, oldest first, show the final result. Leftover > 0 → "Move X to Savings?" with **Move** (creates a transfer from the default account to the savings-target account dated the month's last day, then a `MonthClose` with `leftover_action: 'transferred'`) or **Keep** (`'kept'`). Deficit > 0 → "You overspent X. Next month starts with X less." with **OK** (`'none'`, `deficit_minor` set). A month is closed only through this prompt, never silently.
- [ ] **Step 3: Verify** in the browser pane: with the Task 4 fixture data entered for November, Home shows "Left this month" 259 000 Ft; changing the device date isn't possible, so verify the close flow by creating a transaction dated in a past month and reloading → the prompt appears for that month; after Move, the Savings balance rises and the prompt does not reappear.
- [ ] **Step 4: Commit** `feat: home allowance cards, breakdown, month close`.

---

### Task 12: Data export, deploy, and device check

**Files:**
- Create: `src/data/export.ts`
- Modify: `src/features/settings/SettingsScreen.tsx`

**Interfaces:**
- Produces: `exportAllJson(): Promise<Blob>` (`{ exported_at, version: 1, accounts, categories, transactions, recurring_rules, month_closes, settings }`), `exportTransactionsCsv(): Promise<Blob>` (columns: date, account, kind, amount, currency, amount_huf, category, note, source).

- [ ] **Step 1:** Implement both and add "Export data (JSON)" and "Export transactions (CSV)" buttons in Settings (download via object URL; on iOS standalone, fall back to `navigator.share({ files })` when the download link doesn't work).
- [ ] **Step 2:** `npm test` → all green. `npm run build` → no type errors.
- [ ] **Step 3:** `base44 deploy` → succeeds; `base44 site open`.
- [ ] **Step 4: Device check (user, on iPhone):** the installed PWA updates to the new version; add an expense in 2–3 taps; the allowance cards match the breakdown; the JSON export saves to Files.
- [ ] **Step 5: Commit** `feat: data export`, then tag `v0.1.0`.
