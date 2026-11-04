import { base44 } from '@/data/client';
import { todayInTz } from '@/domain/dates';
import type { ISODate } from '@/domain/types';
import type { NewsRow } from '@/features/news/newsModel';

type Rec = Record<string, unknown>;

export interface DigestRow {
  id: string;
  date: string;
  /** Raw BriefNumbers JSON; parse with parseNumbers(). */
  numbers: unknown;
  notification: string | null;
  what_happened: string | null;
  this_month: string | null;
  news_ids: string[];
  incomplete: boolean;
  ai_ok: boolean;
  push_status: 'sent' | 'failed' | 'skipped' | null;
  push_error: string | null;
}

export interface SourceRow {
  id: string;
  name: string;
  url: string;
  default_tags: string[];
  active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const toNews = (r: Rec): NewsRow => ({
  id: String(r.id),
  source_id: str(r.source_id) ?? '',
  source_name: str(r.source_name) ?? '',
  title: str(r.title) ?? '',
  link: str(r.link) ?? '',
  published_at: str(r.published_at),
  summary: str(r.summary),
  tags: strs(r.tags),
  affects_portfolio: r.affects_portfolio === true,
});

const toDigest = (r: Rec): DigestRow => ({
  id: String(r.id),
  date: str(r.date) ?? '',
  numbers: r.numbers ?? null,
  notification: str(r.notification),
  what_happened: str(r.what_happened),
  this_month: str(r.this_month),
  news_ids: strs(r.news_ids),
  incomplete: r.incomplete === true,
  ai_ok: r.ai_ok === true,
  push_status: r.push_status === 'sent' || r.push_status === 'failed' || r.push_status === 'skipped' ? r.push_status : null,
  push_error: str(r.push_error),
});

const toSource = (r: Rec): SourceRow => ({
  id: String(r.id),
  name: str(r.name) ?? '',
  url: str(r.url) ?? '',
  default_tags: strs(r.default_tags),
  active: r.active !== false,
  last_fetched_at: str(r.last_fetched_at),
  last_error: str(r.last_error),
});

async function meId(): Promise<string> {
  const me = (await base44.auth.me()) as { id: string };
  return me.id;
}

/** Newest first. */
export async function listNews(limit = 100): Promise<NewsRow[]> {
  const rows = (await base44.entities.NewsItem.filter({ owner_id: await meId() }, '-published_at', limit)) as Rec[];
  return (rows ?? []).map(toNews).sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
}

export async function listNewsByIds(ids: string[]): Promise<NewsRow[]> {
  if (ids.length === 0) return [];
  const rows = (await base44.entities.NewsItem.filter({ owner_id: await meId(), id: { $in: ids } }, '-published_at', ids.length)) as Rec[];
  return (rows ?? []).map(toNews);
}

export async function getDigest(date: ISODate): Promise<DigestRow | null> {
  const rows = (await base44.entities.DailyDigest.filter({ owner_id: await meId(), date }, '-created_date', 1)) as Rec[];
  return rows?.[0] ? toDigest(rows[0]) : null;
}

export async function latestDigest(): Promise<DigestRow | null> {
  const rows = (await base44.entities.DailyDigest.filter({ owner_id: await meId() }, '-date', 1)) as Rec[];
  return rows?.[0] ? toDigest(rows[0]) : null;
}

export async function listSources(): Promise<SourceRow[]> {
  const rows = (await base44.entities.NewsSource.filter({ owner_id: await meId() }, 'name', 200)) as Rec[];
  return (rows ?? []).map(toSource);
}

export async function setSourceActive(id: string, active: boolean): Promise<void> {
  await base44.entities.NewsSource.update(id, { active });
}

/** The function body, whether the SDK wraps it in `.data` or not. */
function body(res: unknown): Rec | null {
  const b = ((res as { data?: unknown } | null)?.data ?? res) as unknown;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Rec) : null;
}

export async function collectNow(): Promise<Rec | null> {
  return body(await base44.functions.invoke('collectNews', { action: 'now' }));
}

export async function briefNow(): Promise<Rec | null> {
  return body(await base44.functions.invoke('morningBrief', { action: 'now' }));
}

/** Today's AI credit use, summed across rows. */
export async function todayUsage(today?: ISODate): Promise<{ collect: number; brief: number }> {
  // The server writes AiUsage.date as the Budapest date (budapestDate), so read it the same way.
  const date = today ?? todayInTz('Europe/Budapest');
  const rows = (await base44.entities.AiUsage.filter({ owner_id: await meId(), date }, '-created_date', 50)) as Rec[];
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return (rows ?? []).reduce<{ collect: number; brief: number }>(
    (acc, r) => ({ collect: acc.collect + n(r.collect), brief: acc.brief + n(r.brief) }),
    { collect: 0, brief: 0 },
  );
}
