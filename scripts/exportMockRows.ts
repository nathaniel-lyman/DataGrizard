/**
 * Dump the deterministic mock retail rows as newline-delimited JSON (NDJSON) so
 * a BigQuery test table can hold the *exact same* data the fake server serves.
 * That parity lets you diff fake-vs-BigQuery responses for the same query.
 *
 * Run:  npm run export:mock           # writes ./retail_items.ndjson
 *       npm run export:mock out.ndjson
 */
import { writeFileSync } from "node:fs";
import { mockRetailData } from "../src/data/mockRetailData";

const outPath = process.argv[2] ?? "retail_items.ndjson";
const ndjson = mockRetailData.map((row) => JSON.stringify(row)).join("\n");
writeFileSync(outPath, ndjson + "\n");
console.log(`Wrote ${mockRetailData.length} rows to ${outPath}`);
