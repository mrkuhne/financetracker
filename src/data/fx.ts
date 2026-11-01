import { base44 } from '@/data/client';
import type { ISODate } from '@/domain/types';

export async function getHufPerUnit(
  currency: string,
  date: ISODate,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  if (currency === 'HUF') return 1;
  const pair = `${currency}HUF`;
  const cached = await base44.entities.FxRate.filter({ pair, date });
  if (cached.length > 0) return cached[0].rate as number;

  const res = await fetchFn(`https://api.frankfurter.dev/v1/${date}?from=${currency}&to=HUF`);
  if (!res.ok) throw new Error(`FX rate fetch failed (${res.status})`);
  const body = (await res.json()) as { rates?: { HUF?: number } };
  const rate = body.rates?.HUF;
  if (typeof rate !== 'number') throw new Error(`No HUF rate for ${currency} on ${date}`);
  await base44.entities.FxRate.create({ pair, date, rate });
  return rate;
}
