"use strict";
const path = require("node:path"), fsp = require("node:fs/promises"), fileStore = require("./fileStore");
const { PROBLEMS_DIR } = require("./config");
function isSafeTestId(id) {
  return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(id);
}
function assertTestId(id) { if (!isSafeTestId(id)) throw Object.assign(new Error("Invalid test case id."), { status: 400, code: "INVALID_TEST_ID" }); return id; }
function paths(problemId, testId) {
  assertTestId(testId);
  if (!fileStore.isSafeId(problemId)) throw Object.assign(new Error("Invalid problem id."), { status: 400 });
  const root = path.resolve(fileStore.problemDir(problemId), "tests");
  const file = ext => { const target = path.resolve(root, testId + ext); if (path.dirname(target) !== root) throw Object.assign(new Error("Test path escapes suite."), { status: 400 }); return target; };
  return { root, input: file(".in"), expected: file(".out") };
}
async function rejectLinks(problemId, testId) {
  const value = paths(problemId, testId);
  for (const target of [path.dirname(PROBLEMS_DIR), PROBLEMS_DIR, fileStore.problemDir(problemId), value.root, path.join(value.root, "meta.json"), value.input, value.expected]) {
    try { if ((await fsp.lstat(target)).isSymbolicLink()) throw Object.assign(new Error("Linked testcase paths are not supported."), { status: 400, code: "INVALID_TEST_PATH" }); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return value;
}
async function rejectSuiteLinks(problemId) { await rejectLinks(problemId, "containment-probe"); }
function middleware(req, res, next) { try { assertTestId(req.params.testId); next(); } catch (error) { next(error); } }
function onlyTestMiddleware(req, res, next) { try { if (req.body && req.body.onlyTestId != null) assertTestId(req.body.onlyTestId); next(); } catch (error) { next(error); } }
module.exports = { isSafeTestId, assertTestId, paths, rejectLinks, rejectSuiteLinks, middleware, onlyTestMiddleware };
