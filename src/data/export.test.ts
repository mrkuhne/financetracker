import { describe, it, expect } from 'vitest';
import { buildTransactionsCsv, buildExportJson, CSV_HEADER } from '@/data/export';
import type { Txn } from '@/domain/types';

const base: Txn = {
  id: 't', account_id: 'a1', kind: 'expense', amount_minor: 240000, currency: 'HUF', amount_huf_minor: 240000,
  category_id: 'c1', date: '2026-11-02', source: 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null,
};
const accounts = [{ id: 'a1', name: 'Main, "OTP"' }, { id: 'a2', name: 'Revolut' }];
const categories = [{ id: 'c1', name: 'Food' }];

describe('buildTransactionsCsv', () => {
  it('has the exact header and resolves names, major units, quoting', () => {
    const csv = buildTransactionsCsv([{ ...base, note: 'a,b "c"\nd' }], accounts, categories);
    const [header, ...rest] = csv.split('\r\n');
    expect(header).toBe('date,account,kind,amount,currency,amount_huf,category,note,source');
    expect(header).toBe(CSV_HEADER);
    expect(rest[0]).toBe('2026-11-02,"Main, ""OTP""",expense,2400.00,HUF,2400.00,Food,"a,b ""c""\nd",manual');
  });
  it('formats foreign currency and empty category/note, sorts by date ascending', () => {
    const eur: Txn = { ...base, id: 'u', date: '2026-10-01', account_id: 'a2', amount_minor: 1050, currency: 'EUR', amount_huf_minor: 420000, category_id: null };
    const lines = buildTransactionsCsv([base, eur], accounts, categories).trim().split('\r\n');
    expect(lines[1]).toBe('2026-10-01,Revolut,expense,10.50,EUR,4200.00,,,manual');
    expect(lines[2].startsWith('2026-11-02')).toBe(true);
  });
});

describe('buildExportJson', () => {
  it('includes version, exported_at and all collections', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const o = JSON.parse(buildExportJson({
      accounts: [], categories: [], transactions: [base], recurring_rules: [], month_closes: [],
      settings: { base_currency: 'HUF', monthly_savings_target_minor: 0, monthly_investment_amount_minor: null, emergency_fund_months: 3, week_start: 'monday', digest_time: '20:00', timezone: 'UTC' },
    }, now));
    expect(o.version).toBe(1);
    expect(o.exported_at).toBe('2026-11-01T10:00:00.000Z');
    for (const k of ['accounts', 'categories', 'transactions', 'recurring_rules', 'month_closes', 'settings']) expect(o).toHaveProperty(k);
    expect(o.transactions).toHaveLength(1);
  });
});
