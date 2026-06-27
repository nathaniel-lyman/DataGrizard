import {
  requestToQuerySpec,
  type QuerySpec,
} from "../components/DataGrid/serverQuery";
import type { RetailQuery } from "./fakeServer";
import { retailColumns, retailFilters } from "./mockRetailData";

/**
 * Translates a {@link RetailQuery} into a parameterized BigQuery Standard SQL
 * statement.
 *
 * The schema-aware part (which columns exist, their filter types, which fields
 * search scans) is no longer hand-maintained here: `requestToQuerySpec` derives
 * it from the very same `retailColumns` / `retailFilters` the grid is given, so
 * there's a single source of truth. This module is now just the **BigQuery
 * dialect renderer** — it turns the neutral query spec into SQL + params.
 *
 * Security is unchanged: identifiers come only from the column config (via the
 * spec's whitelist), and every value is a named parameter, never inlined.
 */

const TABLE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;
const DEFAULT_TABLE = "your_project.your_dataset.retail_items";
// Unique tiebreaker so OFFSET pagination is deterministic across equal sort keys.
const TIEBREAK_COLUMN = "item_id";

export type BuildRetailQueryOptions = {
  /** Fully-qualified `project.dataset.table`. */
  table?: string;
};

export type RetailQuerySql = {
  sql: string;
  countSql: string;
  params: Record<string, unknown>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Render the spec's filter + search clauses into a WHERE clause + params. */
const renderWhere = (spec: QuerySpec): { clause: string; params: Record<string, unknown> } => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  let next = 0;
  const bind = (value: unknown): string => {
    const name = `p${next++}`;
    params[name] = value;
    return `@${name}`;
  };

  for (const filter of spec.filters) {
    const column = `\`${filter.column}\``;
    const value = filter.value;
    switch (filter.filterType) {
      case "multiSelect": {
        if (!Array.isArray(value) || value.length === 0) break;
        const op = filter.operator === "isNoneOf" ? "NOT IN" : "IN";
        clauses.push(`${column} ${op} UNNEST(${bind(value)})`);
        break;
      }
      case "text": {
        const text = typeof value === "string" ? value.trim() : "";
        if (!text) break;
        clauses.push(`LOWER(${column}) LIKE ${bind(`%${text.toLowerCase()}%`)}`);
        break;
      }
      case "range": {
        if (!isObject(value)) break;
        if (value.min != null && value.min !== "") clauses.push(`${column} >= ${bind(value.min)}`);
        if (value.max != null && value.max !== "") clauses.push(`${column} <= ${bind(value.max)}`);
        break;
      }
      case "date": {
        if (!isObject(value)) break;
        if (value.from != null && value.from !== "") clauses.push(`${column} >= ${bind(value.from)}`);
        if (value.to != null && value.to !== "") clauses.push(`${column} <= ${bind(value.to)}`);
        break;
      }
      default: {
        // select / boolean: exact match
        if (value == null || value === "") break;
        clauses.push(`${column} = ${bind(value)}`);
      }
    }
  }

  if (spec.search) {
    params.q = `%${spec.search.term.toLowerCase()}%`;
    const ors = spec.search.columns.map((field) => `LOWER(\`${field}\`) LIKE @q`);
    if (ors.length) clauses.push(`(${ors.join(" OR ")})`);
  }

  return {
    clause: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
};

/** Whitelisted ORDER BY (from the spec) with a deterministic tiebreaker. */
const renderOrderBy = (spec: QuerySpec): string => {
  const parts = spec.sort.map((entry) => `\`${entry.column}\` ${entry.direction === "desc" ? "DESC" : "ASC"}`);
  if (!parts.some((part) => part.startsWith(`\`${TIEBREAK_COLUMN}\``))) {
    parts.push(`\`${TIEBREAK_COLUMN}\` ASC`);
  }
  return ` ORDER BY ${parts.join(", ")}`;
};

export function buildRetailQuery(
  query: RetailQuery,
  options: BuildRetailQueryOptions = {},
): RetailQuerySql {
  const table = options.table ?? DEFAULT_TABLE;
  if (!TABLE_PATTERN.test(table)) {
    throw new Error(`Invalid BigQuery table "${table}" — expected "project.dataset.table".`);
  }

  // Schema + whitelist + filter types are derived from the grid's own config.
  const spec = requestToQuerySpec(query, {
    columns: retailColumns,
    filters: retailFilters,
  });

  const { clause, params } = renderWhere(spec);
  const from = `FROM \`${table}\``;
  params.limit = spec.page.limit;
  params.offset = spec.page.offset;

  return {
    sql: `SELECT * ${from}${clause}${renderOrderBy(spec)} LIMIT @limit OFFSET @offset`,
    countSql: `SELECT COUNT(*) AS total ${from}${clause}`,
    params,
  };
}
