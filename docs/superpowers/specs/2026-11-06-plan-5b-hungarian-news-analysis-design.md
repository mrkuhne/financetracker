# Plan 5b: Hungarian news and per-item AI analysis

Date: 2026-11-06. Extends Plan 5 (`2026-11-04-plan-5-news-digest-design.md`), which is live in production.
Mockup: `.superpowers/brainstorm/77769-1793957420/content/news-hu.html` (approved: "tetszik").

## Intent

The user reads the news in the app to decide where this month's investment money should go. Plan 5 shows English
one-line summaries and a once-a-day brief. The user now wants two things:

1. **News in Hungarian.** The sources stay English (the user still finds them better), but what the app shows about each
   item (its title and one-line summary) is Hungarian.
2. **An AI analysis per news item.** Tapping an item opens a page where the AI has read the article, explains it, says
   what it means for the user's own money, and recommends what to buy and how much, or to wait, or that no action is needed.

Success: the user opens a headline, reads a short Hungarian analysis in a few seconds, and knows whether to put money into
something this month and how much, without the advice ever exceeding what they can safely spend.

## Goals

- News list: Hungarian title and one-line summary for each item, from the same English feeds.
- News item page (`/news/:id`) with three AI cards, all in Hungarian:
  - **Miről szól** (what it is about): two or three sentences.
  - **Mit jelent neked** (what it means for you): the effect on the user's holdings, the forint or Hungarian rates. If the
    item does not touch them, one sentence saying so.
  - **Ajánlás** (recommendation):
    - a verdict, one of: buy (`Vehetsz`), wait (`Várj`), no action (`Nincs teendő`);
    - for buy: a concrete amount in Ft and one catalog product, e.g. "10 000 Ft → Global ETF";
    - one or two sentences of reasoning;
    - the line "Ebben a hónapban még befektethető" with this month's remaining amount.
- Below the cards: a link to the original article, and the disclaimer "Oktatási célú, nem befektetési tanácsadás. Te
  döntesz, és te rögzíted a vásárlást."
- **Morning brief in Hungarian too** (user's answer, 2026-11-06): the push notification text and the AI-written cards of the
  brief page (what happened, this month's money) are Hungarian. The brief page's chrome (labels, numbers, dates) stays
  as it is. The notification keeps its two-sentence / 180-character limits.
- The analysis is made **on demand**, the first time the item is opened (a few seconds with a loading state), then
  **stored** and shown instantly afterwards. No AI is spent on items the user never opens.

## Non-goals

- No Hungarian sources (Portfolio.hu etc.); the feed list stays as it is.
- The rest of the app UI stays English (tab names, Settings, the brief screen's chrome, filter chips). The fallback
  notification text (used when the AI fails) becomes Hungarian with the brief.
- No automatic analysis of every item. No push notification per item.
- The app never records a buy; the user decides and records it, as today.

## Anti-goals (a failure even if it works)

- A recommended amount larger than this month's remaining investment money, or a pull-forward suggestion that breaks the
  existing safeguards (emergency fund not done, or the daily allowance at risk).
- Following instructions found inside an article (articles are untrusted internet text).
- Advice framed as certain or as professional advice. Every page carries the disclaimer.
- Silent failure: if the article cannot be read, the page says it worked from the feed summary only.

## Decisions (the user's)

- English sources, Hungarian display (title + summary + analysis).
- The morning brief's AI text (notification and brief cards) is Hungarian too.
- Analysis on tap, stored afterwards.
- The three-card layout and the verdict + amount + product recommendation, as in the mockup.

## Constraints and existing pieces to reuse

- Base44 functions on Deno; shared code only in `base44/shared/`; secrets via `base44:runtime`.
- `NewsItem` (owner_id RLS, client cannot write). Items expire after `NEWS_RETENTION_DAYS = 30`.
- `collectNews` labels new items with one LLM call per run (`buildCollectPrompt`, `normalizeCollect`) and has a seed-URL
  allow-list, a 2 MB body cap and http(s)-only links. `AiUsage` counts calls per Budapest day (`collect` cap 10,
  `brief` cap 2).
- Money numbers come from the client-written `brief_snapshot` on User (left this month, days left, daily spend,
  emergency-fund state, holdings), so server figures equal the app's. `pullForwardRoomMinor` and the amount cap inside
  `normalizeBrief` already enforce the anti-goal for the morning brief; the per-item analysis must use the same rules.
- The investment catalog (`briefCatalogNames`) is the only allowed set of products to name.

## Builder's choices (my calls, open to change)

- **Hungarian title:** the collect prompt also returns a Hungarian title; it is stored as a new `title_hu` field, and the
  English `title` is kept (dedupe and the original-article link depend on it). The summary prompt switches to Hungarian
  (max 160 characters).
- **Existing English items** are not back-filled; the list shows `title_hu` when present, otherwise the English title.
  They age out within 30 days.
- **Reading the article:** server-side fetch of the item's `link`, only if its host matches the host of the item's source
  feed (or a known subdomain), http(s) only, 2 MB cap, 10 s timeout. Strip HTML to plain text and cut it to about 12 000
  characters. On paywall, error or too little text, fall back to the stored summary and title, and show "Csak a hír
  összefoglalójából" under the analysis.
- **New function `analyzeNews`** (user-invoked, `{ id }`), owner-checked. It returns the stored analysis if present,
  otherwise builds it, stores it on the item (`analysis` object + `analysis_at`) and returns it. Re-analysis: a small
  "Újraelemzés" button for when the stored analysis is older than this month or the money numbers have changed. It
  counts against the cap.
- **Daily cap:** a new `analyze` counter on `AiUsage`, 20 per Budapest day; at the cap the page says the daily limit is
  reached.
- **Amount guard:** reuse the morning brief's limits. The amount may be at most this month's remaining money. Above it,
  only up to the pull-forward room, and only when that room is > 0. A violating amount is replaced by verdict wait with
  no amount. A product not in the catalog is dropped.
- **Snapshot missing:** if `brief_snapshot` is null, the recommendation card says to open the app's Invest tab first, and
  gives no amount.

- **Stale analysis (anti-goal path):** the stored analysis keeps the money figures it was made with
  (`month`, `left_minor`, `room_minor`). When the page renders, the amount guard runs again against the current
  snapshot. If the month changed, or the stored amount now exceeds what is left plus the room, the amount is hidden.
  The page then says "Az elemzés óta változott a kereted", and the "Újraelemzés" button becomes the main action. The
  text cards stay visible. Re-analysis is manual only.
- **Counting:** a call counts toward the cap only when the LLM call is made (a cached return, a fetch failure before
  the LLM, or a refused call costs nothing). At the cap, neither new analyses nor re-analysis run.
- **Article hosts:** each seed source gets an explicit list of article hosts (e.g. MarketWatch's feed host differs
  from `marketwatch.com`). Redirects are followed manually, at most 3 hops, and the host is re-checked on every hop.
  A failure falls back to the summary; known paywalls (FT) simply fall back.
- **Duplicate taps:** the client runs one request per item at a time, with the button disabled while waiting. The
  server is last-write-wins. A rare double count is accepted.
- **Output guard (`normalizeAnalysis`):**
  - The verdict must be one of the three values.
  - Only buy carries an amount and a product. Wait and no action never do.
  - The amount guard and the catalog check are applied.
  - Each card is cut at a word to about 400 characters.
  - The language is not machine-checked; the prompt demands Hungarian.
- **Model:** the same model constant as the morning brief.

## Open questions

None.
