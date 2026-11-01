/** Fired after any transaction is created, edited or deleted so open lists can reload. */
export const TXNS_CHANGED = 'txns-changed';
export const notifyTxnsChanged = () => window.dispatchEvent(new Event(TXNS_CHANGED));
