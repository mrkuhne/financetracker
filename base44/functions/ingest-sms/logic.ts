// Pure logic for the ingest-sms function. Web-standard globals only (Deno + Node 20).
// Intentionally self-contained: no npm:/jsr: imports, nothing from src/.

export function extractApiKey(headers: Headers): string | null {
  const direct = headers.get('x-api-key')?.trim();
  if (direct) return direct;
  const m = /^Bearer\s+(.+)$/i.exec(headers.get('authorization')?.trim() ?? '');
  const token = m?.[1].trim();
  return token && token.startsWith('ft_') ? token : null;
}

// Duplicated from src/data/apiKeys.ts on purpose (function folder deploys alone).
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function dedupeHash(sender: string, text: string): Promise<string> {
  return sha256Hex(sender.trim() + '|' + text.trim());
}

export type ValidBody = { text: string; sender: string; received_at: string };

export function validateBody(
  body: unknown,
  nowIso: string,
): { ok: true; value: ValidBody } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
  const b = body as Record<string, unknown>;
  if (typeof b.text !== 'string') return { ok: false, error: 'text_required' };
  const text = b.text.trim();
  if (!text) return { ok: false, error: 'text_required' };
  if (text.length > 1000) return { ok: false, error: 'text_too_long' };
  let sender = 'unknown';
  if (b.sender !== undefined && b.sender !== null) {
    if (typeof b.sender !== 'string') return { ok: false, error: 'invalid_sender' };
    sender = b.sender.trim() || 'unknown';
    if (sender.length > 100) return { ok: false, error: 'sender_too_long' };
  }
  const received_at =
    typeof b.received_at === 'string' && !Number.isNaN(Date.parse(b.received_at)) ? b.received_at : nowIso;
  return { ok: true, value: { text, sender, received_at } };
}

const NUM = '[+\\-−]?\\d[\\d .,]*';
const CUR = '(?<![A-Za-z])(?:HUF|Ft|EUR|USD|GBP|CHF)(?![A-Za-z])|[€$]';
const MONEY_RE = new RegExp(`${NUM}\\s*(?:${CUR})|(?:${CUR})\\s*${NUM}`, 'i');

export function looksLikeMoney(text: string): boolean {
  return MONEY_RE.test(text);
}

export function budapestDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    is_transaction: { type: 'boolean' },
    direction: { type: 'string', enum: ['debit', 'credit'] },
    amount: { type: 'number', exclusiveMinimum: 0, description: 'Positive amount in major units' },
    currency: { type: 'string', description: '3-letter ISO currency code' },
    merchant: { type: 'string' },
    date: { type: 'string', description: 'YYYY-MM-DD or empty' },
    category: { type: 'string', description: 'One of the given category names or empty' },
  },
  required: ['is_transaction'],
};

export function buildPrompt(text: string, sender: string, categoryNames: string[]): string {
  return [
    'You are reading a Hungarian bank SMS. Extract the transaction fields as JSON.',
    '',
    'Fields: is_transaction, direction (debit|credit), amount (positive number in major units), currency (3-letter ISO), merchant, date (YYYY-MM-DD or empty), category.',
    'Direction: "terhelés", "vásárlás" or a minus sign means debit; "jóváírás" or "érkezett" means credit.',
    'Merchant: a readable name without store numbers or city, e.g. "ALDI 152. BUDAPEST" becomes "Aldi".',
    `Category: choose only from this list, or leave empty if none fits: ${categoryNames.join(', ')}`,
    'Set is_transaction to false for OTP codes, login notices, marketing and balance-only texts.',
    '',
    `Sender: ${sender}`,
    `SMS text: ${text}`,
  ].join('\n');
}

export type Normalized =
  | {
      status: 'parsed';
      kind: 'expense' | 'income';
      amount_minor: number;
      currency: string;
      merchant: string | null;
      date: string;
      category_name: string | null;
    }
  | { status: 'ignored' | 'failed'; reason: string };

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Same set looksLikeMoney recognizes (Ft is HUF).
const CURRENCIES = new Set(['HUF', 'EUR', 'USD', 'GBP', 'CHF']);
const MAX_AMOUNT_MINOR = 100_000_000_000; // 1 billion major units
const MAX_DATE_DRIFT_DAYS = 7;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export function normalizeParsed(raw: unknown, fallbackDate: string, categoryNames: string[]): Normalized {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { status: 'failed', reason: 'bad_shape' };
  const r = raw as Record<string, unknown>;
  if (r.is_transaction === false) return { status: 'ignored', reason: 'not_a_transaction' };
  if (r.is_transaction !== true) return { status: 'failed', reason: 'bad_shape' };
  if (r.direction !== 'debit' && r.direction !== 'credit') return { status: 'failed', reason: 'bad_direction' };
  if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0)
    return { status: 'failed', reason: 'bad_amount' };
  const amount_minor = Math.round(r.amount * 100);
  if (!Number.isSafeInteger(amount_minor) || amount_minor <= 0 || amount_minor > MAX_AMOUNT_MINOR)
    return { status: 'failed', reason: 'bad_amount' };
  const currency = typeof r.currency === 'string' ? r.currency.trim().toUpperCase() : '';
  if (!CURRENCIES.has(currency)) return { status: 'failed', reason: 'bad_currency' };
  const merchantRaw = typeof r.merchant === 'string' ? r.merchant.trim().slice(0, 80).trim() : '';
  const date =
    typeof r.date === 'string' && isRealDate(r.date) && daysApart(r.date, fallbackDate) <= MAX_DATE_DRIFT_DAYS
      ? r.date
      : fallbackDate;
  const cat = typeof r.category === 'string' ? r.category.trim().toLowerCase() : '';
  const category_name = (cat && categoryNames.find((n) => n.toLowerCase() === cat)) || null;
  return {
    status: 'parsed',
    kind: r.direction === 'debit' ? 'expense' : 'income',
    amount_minor,
    currency,
    merchant: merchantRaw || null,
    date,
    category_name,
  };
}
