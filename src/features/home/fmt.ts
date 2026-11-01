import { formatMoney } from '@/domain/money';

/** "259 000 Ft" */
export const huf = (minor: number) => formatMoney(Math.round(minor), 'HUF');
/** Number only, for big serif figures that render the unit as <small>. */
export const hufNum = (minor: number) => huf(minor).replace(/\s*Ft$/, '');
/** "+12 000 Ft" / "−12 000 Ft" (zero unsigned). */
export const hufSigned = (minor: number) => (minor > 0 ? `+${huf(minor)}` : huf(minor));
