"use strict";

require("./_isolate-workspace");

const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("../src/applicationProjectStore");
const registry = require("../src/xuongScenarioRegistry");
const { c6Definitions } = require("../src/xuongC6NativeSeeds");

function provider(seedId) {
  return async () => ({
    analysis: { summary: "Lời giải C++ hiện có đang trả kết quả cục bộ cho một tình huống đã đăng ký.", concepts: ["adapter"], constraints: ["Cần giữ oracle đúng"], evidenceRefs: [] },
    pathways: [{ id: `path-${seedId}`, title: "Bộ điều khiển cục bộ", purpose: "Giúp hệ thống kiểm tra một kết quả cục bộ trước khi phát hành.", context: "Nhóm vận hành cần phát hiện sai khác ngay tại máy local.", application: "Thuật toán tính một giá trị đầu ra để oracle độc lập đối chiếu.", target: "cpp", seedId, deliverables: [], verification: "Compiler và oracle kiểm tra kết quả.", tasks: [], contractCriteria: [] }],
  });
}

test("C6 admits exactly two real native families for every new base", () => {
  const coverage = registry.c6Coverage();
  for (const base of ["tree", "timeline", "geometry", "request-response", "runtime-resource", "state-machine"]) {
    assert.equal(coverage[base].admitted, true, `${base} must have two real families and every gate`);
    assert.equal(new Set(coverage[base].families).size, 2);
  }
});

test("C6 adapters compile, run, replay and check through the trusted registry", async () => {
  const firstOfBase = new Set();
  for (const definition of c6Definitions) {
    const adapter = definition.C6_ADAPTER;
    const session = await store.createAnalysisSession({ input: adapter.base, code: `// ${definition.ARTIFACT_ID}` }, { provider: provider(definition.ARTIFACT_ID) });
    const { project } = await store.selectPathway(session.id, session.pathways[0].id);
    const run = await store.runProjectScenario(project.id, { scenarioId: session.pathways[0].scenarioId });
    assert.equal(run.run.status, "completed");
    assert.equal(run.recipe.base.kind, adapter.base);
    assert.equal(run.observable.anchors.length, 0, definition.ARTIFACT_ID);
    const replay = await store.replayProjectRun(project.id, run.run.id, 1);
    assert.equal(replay.replay.observable.events.length, 1);
    const checked = await store.checkProjectRun(project.id, run.run.id);
    assert.equal(checked.evidence[0].outcome, "pass");

    if (!firstOfBase.has(adapter.base)) {
      firstOfBase.add(adapter.base);
      const editable = project.files.find((file) => file.editable);
      const broken = editable.source.replace(/return\s+[^;]+;/, "return 0;");
      assert.notEqual(broken, editable.source);
      await store.saveProjectFile(project.id, editable.path, broken, editable.contentHash);
      const red = await store.runProjectScenario(project.id, { scenarioId: session.pathways[0].scenarioId });
      assert.equal(red.observable.anchors.length, 1, `${adapter.base} needs a source error anchor`);
      const redCheck = await store.checkProjectRun(project.id, red.run.id);
      assert.equal(redCheck.evidence[0].outcome, "fail");
    }
  }
});
