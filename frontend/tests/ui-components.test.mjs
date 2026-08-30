import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("confirms a real exchange sacrifice instead of a merely attacked piece", async () => {
  const { estimateMaterialSacrifice } = await vite.ssrLoadModule(
    "/lib/move-classification.ts",
  );
  const estimate = estimateMaterialSacrifice(
    "rn4k1/8/8/8/8/8/8/1R4K1 w - - 0 1",
    "rR4k1/8/8/8/8/8/8/6K1 b - - 0 1",
    "b1b8",
  );

  assert.equal(estimate.kind, "MOVED");
  assert.equal(estimate.amount, 2);
});

test("reserves brilliant for sound sacrifices in competitive positions", async () => {
  const { classifyMove } = await vite.ssrLoadModule("/lib/move-classification.ts");
  const beforeFen = "rn4k1/8/8/8/8/8/8/1R4K1 w - - 0 1";
  const afterFen = "rR4k1/8/8/8/8/8/8/6K1 b - - 0 1";
  const variation = (pawns, moves) => ({ depth: 16, mate: null, moves, pawns });
  const after = {
    ...variation(1, ["a8b8"]),
    source: "engine",
    variations: [variation(1, ["a8b8"]), variation(0.9, ["g8f7"])],
  };
  const competitive = {
    ...variation(0.5, ["b1b8"]),
    source: "engine",
    variations: [variation(1, ["b1b8"]), variation(0, ["g1f2"])],
  };
  const alreadyWinning = {
    ...variation(8, ["b1b8"]),
    source: "engine",
    variations: [variation(8, ["b1b8"]), variation(7, ["g1f2"])],
  };

  assert.equal(classifyMove({
    after,
    before: competitive,
    index: 1,
    playedUci: "b1b8",
    positions: [beforeFen, afterFen],
  }).key, "brilliant");
  assert.equal(classifyMove({
    after: { ...after, pawns: 8 },
    before: alreadyWinning,
    index: 1,
    playedUci: "b1b8",
    positions: [beforeFen, afterFen],
  }).key, "best");
});
