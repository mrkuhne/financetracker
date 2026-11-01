// Shared helpers for mapping between SDK records and domain types.
type Rec = Record<string, unknown>;

/** Strip null/undefined so optional schema fields are simply omitted on write. */
export function stripNulls<T extends object>(v: T): Rec {
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined));
}

/** Pick only the listed keys (drops SDK-only fields) and normalise missing nullable ones to null. */
export function pick<T>(r: Rec, keys: string[], nullable: string[] = []): T {
  const out: Rec = { id: r.id };
  for (const k of keys) out[k] = r[k] ?? (nullable.includes(k) ? null : undefined);
  return out as T;
}
