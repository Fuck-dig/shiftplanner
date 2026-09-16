// The currency list offered when setting up a restaurant.
//
// WHAT THIS FIELD ACTUALLY IS
//
// `organizations.currency` holds a DISPLAY SYMBOL, not an ISO code — it is
// pasted straight into "kr 1.240" throughout Costs and the pay card. So this
// list is keyed by symbol, and each entry names the currencies that use it
// rather than pretending symbol and currency are the same thing.
//
// That is why there is one `kr` row covering three Nordic currencies instead
// of a DKK row and an SEK row that would both store the identical string. A
// dropdown whose options collapse to the same value is a dropdown that lies
// about what it is choosing.
//
// Free text stayed possible ("Other"), because this list will never cover
// everyone and a restaurant that cannot enter its own currency is worse than
// one with an unusual symbol.
export const CURRENCIES = [
  { symbol: 'kr',  name: 'Danish / Norwegian / Swedish krone' },
  { symbol: '€',   name: 'Euro' },
  { symbol: '£',   name: 'Pound sterling' },
  { symbol: '$',   name: 'US dollar' },
  { symbol: 'CHF', name: 'Swiss franc' },
  { symbol: 'zł',  name: 'Polish złoty' },
  { symbol: 'Kč',  name: 'Czech koruna' },
  { symbol: 'Ft',  name: 'Hungarian forint' },
  { symbol: 'lei', name: 'Romanian leu' },
  { symbol: 'лв',  name: 'Bulgarian lev' },
  { symbol: 'CA$', name: 'Canadian dollar' },
  { symbol: 'A$',  name: 'Australian dollar' },
  { symbol: 'NZ$', name: 'New Zealand dollar' },
  { symbol: '¥',   name: 'Japanese yen' },
  { symbol: '₩',   name: 'South Korean won' },
  { symbol: '₹',   name: 'Indian rupee' },
  { symbol: '₺',   name: 'Turkish lira' },
  { symbol: 'R$',  name: 'Brazilian real' },
  { symbol: 'R',   name: 'South African rand' },
];

// What to offer before anyone has chosen. Matches the language they are
// already reading the setup form in, which is a better guess than a global
// default and is only ever a default — never a constraint.
export const DEFAULT_CURRENCY_FOR_LANG = { da: 'kr', de: '€', en: '$', es: '€', fr: '€' };

export function defaultCurrencyFor(lang){
  return DEFAULT_CURRENCY_FOR_LANG[lang] || 'kr';
}

// Is this something the dropdown can represent, or does it need the free-text
// box? An empty value is "not chosen yet", which is neither.
export function isKnownCurrency(symbol){
  return !!symbol && CURRENCIES.some(c => c.symbol === symbol);
}
