# Plan 3 – Purchase Planner, Savings Goals and Smart Money Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a bigger purchase the user enters a few options, sees exactly what each does to this month and when it is safe to buy, gets an AI recommendation with concrete changes they can apply in one tap, and on a new Plan tab sees savings goals with the emergency fund and a step-by-step smart-money guide written for their own numbers.

**Architecture:** All numbers come from pure, unit-tested functions in `src/domain/` (`planning.ts`, `savings.ts`, `guide.ts`) built on the existing allowance code. The AI is called from the client (`base44.integrations.Core.InvokeLLM` with a JSON schema) through one thin wrapper. It receives only aggregated numbers and category names, and its answers pass through pure normalizers that drop anything invalid before the UI shows them. AI answers are cached on the record they belong to (`PurchasePlan.advice`, `User.guide_cache`), so reopening a screen costs no credits. Applying a recommendation writes either month-only overrides (`User.month_overrides`) or permanent values, and the allowance reads the month-only savings override. A bought purchase becomes a normal expense (one-time) or a monthly `RecurringRule` (installments), so the existing allowance, materializer and "no double deduction" rules cover it with no new allowance code.

**Tech Stack:** As Plans 1–2 (Vite + React + TypeScript, Tailwind/prototype CSS, `@base44/sdk`, Vitest). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-finance-tracker-design.md` (§6.5, §6.6, §5 `SavingsGoal` / `PurchasePlan` / `PurchaseOption`, §6.4 installments line, §7). UI and copy: `docs/prototype/finance-tracker-prototype.html` screens `plan`, `couch-new`, `couch`, `couch-ai`, `savings`, `guide`.

**Builds on:** Plans 1–2, shipped on `main`.

## Global Constraints

- Everything in Plans 1–2's Global Constraints still holds: English UI, HUF base, `Europe/Budapest`, integer minor units (HUF × 100), `YYYY-MM-DD` dates, `YYYY-MM` months, RLS `created_by_id` on every user entity, prototype look and copy.
- Git: work directly on `main`, commit and push without asking, run `npm test` before every push (`CLAUDE.md`).
- **Deploys** (`npm run deploy`, `base44 entities push`) touch production. The controller asks the user in chat once per deploy step and never hands them to subagents.
- **Numbers are computed by code; the AI only interprets and suggests. The AI never invents a balance** (§6.5). Every amount on screen comes from `src/domain/`, never from AI text fields.
- AI input is aggregated numbers, plan titles, option names and prices, and category names with their budgets and this month's spend. No transactions, account names, SMS text or notes (§7).
- AI calls: `model: 'claude-sonnet-5'` (decision support uses the stronger model, §7). One call per user action, never in a loop or on every render.
- All AI content is educational. The copy "General education, not personal financial advice. You decide what to do." appears on the Guide, and "The assistant suggests. Numbers come from your own data, and nothing changes until you tap Apply." appears on the Recommendation screen (prototype).
- Nothing the AI suggests is written until the user taps **Apply changes** (§6.5).
- Purchase plan amounts are HUF only in v1 (`currency: 'HUF'` stored for consistency with §5).
- Option links are shown as links only when they start with `http://` or `https://`.

## Review Focus

1. **A price the user can never afford from the free allowance** (set-aside is 0 or the wait passes 24 months): "Safe to buy" says "Not within 2 years", nothing shows `NaN`, `Infinity` or a negative month → `simulateOption` tests in Task 2.
2. **A brand-new user with no complete month of data and no transactions:** typical spend, average expenses and months covered fall back without dividing by zero; the emergency fund shows "—" months instead of `Infinity` → fallback tests in Task 2 and `monthsCovered` test in Task 3.
3. **The AI answers with junk** (unknown category, a savings "cut" that is an increase, negative or huge amounts, a month in the past, option number 0 or 9): the bad change is dropped, an unusable answer becomes "Could not get a suggestion", and the deterministic impact numbers stay on screen → `normalizeAdvice` tests in Task 6.
4. **A month-only savings change** must change that month's allowance only, not the next month's and not the permanent setting → `savingsTargetFor` and `planApply` tests in Tasks 2 and 6.
5. **"Mark as bought" tapped twice, or on a plan already bought:** exactly one expense or one recurring rule → `planPurchaseRecord` returns `already_recorded` (Task 5), and the button is disabled while saving.
6. **A pasted link like `javascript:alert(1)`** is rejected when saving the plan → `validatePlanDraft` test in Task 4.

---

## File Structure

```
base44/entities/
  purchase-plan.jsonc        NEW  PurchasePlan (RLS created_by_id)
  purchase-option.jsonc      NEW  PurchaseOption
  savings-goal.jsonc         NEW  SavingsGoal
  user.jsonc                 MOD  + month_overrides, has_expensive_debt, guide_cache
src/
  domain/
    types.ts                 MOD  PurchasePlan, PurchaseOption, SavingsGoal, MonthOverride, Advice*, Settings fields
    dates.ts  dates.test.ts  MOD  addMonths, monthsBetween
    allowance.ts (+test)     MOD  savingsTargetFor; computeMonthlyAllowance uses it
    planning.ts (+test)      NEW  history averages, set-aside, simulateOption, emergencyAfterMinor, buildPlanningModel
    savings.ts (+test)       NEW  emergency target, goal allocation, months covered / to reach
    guide.ts (+test)         NEW  the five guide steps and their status
  data/
    purchasePlans.ts         NEW  plans + options CRUD
    savingsGoals.ts          NEW  goals CRUD
    settings.ts              MOD  new defaults; guide cache read/write
    ai.ts                    NEW  invokeLlm wrapper (the only InvokeLLM caller in src/)
    export.ts (+test)        MOD  plans, options, goals in the JSON export
  features/plan/
    usePlanData.ts           NEW  loads home data + categories + plans + options + goals; builds PlanningModel
    planDraft.ts (+test)     NEW  validatePlanDraft, diffOptions
    PlanScreen.tsx           NEW  /plan (list, savings card, guide banner)
    PlanEditScreen.tsx       NEW  /plan/new, /plan/:id/edit (screen 1)
    PlanImpactScreen.tsx     NEW  /plan/:id (screen 2, choose, bought, drop)
    purchaseRecord.ts (+test) NEW pickPurchaseAccount, planPurchaseRecord
    advice.ts (+test)        NEW  prompt, schema, normalizeAdvice, adviceCutsMinor, adviceFingerprint
    applyChanges.ts (+test)  NEW  planApply
    AdviceScreen.tsx         NEW  /plan/:id/advice (screen 3)
    budgets.ts (+test)       NEW  categoryBudgetRows, effectiveCategoryBudget
    BudgetsScreen.tsx        NEW  /budgets
    SavingsScreen.tsx        NEW  /savings
    guideAi.ts (+test)       NEW  guide prompt, schema, normalizeGuide, guideCacheKey
    GuideScreen.tsx          NEW  /guide
  features/shell/TabBar.tsx  MOD  + Plan tab
  features/shell/Icons.tsx   MOD  + piggy, sofa, info symbols (from the prototype sprite) if missing
  index.css                  MOD  + prototype planner CSS (.opt, .kv, .aibox, .change, .steps, .ladder, .rung)
  App.tsx                    MOD  new routes
```

---

### Task 1: Entities, types and data layer

**Files:**
- Create: `base44/entities/purchase-plan.jsonc`, `base44/entities/purchase-option.jsonc`, `base44/entities/savings-goal.jsonc`, `src/data/purchasePlans.ts`, `src/data/savingsGoals.ts`
- Modify: `base44/entities/user.jsonc`, `src/domain/types.ts`, `src/data/settings.ts`, `src/data/export.ts`, `src/data/export.test.ts`

**Interfaces:**
- Produces (types in `src/domain/types.ts`):
  ```ts
  export interface MonthOverride { savings_target_minor?: number; category_budgets?: Record<string, number> }
  // Settings gains:
  month_overrides: Record<YearMonth, MonthOverride>;   // default {}
  has_expensive_debt: boolean | null;                  // default null (not answered)
  export type PlanStatus = 'considering' | 'decided' | 'bought' | 'dropped';
  export interface PurchasePlan {
    id: string; title: string; needed_by: ISODate | null; status: PlanStatus;
    selected_option_id: string | null; planned_month: YearMonth | null;
    transaction_id: string | null; recurring_rule_id: string | null; advice: StoredAdvice | null;
  }
  export interface PurchaseOption {
    id: string; plan_id: string; name: string; price_minor: number; currency: 'HUF';
    payment: 'one_time' | 'installments'; installment_minor: number | null; installment_count: number | null;
    link: string | null; note: string | null; position: number;
  }
  export interface SavingsGoal {
    id: string; name: string; kind: 'emergency' | 'custom'; target_minor: number | null;
    account_id: string; priority: number; icon: string;
  }
  export type AdviceChange =
    | { type: 'category_budget'; category_id: string; category_name: string; from_minor: number | null; to_minor: number }
    | { type: 'savings_target'; from_minor: number; to_minor: number }
    | { type: 'postpone'; month: YearMonth };
  export interface Advice { option_index: number; month: YearMonth; summary: string; others: string; changes: AdviceChange[] }
  export interface StoredAdvice { fingerprint: string; generated_at: string; advice: Advice }
  export interface GuideCache { key: string; intro: string; tips: Record<number, string>; generated_at: string }
  ```
- Produces (data): `listPlans(): Promise<PurchasePlan[]>`, `getPlan(id): Promise<PurchasePlan | null>`, `createPlan(p: Omit<PurchasePlan,'id'>)`, `updatePlan(id, patch)`, `deletePlan(id)` (also deletes its options), `listAllOptions(): Promise<PurchaseOption[]>`, `listOptionsForPlan(planId)`, `createOption`, `updateOption`, `deleteOption` in `src/data/purchasePlans.ts`; `listGoals`, `createGoal`, `updateGoal`, `deleteGoal` in `src/data/savingsGoals.ts`; `getGuideCache(): Promise<GuideCache | null>`, `saveGuideCache(c: GuideCache): Promise<void>` in `src/data/settings.ts`.
- `ExportData` gains `purchase_plans`, `purchase_options`, `savings_goals`.

- [ ] **Step 1: Write the entities.** Follow `recurring-rule.jsonc` for shape and the standard RLS block (`create: true`, read/update/delete `{"created_by_id": "{{user.id}}"}`). Nullable fields use `["<type>", "null"]` like `transaction.jsonc`. Required: plan `title`, `status`; option `plan_id`, `name`, `price_minor`, `currency`, `payment`, `position`; goal `name`, `kind`, `account_id`, `priority`. Enums exactly as the types above; `currency` enum `["HUF"]`. `advice` and `guide_cache` are `["object", "null"]`. User gains `month_overrides` (`object`), `has_expensive_debt` (`["boolean","null"]`), `guide_cache` (`["object","null"]`).
- [ ] **Step 2: Add the types and the data modules.** Copy the `recurring.ts` pattern (`KEYS`, `NULLABLE`, `pick`, `stripNulls`). `toPlan` maps a missing `status` to `'considering'`; `toOption` maps a missing `position` to 0 and sorts nothing (callers sort by `position`). `DEFAULT_SETTINGS` gains `month_overrides: {}` and `has_expensive_debt: null`; `getSettings` keeps `month_overrides` only when it is a plain object. `getGuideCache` reads `guide_cache` from `auth.me()` and returns null unless it has string `key` and `intro`.
- [ ] **Step 3: Extend the export test, run it, see it fail.** In `src/data/export.test.ts`, the "includes version, exported_at and all collections" test passes `purchase_plans: []`, `purchase_options: []`, `savings_goals: []` and asserts `Object.keys(o)` contains all three.

Run: `npx vitest run src/data/export.test.ts` — Expected: FAIL (type error or missing keys).
- [ ] **Step 4: Extend `ExportData` and `exportAllJson`** to load and include the three collections. Run the test — Expected: PASS. Run `npx tsc --noEmit` — Expected: no errors.
- [ ] **Step 5: Commit**
```bash
git add base44/entities src/domain/types.ts src/data
git commit -m "feat: purchase plan, option and savings goal entities and data layer"
```

---

### Task 2: Planning math (overrides, averages, impact)

**Files:**
- Modify: `src/domain/dates.ts`, `src/domain/dates.test.ts`, `src/domain/allowance.ts`, `src/domain/allowance.test.ts`
- Create: `src/domain/planning.ts`, `src/domain/planning.test.ts`

**Interfaces:**
- Consumes: `computeMonthlyAllowance`, `MonthlyAllowance`, `Txn`, `RecurringRule`, `Settings`, `MonthClose`, `PurchaseOption`, `previousDeficit`.
- Produces:
  ```ts
  // dates.ts
  export function addMonths(m: YearMonth, n: number): YearMonth;          // n may be negative
  export function monthsBetween(from: YearMonth, to: YearMonth): number; // '2026-11'→'2027-01' = 2; negative if to < from
  // allowance.ts
  export function savingsTargetFor(settings: Settings, month: YearMonth): number;
  // planning.ts
  export interface MonthTotals { month: YearMonth; spendMinor: number; expensesMinor: number; incomeMinor: number }
  export function completeMonthTotals(txns: Txn[], today: ISODate): MonthTotals[];   // every complete month from the earliest txn's month to the month before today's, oldest first
  export function typicalMonthlySpendMinor(txns: Txn[], today: ISODate): number;
  export function averageMonthlyExpensesMinor(txns: Txn[], rules: RecurringRule[], settings: Settings, today: ISODate): number;
  export function averageMonthlyIncomeMinor(txns: Txn[], rules: RecurringRule[], settings: Settings, today: ISODate): number;
  export interface OptionImpact { leftThisMonthMinor: number; touchesSavingsMinor: number; monthlyCostMinor: number; safeMonth: YearMonth | null }
  export function simulateOption(i: { option: Pick<PurchaseOption,'payment'|'price_minor'|'installment_minor'|'installment_count'>; remainingMinor: number; setAsideMinor: number; currentMonth: YearMonth }): OptionImpact;
  export function emergencyAfterMinor(i: { option: Pick<PurchaseOption,'payment'|'price_minor'|'installment_minor'|'installment_count'>; remainingMinor: number; setAsideMinor: number; currentMonth: YearMonth; plannedMonth: YearMonth; cutsMinor: number; emergencySavedMinor: number }): number;
  export interface PlanningModel {
    today: ISODate; month: YearMonth; remainingMinor: number; setAsideMinor: number; typicalSpendMinor: number;
    avgExpensesMinor: number; avgIncomeMinor: number; trackedMonths: number;
  }
  export function buildPlanningModel(i: { today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; closes: MonthClose[] }): PlanningModel;
  export const SAFE_HORIZON_MONTHS = 24;
  ```

Definitions the tests pin (all HUF minor):
- spend = `kind === 'expense' && recurring_rule_id === null` (same as allowance `isSpend`); expenses = every `kind === 'expense'`; income = every `kind === 'income'`. Transfers never count.
- `typicalMonthlySpendMinor`: average spend of the **last 3** complete months (fewer if fewer exist), rounded down. With no complete month: this month's spend so far × days in month ÷ day of month, rounded down. No txns: 0.
- `averageMonthlyExpensesMinor` / `averageMonthlyIncomeMinor`: average of the last 3 complete months, rounded down. With no complete month: this month's `computeMonthlyAllowance` `recurringExpensesMinor + typicalMonthlySpendMinor` (expenses) or `recurringIncomeMinor + oneOffIncomeMinor` (income), previous deficit 0.
- `setAsideMinor` = `max(0, nextMonthFree − typicalSpend)`, where `nextMonthFree` is `computeMonthlyAllowance` for `addMonths(month, 1)` with previous deficit 0. `remainingMinor` = this month's `remainingMinor` with `previousDeficit(month, closes)`. `trackedMonths` = `completeMonthTotals(...).length`.
- `simulateOption`, one-time: `left = remaining − price`; `touchesSavings = max(0, −left)`; `monthlyCost = price`; `safeMonth` = current month if `price ≤ max(0, remaining)`, else the smallest `k` in 1..24 with `max(0, remaining) + k × setAside ≥ price` → `addMonths(current, k)`, else null.
- `simulateOption`, installments: `monthlyCost = installment`; `left = remaining − installment`; `touchesSavings = max(0, −left)`; `safeMonth` = null if `installment > setAside`, else current month if `installment ≤ max(0, remaining)`, else next month.
- `emergencyAfterMinor`, one-time: `k = max(0, monthsBetween(current, planned))`; `funds = max(0, remaining) + k × setAside + cuts`; result `max(0, saved − max(0, price − funds))`. Installments: `shortfall = max(0, installment − setAside − cuts) × count`; result `max(0, saved − shortfall)`.

- [ ] **Step 1: Write failing tests.**

```ts
// dates.test.ts
expect(addMonths('2026-11', 2)).toBe('2027-01');
expect(addMonths('2026-01', -1)).toBe('2025-12');
expect(monthsBetween('2026-11', '2027-01')).toBe(2);
expect(monthsBetween('2026-11', '2026-10')).toBe(-1);

// allowance.test.ts
const s = { ...BASE_SETTINGS, monthly_savings_target_minor: 10_000_000, month_overrides: { '2026-12': { savings_target_minor: 5_000_000 } } };
expect(savingsTargetFor(s, '2026-12')).toBe(5_000_000);
expect(savingsTargetFor(s, '2026-11')).toBe(10_000_000);
expect(savingsTargetFor(s, '2027-01')).toBe(10_000_000);
expect(computeMonthlyAllowance({ month: '2026-12', rules: [], txns: [], settings: s, previousDeficitMinor: 0 }).savingsTargetMinor).toBe(5_000_000);
expect(computeMonthlyAllowance({ month: '2027-01', rules: [], txns: [], settings: s, previousDeficitMinor: 0 }).savingsTargetMinor).toBe(10_000_000);
```
(`BASE_SETTINGS` = whatever the existing allowance tests use, plus `month_overrides: {}` and `has_expensive_debt: null`. Update existing fixtures for the two new `Settings` fields.)

```ts
// planning.test.ts  — txn(date, kind, amountMinor, ruleId?) is a local fixture helper
const hist = [txn('2026-09-03','expense',30_000_000), txn('2026-09-05','expense',20_000_000,'r1'),
              txn('2026-10-03','expense',36_000_000), txn('2026-10-05','expense',20_000_000,'r1'),
              txn('2026-10-01','income',65_000_000,'r2'), txn('2026-10-09','transfer_out',9_000_000)];
test('typical spend averages complete months, excluding recurring and transfers', () =>
  expect(typicalMonthlySpendMinor(hist, '2026-11-15')).toBe(33_000_000));
test('average expenses include recurring-linked expenses', () =>
  expect(averageMonthlyExpensesMinor(hist, [], SETTINGS, '2026-11-15')).toBe(53_000_000));
test('tracked months counts complete months', () =>
  expect(completeMonthTotals(hist, '2026-11-15').map((m) => m.month)).toEqual(['2026-09', '2026-10']));
test('only the last 3 complete months count', () => { /* Jun 90M, Jul/Aug/Sep/Oct 30M each → 30_000_000 */ });
test('no complete month: extrapolates this month', () =>
  expect(typicalMonthlySpendMinor([txn('2026-11-02','expense',10_000_000)], '2026-11-10')).toBe(30_000_000));
test('no complete month: expenses = projected recurring + typical spend', () => {
  const rent = rule({ amount_huf_minor: 20_000_000, start_date: '2026-11-05', frequency: 'monthly', kind: 'expense' });
  expect(averageMonthlyExpensesMinor([txn('2026-11-02','expense',10_000_000)], [rent], SETTINGS, '2026-11-10')).toBe(50_000_000);
});
test('no data at all gives zeros, not NaN', () => {
  expect(typicalMonthlySpendMinor([], '2026-11-10')).toBe(0);
  expect(averageMonthlyExpensesMinor([], [], SETTINGS, '2026-11-10')).toBe(0);
});

const base = { remainingMinor: 15_000_000, setAsideMinor: 12_000_000, currentMonth: '2026-11' };
const one = (price: number) => ({ payment: 'one_time' as const, price_minor: price, installment_minor: null, installment_count: null });
const inst = (m: number, n = 12) => ({ payment: 'installments' as const, price_minor: m * n, installment_minor: m, installment_count: n });
test('one-time that fits now', () => expect(simulateOption({ ...base, option: one(10_000_000) }))
  .toEqual({ leftThisMonthMinor: 5_000_000, touchesSavingsMinor: 0, monthlyCostMinor: 10_000_000, safeMonth: '2026-11' }));
test('one-time that fits next month', () => expect(simulateOption({ ...base, option: one(18_900_000) }))
  .toEqual({ leftThisMonthMinor: -3_900_000, touchesSavingsMinor: 3_900_000, monthlyCostMinor: 18_900_000, safeMonth: '2026-12' }));
test('one-time five months out', () => expect(simulateOption({ ...base, option: one(69_000_000) }).safeMonth).toBe('2027-04'));
test('never affordable when set-aside is 0', () => expect(simulateOption({ ...base, setAsideMinor: 0, option: one(20_000_000) }).safeMonth).toBeNull());
test('beyond 24 months is null', () => expect(simulateOption({ ...base, setAsideMinor: 100_000, option: one(500_000_000) }).safeMonth).toBeNull());
test('negative remaining counts as 0 for saving up', () => expect(simulateOption({ ...base, remainingMinor: -5_000_000, option: one(10_000_000) }))
  .toEqual({ leftThisMonthMinor: -15_000_000, touchesSavingsMinor: 15_000_000, monthlyCostMinor: 10_000_000, safeMonth: '2026-12' }));
test('installments that fit', () => expect(simulateOption({ ...base, option: inst(3_000_000) }))
  .toEqual({ leftThisMonthMinor: 12_000_000, touchesSavingsMinor: 0, monthlyCostMinor: 3_000_000, safeMonth: '2026-11' }));
test('installment above set-aside never fits', () => expect(simulateOption({ ...base, option: inst(13_000_000) }).safeMonth).toBeNull());
test('installment above remaining starts next month', () => expect(simulateOption({ ...base, remainingMinor: 5_000_000, option: inst(11_000_000) }).safeMonth).toBe('2026-12'));

const ea = { ...base, emergencySavedMinor: 124_000_000 };
test('cuts cover the gap: emergency untouched', () =>
  expect(emergencyAfterMinor({ ...ea, option: one(32_000_000), plannedMonth: '2026-12', cutsMinor: 5_000_000 })).toBe(124_000_000));
test('gap comes out of savings', () =>
  expect(emergencyAfterMinor({ ...ea, option: one(32_000_000), plannedMonth: '2026-12', cutsMinor: 0 })).toBe(119_000_000));
test('installment shortfall over every month', () =>
  expect(emergencyAfterMinor({ ...ea, option: inst(13_000_000), plannedMonth: '2026-11', cutsMinor: 0 })).toBe(112_000_000));
test('never below zero', () =>
  expect(emergencyAfterMinor({ ...ea, emergencySavedMinor: 1_000_000, option: one(90_000_000), plannedMonth: '2026-11', cutsMinor: 0 })).toBe(0));
```

Run: `npx vitest run src/domain` — Expected: FAIL (missing exports).
- [ ] **Step 2: Implement** `addMonths`, `monthsBetween`, `savingsTargetFor` (override's `savings_target_minor` when it is a number, else `monthly_savings_target_minor`), make `computeMonthlyAllowance` use it, and write `planning.ts` to the definitions above. `buildPlanningModel` must not throw on empty data.
- [ ] **Step 3: Run tests** — `npx vitest run src/domain` — Expected: PASS, including every existing allowance test.
- [ ] **Step 4: Commit**
```bash
git add src/domain
git commit -m "feat: planning math — month overrides, spending averages, purchase impact"
```

---

### Task 3: Savings and guide math

**Files:**
- Create: `src/domain/savings.ts`, `src/domain/savings.test.ts`, `src/domain/guide.ts`, `src/domain/guide.test.ts`

**Interfaces:**
- Consumes: `SavingsGoal`, `Account`, `Txn`, `accountBalanceMinor`.
- Produces:
  ```ts
  // savings.ts
  export function emergencyTargetMinor(months: number, avgExpensesMinor: number): number;   // months × avg
  export interface GoalProgress { goal: SavingsGoal; targetMinor: number; savedMinor: number; ratio: number /* 0..1 */ }
  export function allocateGoals(goals: SavingsGoal[], balancesByAccount: Record<string, number>, emergencyTargetMinor: number): GoalProgress[];
  export function monthsCovered(savedMinor: number, avgExpensesMinor: number): number | null; // 1 decimal; null when avg ≤ 0
  export function monthsToReach(remainingMinor: number, monthlyMinor: number): number | null;  // 0 when remaining ≤ 0; null when monthly ≤ 0
  // guide.ts
  export type GuideKey = 'track' | 'emergency' | 'debt' | 'invest' | 'passive';
  export interface GuideStep { n: 1 | 2 | 3 | 4 | 5; key: GuideKey; title: string; status: 'done' | 'now' | 'todo' }
  export function guideSteps(i: { trackedMonths: number; emergency: { savedMinor: number; targetMinor: number } | null; emergencyMonths: number; hasExpensiveDebt: boolean | null; monthlyInvestmentMinor: number | null }): GuideStep[];
  export function currentStep(steps: GuideStep[]): GuideStep | null;   // the 'now' step; null when all done
  ```

Rules the tests pin:
- `allocateGoals`: goals ordered by `priority` ascending (ties by name); each account's balance fills its goals in that order; an emergency goal's target is `emergencyTargetMinor`, a custom goal's is `target_minor ?? 0`; a missing or negative balance counts as 0; `ratio = target > 0 ? min(1, saved / target) : 0`. Output keeps the priority order.
- `monthsCovered` rounds to 1 decimal with `Math.round(x * 10) / 10`.
- Guide titles exactly: `Know where the money goes`, `Emergency fund: ${emergencyMonths} months`, `No expensive debt`, `Invest every month`, `Build passive income`. Done when: track `trackedMonths ≥ 1`; emergency `target > 0 && saved ≥ target`; debt `hasExpensiveDebt === false`; invest `(monthlyInvestmentMinor ?? 0) > 0`; passive never in v1. Status: done → `'done'`; the first not-done step → `'now'`; other not-done steps → `'todo'`.

- [ ] **Step 1: Write failing tests.**
```ts
const g = (o: Partial<SavingsGoal>): SavingsGoal => ({ id: o.name!, name: 'x', kind: 'custom', target_minor: null, account_id: 's1', priority: 1, icon: 'piggy', ...o });
const goals = [g({ name: 'Summer trip', priority: 2, target_minor: 40_000_000 }), g({ name: 'Emergency fund', kind: 'emergency', priority: 1 })];
test('emergency fills first', () => expect(allocateGoals(goals, { s1: 124_000_000 }, 228_000_000).map((p) => [p.goal.name, p.savedMinor, p.targetMinor]))
  .toEqual([['Emergency fund', 124_000_000, 228_000_000], ['Summer trip', 0, 40_000_000]]));
test('overflow goes to the next goal', () => expect(allocateGoals(goals, { s1: 250_000_000 }, 228_000_000)[1].savedMinor).toBe(22_000_000));
test('missing or negative balance is 0', () => {
  expect(allocateGoals(goals, {}, 228_000_000)[0].savedMinor).toBe(0);
  expect(allocateGoals(goals, { s1: -5 }, 228_000_000)[0].savedMinor).toBe(0);
});
test('zero target gives ratio 0', () => expect(allocateGoals(goals, { s1: 1 }, 0)[0].ratio).toBe(0));
test('months covered', () => { expect(monthsCovered(124_000_000, 38_000_000)).toBe(3.3); expect(monthsCovered(1, 0)).toBeNull(); });
test('months to reach', () => { expect(monthsToReach(104_000_000, 10_000_000)).toBe(11); expect(monthsToReach(0, 1)).toBe(0); expect(monthsToReach(5, 0)).toBeNull(); });

const input = { trackedMonths: 2, emergency: { savedMinor: 124_000_000, targetMinor: 228_000_000 }, emergencyMonths: 6, hasExpensiveDebt: null, monthlyInvestmentMinor: null };
test('step 2 is current', () => {
  const s = guideSteps(input);
  expect(s.map((x) => x.status)).toEqual(['done', 'now', 'todo', 'todo', 'todo']);
  expect(s[1].title).toBe('Emergency fund: 6 months');
  expect(currentStep(s)?.n).toBe(2);
});
test('a later step can already be done', () =>
  expect(guideSteps({ ...input, hasExpensiveDebt: false }).map((x) => x.status)).toEqual(['done', 'now', 'done', 'todo', 'todo']));
test('no emergency goal means step 2 is not done', () =>
  expect(guideSteps({ ...input, emergency: null })[1].status).toBe('now'));
test('new user starts at step 1', () => expect(currentStep(guideSteps({ ...input, trackedMonths: 0 }))?.n).toBe(1));
```
Run: `npx vitest run src/domain/savings.test.ts src/domain/guide.test.ts` — Expected: FAIL.
- [ ] **Step 2: Implement** both modules.
- [ ] **Step 3: Run tests** — Expected: PASS.
- [ ] **Step 4: Commit**
```bash
git add src/domain/savings.ts src/domain/savings.test.ts src/domain/guide.ts src/domain/guide.test.ts
git commit -m "feat: savings goal allocation, emergency fund and guide steps"
```

---

### Task 4: Plan tab, plan list and the New purchase screen (screen 1)

**Files:**
- Create: `src/features/plan/planDraft.ts`, `src/features/plan/planDraft.test.ts`, `src/features/plan/usePlanData.ts`, `src/features/plan/PlanScreen.tsx`, `src/features/plan/PlanEditScreen.tsx`
- Modify: `src/features/shell/TabBar.tsx`, `src/features/shell/Icons.tsx`, `src/index.css`, `src/App.tsx`

**Interfaces:**
- Consumes: Task 1 data functions and types; Task 2 `buildPlanningModel`, `simulateOption`; Task 3 `allocateGoals`, `emergencyTargetMinor`, `guideSteps`, `currentStep`; `useHomeData` (`src/features/home/useHomeData.ts`); `listCategories`; `parseAmountInput`; `huf` from `src/features/home/fmt.ts`.
- Produces:
  ```ts
  // planDraft.ts
  export interface OptionDraft { id?: string; name: string; priceText: string; payment: 'one_time' | 'installments'; installmentText: string; countText: string; link: string; note: string }
  export interface PlanDraft { title: string; needed_by: ISODate | null; options: OptionDraft[] }
  export type ValidOption = Omit<PurchaseOption, 'id' | 'plan_id'> & { id?: string };
  export function validatePlanDraft(d: PlanDraft): { ok: true; title: string; needed_by: ISODate | null; options: ValidOption[] } | { ok: false; error: string };
  export function diffOptions(existing: PurchaseOption[], next: ValidOption[]): { create: ValidOption[]; update: (ValidOption & { id: string })[]; remove: string[] };
  export function draftFromPlan(plan: PurchasePlan, options: PurchaseOption[]): PlanDraft;
  export const MAX_OPTIONS = 8;
  // usePlanData.ts
  export interface PlanData { home: HomeData; categories: Category[]; plans: PurchasePlan[]; options: PurchaseOption[]; goals: SavingsGoal[]; planning: PlanningModel; goalProgress: GoalProgress[]; emergency: GoalProgress | null }
  export function usePlanData(): { data: PlanData | null; failed: boolean; reload: () => Promise<void> };
  export const optionLetter: (i: number) => string;   // 0 → 'A'
  ```

`validatePlanDraft` rules and exact error copy (first failing rule wins, options numbered from 1):
- trimmed title empty → `Give the plan a name.`
- no options → `Add at least one option.`; more than 8 → `Up to 8 options.`
- option name empty → `Option ${n}: add a name.`
- price missing or ≤ 0 → `Option ${n}: enter a price.`
- installments: monthly payment ≤ 0, or count not an integer 2..120 → `Option ${n}: enter the monthly payment and how many months.`
- non-empty link not starting with `http://` or `https://` (case-insensitive, after trim) → `Option ${n}: the link must start with http:// or https://`
- Output: names/links/notes trimmed, empty link/note → null, `position` = index, `currency: 'HUF'`, one-time options get `installment_minor: null, installment_count: null`, installment options get `price_minor` = the typed total price.

- [ ] **Step 1: Write failing tests** in `planDraft.test.ts`:
```ts
const opt = (o: Partial<OptionDraft> = {}): OptionDraft => ({ name: 'IKEA Kivik', priceText: '189 000', payment: 'one_time', installmentText: '', countText: '', link: '', note: '', ...o });
test('valid one-time plan', () => {
  const r = validatePlanDraft({ title: ' Couch ', needed_by: '2026-12-15', options: [opt()] });
  expect(r).toEqual({ ok: true, title: 'Couch', needed_by: '2026-12-15', options: [{ name: 'IKEA Kivik', price_minor: 18_900_000, currency: 'HUF', payment: 'one_time', installment_minor: null, installment_count: null, link: null, note: null, position: 0 }] });
});
test('errors', () => {
  expect(validatePlanDraft({ title: '', needed_by: null, options: [opt()] })).toEqual({ ok: false, error: 'Give the plan a name.' });
  expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [] })).toEqual({ ok: false, error: 'Add at least one option.' });
  expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: Array(9).fill(opt()) })).toEqual({ ok: false, error: 'Up to 8 options.' });
  expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt(), opt({ priceText: '0' })] })).toEqual({ ok: false, error: 'Option 2: enter a price.' });
  expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ payment: 'installments', installmentText: '30 000', countText: '1' })] }))
    .toEqual({ ok: false, error: 'Option 1: enter the monthly payment and how many months.' });
});
test('rejects non-http links', () =>
  expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ link: 'javascript:alert(1)' })] }))
    .toEqual({ ok: false, error: 'Option 1: the link must start with http:// or https://' }));
test('installments keep total price and schedule', () => {
  const r = validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ payment: 'installments', priceText: '360 000', installmentText: '30 000', countText: '12', link: ' https://jysk.hu/x ' })] });
  expect(r.ok && r.options[0]).toMatchObject({ price_minor: 36_000_000, installment_minor: 3_000_000, installment_count: 12, link: 'https://jysk.hu/x' });
});
test('diffOptions', () => {
  const existing = [{ id: 'a' }, { id: 'b' }] as PurchaseOption[];
  const next = [{ id: 'a', name: 'A2' }, { name: 'New' }] as ValidOption[];
  expect(diffOptions(existing, next)).toEqual({ create: [{ name: 'New' }], update: [{ id: 'a', name: 'A2' }], remove: ['b'] });
});
```
Run: `npx vitest run src/features/plan` — Expected: FAIL.
- [ ] **Step 2: Implement `planDraft.ts`**, run the tests — Expected: PASS.
- [ ] **Step 3: Port prototype CSS and icons.** Copy the `/* planner */` rules from `docs/prototype/finance-tracker-prototype.html` (`.opt`, `.opt.sel`, `.opt .top`, `.kv`, `.aibox`, `.change`, `.steps`, `.ladder`, `.rung`) into `src/index.css`, keeping its existing token names. Add the prototype's `piggy`, `sofa` and `info` symbols to `IconSprite` (prefixed `i-` like the others) if they are missing.
- [ ] **Step 4: Build `usePlanData`.** Wrap `useHomeData()` and load categories, plans, all options and goals in parallel; build `planning` with `buildPlanningModel`, `goalProgress` with `allocateGoals` (balances from `home.model.accounts`' `balanceHufMinor`, target from `emergencyTargetMinor(settings.emergency_fund_months, planning.avgExpensesMinor)`), and `emergency` = the first emergency goal's progress or null. Reload when `useHomeData` reloads (it already listens to `txns-changed`). Use the same request-id guard as `useHomeData`.
- [ ] **Step 5: Build `PlanScreen` (`/plan`)** after prototype `R.plan`: big header "Plan" with a `+` to `/plan/new`. **Purchases** section: active plans (considering, decided) as `.opt` buttons to `/plan/:id`; pill `Idea` (1 option) / `Comparing ${n}` (2+) / `Decided · ${Mon}` (decided, short month of `planned_month`); kv `Needed by` (when set) and `Estimate` (1 option) or `Options` `min – max`. Bought and dropped plans go in a **Done** section with pills `Bought` / `Dropped`. Empty state: "No plans yet. Add something you are thinking of buying." **Savings** card to `/savings` (emergency progress `%`, bar, `X of Y`; without an emergency goal: "Set up your emergency fund"). Guide banner to `/guide`: "Smart money guide" / `You are on step ${n} of 5: ${title}`. A `Category budgets` list row to `/budgets`.
- [ ] **Step 6: Build `PlanEditScreen` (`/plan/new`, `/plan/:id/edit`)** after prototype `R['couch-new']`: steps bar (1 of 3 on), fields What / Needed by (date, optional) / and per option: name, price, a one-time vs installments segmented control (`.seg`), monthly payment and months when installments, link, note; "Add option" chip (hidden at 8); remove per option. Errors from `validatePlanDraft` shown in a `.err` line. Save: create or update the plan, then apply `diffOptions`; on success navigate to `/plan/:id`. The primary button reads "See what it does to my money". An existing plan's screen also has a "Delete plan" ghost button with an inline confirm (no `window.confirm`).
- [ ] **Step 7: Routes and tab.** Add routes `/plan`, `/plan/new`, `/plan/:id/edit`. Each later task adds its own route (`/plan/:id`, `/plan/:id/advice`, `/savings`, `/budgets`, `/guide`); until then the Plan screen's links to them may 404 in dev. TabBar gains `{ to: '/plan', label: 'Plan', icon: 'target', roots: ['/plan', '/savings', '/budgets', '/guide'] }` between Activity and the end; update the stale comment.
- [ ] **Step 8: Verify.** `npm test` and `npx tsc --noEmit` pass. Run the dev server (`.claude/launch.json` → `finance-dev`) and, signed in with a dev account, create a plan with two options, edit it, delete one option, and confirm the list shows `Comparing 2` / `Idea` correctly. Screenshot at mobile width.
- [ ] **Step 9: Commit**
```bash
git add src
git commit -m "feat: Plan tab, plans list and new purchase screen"
```

---

### Task 5: Impact screen, decide, bought and drop (screen 2 and 4)

**Files:**
- Create: `src/features/plan/purchaseRecord.ts`, `src/features/plan/purchaseRecord.test.ts`, `src/features/plan/PlanImpactScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `usePlanData`, `simulateOption`, `optionLetter`, `createTransaction`, `createRule`, `runMaterialize` (`src/app/runMaterialize.ts`), `notifyTxnsChanged`, `updatePlan`, `addMonths`, `lastDay`, `monthOf`.
- Produces:
  ```ts
  export function pickPurchaseAccount(accounts: Account[]): Account | null;   // default if HUF and not archived, else first non-archived HUF account, else null
  export type PurchaseRecord =
    | { kind: 'txn'; txn: Omit<Txn, 'id'> }
    | { kind: 'rule'; rule: Omit<RecurringRule, 'id'> }
    | { kind: 'error'; reason: 'already_recorded' | 'no_account' };
  export function planPurchaseRecord(i: { plan: PurchasePlan; option: PurchaseOption; accounts: Account[]; categories: Category[]; today: ISODate }): PurchaseRecord;
  ```

Record rules: `already_recorded` when the plan's `status === 'bought'` or it has a `transaction_id` or `recurring_rule_id`. Category = the expense category named `Shopping`, else null. Note/name = `${plan.title} · ${option.name}`. One-time → expense txn: `amount_minor = amount_huf_minor = price_minor`, `currency: 'HUF'`, `date: today`, `source: 'manual'`, `needs_review: false`, `recurring_rule_id: null`, `transfer_pair_id: null`, `sms_message_id: null`. Installments → monthly expense rule: amount = `installment_minor`, `start_date: today`, `end_date: lastDay(addMonths(monthOf(today), installment_count − 1))`, `last_materialized_date: null`, `active: true`.

- [ ] **Step 1: Write failing tests:**
```ts
test('one-time becomes an expense on the default HUF account', () => {
  const r = planPurchaseRecord({ plan, option: oneTime(32_000_000), accounts: [eurDefault, hufMain], categories: [shopping], today: '2026-11-12' });
  expect(r).toEqual({ kind: 'txn', txn: expect.objectContaining({ account_id: hufMain.id, kind: 'expense', amount_minor: 32_000_000, amount_huf_minor: 32_000_000, category_id: shopping.id, date: '2026-11-12', note: 'Couch · JYSK Karlstrup corner', source: 'manual', needs_review: false }) });
});
test('installments become a monthly rule ending after the last payment', () => {
  const r = planPurchaseRecord({ plan, option: installments(3_000_000, 12), accounts: [hufMain], categories: [], today: '2026-11-12' });
  expect(r).toEqual({ kind: 'rule', rule: expect.objectContaining({ amount_minor: 3_000_000, frequency: 'monthly', start_date: '2026-11-12', end_date: '2027-10-31', category_id: null, active: true, last_materialized_date: null }) });
});
test('already bought', () => expect(planPurchaseRecord({ plan: { ...plan, transaction_id: 't1' }, option: oneTime(1), accounts: [hufMain], categories: [], today: '2026-11-12' })).toEqual({ kind: 'error', reason: 'already_recorded' }));
test('no HUF account', () => expect(planPurchaseRecord({ plan, option: oneTime(1), accounts: [eurDefault], categories: [], today: '2026-11-12' })).toEqual({ kind: 'error', reason: 'no_account' }));
test('archived default is skipped', () => expect(pickPurchaseAccount([{ ...hufMain, is_default: true, archived: true }, hufOther])?.id).toBe(hufOther.id));
```
Run: `npx vitest run src/features/plan/purchaseRecord.test.ts` — Expected: FAIL.
- [ ] **Step 2: Implement `purchaseRecord.ts`**, run — Expected: PASS.
- [ ] **Step 3: Build `PlanImpactScreen` (`/plan/:id`)** after prototype `R.couch`: header = plan title with an edit link to `/plan/:id/edit`; steps bar (2 of 3 on); line `If you buy now, from the ${huf(remaining)} left in ${Month}:`; one `.opt` per option (sorted by `position`, letter + name + price; installments show `${huf(installment)} × ${count}` under the name), kv rows **Left this month** (class `pos` ≥ 0, `warnc` > −60 000 Ft, else `neg`), **Savings this month** (`Untouched` or `Needs ${huf(touches)}`), **Safe to buy** (`Now` / `From ${Mon YYYY}` / `Not within 2 years`), and a link out when `link` is set (`target="_blank" rel="noopener noreferrer"`). Tapping an option selects it (`.sel`), preselected from `selected_option_id`. Note: `“Safe to buy” sets aside ${huf(setAside)} a month and keeps your emergency fund untouched.` Buttons: AI `Which one should I pick?` → `/plan/:id/advice` (enabled for any number of options); ghost `Choose ${letter}` (needs a selection) → `updatePlan(id, { status: 'decided', selected_option_id, planned_month: impact.safeMonth ?? currentMonth })`.
- [ ] **Step 4: Bought and drop.** For `decided` plans show **Mark as bought** (uses the selected option). It opens an inline choice: `Add the expense` (one-time) / `Add the monthly payment` (installments), and `It's already in Activity` (marks bought without a record). With a record: create it, then `updatePlan(id, { status: 'bought', transaction_id | recurring_rule_id })`; for a rule call `runMaterialize(today)`; then `notifyTxnsChanged()`. Show `no_account` as "Add a HUF account first." and `already_recorded` as "Already recorded." Disable the buttons while saving. `Drop this plan` (ghost, inline confirm) sets `status: 'dropped'`. A bought or dropped plan shows its status and a `Reopen` ghost button that sets `considering` (it does not delete the recorded expense).
- [ ] **Step 5: Verify.** `npm test`, `npx tsc --noEmit`. In the dev app: a plan with three options shows three impact cards whose numbers match `simulateOption` for the Home screen's remaining; choose one, mark bought (one-time) and check the expense in Activity and the lower Home allowance; repeat with installments and check the rule in Recurring.
- [ ] **Step 6: Commit**
```bash
git add src
git commit -m "feat: purchase impact screen with decide, bought and drop"
```

---

### Task 6: AI recommendation and Apply changes (screen 3)

**Files:**
- Create: `src/data/ai.ts`, `src/features/plan/advice.ts`, `src/features/plan/advice.test.ts`, `src/features/plan/applyChanges.ts`, `src/features/plan/applyChanges.test.ts`, `src/features/plan/AdviceScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `usePlanData`, `simulateOption`, `emergencyAfterMinor`, `monthsCovered`, `savingsTargetFor`, `updatePlan`, `updateSettings`, `updateCategory` (add to `src/data/categories.ts`: `updateCategory(id, patch: Partial<Omit<Category,'id'>>): Promise<Category>`), `addMonths`, `monthsBetween`.
- Produces:
  ```ts
  // src/data/ai.ts
  export async function invokeLlm(prompt: string, schema: object): Promise<unknown>;   // base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: 'claude-sonnet-5' })
  // advice.ts
  export interface AdviceInput {
    planTitle: string; neededBy: ISODate | null; currentMonth: YearMonth;
    options: { letter: string; name: string; payment: 'one_time' | 'installments'; priceMinor: number; installmentMinor: number | null; count: number | null; impact: OptionImpact }[];
    remainingMinor: number; setAsideMinor: number; savingsTargetMinor: number; emergencyMonthsCovered: number | null; emergencyGoalMonths: number;
    categories: { name: string; budgetMinor: number | null; spentThisMonthMinor: number }[];   // expense categories only
  }
  export const ADVICE_SCHEMA: object;
  export function buildAdvicePrompt(i: AdviceInput): string;
  export function normalizeAdvice(raw: unknown, ctx: { optionCount: number; currentMonth: YearMonth; savingsTargetMinor: number; categories: Category[]; effectiveBudget: (categoryId: string) => number | null }): Advice | null;
  export function adviceCutsMinor(changes: AdviceChange[]): number;
  export function adviceFingerprint(options: PurchaseOption[], planning: Pick<PlanningModel, 'month' | 'remainingMinor' | 'setAsideMinor'>): string;
  // applyChanges.ts
  export function planApply(i: { changes: AdviceChange[]; mode: 'month' | 'permanent'; month: YearMonth; settings: Settings }): { settingsPatch: Partial<Settings>; categoryPatches: { id: string; monthly_budget_minor: number }[] };
  ```

`ADVICE_SCHEMA` (raw LLM shape; amounts in whole forints because the model reasons better in Ft):
```json
{ "type": "object", "properties": {
  "recommended_option": { "type": "integer" }, "best_month": { "type": "string" },
  "summary": { "type": "string" }, "others": { "type": "string" },
  "changes": { "type": "array", "items": { "type": "object", "properties": {
    "type": { "type": "string", "enum": ["category_budget", "savings_target", "postpone"] },
    "category_name": { "type": "string" }, "new_amount_huf": { "type": "integer" }, "month": { "type": "string" } },
    "required": ["type"] } } },
  "required": ["recommended_option", "best_month", "summary", "changes"] }
```

`buildAdvicePrompt` must say: options are lettered and `recommended_option` is 1-based; all numbers given are computed by the app and must not be recalculated or invented; suggest at most 3 changes, only from the three types; cuts must be lower than the current value; months are `YYYY-MM` from the current month up to 24 months ahead; write `summary` (≤ 3 sentences, names the option and month) and `others` (≤ 2 sentences on why not the rest) in plain English, educational, no guarantees. It includes every `AdviceInput` field (amounts formatted in Ft) and nothing else.

`normalizeAdvice` rules (`null` = unusable answer):
- not an object, `recommended_option` not an integer in 1..optionCount, or `summary` not a non-empty string → null. Trim `summary`/`others`, cap each at 1000 characters; `others` defaults to `''`.
- `best_month`: `/^\d{4}-\d{2}$/` with month 01–12 and `0 ≤ monthsBetween(current, m) ≤ 24`, else `currentMonth`.
- `category_budget`: `category_name` matches an **expense** category (case-insensitive, trimmed); `new_amount_huf` integer 0..10 000 000; `to_minor = new_amount_huf × 100`; `from_minor = effectiveBudget(id)`; dropped when `from_minor !== null && to_minor >= from_minor`. At most one per category.
- `savings_target`: `new_amount_huf` integer, `0 ≤ to_minor < savingsTargetMinor`; at most one.
- `postpone`: valid month with `1 ≤ monthsBetween(current, m) ≤ 24`; at most one.
- keep at most 3 changes, in answer order. Output `option_index` is 0-based; `month` = the postpone month when present, else `best_month`.
- `adviceCutsMinor` = Σ (`from − to`) over savings changes and over category changes whose `from_minor` is not null.

`planApply`: savings change → month mode: `month_overrides[month].savings_target_minor = to`; permanent: `monthly_savings_target_minor = to`. Category change → month mode: `month_overrides[month].category_budgets[id] = to`; permanent: a `categoryPatches` entry. Postpone writes nothing here. Existing overrides for that month and other months are kept; `settingsPatch` is `{}` when nothing changes there.

- [ ] **Step 1: Write failing tests** (`advice.test.ts`, `applyChanges.test.ts`):
```ts
const cats = [cat('c1', 'Dining out', 'expense'), cat('c2', 'Salary', 'income')];
const ctx = { optionCount: 3, currentMonth: '2026-11', savingsTargetMinor: 10_000_000, categories: cats, effectiveBudget: (id: string) => (id === 'c1' ? 6_000_000 : null) };
const good = { recommended_option: 2, best_month: '2026-12', summary: ' B in December. ', others: 'A is small.',
  changes: [ { type: 'category_budget', category_name: 'dining OUT', new_amount_huf: 20000 }, { type: 'savings_target', new_amount_huf: 50000 } ] };
test('valid advice', () => expect(normalizeAdvice(good, ctx)).toEqual({ option_index: 1, month: '2026-12', summary: 'B in December.', others: 'A is small.', changes: [
  { type: 'category_budget', category_id: 'c1', category_name: 'Dining out', from_minor: 6_000_000, to_minor: 2_000_000 },
  { type: 'savings_target', from_minor: 10_000_000, to_minor: 5_000_000 } ] }));
test('bad option number is unusable', () => { expect(normalizeAdvice({ ...good, recommended_option: 0 }, ctx)).toBeNull(); expect(normalizeAdvice({ ...good, recommended_option: 9 }, ctx)).toBeNull(); });
test('empty summary is unusable', () => expect(normalizeAdvice({ ...good, summary: ' ' }, ctx)).toBeNull());
test('junk changes are dropped', () => expect(normalizeAdvice({ ...good, changes: [
  { type: 'category_budget', category_name: 'Salary', new_amount_huf: 1 },        // income category
  { type: 'category_budget', category_name: 'Rockets', new_amount_huf: 1 },       // unknown
  { type: 'category_budget', category_name: 'Dining out', new_amount_huf: 80000 },// not a cut
  { type: 'savings_target', new_amount_huf: 150000 },                              // increase
  { type: 'savings_target', new_amount_huf: -5 },
  { type: 'postpone', month: '2026-10' },                                          // past
  { type: 'teleport' } ] }, ctx)?.changes).toEqual([]));
test('bad best_month falls back to current; postpone wins', () => {
  expect(normalizeAdvice({ ...good, best_month: '2026-13', changes: [] }, ctx)?.month).toBe('2026-11');
  expect(normalizeAdvice({ ...good, changes: [{ type: 'postpone', month: '2027-02' }] }, ctx)?.month).toBe('2027-02');
});
test('at most 3 changes', () => { /* five valid-looking changes → length 3 */ });
test('cuts', () => expect(adviceCutsMinor(normalizeAdvice(good, ctx)!.changes)).toBe(9_000_000));

// applyChanges.test.ts
const settings = { ...BASE_SETTINGS, monthly_savings_target_minor: 10_000_000, month_overrides: { '2027-01': { savings_target_minor: 1 } } };
const changes: AdviceChange[] = [{ type: 'savings_target', from_minor: 10_000_000, to_minor: 5_000_000 },
  { type: 'category_budget', category_id: 'c1', category_name: 'Dining out', from_minor: 6_000_000, to_minor: 2_000_000 }, { type: 'postpone', month: '2026-12' }];
test('month mode writes overrides only for that month', () => expect(planApply({ changes, mode: 'month', month: '2026-12', settings })).toEqual({
  settingsPatch: { month_overrides: { '2027-01': { savings_target_minor: 1 }, '2026-12': { savings_target_minor: 5_000_000, category_budgets: { c1: 2_000_000 } } } },
  categoryPatches: [] }));
test('permanent mode', () => expect(planApply({ changes, mode: 'permanent', month: '2026-12', settings })).toEqual({
  settingsPatch: { monthly_savings_target_minor: 5_000_000 }, categoryPatches: [{ id: 'c1', monthly_budget_minor: 2_000_000 }] }));
test('postpone only', () => expect(planApply({ changes: [changes[2]], mode: 'month', month: '2026-12', settings })).toEqual({ settingsPatch: {}, categoryPatches: [] }));
```
Run: `npx vitest run src/features/plan` — Expected: FAIL.
- [ ] **Step 2: Implement `advice.ts`, `applyChanges.ts`, `ai.ts`, `updateCategory`.** `effectiveBudget` for the screen comes from Task 7's `effectiveCategoryBudget`; until then pass `(id) => category.monthly_budget_minor` and swap it in Task 7. Run tests — Expected: PASS.
- [ ] **Step 3: Build `AdviceScreen` (`/plan/:id/advice`)** after prototype `R['couch-ai']`: steps bar (3 of 3). If `plan.advice?.fingerprint === adviceFingerprint(...)`, show it; otherwise call `invokeLlm` once on mount (guard against StrictMode double-mount with a ref), normalize, and save `{ fingerprint, generated_at, advice }` to the plan. While loading: spinner + "Thinking it through…". On failure or `null`: "Could not get a suggestion right now." with a `Try again` button, and a link back to the impact screen. Show: `.aibox` "Assistant" with `summary` and `others`; section `Changes for ${Mon}` listing each change (`Dining out budget` `60 000 → 20 000 Ft`; `${Mon} savings` `100 000 → 50 000 Ft`; `Buy in ${Mon YYYY}`), plus a computed row **Emergency fund after**: `${monthsCovered(emergencyAfterMinor(...), avgExpenses)} months of expenses` with pill `OK` when nothing comes out of savings, else `Uses savings` (use `—` when months is null). A segmented control `Just for ${Mon}` / `From now on` (default month) appears when there is a savings or category change. `Apply changes`: `planApply` → `updateSettings(settingsPatch)` when non-empty, `updateCategory` per patch, then `updatePlan(id, { status: 'decided', selected_option_id: option id of option_index, planned_month: advice.month })`; then show the prototype's applied state `Applied · back to plans` (ghost → `/plan`) and a toast-like status line. `Get a new suggestion` ghost re-runs the call. Footer note: the Global Constraints copy.
- [ ] **Step 4: Verify.** `npm test`, `npx tsc --noEmit`. Locally InvokeLLM returns 403 (memory: proxied to production) — check that the failure state renders and Try again works. The live AI path is verified in Task 9.
- [ ] **Step 5: Commit**
```bash
git add src
git commit -m "feat: AI purchase recommendation with apply changes"
```

---

### Task 7: Category budgets and Savings screens

**Files:**
- Create: `src/features/plan/budgets.ts`, `src/features/plan/budgets.test.ts`, `src/features/plan/BudgetsScreen.tsx`, `src/features/plan/SavingsScreen.tsx`
- Modify: `src/App.tsx`, `src/features/plan/AdviceScreen.tsx` (use `effectiveCategoryBudget`)

**Interfaces:**
- Consumes: `usePlanData`, `updateCategory`, `createGoal`, `updateGoal`, `deleteGoal`, `allocateGoals`, `monthsCovered`, `monthsToReach`, `savingsTargetFor`, `monthOf`.
- Produces:
  ```ts
  export function effectiveCategoryBudget(category: Category, settings: Settings, month: YearMonth): number | null;  // month override, else monthly_budget_minor
  export interface BudgetRow { category: Category; budgetMinor: number | null; isMonthOnly: boolean; spentMinor: number; leftMinor: number | null }
  export function categoryBudgetRows(categories: Category[], txns: Txn[], settings: Settings, month: YearMonth): BudgetRow[];  // expense categories only, DEFAULT_ORDER then name; spent = all expense txns of that category in the month (recurring included)
  ```
- [ ] **Step 1: Write failing tests:**
```ts
const s = { ...BASE_SETTINGS, month_overrides: { '2026-12': { category_budgets: { c1: 2_000_000 } } } };
test('override wins only in its month', () => {
  expect(effectiveCategoryBudget(dining /* budget 6_000_000 */, s, '2026-12')).toBe(2_000_000);
  expect(effectiveCategoryBudget(dining, s, '2026-11')).toBe(6_000_000);
});
test('rows', () => {
  const rows = categoryBudgetRows([dining, groceries /* null budget */, salary], [txn('2026-12-03', 'expense', 1_500_000, { category_id: 'c1' }), txn('2026-11-30', 'expense', 9, { category_id: 'c1' })], s, '2026-12');
  expect(rows.map((r) => [r.category.name, r.budgetMinor, r.isMonthOnly, r.spentMinor, r.leftMinor]))
    .toEqual([['Groceries', null, false, 0, null], ['Dining out', 2_000_000, true, 1_500_000, 500_000]]);
});
```
(`DEFAULT_ORDER` puts Groceries before Dining out.) Run — Expected: FAIL. Implement, run — Expected: PASS.
- [ ] **Step 2: Build `BudgetsScreen` (`/budgets`, back to `/plan`).** One row per `BudgetRow`: icon, name, `Spent ${huf} of ${huf}` or `No budget`, `month only` tag when `isMonthOnly`; tapping opens an inline amount input that saves `monthly_budget_minor` (empty → null) via `updateCategory`. Note: "Budgets are a guide for you and the assistant. Your free-to-spend number comes from the monthly plan."
- [ ] **Step 3: Build `SavingsScreen` (`/savings`, back to `/plan`)** after prototype `R.savings`: card with the savings-target account balance (the account with `is_savings_target`, else the sum of savings accounts) and `+${huf(savingsTargetFor(settings, month))} planned every month`. **Goals** list from `goalProgress`: emergency shows `${monthsCovered ?? '—'} / ${N} months`, custom shows `${huf(saved)} / ${huf(target)}`, each with a `.bar`. Without an emergency goal: button `Set up emergency fund` → `createGoal({ name: 'Emergency fund', kind: 'emergency', target_minor: null, account_id: <savings target account or first savings account>, priority: 1, icon: 'shield' })`; with no savings account: "Add a savings account first." linking `/accounts`. `Add goal` opens an inline form (name, target, account from savings accounts, icon fixed `piggy`), priority = max + 1. Tapping a goal allows edit and delete (inline confirm). An emergency line under its bar: `At ${huf(target)} a month you reach it in about ${k} months.` when `monthsToReach` is a number and the target is not yet reached. **History**: the last 10 `transfer_in` txns into savings accounts, newest first (`Monthly saving` style rows with date and amount).
- [ ] **Step 4: Swap `effectiveCategoryBudget` into `AdviceScreen`** (both the prompt's category list and `normalizeAdvice` ctx).
- [ ] **Step 5: Verify.** `npm test`, `npx tsc --noEmit`; in the dev app set up the emergency fund, add a custom goal, set a category budget, and check Plan's savings card and the budget row.
- [ ] **Step 6: Commit**
```bash
git add src
git commit -m "feat: category budgets and savings goals screens"
```

---

### Task 8: Smart money guide

**Files:**
- Create: `src/features/plan/guideAi.ts`, `src/features/plan/guideAi.test.ts`, `src/features/plan/GuideScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `usePlanData`, `guideSteps`, `currentStep`, `monthsCovered`, `monthsToReach`, `savingsTargetFor`, `invokeLlm`, `getGuideCache`, `saveGuideCache`, `updateSettings`.
- Produces:
  ```ts
  export interface GuideFacts {
    avgIncomeMinor: number; avgExpensesMinor: number; trackedMonths: number; savingsTargetMinor: number; investmentMinor: number | null;
    emergencySavedMinor: number | null; emergencyTargetMinor: number | null; emergencyMonthsCovered: number | null; emergencyGoalMonths: number;
    monthsToEmergency: number | null; hasExpensiveDebt: boolean | null; steps: GuideStep[];
  }
  export const GUIDE_SCHEMA: object;   // { intro: string, tips: [{ step: integer, text: string }] }, required ["intro", "tips"]
  export function buildGuidePrompt(f: GuideFacts): string;
  export function normalizeGuide(raw: unknown): { intro: string; tips: Record<number, string> } | null;
  export function guideCacheKey(f: GuideFacts): string;
  export function fallbackFact(step: GuideStep, f: GuideFacts): string;
  ```
Rules: `normalizeGuide` → null unless `intro` is a non-empty string (trimmed, capped at 800 chars); tips keep `step` integers 1..5 with non-empty text (trimmed, capped at 400), last one wins. `guideCacheKey` = `[current step n or 0, round(income / 5_000_000), round(expenses / 5_000_000), round((emergencySaved ?? 0) / 5_000_000)].join('|')` (50 000 Ft buckets). `buildGuidePrompt` says: explain where the user stands on the five steps, in plain, warm English, educational, no specific securities, tickers or guaranteed returns, use only the numbers given, `intro` ≤ 3 sentences, one tip per step ≤ 2 sentences. `fallbackFact` exact copy: track — `${trackedMonths} months tracked.` (`Start by tracking a full month.` when 0); emergency — `${covered ?? '—'} of ${N} months.` + (` At ${huf(savings target)} a month you reach it in about ${k} months.` when k is a number and > 0); debt — `Do you have a credit card balance or personal loan?` (null) / `No expensive debt. Nothing to do here.` (false) / `Pay off expensive debt before investing.` (true); invest — `Start small: ${huf(investment)} a month.` when > 0 else `Set a monthly amount once the emergency fund is on track.`; passive — `Once investments grow, dividends and interest start to matter.`

- [ ] **Step 1: Write failing tests:**
```ts
test('normalize', () => {
  expect(normalizeGuide({ intro: ' Hi. ', tips: [{ step: 2, text: ' Keep going. ' }, { step: 7, text: 'x' }, { step: 3, text: '' }] }))
    .toEqual({ intro: 'Hi.', tips: { 2: 'Keep going.' } });
  expect(normalizeGuide({ intro: '', tips: [] })).toBeNull();
  expect(normalizeGuide('nope')).toBeNull();
});
test('cache key buckets by 50 000 Ft', () => {
  const k1 = guideCacheKey({ ...facts, avgIncomeMinor: 65_000_000 });
  expect(guideCacheKey({ ...facts, avgIncomeMinor: 66_000_000 })).toBe(k1);
  expect(guideCacheKey({ ...facts, avgIncomeMinor: 75_000_000 })).not.toBe(k1);
});
test('fallback facts', () => {
  expect(fallbackFact(steps[1], { ...facts, emergencyMonthsCovered: 3.3, emergencyGoalMonths: 6, savingsTargetMinor: 10_000_000, monthsToEmergency: 11 }))
    .toBe('3.3 of 6 months. At 100 000 Ft a month you reach it in about 11 months.');
  expect(fallbackFact(steps[2], { ...facts, hasExpensiveDebt: null })).toBe('Do you have a credit card balance or personal loan?');
});
```
(Match the `huf()` output format of `src/features/home/fmt.ts`; if it uses a narrow no-break space, build the expected string with `huf(10_000_000)`.) Run — Expected: FAIL. Implement, run — Expected: PASS.
- [ ] **Step 2: Build `GuideScreen` (`/guide`, back to `/plan`)** after prototype `R.guide`: `.aibox` "Based on your numbers" with the AI `intro`; ladder of five `.rung`s (done shows a check, now/todo show the number) with title and the AI tip for that step, falling back to `fallbackFact`. The debt rung, while `hasExpensiveDebt === null`, shows two chips `I have some` / `No debt` → `updateSettings({ has_expensive_debt })` then reload. AI text: if `getGuideCache()` key equals `guideCacheKey(facts)` use it; otherwise call `invokeLlm` once (ref guard) and `saveGuideCache`. On AI failure show the fallback facts and a quiet line "Personal notes are unavailable right now." with `Try again`. A `Refresh` ghost button forces a new call. Footer note: "General education, not personal financial advice. You decide what to do."
- [ ] **Step 3: Verify.** `npm test`, `npx tsc --noEmit`; locally (AI 403) the ladder renders from fallback facts and the debt chips save.
- [ ] **Step 4: Commit**
```bash
git add src
git commit -m "feat: smart money guide with AI notes and fallback facts"
```

---

### Task 9: Deploy and live verification (controller only)

- [ ] **Step 1:** `npm test` and `npx tsc --noEmit` pass; push `main`.
- [ ] **Step 2: Ask the user in chat** before `npx base44 entities push --yes` and `npm run deploy`, then run them.
- [ ] **Step 3: Live check in the browser pane** (the user is signed in there; Claude never types a password): create a "Couch" plan with three options (one installments), check the impact numbers against Home's remaining, run "Which one should I pick?" (confirms client-side InvokeLLM works on the private app; if it is refused, rule: move the call into a backend function `advise` using `createClientFromRequest(req).asServiceRole.integrations.Core.InvokeLLM` after `auth.me()`, same prompt/schema modules copied as pure logic), apply in month mode and check Breakdown's savings line for that month only, mark bought and check Activity. Set up the emergency fund, open the guide and confirm the AI intro shows and a second open costs no new call (network panel). Then delete the test plan, its expense or rule, the test goal, and revert the settings override.
- [ ] **Step 4:** Update memory (`base44-deploy-gotchas.md`) with whatever the live AI check taught; commit any fixes.
