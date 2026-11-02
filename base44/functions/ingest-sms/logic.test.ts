import {
  extractApiKey, sha256Hex, dedupeHash, validateBody, looksLikeMoney,
  budapestDate, normalizeParsed, buildPrompt,
} from './logic.ts';

const S1 = 'MBH Bank: Kartyas vasarlas -15 500 HUF, MOL 1093 BUDAORS, 2026.11.11 08:17. Egyenleg: 412 380 HUF';
const OTP = 'MBH Bank: Az On egyszer hasznalatos kodja: 482913';

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
  expect(looksLikeMoney('Paid €12,50 at shop')).toBe(true);
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
it('normalizeParsed: category match is case-insensitive and canonical', () => {
  expect(normalizeParsed({ is_transaction: true, direction: 'debit', amount: 1, currency: 'HUF', category: 'groceries' }, '2026-11-12', CATS))
    .toMatchObject({ category_name: 'Groceries' });
});
it('normalizeParsed: not a transaction → ignored; garbage → failed', () => {
  expect(normalizeParsed({ is_transaction: false }, '2026-11-12', CATS)).toEqual({ status: 'ignored', reason: 'not_a_transaction' });
  expect(normalizeParsed({ is_transaction: true, direction: 'debit', amount: -5, currency: 'HUF' }, '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
  expect(normalizeParsed({ is_transaction: true, direction: 'debit', amount: 5, currency: 'forint' }, '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
  expect(normalizeParsed({ is_transaction: true, direction: 'sideways', amount: 5, currency: 'HUF' }, '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
  expect(normalizeParsed('oops', '2026-11-12', CATS)).toMatchObject({ status: 'failed' });
});
it('buildPrompt carries the text, sender and only the category names', () => {
  const p = buildPrompt(S1, 'MBH Bank', CATS);
  for (const s of [S1, 'MBH Bank', 'Groceries', 'Transport', 'Dining']) expect(p).toContain(s);
});
