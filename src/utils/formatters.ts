export type FormatOptions = {
  locale?: string;
  currency?: string;
};

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";

export const formatCurrency = (value: number, options: FormatOptions = {}) =>
  new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    style: "currency",
    currency: options.currency ?? DEFAULT_CURRENCY,
    maximumFractionDigits: 0,
  }).format(value);

export const formatNumber = (value: number, options: FormatOptions = {}) =>
  new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value);

export const formatPercent = (value: number, options: FormatOptions = {}) =>
  new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);

export const formatSignedPercent = (value: number, options: FormatOptions = {}) => {
  const formatted = formatPercent(Math.abs(value), options);
  // Decide the sign from the rounded magnitude so tiny values that round to
  // zero never render as "-0.0%" / "+0.0%".
  if (formatted === formatPercent(0, options)) {
    return formatted;
  }
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

export const formatStatusLabel = (status: string) =>
  status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
