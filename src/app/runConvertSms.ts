import { listAccounts } from '@/data/accounts';
import { listCategories } from '@/data/categories';
import { getHufPerUnit } from '@/data/fx';
import { getSettings } from '@/data/settings';
import { listConvertedSmsByHashes, listPendingSms, markSmsConverted } from '@/data/smsMessages';
import { createTransaction, listTransactionsBySmsIds } from '@/data/transactions';
import { todayInTz } from '@/domain/dates';
import { dedupePending, pickSmsAccount, planSmsTxn } from './smsConversion';

let inflight: Promise<number> | null = null;

async function convertAll(): Promise<number> {
  const pending = await listPendingSms();
  if (pending.length === 0) return 0;
  const accounts = await listAccounts();
  if (!pickSmsAccount('', accounts)) return 0;
  const [categories, existing, settings, convertedRows] = await Promise.all([
    listCategories(),
    listTransactionsBySmsIds(pending.map((m) => m.id)),
    getSettings(),
    listConvertedSmsByHashes([...new Set(pending.map((m) => m.text_hash))]),
  ]);
  const byMsg = new Map(existing.map((t) => [t.sms_message_id, t.id]));
  // The same SMS can arrive twice at once (the function's duplicate check races); convert one.
  const txnByHash = new Map(convertedRows.map((m) => [m.text_hash, m.transaction_id]));
  const { convert, duplicates } = dedupePending(pending, new Set(txnByHash.keys()));
  const txnByMsg = new Map<string, string>();
  let created = 0;
  for (const msg of convert) {
    try {
      const dupId = byMsg.get(msg.id);
      if (dupId) {
        await markSmsConverted(msg.id, dupId);
        txnByMsg.set(msg.id, dupId);
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
      txnByMsg.set(msg.id, txn.id);
      created++;
    } catch (e) {
      console.error('SMS conversion failed', msg.id, e);
    }
  }
  // Duplicates follow their original; if that one is still pending, they wait for the next run.
  for (const { msg, of } of duplicates) {
    try {
      const own = byMsg.get(msg.id); // a transaction left by an earlier interrupted run
      if (own) await markSmsConverted(msg.id, own);
      else if (of === null) await markSmsConverted(msg.id, txnByHash.get(msg.text_hash) ?? null);
      else if (txnByMsg.has(of.id)) await markSmsConverted(msg.id, txnByMsg.get(of.id) as string);
    } catch (e) {
      console.error('SMS duplicate marking failed', msg.id, e);
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
