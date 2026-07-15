"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-lab-stress-v2-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const problemStore = require("../src/problemStore");
const { LIMITS } = require("../src/config");
const { buildApp } = require("../server");

test.after(async () => { await fsp.rm(TEST_ROOT, { recursive: true, force: true }); });

const GENERATOR_CODE = [
  "#include <iostream>",
  "#include <cstdlib>",
  "int main(int argc,char**argv){",
  "  unsigned long seed=argc>1?std::strtoul(argv[1],nullptr,10):0;",
  "  std::cout<<seed<<'\\n';",
  "}"
].join("\n");
const ECHO_CODE = "#include <iostream>\nint main(){long long x;if(std::cin>>x)std::cout<<x<<'\\n';}";
const WRONG_CODE = "#include <iostream>\nint main(){long long x;if(std::cin>>x)std::cout<<x+1<<'\\n';}";

async function withServer(run) {
  const server = http.createServer(buildApp());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withProblem(title, run) {
  const meta = await problemStore.createProblem({ title });
  try { return await run(meta.id); }
  finally { await problemStore.deleteProblem(meta.id); }
}

async function post(base, path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function parseSse(text) {
  const frames = [];
  for (const block of String(text).split("\n\n")) {
    const line = block.split("\n").find((part) => part.startsWith("data: "));
    if (!line) continue;
    frames.push(JSON.parse(line.slice(6)));
  }
  return frames;
}

test("POST /stress/stream emits ordered compile/test frames and one terminal done frame for exact fixed seeds", async () => {
  await withServer((base) => withProblem("zz-lab-stress-v2-stream-ac", async (id) => {
    const response = await post(base, `/api/problems/${id}/stress/stream`, {
      mode: "correctness",
      generatorCode: GENERATOR_CODE,
      bruteCode: ECHO_CODE,
      solutionCode: ECHO_CODE,
      seedMode: "fixed",
      seedStart: 100,
      testCount: 2,
      timeMs: 5000,
      compareMode: "strict"
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    const frames = parseSse(await response.text());

    assert.equal(frames[0].type, "start");
    assert.equal(frames[0].seedStart, 100);
    assert.equal(frames[0].runnerIsolation, "local-process");
    assert.deepEqual(frames.filter((f) => f.type === "compile").map((f) => f.program), [
      "generator", "brute", "solution"
    ]);
    assert.deepEqual(frames.filter((f) => f.type === "test").map((f) => [f.index, f.seed, f.verdict]), [
      [1, 100, "AC"], [2, 101, "AC"]
    ]);

    const terminal = frames.at(-1);
    assert.equal(terminal.type, "done");
    assert.equal(terminal.done, true);
    assert.equal(terminal.ok, true);
    assert.equal(terminal.attempted, 2);
    assert.equal(terminal.seedStart, 100);
    assert.equal(terminal.seedEnd, 101);
    assert.equal(terminal.nextSeed, 102);
    assert.equal(terminal.totalSeedsRan, 2);
    assert.equal(frames.filter((f) => f.done === true).length, 1);
  }));
});

test("POST /stress/stream Performance Mode accepts random seed and never compiles Brute", async () => {
  await withServer((base) => withProblem("zz-lab-stress-v2-performance", async (id) => {
    const response = await post(base, `/api/problems/${id}/stress/stream`, {
      mode: "performance",
      generatorCode: GENERATOR_CODE,
      bruteCode: "#error this must be ignored in performance mode",
      solutionCode: ECHO_CODE,
      seedMode: "random",
      testCount: 1,
      timeMs: 5000
    });
    assert.equal(response.status, 200);
    const frames = parseSse(await response.text());
    const start = frames.find((f) => f.type === "start");
    const progress = frames.find((f) => f.type === "test");
    const terminal = frames.at(-1);

    assert.equal(start.seedMode, "random");
    assert.ok(Number.isInteger(start.seedStart));
    assert.equal(progress.seed, start.seedStart);
    assert.equal(progress.verdict, "OK");
    assert.deepEqual(frames.filter((f) => f.type === "compile").map((f) => f.program), [
      "generator", "solution"
    ]);
    assert.equal(terminal.type, "done");
    assert.equal(terminal.mode, "performance");
    assert.equal(terminal.performanceRuns.length, 1);
    assert.equal(terminal.performanceRuns[0].seed, start.seedStart);
  }));
});

test("POST /stress/stream stops on the first WA and returns complete failure diagnostics", async () => {
  await withServer((base) => withProblem("zz-lab-stress-v2-wa", async (id) => {
    const response = await post(base, `/api/problems/${id}/stress/stream`, {
      mode: "correctness",
      generatorCode: GENERATOR_CODE,
      bruteCode: ECHO_CODE,
      solutionCode: WRONG_CODE,
      seedMode: "fixed",
      seedStart: 77,
      testCount: 5,
      timeMs: 5000,
      compareMode: "loose"
    });
    assert.equal(response.status, 200);
    const frames = parseSse(await response.text());
    const terminal = frames.at(-1);

    assert.equal(terminal.type, "failure");
    assert.equal(terminal.done, true);
    assert.equal(terminal.verdict, "WA");
    assert.equal(terminal.index, 1);
    assert.equal(terminal.seed, 77);
    assert.equal(terminal.nextSeed, 78);
    // Windows text-mode stdout uses CRLF; diagnostics intentionally preserve
    // the exact bytes converted to UTF-8 text, so normalize only for assertions.
    assert.equal(terminal.input.replace(/\r\n/g, "\n"), "77\n");
    assert.equal(terminal.expected.replace(/\r\n/g, "\n"), "77\n");
    assert.equal(terminal.actual.replace(/\r\n/g, "\n"), "78\n");
    assert.equal(terminal.generator.status, "OK");
    assert.equal(terminal.brute.status, "OK");
    assert.equal(terminal.solution.status, "OK");
    assert.ok(terminal.diff && terminal.diff.line === 1);
    assert.ok(Number.isFinite(terminal.timings.generatorMs));
    assert.ok(Number.isFinite(terminal.timings.bruteMs));
    assert.ok(Number.isFinite(terminal.timings.solutionMs));
    assert.equal(frames.filter((f) => f.type === "test").length, 0);
    assert.equal(terminal.attempted, 1);
  }));
});

test("POST /stress/stream rejects an oversized source before opening the event stream", async () => {
  await withServer((base) => withProblem("zz-lab-stress-v2-code-limit", async (id) => {
    const response = await post(base, `/api/problems/${id}/stress/stream`, {
      mode: "correctness",
      generatorCode: "x".repeat(LIMITS.maxCodeBytes + 1),
      bruteCode: ECHO_CODE,
      solutionCode: ECHO_CODE,
      seedMode: "fixed",
      seedStart: 1,
      testCount: 1
    });
    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    const data = await response.json();
    assert.equal(data.ok, false);
    assert.equal(data.field, "generatorCode");
    assert.equal(data.details.maxCodeBytes, LIMITS.maxCodeBytes);
  }));
});
