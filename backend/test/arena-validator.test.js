"use strict";

// Tests for arena/validator.js (S12) — real g++ compile+run, no fake runners
// needed (this module has no AI dependency at all, unlike ensureReference).

const test = require("node:test");
const assert = require("node:assert/strict");
const validator = require("../src/arena/validator");

const VALIDATOR_N_LE_10 = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){int n; if(!(cin>>n)) return 1; if(n<1||n>10) return 1; return 0;}",
].join("\n");

test("checkInputAgainstValidator: exit 0 on valid input", async () => {
  const r = await validator.checkInputAgainstValidator({ code: VALIDATOR_N_LE_10, input: "5\n", judgeSettings: {} });
  assert.equal(r.compiled, true);
  assert.equal(r.valid, true);
});

test("checkInputAgainstValidator: non-zero exit on out-of-constraint input", async () => {
  const r = await validator.checkInputAgainstValidator({ code: VALIDATOR_N_LE_10, input: "50000\n", judgeSettings: {} });
  assert.equal(r.compiled, true);
  assert.equal(r.valid, false);
});

test("checkInputAgainstValidator: a validator that fails to compile degrades honestly, never throws", async () => {
  const r = await validator.checkInputAgainstValidator({ code: "int main( { not valid c++", input: "1\n", judgeSettings: {} });
  assert.equal(r.compiled, false);
  assert.equal(r.compilerMissing, false);
  assert.ok(r.stderr);
});
