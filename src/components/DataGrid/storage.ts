// Scoped localStorage helpers used by DataGrid persistence. All guard
// `typeof window === "undefined"` (SSR) and swallow parse/quota errors.

export const loadJson = <TValue,>(key: string | undefined, fallback: TValue): TValue => {
  if (!key || typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as TValue) : fallback;
  } catch {
    return fallback;
  }
};

export const saveJson = (key: string | undefined, value: unknown) => {
  if (!key || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort; state callbacks must still fire if storage is
    // unavailable or full.
  }
};

export const removeJson = (key: string | undefined) => {
  if (!key || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same best-effort contract as saveJson.
  }
};
