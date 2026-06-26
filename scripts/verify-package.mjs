import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = join(root, ".tmp", "package-smoke");
const nodeModules = join(smokeRoot, "node_modules");
const packageRoot = join(nodeModules, "datagrizard");

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });

const fail = (message) => {
  throw new Error(`Package verification failed: ${message}`);
};

const assertFile = (files, path) => {
  if (!files.has(path)) {
    fail(`missing ${path}`);
  }
};

const assertAbsent = (files, path) => {
  if (files.has(path)) {
    fail(`unexpected ${path}`);
  }
};

const symlinkDependency = (name) => {
  const source = join(root, "node_modules", ...name.split("/"));
  const target = join(nodeModules, ...name.split("/"));

  if (!existsSync(source)) {
    fail(`missing local dependency ${name}; run npm install first`);
  }

  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, "junction");
};

rmSync(smokeRoot, { recursive: true, force: true });
mkdirSync(nodeModules, { recursive: true });

const packOutput = run("npm", ["pack", "--json", "--pack-destination", smokeRoot]);
const [packResult] = JSON.parse(packOutput);
const files = new Set(packResult.files.map((file) => file.path));

[
  "dist/datagrid.js",
  "dist/datagrid.cjs",
  "dist/datagrid.css",
  "dist/types/components/DataGrid/index.d.ts",
  "README.md",
  "package.json",
].forEach((path) => assertFile(files, path));

[
  "dist/index.html",
  "dist/assets/index-D3repmCA.js",
  "dist/assets/index-Cdf9q0Y7.css",
].forEach((path) => assertAbsent(files, path));

for (const file of files) {
  if (file.startsWith("dist/assets/")) {
    fail(`unexpected app asset ${file}`);
  }
}

mkdirSync(packageRoot, { recursive: true });
run("tar", ["-xzf", join(smokeRoot, packResult.filename), "--strip-components=1", "-C", packageRoot]);

symlinkDependency("react");
symlinkDependency("react-dom");
symlinkDependency("@tanstack/react-table");

writeFileSync(
  join(smokeRoot, "consumer.mjs"),
  [
    'import { DataGrid } from "datagrizard";',
    'import * as dataGridPackage from "datagrizard";',
    'if (typeof DataGrid !== "function") throw new Error("ESM DataGrid export is not a function");',
    'if (dataGridPackage.DataGrid !== DataGrid) throw new Error("ESM namespace export mismatch");',
  ].join("\n"),
);

writeFileSync(
  join(smokeRoot, "consumer.cjs"),
  [
    'const { existsSync } = require("node:fs");',
    'const dataGridPackage = require("datagrizard");',
    'if (typeof dataGridPackage.DataGrid !== "function") throw new Error("CJS DataGrid export is not a function");',
    'const cssPath = require.resolve("datagrizard/styles.css");',
    'if (!existsSync(cssPath)) throw new Error("CSS export does not resolve to a file");',
  ].join("\n"),
);

run(process.execPath, [join(smokeRoot, "consumer.mjs")], { cwd: smokeRoot });
run(process.execPath, [join(smokeRoot, "consumer.cjs")], { cwd: smokeRoot });

const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
if (packageJson.exports?.["./styles.css"] !== "./dist/datagrid.css") {
  fail("styles.css export does not point at dist/datagrid.css");
}

console.log(`Verified ${packResult.filename} with ${files.size} package files.`);
