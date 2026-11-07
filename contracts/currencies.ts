export const currencyDefinitions = [
  { code: "RUB", name: "Российский рубль", symbol: "₽" },
  { code: "USD", name: "Доллар США", symbol: "$" },
  { code: "EUR", name: "Евро", symbol: "€" },
  { code: "GBP", name: "Британский фунт", symbol: "£" },
  { code: "THB", name: "Тайский бат", symbol: "฿" },
  { code: "CNY", name: "Китайский юань", symbol: "¥" },
  { code: "JPY", name: "Японская иена", symbol: "¥" },
  { code: "AED", name: "Дирхам ОАЭ", symbol: "AED" },
  { code: "TRY", name: "Турецкая лира", symbol: "₺" },
  { code: "GEL", name: "Грузинский лари", symbol: "₾" },
  { code: "KZT", name: "Казахстанский тенге", symbol: "₸" },
  { code: "VND", name: "Вьетнамский донг", symbol: "₫" },
  { code: "IDR", name: "Индонезийская рупия", symbol: "Rp" },
  { code: "KRW", name: "Южнокорейская вона", symbol: "₩" },
] as const;

export type CurrencyCode = (typeof currencyDefinitions)[number]["code"];

export const currencyCodes = currencyDefinitions.map(
  (currency) => currency.code,
) as [CurrencyCode, ...CurrencyCode[]];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return currencyCodes.includes(value as CurrencyCode);
}

export function currencyDefinition(code: string) {
  return (
    currencyDefinitions.find((currency) => currency.code === code) ?? {
      code,
      name: code,
      symbol: code,
    }
  );
}

export function currencyLabel(code: string) {
  const currency = currencyDefinition(code);
  return `${currency.code} — ${currency.name}`;
}

export function currencyMoney(value: number, code: string) {
  const currency = currencyDefinition(code);
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(value);

  return currency.symbol.length > 2
    ? `${formatted} ${currency.code}`
    : `${formatted} ${currency.symbol}`;
}
