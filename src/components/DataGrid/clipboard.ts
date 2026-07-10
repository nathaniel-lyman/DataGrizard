import type { GridDataType } from "../../types/grid";

/**
 * Parse spreadsheet-style TSV, including quoted fields, escaped quotes, and
 * embedded tabs/newlines. A terminal line break does not create a phantom row.
 */
export const parseClipboardTsv = (text: string): string[][] => {
  if (text === "") {
    return [];
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let endedWithRowBreak = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    endedWithRowBreak = false;

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      inQuotes = true;
    } else if (character === "\t") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      endedWithRowBreak = true;
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (!endedWithRowBreak || row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const numericTypes = new Set<GridDataType>(["number", "currency", "percent"]);

const localeDigitMap = (locale?: string) => {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  return new Map(
    Array.from({ length: 10 }, (_, digit) => [formatter.format(digit), String(digit)]),
  );
};

/**
 * Turn a formatted spreadsheet value back into the editor-friendly string the
 * grid's default parser expects. Custom column parsers intentionally receive
 * the original clipboard text instead.
 */
export const normalizeClipboardInput = (
  input: string,
  dataType: GridDataType,
  locale?: string,
): string => {
  const trimmed = input.trim();
  if (dataType === "boolean") {
    const normalized = trimmed.toLocaleLowerCase(locale);
    if (["true", "yes", "1", "on"].includes(normalized)) {
      return "true";
    }
    if (["false", "no", "0", "off"].includes(normalized)) {
      return "false";
    }
    return trimmed;
  }
  if (!numericTypes.has(dataType) || trimmed === "") {
    return input;
  }

  const numberParts = new Intl.NumberFormat(locale).formatToParts(-12345.6);
  const percentParts = new Intl.NumberFormat(locale, { style: "percent" }).formatToParts(1);
  const decimal = numberParts.find((part) => part.type === "decimal")?.value ?? ".";
  const groupSymbols = new Set(
    numberParts.filter((part) => part.type === "group").map((part) => part.value),
  );
  const minusSign = numberParts.find((part) => part.type === "minusSign")?.value ?? "-";
  const plusSign = numberParts.find((part) => part.type === "plusSign")?.value ?? "+";
  const percentSigns = new Set([
    "%",
    ...percentParts.filter((part) => part.type === "percentSign").map((part) => part.value),
  ]);
  const digits = localeDigitMap(locale);
  const negativeParentheses = /^\s*\(.*\)\s*$/.test(trimmed);
  let sawPercent = false;
  let normalized = "";

  for (const character of Array.from(trimmed)) {
    const localizedDigit = digits.get(character);
    if (localizedDigit != null) {
      normalized += localizedDigit;
    } else if (/\d/.test(character)) {
      normalized += character;
    } else if (character === decimal) {
      normalized += ".";
    } else if (character === minusSign || character === "-") {
      normalized += "-";
    } else if (character === plusSign || character === "+") {
      normalized += "+";
    } else if (percentSigns.has(character)) {
      sawPercent = true;
    } else if (groupSymbols.has(character) || /\s/u.test(character)) {
      // Locale grouping and spacing are presentation only.
    }
    // Currency symbols and other surrounding literals are intentionally ignored.
  }

  if (negativeParentheses && !normalized.startsWith("-")) {
    normalized = `-${normalized}`;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return input;
  }
  return String(dataType === "percent" && sawPercent ? numeric / 100 : numeric);
};
