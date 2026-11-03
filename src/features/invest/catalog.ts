import type { AssetType, ISODate, Platform } from '@/domain/types';

/**
 * Hand-checked investment products. The only products, rates and platforms the app (and the AI)
 * may name. Re-check every row against its source_url before changing checked_at.
 */
export interface CatalogProduct {
  id: string; type: AssetType; name: string; where: Platform[]; summary: string; risk: 'low' | 'medium' | 'high';
  quote_symbol: string | null;     // Yahoo chart symbol; null for bonds
  quote_currency: string | null;   // currency of quote_symbol
  rate_pct: number | null;         // bonds: indicative yearly rate at checked_at
  min_minor: number | null; source_url: string; checked_at: ISODate;
}

const CHECKED: ISODate = '2026-11-03';

/** Catalog order is preference order: the first product of a type is its default. */
export const CATALOG: CatalogProduct[] = [
  {
    id: 'map-plusz',
    type: 'bond',
    name: 'Magyar Állampapír Plusz (MÁP Plusz)',
    where: ['mbh'],
    summary:
      'A 5-year Hungarian government bond in forints. The yearly rate is fixed in steps: 5.00% in the first year, rising to 6.00% in the fifth year. Interest is added to your bond once a year and the interest is tax-free. You can sell it back before the end, but the price can then be lower.',
    risk: 'low',
    quote_symbol: null,
    quote_currency: null,
    rate_pct: 5.0,
    min_minor: 10_000_000,
    source_url: 'https://www.allampapir.hu/allampapirok/MAPP',
    checked_at: CHECKED,
  },
  {
    id: 'fix-map',
    type: 'bond',
    name: 'Fix Magyar Állampapír (FixMÁP)',
    where: ['mbh'],
    summary:
      'A 3-year Hungarian government bond in forints with a fixed 5.50% yearly rate. Interest is paid to your account every three months and is tax-free. Only a limited amount is sold, so it can run out. You can sell it before the end, but the price can then be lower.',
    risk: 'low',
    quote_symbol: null,
    quote_currency: null,
    rate_pct: 5.5,
    min_minor: 10_000_000,
    source_url: 'https://www.allampapir.hu/allampapirok/FIX_MAP',
    checked_at: CHECKED,
  },
  {
    id: 'vanguard-ftse-all-world-acc',
    type: 'etf',
    name: 'Vanguard FTSE All-World UCITS ETF (USD) Accumulating',
    where: ['revolut'],
    summary:
      'One fund that holds more than 3,500 companies across developed and emerging markets worldwide. Dividends are reinvested in the fund, not paid out. Its price is in euros, so the forint exchange rate also moves its value.',
    risk: 'medium',
    quote_symbol: 'VWCE.DE',
    quote_currency: 'EUR',
    rate_pct: null,
    min_minor: null,
    source_url: 'https://www.revolut.com/en-HU/etfs/',
    checked_at: CHECKED,
  },
  {
    id: 'ishares-core-msci-world-acc',
    type: 'etf',
    name: 'iShares Core MSCI World UCITS ETF USD (Acc)',
    where: ['revolut'],
    summary:
      'One fund that holds over 1,000 large and mid-size companies in 23 developed countries. It does not include emerging markets. Dividends are reinvested in the fund. Its price is in euros, so the forint exchange rate also moves its value.',
    risk: 'medium',
    quote_symbol: 'EUNL.DE',
    quote_currency: 'EUR',
    rate_pct: null,
    min_minor: null,
    source_url: 'https://www.revolut.com/en-HU/etfs/',
    checked_at: CHECKED,
  },
  {
    id: 'apple',
    type: 'stock',
    name: 'Apple Inc. (AAPL)',
    where: ['revolut'],
    summary:
      'A share of one company, the maker of the iPhone and Mac, listed in New York in US dollars. Shown as an example of a well-known company. A single company can fall a lot, even when the market does well.',
    risk: 'high',
    quote_symbol: 'AAPL',
    quote_currency: 'USD',
    rate_pct: null,
    min_minor: null,
    source_url: 'https://www.revolut.com/en-HU/stock-trading/',
    checked_at: CHECKED,
  },
  {
    id: 'microsoft',
    type: 'stock',
    name: 'Microsoft Corporation (MSFT)',
    where: ['revolut'],
    summary:
      'A share of one company, the maker of Windows, Office and the Azure cloud, listed in New York in US dollars. Shown as an example of a well-known company. A single company can fall a lot, even when the market does well.',
    risk: 'high',
    quote_symbol: 'MSFT',
    quote_currency: 'USD',
    rate_pct: null,
    min_minor: null,
    source_url: 'https://www.revolut.com/en-HU/stock-trading/',
    checked_at: CHECKED,
  },
  {
    id: 'bitcoin',
    type: 'crypto',
    name: 'Bitcoin (BTC)',
    where: ['other'],
    summary:
      'The oldest and largest cryptocurrency. It has no company or government behind it, and its price can rise or fall by half within months. Only put in money you could lose completely.',
    risk: 'high',
    quote_symbol: 'BTC-EUR',
    quote_currency: 'EUR',
    rate_pct: null,
    min_minor: null,
    source_url: 'https://help.revolut.com/en-HU/help/crypto/question-crypto-hungary-pausing-services-retail/',
    checked_at: CHECKED,
  },
  {
    id: 'ethereum',
    type: 'crypto',
    name: 'Ethereum (ETH)',
    where: ['other'],
    summary:
      'The second-largest cryptocurrency, used to run apps on its own network. Its price usually swings even more than Bitcoin. Only put in money you could lose completely.',
    risk: 'high',
    quote_symbol: 'ETH-EUR',
    quote_currency: 'EUR',
    rate_pct: null,
    min_minor: null,
    source_url: 'https://help.revolut.com/en-HU/help/crypto/question-crypto-hungary-pausing-services-retail/',
    checked_at: CHECKED,
  },
];

export const TYPE_INFO: Record<AssetType, { title: string; what: string; where_note: string }> = {
  bond: {
    title: 'Government bonds',
    what:
      'You lend money to the Hungarian state, and it pays you a set yearly interest and gives the money back at the end. These retail bonds are in forints and their interest is tax-free. They are the calmest type here, but selling before the end can cost you some of the interest.',
    where_note:
      'MBH Bank sells these bonds in its branches and by phone (TeleBank); an MBH order must be at least 100 000 Ft, and you need a securities account and a short investor questionnaire. The State Treasury (Magyar Államkincstár) also sells them directly, but that needs a separate Treasury account. Checked with MBH and allampapir.hu.',
  },
  etf: {
    title: 'ETFs (index funds)',
    what:
      'An ETF is one fund that holds hundreds or thousands of companies, so one purchase spreads your money widely. Its value goes up and down with the stock markets, and it can drop for a year or more. It suits money you can leave invested for many years.',
    where_note:
      'Revolut offers EU-registered ETFs in its Invest tab, from €1 with fractional shares; search the fund name or ISIN there. Your plan includes a few commission-free orders a month, and currency exchange fees can apply. MBH also offers ETFs through its separate MBH Trading Platform account, but these funds were not checked there. Checked with Revolut and MBH.',
  },
  stock: {
    title: 'Stocks',
    what:
      'A stock is a small share of one company. Its price follows how that one company does, so it can rise or fall much more than a fund. These are shown as examples to learn from, not picks.',
    where_note:
      'Revolut lists US and EU stocks in its Invest tab, from €1 with fractional shares; US stocks are priced in dollars, so currency exchange fees can apply. MBH also offers foreign stocks through its separate MBH Trading Platform account, but these companies were not checked there. Checked with Revolut and MBH.',
  },
  crypto: {
    title: 'Crypto',
    what:
      'Cryptocurrencies are digital coins with no company or government behind them. Their prices can swing wildly, and you can lose all of the money. Keep this to a small part you could afford to lose.',
    where_note:
      'Revolut has stopped crypto services for customers in Hungary, and we found no crypto offer at MBH. Buying it now needs a new account with a crypto provider licensed by the Hungarian National Bank (MNB); check the provider on mnb.hu before you sign up. Checked with Revolut and MBH.',
  },
};

export function productsFor(type: AssetType): CatalogProduct[] {
  return CATALOG.filter((p) => p.type === type);
}

export function defaultProduct(type: AssetType): CatalogProduct {
  const first = productsFor(type)[0];
  if (!first) throw new Error(`No catalog product for type ${type}`);
  return first;
}

export function findProduct(id: string): CatalogProduct | null {
  return CATALOG.find((p) => p.id === id) ?? null;
}
