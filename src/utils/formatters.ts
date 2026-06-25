export type FormatOptions = {
  locale?: string;
  currency?: string;
  dateFormat?: Intl.DateTimeFormatOptions;
};

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

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

// Accept Date | ISO-8601 string | epoch ms. A date-only ISO string
// ("2026-06-24") is parsed as LOCAL midnight (not new Date("2026-06-24"),
// which is UTC and shifts a day in negative-offset zones). Returns null for
// blank/unparseable input.
export const toDate = (value: unknown): Date | null => {
  if (value == null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const formatDate = (value: unknown, options: FormatOptions = {}) => {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat(
    options.locale ?? DEFAULT_LOCALE,
    options.dateFormat ?? DEFAULT_DATE_FORMAT,
  ).format(date);
};
