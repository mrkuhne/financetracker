// Row helpers shared by the collectNews and morningBrief functions (via `../../shared/rows.ts`).
// No imports on purpose: functions bundle this file on its own.

type Dated = { id: string; created_date?: string };

const byAge = (a: Dated, b: Dated) => {
  const ta = Date.parse(a.created_date ?? '');
  const tb = Date.parse(b.created_date ?? '');
  const na = Number.isNaN(ta) ? Infinity : ta;
  const nb = Number.isNaN(tb) ? Infinity : tb;
  if (na !== nb) return na - nb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Ids of rows that repeat an earlier row's key; the oldest (created_date, then id) of each key is kept. */
export function duplicateIds<T extends Dated>(rows: T[], key: (r: T) => unknown): string[] {
  const seen = new Set<unknown>();
  const out: string[] = [];
  for (const r of [...rows].sort(byAge)) {
    const k = key(r);
    if (k === undefined || k === null || k === '') continue;
    if (seen.has(k)) out.push(r.id);
    else seen.add(k);
  }
  return out;
}

export type UsageRow = { id: string; created_date?: string; collect?: number; brief?: number };

/** Several AiUsage rows for one day (from overlapping runs) count as one: summed totals, the oldest row is written. */
export function usageTotals(rows: UsageRow[]): { primary: UsageRow | null; collect: number; brief: number } {
  const sorted = [...rows].sort(byAge);
  let collect = 0;
  let brief = 0;
  for (const r of sorted) {
    collect += typeof r.collect === 'number' ? r.collect : 0;
    brief += typeof r.brief === 'number' ? r.brief : 0;
  }
  return { primary: sorted[0] ?? null, collect, brief };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
