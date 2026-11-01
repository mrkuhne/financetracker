import { listRules, updateRule } from '@/data/recurring';
import { createTransaction, listTransactions } from '@/data/transactions';
import { getHufPerUnit } from '@/data/fx';
import type { ISODate } from '@/domain/types';
import { materializeSingleFlight } from './materialize';

/** Materialize with the real data layer. Shared by startup and the Recurring screen. */
export const runMaterialize = (today: ISODate) =>
  materializeSingleFlight(today, { listRules, listTransactions, createTransaction, updateRule, getHufPerUnit });
