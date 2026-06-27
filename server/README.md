# Retail BigQuery backend (DataGrid server mode)

A reference backend that feeds `DataGrid` server mode from Google BigQuery. It
demonstrates the **clean separation** the grid is designed for: the component
itself is never modified. The browser only ever calls a single async function
(`dataSource`), and everything BigQuery-specific lives outside the component
surface.

## The three layers (and where the boundary is)

| Layer | File | Knows about | Tested by |
|-------|------|-------------|-----------|
| Component surface | `src/components/DataGrid/` | nothing — generic `DataGridDataSource` | (unchanged) |
| Consumer adapter | `src/data/retailBigQuery.ts` | the HTTP endpoint + retail row type | `retailBigQuery.test.ts` |
| Query → SQL | `src/data/retailQuerySql.ts` | retail columns/filters (pure, no SDK) | `retailQuerySql.test.ts` |
| Backend | `server/retailBigQueryServer.ts` | credentials, SQL execution, cost | live BigQuery |

The grid's built-in `dataSource` prop already owns all the plumbing — query
slices, `AbortSignal`, stale-response dropping, loading and error states. So
adding BigQuery required **zero changes** under `src/components/DataGrid/`.

## 1. Install (already in package.json devDependencies)

```bash
npm install
```

Adds `express`, `@google-cloud/bigquery`, `tsx`, `@types/express`. These are
dev/server-only — `package.json` `files` is `["dist"]`, so they never ship in
the published library tarball.

## 2. Authenticate to BigQuery

Local dev uses Application Default Credentials:

```bash
gcloud auth application-default login
```

In production, run under a service account with **BigQuery Data Viewer** + **BigQuery Job User**.

## 3. Run the backend

```bash
BQ_TABLE=your_project.your_dataset.retail_items npm run server
```

Env vars: `BQ_TABLE` (required), `PORT` (default 8787), `MAX_BYTES_BILLED`
(default ~1 GB — a cost guard), `CLIENT_ORIGIN` (default the Vite dev origin).

Your table needs columns matching `RetailItem`: `item_id`, `item_name`,
`department`, `category`, `brand`, `sales`, `units`, `margin_rate`, `price_gap`,
`recommendation_status`, `last_restocked_at`.

## 3b. Create a BigQuery test table (with identical data)

Seeding the table with the *same* 500 rows the fake server serves lets you diff
fake-vs-BigQuery responses for any query.

Prereqs: the `gcloud`/`bq` CLI installed, a project selected
(`gcloud config set project YOUR_PROJECT`), and ADC set up (step 2 above).

```bash
# 1. A dataset to hold the table
bq --location=US mk --dataset YOUR_PROJECT:retail_demo

# 2. Generate the seed file (same generator as the demo's fake server)
npm run export:mock -- retail_items.ndjson      # writes 500 NDJSON rows

# 3. Create the table + load the data in one shot (explicit schema → exact types)
bq load --source_format=NEWLINE_DELIMITED_JSON \
  YOUR_PROJECT:retail_demo.retail_items \
  retail_items.ndjson \
  server/retail_items.schema.json

# 4. Verify
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) AS n FROM `YOUR_PROJECT.retail_demo.retail_items`'   # → 500

# 5. Run the backend against it
BQ_TABLE=YOUR_PROJECT.retail_demo.retail_items npm run server
```

**Date column choice:** `retail_items.schema.json` types `last_restocked_at` as
`STRING` (`YYYY-MM-DD`). This matches the mock data exactly and works with the
shipped `buildRetailQuery` unchanged — ISO date-only strings sort and
range-compare correctly as strings. If you'd rather use a native `DATE` column,
change the schema and wrap the date params in the builder (`DATE(@p0)`); that's
stricter typing but extra code. For a test table, `STRING` is simplest.

## 4. Point the demo at it (env-gated)

The demo's **Server** toggle already supports this. Set `VITE_RETAIL_ENDPOINT`
and it round-trips to the real backend; leave it unset and it uses the in-memory
fake server (so tests and offline dev are unaffected).

```bash
# terminal 1 — backend
BQ_TABLE=gcp-test-500713.retail_demo.retail_items npm run server

# terminal 2 — demo pointed at the backend
VITE_RETAIL_ENDPOINT=http://127.0.0.1:8787/api/retail/query npm run dev
```

Or persist it in `.env.local` (git-ignored):

```
VITE_RETAIL_ENDPOINT=http://127.0.0.1:8787/api/retail/query
```

Then switch to **Grid → Server** in the UI: sort/filter/search/paginate now hit
BigQuery. (Cell edits and row-action status changes don't persist against the
read-only test table — route those to your system of record; see notes below.)

### How it wires in (for reference)

In `src/App.tsx`, swap the manual server-mode plumbing (the `useEffect` +
controlled slices around `queryRetail`) for the built-in `dataSource` prop:

```tsx
import { createRetailBigQueryDataSource } from "./data/retailBigQuery";

const retailSource = createRetailBigQueryDataSource({
  endpoint: "http://127.0.0.1:8787/api/retail/query",
});

// ...
<DataGrid
  columns={retailColumns}
  dataSource={isServer ? retailSource : undefined}
  renderDataSourceError={(reason) =>
    `Load failed: ${reason instanceof Error ? reason.message : "unknown error"}`
  }
  /* presentation props unchanged */
/>
```

With `dataSource`, the grid sets `dataMode="server"`, controls the query slices,
and calls `retailSource` on every sort/filter/search/page change. You no longer
need `state` / `on*Change` / `rowCount` / `isLoading` wiring by hand.

## Testing strategy

- **Pure logic** (`retailQuerySql.ts`) is fully unit-tested, including
  injection defenses (non-whitelisted sort/filter ids are dropped, every value
  is a named parameter). Run: `npx vitest run src/data/retailQuerySql.test.ts`.
- **Adapter** (`retailBigQuery.ts`) is tested with a mocked `fetch` — verifies
  it sends only JSON-safe slices, forwards the abort signal, and surfaces
  non-OK responses. Run: `npx vitest run src/data/retailBigQuery.test.ts`.
- **Contract parity:** the fake server (`src/data/fakeServer.ts`) and this
  BigQuery backend speak the same `RetailQuery` / `RetailQueryResult` shapes, so
  you can develop against the fake (`queryRetail`) and flip to BigQuery by
  changing only which `dataSource` you pass.
- **End-to-end:** with the server running and `BQ_TABLE` set, toggle the demo to
  Server mode and confirm sort/filter/search/paging round-trip to BigQuery.

## Notes for real-world scale

- **Deep pagination:** `OFFSET` on large tables is slow/expensive. For big data
  consider keyset (cursor) pagination instead.
- **Cost:** every query scans columns. `MAX_BYTES_BILLED` makes a runaway query
  fail rather than bill; consider partitioning/clustering the table and caching.
- **Filter `select` options:** in server mode the grid sources dropdown options
  only from static `GridFilterConfig.options` (it can't infer them from one
  page). Populate those, or fetch distinct values separately.
- **Edits:** `onCellEdit` is independent of reads. BigQuery is not built for
  single-row updates; route edits to your system of record (or a staging table)
  and refetch.
