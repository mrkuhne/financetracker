import type { Account } from '@/domain/types';

export type AccountDraft = Omit<Account, 'id'> & { id?: string };
export interface AccountPatch {
  id: string;
  patch: Partial<Omit<Account, 'id'>>;
}
export interface AccountPlan {
  /** The account to persist, with is_default / is_savings_target resolved. */
  saved: AccountDraft;
  /** Other accounts whose flags must change so the one-default / one-savings-target rules hold. */
  patches: AccountPatch[];
}

/**
 * Enforces: exactly one default account, and exactly one savings target among savings accounts.
 * `others` = every account except the one being saved. Pure; callers persist the result.
 */
export function planAccountSave(others: Account[], draft: AccountDraft): AccountPlan {
  const flags = new Map<string, Partial<Pick<Account, 'is_default' | 'is_savings_target'>>>();
  const set = (id: string, f: Partial<Pick<Account, 'is_default' | 'is_savings_target'>>) => flags.set(id, { ...flags.get(id), ...f });
  const saved: AccountDraft = { ...draft };

  // Default: the saved account wins if it asks for it; otherwise it must be default when nobody else is.
  const otherDefault = others.some((o) => o.is_default);
  if (saved.is_default) {
    for (const o of others) if (o.is_default) set(o.id, { is_default: false });
  } else if (!otherDefault) {
    saved.is_default = true;
  }

  // Savings target: only savings accounts can hold it.
  if (saved.type !== 'savings') {
    saved.is_savings_target = false;
    const hasOtherTarget = others.some((o) => o.type === 'savings' && o.is_savings_target);
    const candidate = others.find((o) => o.type === 'savings' && !o.archived) ?? others.find((o) => o.type === 'savings');
    if (!hasOtherTarget && candidate) set(candidate.id, { is_savings_target: true });
  } else if (saved.is_savings_target) {
    for (const o of others) if (o.is_savings_target) set(o.id, { is_savings_target: false });
  } else if (!others.some((o) => o.type === 'savings' && o.is_savings_target)) {
    saved.is_savings_target = true; // first savings account (or the only one left) is the target
  }

  const patches: AccountPatch[] = [];
  for (const o of others) {
    const f = flags.get(o.id);
    if (!f) continue;
    const patch: AccountPatch['patch'] = {};
    if (f.is_default !== undefined && f.is_default !== o.is_default) patch.is_default = f.is_default;
    if (f.is_savings_target !== undefined && f.is_savings_target !== o.is_savings_target) patch.is_savings_target = f.is_savings_target;
    if (Object.keys(patch).length) patches.push({ id: o.id, patch });
  }
  return { saved, patches };
}
