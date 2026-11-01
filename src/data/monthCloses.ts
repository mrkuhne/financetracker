import { base44 } from '@/data/client';
import type { MonthClose } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';

const KEYS = ['month', 'final_remaining_minor', 'deficit_minor', 'leftover_action', 'transfer_pair_id'];
const toClose = (r: Record<string, unknown>): MonthClose =>
  pick<MonthClose>(r, KEYS, ['transfer_pair_id']);

export async function listMonthCloses(): Promise<MonthClose[]> {
  return (await base44.entities.MonthClose.list()).map(toClose);
}
export async function createMonthClose(c: Omit<MonthClose, 'id'>): Promise<MonthClose> {
  return toClose(await base44.entities.MonthClose.create(stripNulls(c)));
}
