/**
 * Reference backend for DataGrid server mode, talking to Google BigQuery.
 *
 * This is the ONLY place credentials, SQL, and query cost live. The browser
 * never touches BigQuery — it POSTs the grid's query slices here, and this
 * handler translates them into a parameterized query via `buildRetailQuery`
 * (the same pure builder unit-tested in src/data/retailQuerySql.test.ts).
 *
 * Run:   npm run server          (uses tsx; no build step)
 * Env:
 *   BQ_TABLE          fully-qualified `project.dataset.table` (required)
 *   PORT              default 8787
 *   MAX_BYTES_BILLED  cost guard in bytes (default 1e9 = ~1 GB scanned)
 *   CLIENT_ORIGIN     CORS origin for the Vite dev server
 *                     (default http://127.0.0.1:5173)
 *
 * Auth: the BigQuery client uses Application Default Credentials. Locally:
 *   gcloud auth application-default login
 * In production, attach a service account with BigQuery Data Viewer + Job User.
 */
import express from "express";
import { BigQuery } from "@google-cloud/bigquery";
import { buildRetailQuery } from "../src/data/retailQuerySql";
import type { RetailQuery } from "../src/data/fakeServer";

const PORT = Number(process.env.PORT ?? 8787);
const TABLE = process.env.BQ_TABLE;
const MAX_BYTES_BILLED = process.env.MAX_BYTES_BILLED ?? String(1_000_000_000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://127.0.0.1:5173";

if (!TABLE) {
  console.error("Set BQ_TABLE to a fully-qualified project.dataset.table.");
  process.exit(1);
}

const bigquery = new BigQuery();
const app = express();
app.use(express.json());

// Minimal CORS for the Vite dev server (tighten/origin-check for production).
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.post("/api/retail/query", async (req, res) => {
  try {
    // Trust only the four query slices; everything else is derived server-side.
    const query: RetailQuery = {
      sorting: req.body?.sorting ?? [],
      columnFilters: req.body?.columnFilters ?? [],
      globalFilter: req.body?.globalFilter ?? "",
      pagination: req.body?.pagination ?? { pageIndex: 0, pageSize: 50 },
    };

    const { sql, countSql, params } = buildRetailQuery(query, { table: TABLE });

    // Page rows and total count run as two jobs sharing the same params. Both
    // are capped by maximumBytesBilled so a runaway scan fails instead of
    // running up a bill.
    const jobOptions = { params, maximumBytesBilled: MAX_BYTES_BILLED };
    const [[rows], [countRows]] = await Promise.all([
      bigquery.query({ query: sql, ...jobOptions }),
      bigquery.query({ query: countSql, ...jobOptions }),
    ]);

    const rowCount = Number(countRows?.[0]?.total ?? 0);
    res.json({ rows, rowCount });
  } catch (error) {
    console.error("Retail query failed:", error);
    res.status(500).json({ error: "Query failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Retail BigQuery server on http://127.0.0.1:${PORT}`);
  console.log(`Querying table: ${TABLE}`);
});
