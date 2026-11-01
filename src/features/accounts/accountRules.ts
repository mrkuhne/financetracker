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
  /** Set when the save must be refused; show it to the user. */
  error?: string;
}

type Flags = Partial<Pick<Account, 'is_default' | 'is_savings_target'>>;

/**
 * Enforces: exactly one (non-archived) default account, and exactly one savings target among
 * non-archived savings accounts. `others` = every account except the one being saved. Pure; callers persist.
 * Returns `error` (plain words) when the save must be refused.
 */
export function planAccountSave(others: Account[], draft: AccountDraft): AccountPlan {
  const flags = new Map<string, Flags>();
  const set = (id: string, f: Flags) => flags.set(id, { ...flags.get(id), ...f });
  const saved: AccountDraft = { ...draft };
  const active = others.filter((o) => !o.archived);

  if (saved.archived && active.length === 0) {
    return { saved, patches: [], error: 'You need at least one account that is not archived.' };
  }
  if (saved.archived) {
    saved.is_default = false;
    saved.is_savings_target = false;
  }

  // Default
  if (saved.is_default) {
    for (const o of others) if (o.is_default) set(o.id, { is_default: false });
  } else if (!active.some((o) => o.is_default)) {
    if (saved.archived) {
      for (const o of others) if (o.is_default) set(o.id, { is_default: false });
      set(active[0].id, { is_default: true });
    } else {
      saved.is_default = true;
    }
  }

  // Savings target: only non-archived savings accounts can hold it.
  const activeSavings = active.filter((o) => o.type === 'savings');
  if (saved.type !== 'savings' || saved.archived) {
    saved.is_savings_target = false;
    if (!activeSavings.some((o) => o.is_savings_target) && activeSavings.length) {
      for (const o of others) if (o.is_savings_target) set(o.id, { is_savings_target: false });
      set(activeSavings[0].id, { is_savings_target: true });
    }
  } else if (saved.is_savings_target) {
    for (const o of others) if (o.is_savings_target) set(o.id, { is_savings_target: false });
  } else if (!activeSavings.some((o) => o.is_savings_target)) {
    saved.is_savings_target = true;
  }

  return { saved, patches: toPatches(others, flags) };
}

function toPatches(others: Account[], flags: Map<string, Flags>): AccountPatch[] {
  const patches: AccountPatch[] = [];
  for (const o of others) {
    const f = flags.get(o.id);
    if (!f) continue;
    const patch: AccountPatch['patch'] = {};
    if (f.is_default !== undefined && f.is_default !== o.is_default) patch.is_default = f.is_default;
    if (f.is_savings_target !== undefined && f.is_savings_target !== o.is_savings_target) patch.is_savings_target = f.is_savings_target;
    if (Object.keys(patch).length) patches.push({ id: o.id, patch });
  }
  return patches;
}

/** Self-heal: if several accounts claim default / savings target, keep the first of each and clear the rest. */
export function healAccounts(accounts: Account[]): AccountPatch[] {
  const flags = new Map<string, Flags>();
  let seenDefault = false;
  let seenTarget = false;
  for (const a of accounts) {
    if (a.is_default) {
      if (seenDefault) flags.set(a.id, { ...flags.get(a.id), is_default: false });
      seenDefault = true;
    }
    if (a.is_savings_target) {
      if (seenTarget) flags.set(a.id, { ...flags.get(a.id), is_savings_target: false });
      seenTarget = true;
    }
  }
  return toPatches(accounts, flags);
}
