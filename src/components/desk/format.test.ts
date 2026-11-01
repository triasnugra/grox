import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtUtc, pxFull } from "./format.ts";

test("pxFull menjaga presisi harga kecil dan tidak memakai notasi ilmiah", () => {
  assert.equal(pxFull(69123.45), "69123.45");
  assert.equal(pxFull(0.045678), "0.045678");
  assert.equal(pxFull(0.0000123456), "0.0000123456");
  assert.ok(!/e/i.test(pxFull(1.234e-9)));
  assert.equal(pxFull(null), "–");
  assert.equal(pxFull(Number.NaN), "–");
});

test("fmtUtc menulis zona eksplisit", () => {
  assert.equal(fmtUtc(Date.UTC(2026, 9, 29, 1, 19)), "2026-10-29 01:19 UTC");
});
