// Domain-neutral, dependency-free delimited-text export helpers.

// RFC-4180-style quoting: wrap a field in double quotes when it contains the
// delimiter, a quote, or a newline, and double any embedded quotes.
const escapeField = (field: string, delimiter: string): string => {
  if (
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes("\n") ||
    field.includes("\r")
  ) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
};

export const toDelimited = (rows: string[][], delimiter: string): string =>
  rows.map((row) => row.map((field) => escapeField(field, delimiter)).join(delimiter)).join("\r\n");

export const toCsv = (rows: string[][]): string => toDelimited(rows, ",");

export const toTsv = (rows: string[][]): string => toDelimited(rows, "\t");

export const downloadTextFile = (filename: string, mime: string, content: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// Writes text to the clipboard, preferring the async Clipboard API and falling
// back to execCommand. Never throws (mirrors the persistence helpers).
export const writeClipboardText = (text: string): void => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      /* swallow — insecure context or denied permission */
    });
    return;
  }
  if (typeof document === "undefined") {
    return;
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  } catch {
    /* swallow */
  }
};
