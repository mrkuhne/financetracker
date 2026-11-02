import { fromMinor } from '@/domain/money';
import type { ISODate, PurchaseOption, PurchasePlan } from '@/domain/types';
import { parseAmountInput } from '@/lib/amountInput';

export const MAX_OPTIONS = 8;

export interface OptionDraft {
  id?: string; name: string; priceText: string; payment: 'one_time' | 'installments';
  installmentText: string; countText: string; link: string; note: string;
}
export interface PlanDraft { title: string; needed_by: ISODate | null; options: OptionDraft[] }
export type ValidOption = Omit<PurchaseOption, 'id' | 'plan_id'> & { id?: string };

type Result = { ok: true; title: string; needed_by: ISODate | null; options: ValidOption[] } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

/** Checks the draft in screen order; the first failing rule wins. */
export function validatePlanDraft(d: PlanDraft): Result {
  const title = d.title.trim();
  if (!title) return fail('Give the plan a name.');
  if (d.options.length === 0) return fail('Add at least one option.');
  if (d.options.length > MAX_OPTIONS) return fail(`Up to ${MAX_OPTIONS} options.`);
  const options: ValidOption[] = [];
  for (let i = 0; i < d.options.length; i++) {
    const o = d.options[i];
    const n = i + 1;
    const name = o.name.trim();
    if (!name) return fail(`Option ${n}: add a name.`);
    const price = parseAmountInput(o.priceText);
    if (price === null || price <= 0) return fail(`Option ${n}: enter a price.`);
    let installment: number | null = null;
    let count: number | null = null;
    if (o.payment === 'installments') {
      installment = parseAmountInput(o.installmentText);
      const c = o.countText.trim() === '' ? NaN : Number(o.countText.trim());
      if (installment === null || installment <= 0 || !Number.isInteger(c) || c < 2 || c > 120) {
        return fail(`Option ${n}: enter the monthly payment and how many months.`);
      }
      count = c;
    }
    const link = o.link.trim();
    if (link && !/^https?:\/\//i.test(link)) return fail(`Option ${n}: the link must start with http:// or https://`);
    options.push({
      ...(o.id ? { id: o.id } : {}),
      name, price_minor: price, currency: 'HUF', payment: o.payment,
      installment_minor: installment, installment_count: count,
      link: link || null, note: o.note.trim() || null, position: i,
    });
  }
  return { ok: true, title, needed_by: d.needed_by, options };
}

/** Splits the edited options into creates, updates (kept ids) and removals (ids no longer present). */
export function diffOptions(existing: PurchaseOption[], next: ValidOption[]): { create: ValidOption[]; update: (ValidOption & { id: string })[]; remove: string[] } {
  const known = new Set(existing.map((o) => o.id));
  const kept = new Set(next.filter((o) => o.id && known.has(o.id)).map((o) => o.id));
  return {
    create: next.filter((o) => !o.id || !known.has(o.id)),
    update: next.filter((o): o is ValidOption & { id: string } => !!o.id && known.has(o.id)),
    remove: existing.filter((o) => !kept.has(o.id)).map((o) => o.id),
  };
}

const amountText = (minor: number) => String(fromMinor(minor));

export function draftFromPlan(plan: PurchasePlan, options: PurchaseOption[]): PlanDraft {
  return {
    title: plan.title,
    needed_by: plan.needed_by,
    options: [...options].sort((a, b) => a.position - b.position).map((o) => ({
      id: o.id, name: o.name, priceText: amountText(o.price_minor), payment: o.payment,
      installmentText: o.installment_minor != null ? amountText(o.installment_minor) : '',
      countText: o.installment_count != null ? String(o.installment_count) : '',
      link: o.link ?? '', note: o.note ?? '',
    })),
  };
}

/** The trimmed link when it is an http(s) URL, else null (never render other schemes as links). */
export function safeLink(link: string | null): string | null {
  const t = link?.trim() ?? '';
  return /^https?:\/\//i.test(t) ? t : null;
}
