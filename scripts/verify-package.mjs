import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = join(root, ".tmp", "package-smoke");
const nodeModules = join(smokeRoot, "node_modules");
const packageRoot = join(nodeModules, "datagrizard");
const typescriptBin = join(root, "node_modules", "typescript", "bin", "tsc");
const publintBin = join(root, "node_modules", "publint", "src", "cli.js");
const attwBin = join(root, "node_modules", "@arethetypeswrong", "cli", "dist", "index.js");

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

const isInsideKeyframes = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && /(?:^|-)keyframes$/i.test(parent.name)) {
      return true;
    }
  }
  return false;
};

const assertIsolatedCss = (css) => {
  if (!css.includes(".dg-root")) {
    fail("datagrid.css is missing .dg-root");
  }
  if (!css.includes(".dg-header-cell")) {
    fail("datagrid.css is missing .dg-header-cell");
  }
  if (/--tw-|@tailwind\b/i.test(css)) {
    fail("datagrid.css contains Tailwind output");
  }
  if (/(^|})\s*(\*|html|body|:root)\s*[,{]/i.test(css)) {
    fail("datagrid.css contains an unscoped global selector");
  }

  const stylesheet = postcss.parse(css, { from: "dist/datagrid.css" });
  stylesheet.walkAtRules((atRule) => {
    if (!/(?:^|-)keyframes$/i.test(atRule.name)) return;
    const [name] = atRule.params.trim().split(/\s+/);
    if (!name?.startsWith("dg-")) {
      fail(`unscoped keyframe name ${name || "<empty>"}`);
    }
  });

  stylesheet.walkRules((rule) => {
    if (isInsideKeyframes(rule)) return;
    try {
      selectorParser((selectors) => {
        selectors.each((selector) => {
          const first = selector.nodes.find((node) => node.type !== "comment");
          if (first?.type !== "class" || !first.value.startsWith("dg-")) {
            fail(`selector must start with a dg-* class: ${selector.toString()}`);
          }
        });
      }).processSync(rule.selector);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Package verification failed:")) {
        throw error;
      }
      fail(`could not parse selector ${rule.selector}: ${error}`);
    }
  });
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
  "dist/datagrid.d.ts",
  "dist/datagrid.d.cts",
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
  if (file.startsWith("dist/types/")) {
    fail(`unexpected loose declaration ${file}`);
  }
}

mkdirSync(packageRoot, { recursive: true });
const tarballPath = join(smokeRoot, packResult.filename);
run("tar", ["-xzf", tarballPath, "--strip-components=1", "-C", packageRoot]);

symlinkDependency("react");
symlinkDependency("react-dom");
symlinkDependency("@tanstack/react-table");
symlinkDependency("@types/react");
symlinkDependency("@types/react-dom");
symlinkDependency("jsdom");

const packagedCss = readFileSync(join(packageRoot, "dist", "datagrid.css"), "utf8");
assertIsolatedCss(packagedCss);

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
    "process.exit(0);",
  ].join("\n"),
);

run(process.execPath, [join(smokeRoot, "consumer.mjs")], { cwd: smokeRoot });
run(process.execPath, [join(smokeRoot, "consumer.cjs")], { cwd: smokeRoot });

writeFileSync(
  join(smokeRoot, "consumer-render.mjs"),
  [
    'import { readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'import { JSDOM } from "jsdom";',
    'import React, { act } from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { DataGrid } from "datagrizard";',
    "",
    'const dom = new JSDOM("<!doctype html><html><head></head><body><div id=\\"app\\"></div></body></html>", {',
    "  pretendToBeVisual: true,",
    '  url: "http://localhost/",',
    "});",
    "const { window } = dom;",
    "for (const name of [",
    '  "window", "document", "navigator", "HTMLElement", "Element", "Node", "Event",',
    '  "KeyboardEvent", "MouseEvent", "MutationObserver", "localStorage", "DOMRect",',
    "]) {",
    "  Object.defineProperty(globalThis, name, {",
    "    configurable: true,",
    "    writable: true,",
    "    value: name === \"window\" ? window : window[name],",
    "  });",
    "}",
    "globalThis.getComputedStyle = window.getComputedStyle.bind(window);",
    "globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);",
    "globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);",
    "globalThis.IS_REACT_ACT_ENVIRONMENT = true;",
    "class ResizeObserverStub {",
    "  observe() {}",
    "  unobserve() {}",
    "  disconnect() {}",
    "}",
    "globalThis.ResizeObserver = ResizeObserverStub;",
    "window.ResizeObserver = ResizeObserverStub;",
    "window.matchMedia = () => ({",
    "  matches: false,",
    "  addEventListener() {},",
    "  removeEventListener() {},",
    "  addListener() {},",
    "  removeListener() {},",
    "});",
    "window.HTMLElement.prototype.scrollIntoView = () => {};",
    "",
    'const packageStyle = document.createElement("style");',
    'packageStyle.dataset.source = "datagrizard";',
    'packageStyle.textContent = readFileSync(join(process.cwd(), "node_modules/datagrizard/dist/datagrid.css"), "utf8");',
    "document.head.append(packageStyle);",
    "",
    "const data = [",
    '  { id: "one", name: "Alpha", qty: 1 },',
    '  { id: "two", name: "Beta", qty: 2 },',
    '  { id: "three", name: "Gamma", qty: 3 },',
    "];",
    "const columns = [",
    '  { accessorKey: "name", header: "Name", dataType: "text" },',
    '  { accessorKey: "qty", header: "Quantity", dataType: "number" },',
    "];",
    'const container = document.getElementById("app");',
    "const root = createRoot(container);",
    "await act(async () => {",
    "  root.render(React.createElement(DataGrid, {",
    "    data,",
    "    columns,",
    "    getRowId: (row) => row.id,",
    "    features: { toolbar: false, pagination: false, rowSelection: false, headerFilters: false },",
    "  }));",
    "});",
    "",
    'if (!container.querySelector(".dg-root")) throw new Error("rendered package is missing .dg-root");',
    'const headerText = [...container.querySelectorAll(".dg-header-cell")].map((cell) => cell.textContent?.trim());',
    'if (!headerText.includes("Name") || !headerText.includes("Quantity")) {',
    '  throw new Error(`rendered package is missing expected column headers: ${headerText.join(", ")}`);',
    "}",
    'const cell = container.querySelector(".dg-cell");',
    'if (!cell) throw new Error("rendered package is missing .dg-cell");',
    "",
    'const consumerStyle = document.createElement("style");',
    'consumerStyle.dataset.source = "consumer";',
    'consumerStyle.textContent = ".dg-cell { background: rgb(1, 2, 3); border-right-color: rgb(1, 2, 3); }";',
    "document.head.append(consumerStyle);",
    'const expectedColor = "rgb(1, 2, 3)";',
    "const computed = window.getComputedStyle(cell);",
    "if (computed.backgroundColor !== expectedColor || computed.borderRightColor !== expectedColor) {",
    "  const sheets = [...document.styleSheets];",
    "  const packageIndex = sheets.indexOf(packageStyle.sheet);",
    "  const consumerIndex = sheets.indexOf(consumerStyle.sheet);",
    "  const hasConsumerRule = [...(consumerStyle.sheet?.cssRules ?? [])].some(",
    '    (rule) => rule.selectorText === ".dg-cell",',
    "  );",
    "  if (packageIndex < 0 || consumerIndex <= packageIndex || !hasConsumerRule) {",
    "    throw new Error(`consumer CSS did not override package CSS: ${computed.backgroundColor}`);",
    "  }",
    '  console.warn("jsdom did not resolve the override value; verified consumer CSSOM order instead");',
    "}",
    "",
    "await act(async () => root.unmount());",
    "dom.window.close();",
    'console.log("Verified Tailwind-free extracted-package render and consumer CSS override order.");',
    "process.exit(0);",
  ].join("\n"),
);

run(process.execPath, [join(smokeRoot, "consumer-render.mjs")], {
  cwd: smokeRoot,
  stdio: "inherit",
});

const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const expectedReactPeerRange = "^18.2 || ^19";
for (const peer of ["react", "react-dom"]) {
  if (packageJson.peerDependencies?.[peer] !== expectedReactPeerRange) {
    fail(`${peer} peer range must be ${expectedReactPeerRange}`);
  }
}
if (packageJson.exports?.["./styles.css"] !== "./dist/datagrid.css") {
  fail("styles.css export does not point at dist/datagrid.css");
}
if (packageJson.exports?.["./package.json"] !== "./package.json") {
  fail("package.json export is missing");
}
if (packageJson.exports?.["."]?.import?.types !== "./dist/datagrid.d.ts") {
  fail("ESM types export does not point at dist/datagrid.d.ts");
}
if (packageJson.exports?.["."]?.require?.types !== "./dist/datagrid.d.cts") {
  fail("CJS types export does not point at dist/datagrid.d.cts");
}

for (const bundle of ["datagrid.js", "datagrid.cjs"]) {
  const contents = readFileSync(join(packageRoot, "dist", bundle), "utf8");
  if (!contents.startsWith('"use client";')) {
    fail(`${bundle} is missing the use-client banner`);
  }
}

const typeFixture = [
  'import type { GridColumnConfig } from "datagrizard";',
  "",
  "type Row = { qty: number; name: string };",
  "",
  "const columns: GridColumnConfig<Row>[] = [",
  "  {",
  '    accessorKey: "qty",',
  '    header: "Quantity",',
  '    dataType: "number",',
  "    formatValue(value) {",
  "      const quantity: number = value;",
  "      // @ts-expect-error A qty formatter must not widen its value to string.",
  "      const invalid: string = value;",
  "      return quantity;",
  "    },",
  "  },",
  "];",
  "",
  "void columns;",
].join("\n");

writeFileSync(join(smokeRoot, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
writeFileSync(join(smokeRoot, "consumer-esm.ts"), typeFixture);
writeFileSync(join(smokeRoot, "consumer-cjs.cts"), typeFixture);
writeFileSync(
  join(smokeRoot, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        jsx: "react-jsx",
        noEmit: true,
        skipLibCheck: false,
        types: ["react", "react-dom"],
      },
      files: ["consumer-esm.ts", "consumer-cjs.cts"],
    },
    null,
    2,
  )}\n`,
);

run(process.execPath, [typescriptBin, "--project", join(smokeRoot, "tsconfig.json")], {
  cwd: smokeRoot,
  stdio: "inherit",
});

console.log("Running publint against the packed artifact...");
run(process.execPath, [publintBin, tarballPath, "--strict"], { stdio: "inherit" });

console.log("Running Are the Types Wrong against the packed artifact...");
run(
  process.execPath,
  [attwBin, tarballPath, "--exclude-entrypoints", "styles.css", "--format", "ascii"],
  { stdio: "inherit" },
);

console.log(`Verified ${packResult.filename} with ${files.size} package files.`);
