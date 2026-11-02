# Plan 2 – SMS Ingestion via iOS Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When MBH Bank texts the user about a card payment or incoming money, an iPhone Shortcut posts the SMS to the app, and the next time the app opens the transaction is there, marked "Check", counted in the allowance, and confirmable in one tap.

**Architecture:** One Base44 backend function, `ingest-sms`, is called directly over HTTP by the Shortcut. It checks a personal API key (only its SHA-256 hash is stored, in `ApiKey`), drops duplicates and non-money texts, asks InvokeLLM for structured fields, and writes an **`SmsMessage` inbox record** with the service role and an explicit `owner_id`. `SmsMessage` RLS lets the owner read it through `data.owner_id`, so the function never has to forge `created_by_id`. The client converts parsed inbox records into normal `Transaction`s (`source: 'sms'`, `needs_review: true`) on startup and on every return to the app, idempotently through `Transaction.sms_message_id`. The function's pure logic lives in `base44/functions/ingest-sms/logic.ts` (no `npm:` imports) and is unit-tested by Vitest. The client side's pure logic lives in `src/app/smsConversion.ts`.

**Tech Stack:** As Plan 1, plus Base44 backend functions (Deno, `npm:@base44/sdk`, `createClientFromRequest`, `asServiceRole`, `integrations.Core.InvokeLLM`) and Web Crypto (`crypto.subtle.digest('SHA-256')`) on both sides.

**Spec:** `docs/superpowers/specs/2026-11-01-finance-tracker-design.md` (§6.2, §5 `ApiKey`, §7, §8 risk 2)

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-11-01-plan-1-foundation-and-money-core.md`), shipped on `main`.

## Global Constraints

- Everything in Plan 1's Global Constraints still holds: English UI, HUF base, `Europe/Budapest`, integer minor units with `amount_huf_minor`, `YYYY-MM-DD` dates, RLS on every user entity, prototype look and copy.
- Git: work directly on `main`, commit and push without asking, run `npm test` before every push (`CLAUDE.md`).
- **Deploys** (`npm run deploy`, `base44 functions deploy`, `base44 entities push`) touch production. The auto-mode classifier blocks them, so the **controller asks the user once per deploy step** and does not hand them to subagents.
- Function name is **`ingest-sms`** (Base44 CLI requires kebab-case folders; the spec's `ingestSms` is the same endpoint). URL: `https://<app-domain>/functions/ingest-sms`.
- The key travels in the **`X-Api-Key`** header. `Authorization: Bearer ft_…` is also accepted. The platform may claim `Authorization` for its own tokens; Task 1 confirms what arrives.
- API keys look like `ft_` + 32 random bytes as base64url. Only `sha256(key)` as lowercase hex and the last 4 characters are stored. The full key is shown once.
- `base44/functions/ingest-sms/logic.ts` must not import `npm:` or `jsr:` specifiers, and it must not import from `src/`. Function-folder imports use explicit `.ts` extensions (Deno).
- InvokeLLM takes no model parameter (SDK `InvokeLLMParams`), so the workspace default model is used. The spec's "cheap model for frequent calls" (§7) is met by the pre-filter that skips the LLM for non-money texts.
- LLM input is only the SMS text, the sender, and the user's **category names**. No balances or other transactions (§7).
- Non-money texts (OTP, ads) are never sent to the LLM when the pre-filter rejects them, and their text is **not stored**, only `text_hash` and a reason.
- An SMS request never fails because of a bad LLM answer. It stores `status: 'failed'` with a reason and returns 200.

## Review Focus

1. **The same SMS arrives twice** (Shortcut retry, two automations): exactly one `SmsMessage` and one `Transaction` → `dedupeHash` test in Task 3; `planSmsConversion` skips messages that already have a transaction (Task 4); manual double-post in Task 8.
2. **OTP code or a marketing text from the bank:** no transaction, no LLM call, no stored text → `looksLikeMoney` tests in Task 3; manual post in Task 8.
3. **Wrong, missing or revoked key:** 401, nothing stored, no LLM call → `extractApiKey` tests in Task 3; manual posts in Task 8.
4. **Card purchase in EUR on the HUF MBH account:** the transaction is in the account's currency with the right HUF value, and the original amount is kept in the note → test in Task 4.
5. **App not opened for days, then opened twice quickly, or conversion interrupted halfway:** every parsed SMS becomes exactly one transaction → single-flight runner and the `sms_message_id` guard in Task 4.

---

## File Structure

```
base44/
  entities/
    api-key.jsonc            NEW  ApiKey (user-created, RLS created_by_id)
    sms-message.jsonc        NEW  SmsMessage inbox (service-role-created, RLS data.owner_id, create: false)
    transaction.jsonc        MOD  + sms_message_id (nullable)
    account.jsonc            MOD  + sms_sender (nullable)
  functions/ingest-sms/
    entry.ts                 NEW  HTTP handler (thin; SDK calls only)
    logic.ts                 NEW  pure: key extraction, hashing, validation, pre-filter, prompt, schema, normalize
    logic.test.ts            NEW
src/
  domain/types.ts            MOD  Txn.sms_message_id, Account.sms_sender
  data/
    apiKeys.ts  apiKeys.test.ts      NEW  generate/hash (pure part tested), list, create, revoke
    smsMessages.ts                   NEW  list recent, list pending, mark converted
    transactions.ts  accounts.ts     MOD  new field in KEYS/NULLABLE
    export.ts  export.test.ts        MOD  CSV formula-injection guard
  app/
    smsConversion.ts  smsConversion.test.ts   NEW  pure planSmsConversion
    runConvertSms.ts                          NEW  single-flight runner
    startup.ts                                MOD  convert on start and on every resume
  features/
    sms/SmsAutomationScreen.tsx      NEW  key, Shortcut guide, test, recent log
    sms/ReviewSmsScreen.tsx          NEW  "Check SMS"
    accounts/AccountSheet.tsx        MOD  "SMS sender" field
    settings/SettingsScreen.tsx      MOD  row to SMS automation
    home/HomeScreen.tsx  transactions/TransactionsScreen.tsx  MOD  review items open Check SMS
  App.tsx                            MOD  routes /settings/sms, /review/:id
vitest.config.ts                     MOD  include base44/functions/**/*.test.ts
```

---

### Task 1: Spike – the deployed function path (controller + user)

Spec §8 risk 2. Every later task assumes these answers, so the controller runs this one itself, after the user approves the production deploy.

**Files:**
- Create (temporary, deleted at the end of the task): `base44/functions/spike-echo/entry.ts`

- [ ] **Step 1:** Write `spike-echo`: it returns JSON with the request method, the headers (with `authorization` and `x-api-key` values masked to their first 6 characters plus length), the body, the result of `createClientFromRequest(req).auth.me()` (or the error string), and the result of `asServiceRole.entities.Category.filter({ created_by_id: <id from body.owner_id> }, undefined, 3)` (count plus the keys of the first row, or the error string).
- [ ] **Step 2 (needs user approval):** `base44 functions deploy spike-echo`.
- [ ] **Step 3:** From the shell, `curl -X POST https://finance-tracker-00c038fc.base44.app/functions/spike-echo` three times: with no auth header, with `X-Api-Key: ft_spike`, and with `Authorization: Bearer ft_spike`. The body is `{"owner_id":"<user id from the app's auth.me()>"}`; read it in the browser pane with `base44.auth.me()`.
- [ ] **Step 4: Record in the ledger:**
  - (a) Does an unauthenticated POST reach the function on the private app?
  - (b) Which of the two headers arrives intact?
  - (c) Can the service role filter `Category` by `created_by_id`, and are `created_by_id` and `id` in the returned rows?
- [ ] **Step 5: Decision rules:**
  - (a) no → **stop and ask the user.** The fix is `"visibility": "public"`, a security decision that is theirs.
  - (b) neither header arrives → **stop and ask.**
  - (b) only one arrives → ledger it. Task 3 keeps accepting both, and the guide in Task 6 uses the one that works.
  - (c) no → Task 5's entry uses `asServiceRole.entities.Category.list()` and filters in code by `created_by_id === owner_id`. Ledger it.
- [ ] **Step 6:** `base44 functions delete spike-echo` (needs approval) and remove the folder. Nothing to commit.

### Task 2: Entities and the ApiKey data layer

**Files:**
- Create: `base44/entities/api-key.jsonc`, `base44/entities/sms-message.jsonc`, `src/data/apiKeys.ts`, `src/data/apiKeys.test.ts`, `src/data/smsMessages.ts`
- Modify: `base44/entities/transaction.jsonc`, `base44/entities/account.jsonc`, `src/domain/types.ts`, `src/data/transactions.ts`, `src/data/accounts.ts`

**Interfaces:**
- Produces:
  - `ApiKey` entity: `name` string, `key_hash` string, `last4` string, `owner_id` string, `revoked` boolean, `last_used_at` `["string","null"]` (`format: date-time`). Required: `name, key_hash, last4, owner_id`. RLS: standard (`create: true`, read/update/delete `created_by_id`).
  - `SmsMessage` entity:
    - `owner_id` string
    - `sender` string
    - `text` `["string","null"]`
    - `text_hash` string
    - `received_at` string (`date-time`)
    - `status` enum `parsed|ignored|failed|converted`
    - `reason` nullable string
    - `kind` nullable enum `expense|income`
    - `amount_minor` nullable integer
    - `currency` nullable string
    - `merchant` nullable string
    - `date` nullable string (`date`)
    - `category_name` nullable string
    - `transaction_id` nullable string
    - Required: `owner_id, sender, text_hash, received_at, status`.
    - RLS: `"create": false`, `read/update/delete: {"data.owner_id": "{{user.id}}"}`.
  - `Transaction.sms_message_id` and `Account.sms_sender`: both `["string","null"]`. Mirror them in `Txn` (`sms_message_id?: string | null`), in `Account` (`sms_sender: string | null`), and in the KEYS/NULLABLE lists of their data files.
  - `src/data/apiKeys.ts`:
    - `export interface ApiKeyRow { id: string; name: string; last4: string; revoked: boolean; last_used_at: string | null; created_date?: string }`
    - `generateApiKey(): Promise<{ key: string; hash: string; last4: string }>`
    - `sha256Hex(s: string): Promise<string>`
    - `listApiKeys(): Promise<ApiKeyRow[]>` (newest first)
    - `createApiKey(name: string): Promise<{ key: string; row: ApiKeyRow }>`: revokes every unrevoked key first (one active key, as in the prototype's "Old key revoked, new key created"), and sets `owner_id` from `base44.auth.me()`.
    - `revokeApiKey(id: string): Promise<void>`
  - `src/data/smsMessages.ts`:
    - `export interface SmsMessageRow` (all fields above plus `id`, `created_date`)
    - `listRecentSms(limit = 20): Promise<SmsMessageRow[]>` (by `-created_date`)
    - `listPendingSms(): Promise<SmsMessageRow[]>` (`status: 'parsed'`)
    - `markSmsConverted(id: string, transactionId: string): Promise<void>`

- [ ] **Step 1: Failing tests** in `apiKeys.test.ts`:

```ts
it('sha256Hex matches the shared vector', async () => {
  expect(await sha256Hex('ft_test_key')).toBe('c55775582807cd18d29c1ca2ebddf6985219452099c6c03f1f9d623e6be6a1de');
});
it('generateApiKey: ft_ prefix, 43 base64url chars, hash and last4 consistent', async () => {
  const { key, hash, last4 } = await generateApiKey();
  expect(key).toMatch(/^ft_[A-Za-z0-9_-]{43}$/);
  expect(hash).toBe(await sha256Hex(key));
  expect(last4).toBe(key.slice(-4));
});
it('two keys differ', async () => {
  expect((await generateApiKey()).key).not.toBe((await generateApiKey()).key);
});
```

- [ ] **Step 2:** `npx vitest run src/data/apiKeys.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the entities, the types and the two data files. Use `crypto.getRandomValues` and `crypto.subtle`; Node 20 has both globally.
- [ ] **Step 4:** `npm test` → green, and `npm run build` → no type errors.
- [ ] **Step 5 (controller, needs user approval):** `base44 entities push --yes`.
- [ ] **Step 6: Commit** `feat: ApiKey and SmsMessage entities, sms fields on Transaction and Account`.

### Task 3: `ingest-sms` pure logic

**Files:**
- Create: `base44/functions/ingest-sms/logic.ts`, `base44/functions/ingest-sms/logic.test.ts`
- Modify: `vitest.config.ts` (include `base44/functions/**/*.test.ts`)

**Interfaces:**
- Produces (all exported from `logic.ts`):
  - `extractApiKey(headers: Headers): string | null`: `x-api-key` first, then `authorization: Bearer <v>` only when `<v>` starts with `ft_`. Values are trimmed, and empty counts as null.
  - `sha256Hex(s: string): Promise<string>`: same algorithm as `src/data/apiKeys.ts`.
  - `dedupeHash(sender: string, text: string): Promise<string>` = `sha256Hex(sender.trim() + '|' + text.trim())`.
  - `validateBody(body: unknown, nowIso: string): { ok: true; value: { text: string; sender: string; received_at: string } } | { ok: false; error: string }`
    - `text` must be a non-empty string of at most 1000 characters after trim.
    - `sender` is a string of at most 100 characters, default `'unknown'`.
    - `received_at` must be a parseable ISO date-time, otherwise `nowIso` is used.
  - `looksLikeMoney(text: string): boolean`: true when the text has a number next to a currency token (`HUF`, `Ft`, `EUR`, `€`, `USD`, `$`, `GBP`, `CHF`, case-insensitive), like `-15 500 HUF` or `12,50 EUR`.
  - `budapestDate(iso: string): string`: the `YYYY-MM-DD` of the instant in `Europe/Budapest` (`Intl.DateTimeFormat('en-CA', { timeZone })`).
  - `PARSE_SCHEMA`: the JSON schema object for InvokeLLM, with these properties:
    - `is_transaction` boolean
    - `direction` enum `debit|credit`
    - `amount` number, positive, in major units
    - `currency` string (3-letter ISO)
    - `merchant` string
    - `date` string (`YYYY-MM-DD` or empty)
    - `category` string, one of the given names or empty
  - `buildPrompt(text: string, sender: string, categoryNames: string[]): string`. It must say five things:
    - this is a Hungarian bank SMS
    - extract the fields above
    - "terhelés", "vásárlás" or a minus sign means debit; "jóváírás" or "érkezett" means credit
    - the merchant is a readable name without store numbers or city (so `ALDI 152. BUDAPEST` becomes `Aldi`)
    - the category is chosen only from the given list, and `is_transaction: false` covers OTP, login, marketing and balance-only texts
  - `normalizeParsed(raw: unknown, fallbackDate: string, categoryNames: string[]): { status: 'parsed'; kind: 'expense' | 'income'; amount_minor: number; currency: string; merchant: string | null; date: string; category_name: string | null } | { status: 'ignored' | 'failed'; reason: string }`

- [ ] **Step 1: Failing tests**, using the prototype samples `S1 = 'MBH Bank: Kartyas vasarlas -15 500 HUF, MOL 1093 BUDAORS, 2026.11.11 08:17. Egyenleg: 412 380 HUF'` and `OTP = 'MBH Bank: Az On egyszer hasznalatos kodja: 482913'`:

```ts
it('extractApiKey prefers X-Api-Key, accepts Bearer ft_ only', () => {
  expect(extractApiKey(new Headers({ 'x-api-key': ' ft_a ' }))).toBe('ft_a');
  expect(extractApiKey(new Headers({ authorization: 'Bearer ft_b' }))).toBe('ft_b');
  expect(extractApiKey(new Headers({ authorization: 'Bearer eyJplatformtoken' }))).toBeNull();
  expect(extractApiKey(new Headers({ 'x-api-key': '' }))).toBeNull();
  expect(extractApiKey(new Headers())).toBeNull();
});
it('sha256Hex shares the client vector', async () => {
  expect(await sha256Hex('ft_test_key')).toBe('c55775582807cd18d29c1ca2ebddf6985219452099c6c03f1f9d623e6be6a1de');
});
it('dedupeHash trims and joins with |', async () => {
  expect(await dedupeHash(' MBH Bank ', S1 + '\n')).toBe('8492fff52f966d6674637bb206de97097262e8b7501fb0901f1310735a902649');
});
it('validateBody', () => {
  const now = '2026-11-11T07:20:00.000Z';
  expect(validateBody({ text: S1, sender: 'MBH Bank' }, now)).toEqual({ ok: true, value: { text: S1, sender: 'MBH Bank', received_at: now } });
  expect(validateBody({ text: '  ' }, now).ok).toBe(false);
  expect(validateBody({ text: 'x'.repeat(1001) }, now).ok).toBe(false);
  expect(validateBody(null, now).ok).toBe(false);
  expect(validateBody({ text: 'a', received_at: 'yesterday' }, now)).toMatchObject({ ok: true, value: { sender: 'unknown', received_at: now } });
});
it('looksLikeMoney', () => {
  expect(looksLikeMoney(S1)).toBe(true);
  expect(looksLikeMoney('Jovairas +250 000 Ft erkezett')).toBe(true);
  expect(looksLikeMoney('Card payment 12,50 EUR')).toBe(true);
  expect(looksLikeMoney(OTP)).toBe(false);
});
it('budapestDate crosses midnight correctly', () => {
  expect(budapestDate('2026-11-10T23:30:00Z')).toBe('2026-11-11');
});
const CATS = ['Groceries', 'Transport', 'Dining'];
it('normalizeParsed: debit → expense in minor units, category from list', () => {
  expect(normalizeParsed({ is_transaction: true, direction: 'debit', amount: 15500, currency: 'huf', merchant: ' MOL ', date: '2026-11-11', category: 'Transport' }, '2026-11-12', CATS))
    .toEqual({ status: 'parsed', kind: 'expense', amount_minor: 1_550_000, currency: 'HUF', merchant: 'MOL', date: '2026-11-11', category_name: 'Transport' });
});
it('normalizeParsed: credit → income; bad date and unknown category fall back', () => {
  expect(normalizeParsed({ is_transaction: true, direction: 'credit', amount: 12.5, currency: 'EUR', merchant: '', date: '2026-13-40', category: 'Salary??' }, '2026-11-12', CATS))
    .toEqual({ status: 'parsed', kind: 'income', amount_minor: 1250, currency: 'EUR', merchant: null, date: '2026-11-12', category_name: null });
});
it('normalizeParsed: not a transaction → ignored; garbage → failed', () => {
  expect(normalizeParsed({ is_transaction: false }, '2026-11-12', CATS)).toEqual({ status: 'ignored', reason: 'not_a_transaction' });
  expect(normalizeParsed({ is_transaction: true, direction: 'debit', amount: -5, currency: 'HUF' }, '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
  expect(normalizeParsed({ is_transaction: true, direction: 'debit', amount: 5, currency: 'forint' }, '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
  expect(normalizeParsed('oops', '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
});
it('buildPrompt carries the text, sender and only the category names', () => {
  const p = buildPrompt(S1, 'MBH Bank', CATS);
  for (const s of [S1, 'MBH Bank', 'Groceries', 'Transport', 'Dining']) expect(p).toContain(s);
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `logic.ts`. Round amounts with `Math.round(amount * 100)`. A date must match `^\d{4}-\d{2}-\d{2}$` and be a real calendar day. Merchant names are trimmed, an empty one becomes `null`, and they are capped at 80 characters.
- [ ] **Step 4:** `npm test` → green. `npm run build` stays clean (the function folder is outside `tsconfig` `include`).
- [ ] **Step 5: Commit** `feat: ingest-sms parsing logic`.

### Task 4: Client conversion of parsed SMS into transactions

**Files:**
- Create: `src/app/smsConversion.ts`, `src/app/smsConversion.test.ts`, `src/app/runConvertSms.ts`
- Modify: `src/app/startup.ts`

**Interfaces:**
- Consumes:
  - `SmsMessageRow`, `listPendingSms`, `markSmsConverted` (Task 2)
  - `listAccounts`, `listCategories` (Plan 1)
  - `getHufPerUnit(currency, date)`, `toHufMinor`, `createTransaction`, `notifyTxnsChanged` (Plan 1)
- Produces:
  - `pickSmsAccount(sender: string, accounts: Account[]): Account | null`:
    1. the non-archived account whose `sms_sender`, lowercased and trimmed, equals the sender lowercased and trimmed
    2. otherwise the non-archived default account
    3. otherwise the first non-archived account
    4. otherwise `null`
  - `convertMinor(amountMinor: number, fromHufPerUnit: number, toHufPerUnit: number): number` = `Math.round(amountMinor * fromHufPerUnit / toHufPerUnit)`
  - `planSmsTxn(msg: SmsMessageRow, account: Account, categories: Category[], rates: { msg: number; account: number }): Omit<Txn, 'id'>`:
    - `source` is `'sms'`, `needs_review` is `true`, and `sms_message_id` is `msg.id`.
    - `kind` comes from the message, and `category_id` is matched by name (case-insensitive) or `null`.
    - `amount_minor` is in the account's currency (converted when it differs), `currency` is the account's currency, and `amount_huf_minor` is `toHufMinor(amount_minor, rates.account)`.
    - The note is the merchant, plus ` · <original amount formatted>` when the currency was converted (e.g. `Bistro · 12,50 €`; use Plan 1's `formatMoney`).
  - `runConvertSms(): Promise<number>`: single-flight, returns how many transactions it created, never throws (it logs instead). For each pending message:
    - skip it if a transaction with `sms_message_id === msg.id` already exists (look this up with one `Transaction.filter({ sms_message_id: { $in: ids } })` call), and only mark it converted
    - otherwise create the transaction, then call `markSmsConverted`
  - `startup.ts` calls `runConvertSms()` after materialize in `runStartup`, and on **every** `visibilitychange → visible`, not only on a new day. When it returns more than 0, it calls `notifyTxnsChanged()`.

- [ ] **Step 1: Failing tests** (`smsConversion.test.ts`):

```ts
it('pickSmsAccount: sms_sender match beats default; archived never chosen', () => {
  expect(pickSmsAccount('MBH Bank', [acct({ id: 'rev', is_default: true }), acct({ id: 'mbh', sms_sender: ' mbh bank ' })])?.id).toBe('mbh');
  expect(pickSmsAccount('MBH Bank', [acct({ id: 'old', sms_sender: 'MBH Bank', archived: true }), acct({ id: 'def', is_default: true })])?.id).toBe('def');
  expect(pickSmsAccount('X', [])).toBeNull();
});
it('planSmsTxn: HUF expense on HUF account', () => {
  const t = planSmsTxn(msg({ amount_minor: 1_550_000, currency: 'HUF', merchant: 'MOL', category_name: 'transport', date: '2026-11-11' }), acct({ id: 'mbh', currency: 'HUF' }), cats, { msg: 1, account: 1 });
  expect(t).toMatchObject({ account_id: 'mbh', kind: 'expense', amount_minor: 1_550_000, currency: 'HUF', amount_huf_minor: 1_550_000, category_id: 'cat-transport', date: '2026-11-11', note: 'MOL', source: 'sms', needs_review: true, sms_message_id: 'sms1' });
});
it('planSmsTxn: EUR purchase on HUF account converts and keeps the original in the note', () => {
  const t = planSmsTxn(msg({ amount_minor: 1250, currency: 'EUR', merchant: 'Bistro' }), acct({ currency: 'HUF' }), cats, { msg: 400, account: 1 });
  expect(t.amount_minor).toBe(500_000);
  expect(t.currency).toBe('HUF');
  expect(t.amount_huf_minor).toBe(500_000);
  expect(t.note).toMatch(/^Bistro · .*12[.,]50/);
});
it('planSmsTxn: unknown category → null, missing merchant → empty note', () => {
  const t = planSmsTxn(msg({ category_name: null, merchant: null }), acct({}), cats, { msg: 1, account: 1 });
  expect(t.category_id).toBeNull();
  expect(t.note ?? '').toBe('');
});
```

(`acct`, `msg` and `cats` are small factories in the test file; `msg` defaults are `id: 'sms1'`, `kind: 'expense'`, `status: 'parsed'`, `sender: 'MBH Bank'`.)

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** `npm test` green, and the build is clean.
- [ ] **Step 5: Commit** `feat: convert parsed SMS into review transactions on open and resume`.

### Task 5: `ingest-sms` entry and deploy

**Files:**
- Create: `base44/functions/ingest-sms/entry.ts`

**Interfaces:**
- Consumes: everything from `logic.ts` (Task 3); Task 1's ledger answers.
- Produces: the HTTP contract below, which the Shortcut and Task 6's test button rely on. Every response is JSON.

| Case | Status | Body |
|---|---|---|
| method is not POST | 405 | `{ error }` |
| no key, unknown key, or revoked key | 401 | `{ error: 'invalid_key' }` (checked **before** reading the body or calling the LLM) |
| invalid body | 400 | `{ error }` |
| same `owner_id` and `text_hash` already exist | 200 | `{ status: 'duplicate' }` |
| `looksLikeMoney` false | 200 | `{ status: 'ignored' }`, after storing `{ status: 'ignored', reason: 'no_amount', text: null }` |
| otherwise | 200 | `{ status, kind?, amount_minor?, currency?, merchant? }` |

In the last case the function does this, in order:
1. Load the owner's category names (the filter from Task 1 (c), or its fallback).
2. Call `asServiceRole.integrations.Core.InvokeLLM({ prompt: buildPrompt(...), response_json_schema: PARSE_SCHEMA })`, wrapped in try/catch. A throw counts as `failed` with reason `'llm_error'`.
3. Run `normalizeParsed(raw, budapestDate(received_at), names)`.
4. Store the `SmsMessage` with `owner_id` set to the key's `owner_id`. `text` is kept for `parsed` and `failed`, and is `null` for `ignored`.
5. Set `ApiKey.last_used_at`.
6. Respond.

A top-level try/catch returns 500 `{ error: 'internal' }` and logs the error, never the text or the key.

- [ ] **Step 1:** Implement `entry.ts`. Keep it thin: SDK calls plus the order above.
- [ ] **Step 2 (controller, needs user approval):** `base44 functions deploy ingest-sms`.
- [ ] **Step 3:** Smoke test with curl and no key → `401 {"error":"invalid_key"}`.
- [ ] **Step 4: Commit** `feat: ingest-sms backend function`.

### Task 6: SMS automation screen and the account "SMS sender" field

**Files:**
- Create: `src/features/sms/SmsAutomationScreen.tsx`
- Modify: `src/App.tsx` (route `/settings/sms`), `src/features/settings/SettingsScreen.tsx`, `src/features/accounts/AccountSheet.tsx`

**Interfaces:**
- Consumes: `createApiKey`, `listApiKeys`, `revokeApiKey`, `listRecentSms` (Task 2); the HTTP contract (Task 5).
- Produces: UI only.

- [ ] **Step 1:** Build the screen. It follows the prototype's `R.sms` screen (copy and structure), with real behavior:
  - **1 · Your personal key.**
    - With no active key, a "Create key" button.
    - After creating one, the full key in a monospace `.code` box with "Copy" (`navigator.clipboard.writeText`, toast "Key copied"), and the line "Shown once. Revoke it here if your phone is lost."
    - Afterwards only `ft_••••<last4>`, "Last used …" (or "Not used yet"), and "New key" / "Revoke" buttons.
    - "New key" asks for confirmation in the page itself (no `confirm()`).
  - **2 · Set up the Shortcut.** A numbered list the user can follow on the iPhone:
    1. Shortcuts → Automation → New → Message.
    2. Sender: MBH Bank. Run Immediately, Notify off.
    3. Add action "Get Contents of URL".
    4. URL: `{window.location.origin}/functions/ingest-sms`, with a copy button.
    5. Method POST.
    6. Header `X-Api-Key` = your key (or the header Task 1 found working).
    7. Request Body JSON: `text` = Shortcut Input → Content, `sender` = `MBH Bank`.
  - **3 · Test it.** The prototype's sample SMS, plus a "Send a test message" button. The button POSTs it with the just-created key, so it only works while the key is still in memory on this screen; otherwise it says "Create a new key to test from here". The result goes in a toast:
    - `parsed` → "Test received: <merchant> −<amount>"
    - `duplicate` → "Already received"
    - otherwise the status
  - **Recent messages.** The last 20 `SmsMessage`s, each with date, status pill (Parsed / Added / Ignored / Couldn't read), and the merchant and amount when present.
  - The Revolut note from the prototype.
- [ ] **Step 2:** Settings gets an "SMS automation" row: icon `sms`, subtitle "On · last one <time>" or "Off", leading to `/settings/sms`.
- [ ] **Step 3:** AccountSheet gets an optional "SMS sender" text field with placeholder `MBH Bank` and the help line "SMS from this sender land in this account". The Accounts list subtitle shows "SMS automation on" when it is set (prototype).
- [ ] **Step 4:** `npm test` green, and the build is clean. Check the screen in the browser pane against local `base44 dev` (create a key, copy, revoke, set the account field).
- [ ] **Step 5: Commit** `feat: SMS automation settings and account SMS sender`.

### Task 7: Check SMS review screen and the CSV guard

**Files:**
- Create: `src/features/sms/ReviewSmsScreen.tsx`
- Modify: `src/App.tsx` (route `/review/:id`), `src/features/home/HomeScreen.tsx`, `src/features/transactions/TransactionsScreen.tsx`, `src/data/export.ts`, `src/data/export.test.ts`

**Interfaces:**
- Consumes: `Txn.sms_message_id`; the `SmsMessage` read by id (add `getSms(id: string): Promise<SmsMessageRow | null>` to `src/data/smsMessages.ts`); `updateTransaction`; `TransactionForm` (Plan 1).
- Produces: `csvField` now neutralizes formula injection.

- [ ] **Step 1: Failing test** in `export.test.ts`:

```ts
it('csvField neutralizes spreadsheet formulas in text fields', () => {
  expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  expect(csvField('+36 30 123')).toBe("'+36 30 123");
  expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  expect(csvField('Aldi')).toBe('Aldi');
});
it('amount column keeps its minus sign', () => {
  expect(buildTransactionsCsv([expenseTxn], accounts, categories)).toMatch(/,-12\.00,/);
});
```

  `csvField` gains the guard: it prefixes `'` when the field starts with `=`, `+`, `-`, `@`, tab or CR, then quotes as before. `buildTransactionsCsv` keeps the generated columns (date, kind, the two `major(...)` amounts, currency, source) out of `csvField` and joins them as they are. Only the user or bank-supplied text (account, category, note) goes through `csvField`. (`expenseTxn` is `{ ...base, kind: 'expense', amount_minor: 1200 }` using the file's existing `base`, `accounts` and `categories`.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** green.
- [ ] **Step 5: Build `ReviewSmsScreen`.** It follows the prototype's `R.review` screen:
  - Header "Check SMS".
  - "Message from <sender>" with the raw text in `.smsraw`.
  - A "What we read" list: Amount, Merchant, Category with the "AI guess" pill, Account, Date.
  - Two buttons:
    - **Edit** opens Plan 1's `TransactionForm` for this transaction. Saving the form also clears `needs_review`.
    - **Looks right** calls `updateTransaction(id, { needs_review: false })`, then moves to the next item that needs review, or back to Home when none is left.
  - The prototype's note: "SMS items count toward your allowance right away. Checking only confirms the details."
  - If the `SmsMessage` is gone, the raw-text block is hidden.
- [ ] **Step 6:** Make review items open the new screen:
  - On Home, the review banner and rows with `needs_review` and an `sms_message_id` link to `/review/<txn id>`.
  - On Activity, those rows do the same.
  - Other rows keep their behavior.
- [ ] **Step 7:** `npm test` green, and the build is clean. Browser-pane check with a hand-made `SmsMessage` is not possible locally (`create: false`), so check the screen with a transaction whose `source` is `'sms'`; the raw block stays hidden.
- [ ] **Step 8: Commit** `feat: Check SMS review screen; neutralize CSV formulas`.

### Task 8: Deploy and end-to-end check (controller + user)

- [ ] **Step 1 (needs user approval):** `npm run deploy` (entities, function and site).
- [ ] **Step 2: User, in the installed app:** create a key in Settings → SMS automation. "Send a test message" → toast "Test received: MOL …". Open Home: the item appears with "Check", and the allowance dropped by 15 500 Ft.
- [ ] **Step 3: Controller, curl with the key the user pastes into chat or gives through the test button's result.** The controller does not store the key anywhere. Check:
  - the same SMS again → `duplicate`
  - the OTP text → `ignored`
  - a wrong key → 401
  - an EUR sample `MBH Bank: Kartyas vasarlas -12,50 EUR, BISTRO VIENNA, 2026.11.12 13:05` → parsed, and after opening the app the transaction is in HUF with "12,50 €" in the note
- [ ] **Step 4: User:** set up the real Shortcut from the guide, then wait for the next real MBH SMS (or ask the bank for a balance SMS, which should come back as `ignored`). Confirm the transaction appears. Masked real SMS samples, if they differ from the prototype format, go into `logic.test.ts` as extra `looksLikeMoney` cases and into the prompt's examples.
- [ ] **Step 5:** Tap "Looks right" → the "Check" mark disappears. Revoke the key → the next curl returns 401.
- [ ] **Step 6: Commit** any sample-driven tweaks (`fix: MBH SMS samples`), push.
