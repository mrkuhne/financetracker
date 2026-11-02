import { describe, expect, it } from 'vitest';
import { smsStatusLabel, testToast } from './smsUi';
import { formatMoney } from '@/domain/money';

describe('smsUi', () => {
  it('labels statuses', () => {
    expect(smsStatusLabel('parsed')).toBe('Parsed');
    expect(smsStatusLabel('converted')).toBe('Added');
    expect(smsStatusLabel('ignored')).toBe('Ignored');
    expect(smsStatusLabel('failed')).toBe("Couldn't read");
  });
  it('builds the test toast', () => {
    const amt = formatMoney(1550000, 'HUF');
    expect(testToast(200, { status: 'parsed', merchant: 'MOL', amount_minor: 1550000, currency: 'HUF' })).toBe(`Test received: MOL −${amt}`);
    expect(testToast(200, { status: 'parsed', amount_minor: -1550000, currency: 'HUF' })).toBe(`Test received: Expense −${amt}`);
    expect(testToast(200, { status: 'parsed' })).toBe('Test received: Expense');
    expect(testToast(200, { status: 'duplicate' })).toBe('Already received');
    expect(testToast(200, { status: 'ignored' })).toBe('ignored');
    expect(testToast(401, { error: 'invalid_key' })).toBe('Key not accepted');
    expect(testToast(400, { error: 'bad' })).toBe('bad');
  });
});
