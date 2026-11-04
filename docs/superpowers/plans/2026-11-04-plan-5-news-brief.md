# Plan 5 – News and Morning Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A News tab fed by English RSS sources, and a daily morning brief (holdings moves, AI read, this month's investing money) that is pushed to the installed iPhone PWA at the user's chosen time.

**Architecture:**
- **Server:** two scheduled Base44 functions, `collectNews` (hourly tick, interval-gated) and `morningBrief` (15-minute tick, time-gated). They write `NewsItem` and `DailyDigest` rows owned through `owner_id`, as `ingest-sms` does. Code shared by functions lives in `base44/shared/`, because functions cannot import `src/`.
- **Money numbers:** they stay identical to the app's because the client writes a `brief_snapshot` (this month's suggestion and the pull-forward inputs) to the User on every app start. The pull-forward and month-left math lives in one self-contained `base44/shared/brief.ts`, which both sides import.
- **Push:** Web Push with VAPID from `morningBrief`. The service worker moves to `injectManifest` to handle `push` and `notificationclick`.

**Tech Stack:** Base44 (Deno/Workers functions, automations, `asServiceRole.integrations.Core.InvokeLLM`), React 18 + TS, react-router 6, vite-plugin-pwa 2 (`injectManifest`, workbox-precaching), vitest, `jsr:@negrel/webpush` (or `npm:web-push`, decided in Task 2).

**Spec:** `docs/superpowers/specs/2026-11-04-plan-5-news-digest-design.md` (approved 2026-11-04). The screen mockups are in `docs/superpowers/specs/2026-11-04-plan-5-screens.html`.

## Global Constraints

- **UI and data:**
  - English UI and English news. HUF base currency, money as integer minor units (HUF×100).
  - Timezone `Europe/Budapest` (the User `timezone` field when set).
- **AI:**
  - Code computes every number, and the AI only writes text.
  - AI output is normalized, and invalid parts are dropped: unknown news ids, products outside the catalog, and amounts above the computed limit.
- **Brief footer copy, verbatim:** "Educational, not financial advice. You decide and record the buy."
- **Notification:** title `Morning brief`. The body is at most 2 sentences and at most 180 characters (hard-truncate at 180).
- **Stored news fields:** only title, link, source, published time, one-line AI summary, tags and `affects_portfolio`. Never article text. News older than 30 days is deleted.
- **Tags:** exactly this set: `markets`, `etf`, `stocks`, `bonds`, `crypto`, `rates`, `inflation`, `forint`, `hungary`, `housing`, `economy`.
- **Limits:**
  - Per collection run: at most 40 new items go to the AI.
  - Per brief: at most 15 news items go to the AI.
  - Daily AI cap: 10 collection calls and 2 brief calls per day.
- **Settings choices:**
  - Default `digest_time` `07:00`.
  - `news_interval_hours` ∈ {2, 4, 8, 12}, default 4.
- **Pull-forward:**
  - Only if the emergency fund is done.
  - Room = min(50% of the current month's computed suggestion, remaining − dailySpend × daysLeft), floored at 0. *Ruling:* the spec's "next month's suggestion" is not knowable before next month, so this month's suggestion stands in for it.
  - Overspend of last month reduces this month's computed suggestion, capped at 50% of the pre-deduction amount. Never when the user set a fixed amount (`source: 'setting'`).
- **Functions:** functions never import `src/` or `@/`, and shared code goes in `base44/shared/`. Imports inside `base44/` use explicit `.ts` extensions.
- **Production:** every production deploy (`npm run deploy`) needs the user's explicit OK in chat. Live tests delete only rows they created.
- **Git:** run `npm test` before every push. Work on `main`.

## Review Focus

1. **Month rollover:** on the 1st, before the app has been opened, the snapshot is from last month. The brief must show "Open the app to update this month's numbers" and not reuse last month's suggestion. Test: Task 7 `briefNumbers` with a stale snapshot month.
2. **A buy recorded after the last app open:** the server recomputes `left` from InvestmentTransaction rows, so the brief never tells the user to invest money already spent. Test: Task 7 `briefNumbers` with a buy dated after `snapshot.computed_at`.
3. **A dead or garbage feed:** one source returning HTML, a 404 or a timeout must not stop the others. Its `last_error` is set. Test: Task 5 `parseFeed` on HTML input, and Task 6's per-source isolation.
4. **A subscription the phone has dropped:** a 404 or 410 from the push service deactivates that subscription, and the digest records `push_status` correctly. Test: Task 8 `classifyPushResult`.
5. **AI returning a long or invented notification:** the notification over 180 characters is truncated, unknown news ids are dropped, and a missing field falls back to the code template. Test: Task 7 `normalizeBrief`.

---

### Task 1: Gate A – scheduled function, server-side InvokeLLM, run identity (live probe)

**Files:**
- Create: `base44/functions/briefProbe/entry.ts`, `base44/functions/briefProbe/function.jsonc`

**Interfaces:**
- Produces: a written answer in the ledger and memory to three questions. Does a `simple` 15-minute automation fire? With what auth does it run: does `auth.me()` fail, and does `asServiceRole` work? Does `base44.asServiceRole.integrations.Core.InvokeLLM` succeed from a scheduled run?

- [ ] **Step 1: Write the probe.** `entry.ts` takes `{ source }` from the body.
  - It tries `auth.me()` and records the error status.
  - It counts `asServiceRole.entities.User.list()`.
  - It calls InvokeLLM with prompt `Reply with the word ok` and schema `{type:'object',properties:{w:{type:'string'}}}`.
  - It returns `{source, me:<status>, users:<n>, llm:<w or error>}` and also `console.log`s the same.
- [ ] **Step 2: Write `function.jsonc`.** Use `{ "name": "briefProbe", "entry": "entry.ts", "automations": [ { "type": "scheduled", "name": "probe_every_15", "schedule_mode": "recurring", "schedule_type": "simple", "repeat_unit": "minutes", "repeat_interval": 15, "function_args": { "source": "schedule" } } ] }`.
- [ ] **Step 3: Ask the user to OK a deploy, then run `npm run deploy`.** Expected: `briefProbe` deployed with 1 automation (`npx base44 functions list` shows "(1 automation)").
- [ ] **Step 4: After at most 20 minutes, read the run.**
  - Commands: `npx base44 workflows runs` and `npx base44 logs` (see the base44-troubleshooter skill).
  - Expected: one run, with `users` ≥ 1 and `llm: "ok"`.
  - If the automation deploy fails with HTTP 409 (the app uses workflows) or never fires: STOP. Report to the user and ask whether to use the on-open fallback (spec §7). Do not continue.
- [ ] **Step 5: Delete the probe and record the result.**
  - Remove the probe folder and redeploy with the user's OK, so the automation is gone.
  - Record the auth result in `~/.claude/projects/-Users-mrkuhne-Applications-Personal-Finance-Tracker/memory/base44-deploy-gotchas.md`.
  - Commit `chore: scheduled-function probe result`.

### Task 2: Gate B – Web Push to the installed iPhone PWA

**Files:**
- Create:
  - `src/sw.ts`
  - `base44/entities/push-subscription.jsonc`
  - `src/data/push.ts`
  - `src/data/push.test.ts`
  - `base44/functions/morningBrief/entry.ts` (test action only for now)
  - `base44/functions/morningBrief/push.ts`
  - `base44/functions/morningBrief/push.test.ts`
- Modify:
  - `vite.config.ts` (VitePWA → `strategies: 'injectManifest'`)
  - `src/features/settings/SettingsScreen.tsx` (temporary "Test notification" row, replaced in Task 10)

**Interfaces:**
- Produces:
  - `PushSubscription` entity:
    - fields `owner_id`, `endpoint`, `p256dh`, `auth`, `device_name`, `active` (bool), `last_error` (string|null);
    - RLS as `sms-message.jsonc`, but `create: true`, `update: false`, `delete: {"data.owner_id": "{{user.id}}"}`.
  - `src/data/push.ts`:
    - `VAPID_PUBLIC_KEY: string`;
    - `pushSupport(): 'ok' | 'not_installed' | 'unsupported' | 'denied'`;
    - `subscribePush(deviceName: string): Promise<void>`, which asks permission, calls `pushManager.subscribe`, and creates the row with `owner_id = me.id`;
    - `unsubscribePush(): Promise<void>`;
    - `sendTestPush(): Promise<{ sent: number; failed: number; errors: string[] }>`, which invokes `morningBrief` with `{action:'test'}`.
  - `base44/functions/morningBrief/push.ts`:
    - `sendPush(sub: {endpoint,p256dh,auth}, payload: {title:string; body:string; url:string}, vapid: {publicKey,privateKey,subject}): Promise<{ok:true}|{ok:false; status:number|null; error:string}>`;
    - `classifyPushResult(r): 'sent'|'gone'|'failed'`, where `gone` = status 404 or 410.
  - SW behaviour: show a notification `{title, body, data:{url}}` on `push`. On `notificationclick`, focus an existing client and navigate it to `data.url`, or `openWindow(data.url)`.

- [ ] **Step 1: Write failing tests.**
  - `push.test.ts`:
    - `classifyPushResult({ok:true})==='sent'`;
    - `{ok:false,status:410}` → `'gone'`;
    - `{ok:false,status:404}` → `'gone'`;
    - `{ok:false,status:500}` → `'failed'`;
    - `{ok:false,status:null}` → `'failed'`.
  - `src/data/push.test.ts`, for `pushSupport` with stubbed `window`/`navigator`:
    - no `PushManager` → `'unsupported'`;
    - `matchMedia('(display-mode: standalone)')` false and `navigator.standalone` falsy → `'not_installed'`;
    - `Notification.permission==='denied'` → `'denied'`.
- [ ] **Step 2: Run `npm test`.** Expected: these tests FAIL (modules missing).
- [ ] **Step 3: Switch the SW to `injectManifest`.**
  - `vite.config.ts`: `strategies:'injectManifest', srcDir:'src', filename:'sw.ts', injectManifest:{ globPatterns:['**/*.{js,css,html,png,svg,ico}'] }`.
  - Keep `registerType:'autoUpdate'`, `injectRegister:false` and the manifest. Remove the `workbox` block.
  - `src/sw.ts` keeps today's behaviour:
    - `precacheAndRoute(self.__WB_MANIFEST)`;
    - `cleanupOutdatedCaches()`;
    - a `NavigationRoute` to `/index.html` with `denylist:[/^\/api\//]`;
    - `self.skipWaiting()` on install and `clients.claim()` on activate.
  - It adds the `push` and `notificationclick` handlers.
  - Add the devDependencies `workbox-precaching` and `workbox-routing` at the version vite-plugin-pwa 2 already pulls in.
  - Check: `npx base44 build` succeeds, `dist/sw.js` contains `skipWaiting` and `showNotification`, and `dist/index.html` has no `registerSW.js`.
- [ ] **Step 4: Generate the VAPID keys and set the secrets.**
  - Generate a VAPID key pair once (`deno run jsr:@negrel/webpush/generate-vapid-keys`, or `npx web-push generate-vapid-keys`).
  - Put the public key in `VAPID_PUBLIC_KEY`.
  - Ask the user which `mailto:` address to use as the VAPID subject (Apple rejects placeholder subjects). Do not pick one yourself.
  - Ask the user to OK setting the secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`npx base44 secrets set`). Never print the private key in chat or commit it.
- [ ] **Step 5: Implement `push.ts` and the function's test action.**
  - `push.ts` uses `jsr:@negrel/webpush`.
  - The `entry.ts` `test` action:
    1. requires `auth.me()`;
    2. loads that user's active `PushSubscription` rows through `asServiceRole`, filtered by `owner_id` and checked `owner_id === created_by_id`;
    3. sends `{title:'Morning brief', body:'Test notification from Finance Tracker.', url:'/news'}`;
    4. sets `active:false` on `gone`, and writes `last_error` on `failed`;
    5. returns `{sent, failed, errors}`.
  - If `jsr:` fails to deploy or to run, swap to `npm:web-push` and note it.
- [ ] **Step 6: Add the temporary Settings row** with Subscribe / Send test buttons and the `pushSupport()` message.
- [ ] **Step 7: Run `npm test` and `npx tsc --noEmit`.** Expected: all PASS.
- [ ] **Step 8: Run the live gate.**
  - Ask the user to OK a deploy, then deploy.
  - The user installs the app on their iPhone Home Screen (if not done), opens it, and taps Subscribe and then Send test.
  - Expected: a notification arrives, and tapping it opens `/news` (Not found for now is fine).
  - If it doesn't arrive after the library swap and one more fix attempt: STOP and talk to the user (spec §7).
- [ ] **Step 9: Commit** `feat: web push pipeline and injectManifest service worker`, then push.

### Task 3: Shared brief math and the Plan 4 deduction

**Files:**
- Create: `base44/shared/brief.ts`, `base44/shared/brief.test.ts`
- Modify:
  - `vitest.config.ts` (include `base44/shared/**/*.test.ts`; alias `@shared` → `base44/shared`)
  - `tsconfig.json` (`paths` `@shared/*`; include `base44/shared`; `allowImportingTsExtensions: true`)
  - `vite.config.ts` (alias `@shared`)
  - `src/domain/invest.ts`, `src/domain/invest.test.ts`
  - `src/domain/planning.ts`, `src/domain/planning.test.ts`

**Interfaces:**
- Produces, from `base44/shared/brief.ts` (no imports, pure):
  - `leftThisMonthMinor(suggestedMinor: number, investedMinor: number): number`, which is `max(0, s − i)`.
  - `daysLeftInMonth(today: string /* YYYY-MM-DD */): number`, which counts today too: 30 Nov → 1, 1 Nov → 30.
  - `pullForwardRoomMinor(i: { emergencyDone: boolean; suggestedMinor: number; investedMinor: number; remainingMinor: number; dailySpendMinor: number; daysLeft: number }): number`.
  - `PULL_FORWARD_SHARE = 0.5`, `OVERSPEND_CAP_SHARE = 0.5`.
- Produces, in `src/domain/invest.ts`:
  - `suggestInvestment` takes the new input `prevExcessMinor: number`. When the result is `computed`: `amountMinor = max(0, raw − min(prevExcessMinor, floor(raw × OVERSPEND_CAP_SHARE)))`, rounded down to `roundToMinor`, with `kind:'nothing_spare'` if that reaches 0. `setting` ignores it.
  - `monthCard` uses `leftThisMonthMinor`.
- Produces, in `src/domain/planning.ts`: `dailySpendMinor(txns: Txn[], today: ISODate): number`, which is the larger of two values:
  - this month's `isSpend` total divided by the elapsed days, today included;
  - the complete-month `isSpend` average (from `completeMonthTotals(...).spendMinor`) divided by 30.
  - Both are rounded up, and the result is 0 with no data.

- [ ] **Step 1: Write the failing tests.**
  - `pullForwardRoomMinor`:
    - `({emergencyDone:false, …})===0`.
    - With `suggested=4_000_000, invested=4_000_000, remaining=10_000_000, dailySpend=200_000, daysLeft=20` → `min(2_000_000, 10_000_000−4_000_000)=2_000_000`.
    - Same with `remaining=5_000_000` → `1_000_000`.
    - Already over (`invested=5_000_000`): room shrinks by the 1_000_000 excess → `1_000_000`.
    - Negative cases → 0.
  - `daysLeftInMonth('2026-11-30')===1`, `('2026-02-01')===28`.
  - `suggestInvestment`:
    - with `prevExcessMinor: 3_000_000` and a computed raw 4_000_000 → `2_000_000` (capped at 50%);
    - with `prevExcessMinor: 500_000` → `3_500_000`;
    - with `settingMinor: 4_000_000, prevExcessMinor: 3_000_000` → `4_000_000`.
  - `dailySpendMinor`:
    - an empty list → 0;
    - this month 3 000 Ft over 3 days vs a complete-month average 60 000 Ft → `200_000` (the larger);
    - recurring-linked expenses don't count.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update every `suggestInvestment` caller (`investModel.ts` `buildInvestCore`) to pass `prevExcessMinor`:
  - `prevExcessMinor` = last month's buys (`investedThisMonthMinor(txns, prevMonth)`) − `settings.invest_suggested_log?.[prevMonth]`, floored at 0, and 0 when the log has no entry.
  - Add `invest_suggested_log: Record<YearMonth, number>` to `Settings`, to `DEFAULT_SETTINGS` (`{}`) and to `user.jsonc` (`object`).
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS, with existing invest tests unchanged except where the new parameter is added.
- [ ] **Step 5: Commit** `feat: shared brief math; last month's overspend trims this month's suggestion`.

### Task 4: Client brief snapshot

**Files:**
- Create: `src/app/briefSnapshot.ts`, `src/app/briefSnapshot.test.ts`
- Modify: `src/app/startup.ts` (run after materialize and SMS conversion, never throwing), `src/domain/types.ts`, `base44/entities/user.jsonc`, `src/data/settings.ts`

**Interfaces:**
- Consumes: `buildInvestCore`, `useInvestData`'s loading sequence (move its body into a reusable `loadInvestCore(home)` in `useInvestData.ts` so both use one path), `dailySpendMinor`.
- Produces:
  - Type `BriefSnapshot`:
    `{ month: YearMonth; computed_at: string; suggestion: { kind: 'no_data'|'nothing_spare'|'amount'; amountMinor: number|null; source: 'computed'|'setting'|null }; split: Record<AssetType, number>|null; emergencyDone: boolean; remainingMinor: number; dailySpendMinor: number; holdings: { holding_id: string; name: string; asset_type: AssetType; quote_symbol: string|null; currency: string; costMinor: number; valueMinor: number|null }[] }`.
  - User fields `brief_snapshot` (object|null) and `invest_suggested_log` (object).
  - `buildBriefSnapshot(core: InvestCore, home: HomeData, nowIso: string): BriefSnapshot` (pure).
  - `refreshBriefSnapshot(): Promise<void>`, which writes `brief_snapshot`, and also writes `invest_suggested_log[month] = amountMinor` when `source==='computed'`.

- [ ] **Step 1: Write the failing tests** for `buildBriefSnapshot`, using fixtures from `investModel.test.ts`:
  - `suggestion.kind` follows the core;
  - `remainingMinor === home.model.monthly.remainingMinor`;
  - `holdings` lists open positions only, with `valueMinor` null when unpriced;
  - `month` = month of `home.today`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `startup.ts`, call `void refreshBriefSnapshot()` after the startup work and on the resume path (`visibilitychange`), with errors only logged.
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: write the brief snapshot on app start`.

### Task 5: News entities, sources and feed parsing

**Files:**
- Create:
  - `base44/entities/news-source.jsonc`, `base44/entities/news-item.jsonc`, `base44/entities/daily-digest.jsonc`
  - `base44/shared/news.ts`, `base44/shared/news.test.ts`
- Modify: `base44/entities/user.jsonc` (`digest_enabled` bool, `news_interval_hours` integer)

**Interfaces:**
- Produces:
  - **Entities.** All have `owner_id` and RLS `create:false`, `read:{"data.owner_id":"{{user.id}}"}`, `delete:false`. `update:false`, except NewsSource `update:{"data.owner_id":"{{user.id}}"}` (the `active` toggle).
    - **NewsSource:** `name`, `url`, `default_tags` (string[]), `active`, `last_fetched_at`, `last_error`.
    - **NewsItem:** `source_id`, `source_name`, `title`, `link`, `published_at`, `summary` (string|null), `tags` (string[]), `affects_portfolio` (bool), `ai_done` (bool).
    - **DailyDigest:** `date`, `numbers` (object), `notification`, `what_happened` (string|null), `this_month` (string|null), `news_ids` (string[]), `incomplete`, `ai_ok`, `push_status` (`sent`|`failed`|`skipped`), `push_error` (string|null). **AiUsage:** `date`, `collect` (integer), `brief` (integer), one row per Budapest day, holding the daily AI cap counters.
  - **From `base44/shared/news.ts`:**
    - `SEED_SOURCES: {name, url, default_tags}[]`, the 8 feeds of spec §4.1, verbatim.
    - `NEWS_TAGS`.
    - `parseFeed(xml: string): { title: string; link: string; published_at: string|null }[]`. It handles RSS `<item>` and Atom `<entry>`, uses a regex/DOM-free parser (Workers have no DOMParser), decodes entities and CDATA, and returns `[]` for non-XML.
    - `newItems(parsed, knownLinks: Set<string>, max: number)`, which dedupes by link and keeps the newest first, up to `max`.
    - `COLLECT_SCHEMA`.
    - `buildCollectPrompt(items: {i:number; title:string; source:string}[], holdings: {name:string; asset_type:string; ticker:string|null; currency:string}[]): string`. The prompt says an item affects the portfolio when it touches a holding, its asset class, its currency against HUF, the forint, or Hungarian interest rates, even with no holdings (spec §4.2).
    - `normalizeCollect(raw, count): ({summary:string; tags:string[]; affects_portfolio:boolean}|null)[]`. Unknown tags are dropped, a summary is cut to 160 characters, and missing or garbage entries become null.
    - `collectDue(lastRunIso: string|null, nowIso: string, intervalHours: number): boolean`.
    - `isExpired(publishedIso: string, nowIso: string): boolean` (over 30 days).

- [ ] **Step 1: Write the failing tests.**
  - `parseFeed`:
    - a CNBC-shaped RSS fixture with 2 items, one using CDATA and `&amp;`;
    - an Atom fixture;
    - HTML input → `[]`.
  - `newItems`: drops known links and caps at `max`.
  - `normalizeCollect`: tag `"weather"` dropped; a missing entry → null; `count` honoured.
  - `collectDue`: null → true; 3h after with 4h interval → false; 4h → true.
  - `isExpired`: at 31 days → true.
  - `SEED_SOURCES.length===8`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: news entities and feed parsing`.

### Task 6: `collectNews` function

**Files:**
- Create: `base44/functions/collectNews/entry.ts`, `base44/functions/collectNews/function.jsonc`

**Interfaces:**
- Consumes: Task 5 shared helpers, and the Task 1 finding on how a scheduled run finds its user.
- Produces:
  - An hourly automation `collect_hourly` (`simple`, `repeat_unit:'hours'`, `repeat_interval:1`).
  - Client-callable `{action:'now'}`, which requires `auth.me()` and runs for that user, ignoring the interval.
- Behaviour, per user who has `digest_enabled` true or any NewsSource row:
  1. Seed the sources if none exist.
  2. Skip unless `collectDue(max last_fetched_at, now, news_interval_hours ?? 4)`.
  3. Fetch the active sources in batches of up to 6, with `AbortSignal.timeout(10_000)` each. On failure, set that source's `last_error`; on success, clear it and set `last_fetched_at`.
  4. Pick new items by link (`newItems`, max 40) and create them with the source's `default_tags`, `ai_done:false`.
  5. If today's `AiUsage.collect` < 10: run one InvokeLLM (`model:'gemini_3_8_flash'`) over all `ai_done:false` items (max 40, newest first), with holdings from the user's `brief_snapshot`. Write `summary`, `tags`, `affects_portfolio`, `ai_done:true`, and increment the counter.
  6. Delete items where `isExpired`.

- [ ] **Step 1: Implement** the entry, with the safe-log pattern from `quotes/entry.ts`.
- [ ] **Step 2: Run `npx tsc --noEmit` and `npm test`.** Expected: PASS.
- [ ] **Step 3: Commit** `feat: collectNews scheduled function`. The live check comes in Task 11.

### Task 7: Brief composition logic

**Files:**
- Create:
  - `base44/shared/chart.ts`, `base44/shared/chart.test.ts`. Move `chartUrl`/`parseChart` there from `quotes/logic.ts` and re-export them from `quotes/logic.ts` so its tests still pass.
  - `base44/functions/morningBrief/brief.ts`, `base44/functions/morningBrief/brief.test.ts`

**Interfaces:**
- Consumes: `BriefSnapshot` (the shape from Task 4, redeclared as a type in `brief.ts`, since functions can't import `src/`), and `leftThisMonthMinor`, `pullForwardRoomMinor`, `daysLeftInMonth` from `../../shared/brief.ts`.
- Produces:
  - `chart.ts`: `parseCloses(json): { date: string; close: number }[]`, which reads `timestamp` and `indicators.quote[0].close`, skips nulls and dates by Budapest, plus `changeOver(closes, days: number): number|null`.
    - Day change: last close / previous close − 1.
    - Week change: last close / the last close at least 7 days before − 1.
    - The result is null when there is no such close.
  - `briefNumbers(i: { snapshot: BriefSnapshot|null; today: string; investedThisMonthMinor: number; moves: Record<string /* symbol */, {day:number|null; week:number|null}>; eurHuf: {rate:number; weekChange:number|null}|null }): BriefNumbers`.
    - Type `BriefNumbers`: `{ stale: boolean; holdings: {name, asset_type, day: number|null, week: number|null, fixed: boolean}[]; eurHuf; month: {suggestedMinor:number|null; investedMinor:number; leftMinor:number|null; pullForwardRoomMinor:number|null}; incomplete: boolean }`.
    - `stale` = no snapshot, or `snapshot.month !== monthOf(today)`. When stale, the month fields are null.
    - Bonds are `fixed:true` with null moves.
    - `incomplete` is set when any market-priced holding lacks a `day` or eurHuf is null.
  - `pickNews(items: {id, published_at, affects_portfolio, tags}[], nowIso): string[]`: 24h `affects_portfolio` items first, then the past week's items tagged `rates|inflation|forint|markets`, with a total of at most 15.
  - `BRIEF_SCHEMA`.
  - `buildBriefPrompt(numbers: BriefNumbers, news: {id,title,summary,source}[], split: Record<string,number>|null, catalogNames: string[]): string`. The prompt carries the anti-goals: calm tone, "nothing to do" is a fine answer, never suggest selling, and only use given numbers and given news ids.
  - `normalizeBrief(raw, allowedIds: Set<string>): { notification: string|null; what_happened: string|null; this_month: string|null; news_ids: string[] }`. The notification is trimmed and cut to 180 characters on a word boundary.
  - `fallbackNotification(n: BriefNumbers): string`. Example: `"Portfolio +0.8% this week. 15 000 Ft left to invest this month."`. The no-holdings variant is `"Markets: world ETF +0.6% today. EUR/HUF 364.4."`. The stale variant ends with `"Open the app to update this month's numbers."`. The result is always at most 180 characters.

- [ ] **Step 1: Write the failing tests.**
  - `parseCloses`/`changeOver` on a 10-day fixture: the day change is right, and the week change uses the close at least 7 days back.
  - `briefNumbers` stale snapshot (`month:'2026-10'`, today `2026-11-01`) → `stale:true` and `leftMinor:null`. This is Review Focus 1.
  - `briefNumbers` with `suggestion.amountMinor:4_000_000` and `investedThisMonthMinor:2_500_000` → `leftMinor:1_500_000`, even though the snapshot predates the buy. This is Review Focus 2.
  - `briefNumbers` with no eurHuf → `incomplete:true`.
  - `normalizeBrief`:
    - a 300-character notification → at most 180 characters;
    - an unknown id is dropped;
    - a missing field → null (Review Focus 5).
  - `fallbackNotification`: all three variants, each at most 180 characters.
  - `pickNews` caps at 15.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS, with the `quotes` tests unchanged.
- [ ] **Step 5: Commit** `feat: morning brief composition logic`.

### Task 8: `morningBrief` scheduled function

**Files:**
- Modify: `base44/functions/morningBrief/entry.ts`, `base44/functions/morningBrief/push.test.ts`
- Create: `base44/functions/morningBrief/function.jsonc`, `base44/functions/morningBrief/due.ts`, `base44/functions/morningBrief/due.test.ts`

**Interfaces:**
- Produces:
  - `briefDue(nowIso: string, tz: string, digestTime: string, hasTodayDigest: boolean): boolean`, which is true once the local time ≥ `digestTime` and there is no digest for today.
  - Automation `brief_every_15` (`simple`, minutes, 15).
  - Actions:
    - `{action:'test'}` (Task 2): it now sends the latest digest's `notification` with `url:/brief/<date>` when one exists.
    - `{action:'now'}`: requires auth and builds today's digest if it is missing.
- Run for each user with a `brief_snapshot` or a PushSubscription row, when `briefDue`:
  1. Load the snapshot, this month's buys (InvestmentTransaction, `side:'buy'`, owned by the user), the chart for each `quote_symbol` (`range=1mo&interval=1d`) and EUR/HUF from `https://api.frankfurter.app/latest?from=EUR&to=HUF` plus `https://api.frankfurter.app/<today−7>?from=EUR&to=HUF` for the week change. Upsert `FxRate`. If a holding is in USD, fetch USD/HUF the same way. Without holdings, use `VWCE.DE` as the market line.
  2. Run `briefNumbers` and `pickNews`.
  3. If today's `AiUsage.brief` < 2: one InvokeLLM (`model:'claude-sonnet-5'`) → `normalizeBrief`. Otherwise, or on error, set `ai_ok:false`.
  4. `notification` = AI notification ?? `fallbackNotification`.
  5. Create the DailyDigest. When `digest_enabled` and there are active subscriptions: send to each, apply `classifyPushResult`, and set `push_status`/`push_error`. Otherwise set `push_status:'skipped'`.
  6. Never create a second digest for the same date. Re-check right before the create.

- [ ] **Step 1: Write the failing tests.**
  - `briefDue('2026-11-04T05:59:00Z','Europe/Budapest','07:00',false)===false`; at 06:00Z (07:00 local) → true; with `hasTodayDigest:true` → false.
  - The CET/CEST switch: `'2026-07-01T05:00:00Z'` (07:00 CEST) → true.
  - `push.test.ts`: a digest-level status helper `digestPushStatus(results: ('sent'|'gone'|'failed')[]): {status:'sent'|'failed'|'skipped'; error:string|null}`:
    - `[]` → skipped;
    - any sent → sent;
    - all failed/gone → failed, with `'subscription expired'` when all are gone (Review Focus 4).
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** `due.ts`, the status helper and the run.
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: morningBrief scheduled function`.

### Task 9: News tab and Brief screen

**Files:**
- Create:
  - `src/data/news.ts` (`listNews(limit=100)`, `getDigest(date)`, `latestDigest()`, `listSources()`, `setSourceActive(id, active)`, `collectNow()`, `briefNow()`)
  - `src/features/news/NewsScreen.tsx`, `src/features/news/BriefScreen.tsx`, `src/features/news/newsModel.ts`, `src/features/news/newsModel.test.ts`
- Modify: `src/App.tsx` (routes `/news`, `/brief/:date`), `src/features/shell/TabBar.tsx` (5th tab `{to:'/news', label:'News', icon:'news', roots:['/news','/brief']}`), `src/features/shell/Icons.tsx` (a `news` icon in the existing outline style)

**Interfaces:**
- Produces, in `newsModel.ts`:
  - `NEWS_FILTERS = ['Mine','All','Rates','Forint','Markets','Housing'] as const`.
  - `filterNews(items, filter)`:
    - Mine = `affects_portfolio`;
    - Rates = `rates|inflation`;
    - Forint = `forint|hungary`;
    - Markets = `markets|etf|stocks|bonds|crypto`;
    - Housing = `housing`.
  - `ago(publishedIso, nowIso): string`, giving `"2 h"`, `"1 d"` or `"now"`.
  - `pctLabel(x: number|null): string`, giving `"+0.6%"`, `"−0.4%"` or `"no data"`.
- Screens follow the mockup and the existing `Screen`/card classes:
  - **News:** today's brief card on top (`latestDigest()` dated today, otherwise "Your first brief arrives tomorrow at 07:00", using the user's time), then the chips and the list. Each row opens `link` in a new tab. Empty state: "News arrives within a few hours." The default filter is `All`.
  - **Brief `/brief/:date`:**
    - three cards: Your investments, What happened (with source names of `news_ids`), This month's money;
    - the stale copy "Open the app to update this month's numbers.";
    - "AI note unavailable" when the AI failed;
    - the incomplete badge;
    - the footer copy verbatim (see Global Constraints).
  - The This-month card links to `/invest`.

- [ ] **Step 1: Write the failing tests** for `filterNews` (each filter), `ago` and `pctLabel` (the minus sign is U+2212, as in the mockup).
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the data layer, the screens, the route and the tab. Visiting `/news` with no rows must render without errors.
- [ ] **Step 4: Run `npm test` and `npx tsc --noEmit`.** Expected: PASS. Check the tab bar at 375px wide in the browser pane, with `npm run dev`: five tabs fit without wrapping.
- [ ] **Step 5: Commit** `feat: News tab and morning brief screen`.

### Task 10: Settings → Morning brief

**Files:**
- Create: `src/features/settings/BriefSettingsScreen.tsx`
- Modify:
  - `src/App.tsx` (`/settings/brief`)
  - `src/features/settings/SettingsScreen.tsx` (replace the Task 2 temporary row with a "Morning brief" link row)
  - `src/domain/types.ts` and `src/data/settings.ts` (`digest_enabled: boolean` default false, `news_interval_hours: 2|4|8|12` default 4)

**Interfaces:**
- Consumes: `pushSupport`, `subscribePush`, `unsubscribePush`, `sendTestPush`, `listSources`, `setSourceActive`, `latestDigest`.
- The screen shows:
  - A notifications toggle. On: `subscribePush` and then `updateSettings({digest_enabled:true})`. Off: `unsubscribePush` and `digest_enabled:false`. The `pushSupport()` messages are: not installed → "Add the app to your Home Screen to get notifications.", denied → "Notifications are blocked in iPhone Settings.", unsupported → "This browser can't show notifications."
  - A time input (`HH:MM`, saved to `digest_time`).
  - An interval select (2/4/8/12 h) with "Each round uses a few Base44 AI credits."
  - Per-source toggles, each with its `last_error` when set.
  - Last brief: date, `push_status`, and `push_error` when set. "Daily AI limit reached" when today's `AiUsage` hit a cap (read through a new `todayUsage()` in `src/data/news.ts`).
  - A "Send a test notification" button showing the sent/failed result.

- [ ] **Step 1: Implement**, reusing the Settings row styles.
- [ ] **Step 2: Run `npx tsc --noEmit` and `npm test`.** Expected: PASS.
- [ ] **Step 3: Commit** `feat: morning brief settings`.

### Task 11: Deploy and live verification

- [ ] **Step 1: Run `npm test` and `npx tsc --noEmit`, then push to main.**
- [ ] **Step 2: Ask the user to OK the deploy, then run `npm run deploy`.** Expected: `collectNews` (1 automation) and `morningBrief` (1 automation) deployed.
- [ ] **Step 3: Check in the signed-in browser pane** (the user signs in themself):
  1. Settings → Morning brief renders, and the sources are seeded after `collectNow()`.
  2. News fills with tagged items that have summaries. A source error, if any, shows under its toggle.
  3. `briefNow()` creates today's digest, and `/brief/<today>` shows the three cards with real EUR/HUF.
  4. `/does-not-exist` still shows Not found.
  5. The service worker is active with nothing waiting.
- [ ] **Step 4: Run the live push on the iPhone.** With the user: toggle on and Send test, then wait for one scheduled brief at a time set about 20 minutes ahead. Expected: the notification arrives at that time, and tapping it opens `/brief/<today>`. Restore the user's time afterwards.
- [ ] **Step 5: Check the credit usage.** Read today's `AiUsage` row and note it.
- [ ] **Step 6: Clean up and record.**
  - Delete only the test rows created during verification: an extra digest, if any.
  - Update memory: a Plan 5 facts note (scheduled-run identity, push library used, VAPID secrets set) and a follow-ups note.
  - Commit and push.
