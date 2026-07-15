"use strict";

// Route-level tests: arena-match.js, arena-rating.js, and the new `arena`
// field on POST /:id/judge — proves S2/S3/S4 are wired end-to-end through
// real HTTP, not just unit-tested in isolation. Same withServer/withProblem
// convention as problems-event.test.js.
//
// This is the ONE place in the whole Arena test suite that touches the REAL
// data/arena-rating.json (routes/arena-rating.js hardcodes that path — by
// design, same as routes/moment.js's STUDENT_MODEL_FILE constant). Snapshot
// it before this file's tests run and restore it after, so Phúc's actual
// rating never ends up permanently nudged by test noise.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-arena-match-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const problemStore = require("../src/problemStore");
const referenceStore = require("../src/arena/referenceStore");
const { statementHash } = require("../src/trustLayer");
const config = require("../src/config");
const { buildApp } = require("../server");

const RATING_FILE = path.join(config.DATA_DIR, "arena-rating.json");
let snapshot;
test.before(async () => {
  snapshot = await fsp.readFile(RATING_FILE, "utf8").catch(() => null);
});
test.after(async () => {
  if (snapshot == null) await fsp.rm(RATING_FILE, { force: true });
  else await fsp.writeFile(RATING_FILE, snapshot, "utf8");
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
});

const STATEMENT = ["# Sum", "## Input", "```", "3", "1 2 3", "```", "## Output", "```", "6", "```"].join("\n");
const CORRECT_CODE = [
  "#include <bits/stdc++.h>", "using namespace std;",
  "int main(){int n; cin>>n; long long s=0; for(int i=0;i<n;i++){int x;cin>>x;s+=x;} cout<<s<<endl;}",
].join("\n");

async function withProblem(overrides, run) {
  // Scratch input/expected so POST /judge has something to judge — this app's
  // judge route returns a special "no tests" reply and never reaches the
  // Arena hook at all when both the test suite AND the scratch pair are empty.
  const meta = await problemStore.createProblem({
    title: "zz-arena-match-route-test", statement: STATEMENT, input: "3\n1 2 3\n", expected: "6\n", ...overrides,
  });
  try {
    return await run(meta.id);
  } finally {
    await problemStore.deleteProblem(meta.id);
  }
}

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      try { resolve(await run(`http://127.0.0.1:${port}`)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

test("GET /match on a fresh problem: state none, not rated-eligible", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const r = await getJson(base, `/api/problems/${id}/match`);
    assert.equal(r.status, 200);
    assert.equal(r.json.match.state, "none");
    assert.equal(r.json.wouldBeRated, false);
  }));
});

test("POST /rating-confirm rejects when there is no cfRating estimate yet", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const r = await postJson(base, `/api/problems/${id}/rating-confirm`);
    assert.equal(r.status, 400);
  }));
});

test("POST /rating-confirm succeeds once cfRating exists, and GET /match then shows it counted", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    await problemStore.updateProblem(id, { analysis: { cfRating: 1300 } });
    const r = await postJson(base, `/api/problems/${id}/rating-confirm`);
    assert.equal(r.status, 200);
    assert.equal(r.json.analysis.ratingConfirmed, true);

    const status = await getJson(base, `/api/problems/${id}/match`);
    assert.equal(status.json.eligibility.problemRatingConfirmed, true);
    assert.equal(status.json.problemRating, 1300);
  }));
});

test("POST /judge on a fully-eligible problem closes the match RATED and moves the rating", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    await referenceStore.setReference(id, CORRECT_CODE, { source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT) });
    await problemStore.updateProblem(id, { analysis: { cfRating: 1300, ratingConfirmed: true } });

    const before = await getJson(base, `/api/arena/rating`);
    const r = await postJson(base, `/api/problems/${id}/judge`, { code: CORRECT_CODE });
    assert.equal(r.status, 200);
    assert.equal(r.json.verdict, "AC");
    assert.ok(r.json.arena, "judge response must carry the new `arena` field");
    assert.equal(r.json.arena.match.rated, true);
    assert.ok(r.json.arena.rating);
    assert.ok(r.json.arena.rating.delta > 0);

    const after = await getJson(base, `/api/arena/rating`);
    assert.equal(after.json.rating, before.json.rating + r.json.arena.rating.delta);
    assert.equal(after.json.gamesPlayed, before.json.gamesPlayed + 1);
  }));
});

test("POST /judge: re-judging an ALREADY-WON problem never rates a second time (no rated-replay farm)", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    await referenceStore.setReference(id, CORRECT_CODE, { source: "manual", trusted: true, samplesChecked: 1, statementHash: statementHash(STATEMENT) });
    await problemStore.updateProblem(id, { analysis: { cfRating: 1300, ratingConfirmed: true } });

    // First AC: a real, legitimate rated win.
    const first = await postJson(base, `/api/problems/${id}/judge`, { code: CORRECT_CODE });
    assert.equal(first.json.arena.match.rated, true);
    assert.ok(first.json.arena.rating);
    const afterFirst = await getJson(base, `/api/arena/rating`);

    // Re-submitting the EXACT same already-AC'd code (or any code — the
    // problem itself is already spent) must close FRIENDLY, not rated, even
    // though sample/reference/problemRatingConfirmed are all still true.
    const second = await postJson(base, `/api/problems/${id}/judge`, { code: CORRECT_CODE });
    assert.equal(second.status, 200);
    assert.equal(second.json.verdict, "AC");
    assert.equal(second.json.arena.match.rated, false, "second AC on an already-won problem must be Friendly");
    assert.equal(second.json.arena.rating, null, "no rating call — this must never move the Elo needle");

    const afterSecond = await getJson(base, `/api/arena/rating`);
    assert.equal(afterSecond.json.rating, afterFirst.json.rating, "rating must be unchanged by the replay");
    assert.equal(afterSecond.json.gamesPlayed, afterFirst.json.gamesPlayed, "gamesPlayed must be unchanged by the replay");
  }));
});

test("POST /judge on an ineligible problem closes FRIENDLY and never touches the rating", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    const before = await getJson(base, `/api/arena/rating`);
    const r = await postJson(base, `/api/problems/${id}/judge`, { code: CORRECT_CODE });
    assert.equal(r.json.arena.match.rated, false);
    assert.equal(r.json.arena.rating, null);
    const after = await getJson(base, `/api/arena/rating`);
    assert.equal(after.json.rating, before.json.rating);
    assert.equal(after.json.gamesPlayed, before.json.gamesPlayed);
  }));
});

test("GET /rating/stakes reports a win/lose preview for a candidate problem", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    await problemStore.updateProblem(id, { analysis: { cfRating: 1500 } });
    const r = await getJson(base, `/api/arena/rating/stakes?problemId=${id}`);
    assert.equal(r.status, 200);
    assert.ok(r.json.win > 0);
    assert.ok(r.json.lose < 0);
    assert.ok(["safe", "standard", "upset"].includes(r.json.risk));
  }));
});

test("POST /match/adjourn then /match/surrender: adjourned match can still be surrendered", async () => {
  await withServer((base) => withProblem({}, async (id) => {
    await postJson(base, `/api/problems/${id}/judge`, { code: "#include <bits/stdc++.h>\nint main(){int n;std::cin>>n;std::cout<<0;}" }); // WA (prints 0, expected 6) — opens the match
    const adj = await postJson(base, `/api/problems/${id}/match/adjourn`);
    assert.equal(adj.json.match.state, "adjourned");
    const sur = await postJson(base, `/api/problems/${id}/match/surrender`);
    assert.equal(sur.json.match.state, "surrendered");
  }));
});
