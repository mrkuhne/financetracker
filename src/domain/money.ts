function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export function toMinor(major: number): number {
  return roundHalfAwayFromZero(major * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Convert a minor-unit amount in a foreign currency to HUF minor units. */
export function toHufMinor(amountMinor: number, hufPerUnit: number): number {
  return roundHalfAwayFromZero(amountMinor * hufPerUnit);
}

export function formatMoney(minor: number, currency: string): string {
  const digits = currency === 'HUF' ? 0 : 2;
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: 'always',
  } as Intl.NumberFormatOptions).format(fromMinor(minor));
}
