import assert from "node:assert/strict";
import test from "node:test";

// Node chạy trực tiếp TypeScript (type stripping), không cần bundler cho test này.
const { estimateMaterialSacrifice } = await import("../lib/move-classification.ts");

test("confirms a real exchange sacrifice instead of a merely attacked piece", () => {
  const estimate = estimateMaterialSacrifice(
    "rn4k1/8/8/8/8/8/8/1R4K1 w - - 0 1",
    "rR4k1/8/8/8/8/8/8/6K1 b - - 0 1",
    "b1b8",
  );

  assert.equal(estimate.kind, "MOVED");
  assert.equal(estimate.amount, 2);
});

test("ignores a defended piece that is merely attacked", () => {
  // Xe b8 được xe b1 bảo vệ: Đen bắt thì Trắng bắt lại, vật chất không đổi.
  const estimate = estimateMaterialSacrifice(
    "r5k1/8/8/8/8/8/1R6/1R4K1 w - - 0 1",
    "rR4k1/8/8/8/8/8/8/1R4K1 b - - 0 1",
    "b2b8",
  );

  assert.equal(estimate.kind, "NONE");
});
