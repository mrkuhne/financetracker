// Pure brief math shared by the client (via `@shared/brief`) and Base44 functions (via `../../shared/brief.ts`).
// No imports on purpose: functions bundle this file on its own.

export const PULL_FORWARD_SHARE = 0.5;
export const OVERSPEND_CAP_SHARE = 0.5;

/** What is still to invest this month: max(0, suggested - invested). */
export function leftThisMonthMinor(suggestedMinor: number, investedMinor: number): number {
  return Math.max(0, suggestedMinor - investedMinor);
}

/** Days left in the month of `today` (YYYY-MM-DD), today included: 30 Nov -> 1, 1 Nov -> 30. */
export function daysLeftInMonth(today: string): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return total - day + 1;
}

/**
 * How much could be invested ahead of next month: at most half of this month's suggestion, and no more than
 * what stays free after the expected spend for the rest of the month. Buys above the suggestion already used
 * part of that room, so the excess shrinks it. 0 until the emergency fund is done.
 */
export function pullForwardRoomMinor(i: {
  emergencyDone: boolean; suggestedMinor: number; investedMinor: number; remainingMinor: number;
  dailySpendMinor: number; daysLeft: number;
}): number {
  if (!i.emergencyDone) return 0;
  const freeAfterSpend = i.remainingMinor - i.dailySpendMinor * i.daysLeft;
  // `remainingMinor` already nets this month's buys, so the excess only shrinks the half-suggestion cap.
  const excess = Math.max(0, i.investedMinor - i.suggestedMinor);
  return Math.max(0, Math.min(Math.floor(i.suggestedMinor * PULL_FORWARD_SHARE) - excess, freeAfterSpend));
}
