import { listAccounts } from '@/data/accounts';
import { listCategories } from '@/data/categories';
import { getHufPerUnit } from '@/data/fx';
import { getSettings } from '@/data/settings';
import { listPendingSms, markSmsConverted } from '@/data/smsMessages';
import { createTransaction, listTransactionsBySmsIds } from '@/data/transactions';
import { todayInTz } from '@/domain/dates';
import { pickSmsAccount, planSmsTxn } from './smsConversion';

let inflight: Promise<number> | null = null;

async function convertAll(): Promise<number> {
  const pending = await listPendingSms();
  if (pending.length === 0) return 0;
  const accounts = await listAccounts();
  if (!pickSmsAccount('', accounts)) return 0;
  const [categories, existing, settings] = await Promise.all([
    listCategories(),
    listTransactionsBySmsIds(pending.map((m) => m.id)),
    getSettings(),
  ]);
  const byMsg = new Map(existing.map((t) => [t.sms_message_id, t.id]));
  let created = 0;
  for (const msg of pending) {
    try {
      const dupId = byMsg.get(msg.id);
      if (dupId) {
        await markSmsConverted(msg.id, dupId);
        continue;
      }
      if (msg.amount_minor == null || !msg.currency || !msg.kind) {
        console.error('SMS missing amount/currency/kind; left pending', msg.id);
        continue;
      }
      const account = pickSmsAccount(msg.sender, accounts);
      if (!account) continue;
      const date = msg.date ?? todayInTz(settings.timezone);
      const rates = {
        msg: await getHufPerUnit(msg.currency, date),
        account: await getHufPerUnit(account.currency, date),
      };
      const txn = await createTransaction(planSmsTxn({ ...msg, date }, account, categories, rates));
      await markSmsConverted(msg.id, txn.id);
      created++;
    } catch (e) {
      console.error('SMS conversion failed', msg.id, e);
    }
  }
  return created;
}

/** Convert pending parsed SMS into review transactions. Single-flight; never throws. */
export function runConvertSms(): Promise<number> {
  inflight ??= convertAll()
    .catch((e) => {
      console.error('SMS conversion failed', e);
      return 0;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
