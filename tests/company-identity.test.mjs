import test from "node:test";
import assert from "node:assert/strict";
import { findCompanyPreset, normalizeCompanyName } from "../src/company-identity.js";

const presets = [
  ["jd", ["京东", "JD", "京东集团"]],
  ["alibaba", ["阿里", "阿里巴巴", "Alibaba"]],
];

test("company aliases match conservatively without merging 京东方 into 京东", () => {
  assert.equal(findCompanyPreset("京东", presets)?.[0], "jd");
  assert.equal(findCompanyPreset("京东科技有限公司", presets)?.[0], "jd");
  assert.equal(findCompanyPreset("JD", presets)?.[0], "jd");
  assert.equal(findCompanyPreset("京东方科技集团", presets), undefined);
});

test("company name normalization removes legal suffixes but preserves the identity", () => {
  assert.equal(normalizeCompanyName(" 阿里巴巴（中国）有限公司 "), "阿里巴巴");
  assert.equal(findCompanyPreset("阿里巴巴（中国）有限公司", presets)?.[0], "alibaba");
  assert.equal(normalizeCompanyName("京东方科技集团"), "京东方");
});
