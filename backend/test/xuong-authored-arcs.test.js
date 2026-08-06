"use strict";

// Ten authored arcs — red-before-green with the real compiler.
//
// The rule from docs/HANDOVER.md: a design is not authored because someone
// wrote a nice brief for it. It is authored when the baseline source compiles
// and produces the WRONG answer, the one documented edit produces the RIGHT
// one, an EventAnchor points at the editable symbol while it is still wrong,
// and the projection is chosen from the model rather than from the algorithm
// name. Every claim below is checked against g++, not against prose.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const registry = require("../src/xuongScenarioRegistry");
const { authoredDefinitions, ZONE_READ, ZONE_WORK, CUT_OPEN, CUT_CLOSE } = require("../src/xuongAuthoredSeeds");
const { modelFor } = require("../src/xuongObservableSamples");
const { planView } = require("../src/xuongViewPlanner");

const MAPPING_ID = "main-editable-symbol";
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "xuong-authored-"));

function compileAndRun(definition, variant) {
  const scaffold = definition.buildScaffold({ createdAt: "2026-07-24T00:00:00.000Z" });
  const authored = definition.AUTHORED;
  const dir = path.join(workRoot, `${definition.ARTIFACT_ID}-${variant}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, authored.headerName), scaffold.files[authored.headerName]);
  fs.writeFileSync(path.join(dir, authored.sourceName),
    variant === "green" ? authored.solvedSource : scaffold.files[authored.sourceName]);
  fs.writeFileSync(path.join(dir, authored.testName), scaffold.files[authored.testName]);
  const binary = path.join(dir, process.platform === "win32" ? "run.exe" : "run");
  execFileSync("g++", ["-std=c++17", "-O1", "-o", binary,
    path.join(dir, authored.sourceName), path.join(dir, authored.testName)], { cwd: dir, stdio: "pipe" });
  return execFileSync(binary, { cwd: dir }).toString();
}

const authored = authoredDefinitions.map((definition) => ({
  definition,
  arc: registry.getArc(definition.ARTIFACT_ID),
}));

test("registry publishes all ten new authored arcs", () => {
  assert.equal(authored.length, 10);
  for (const { definition, arc } of authored) {
    assert.ok(arc, `thiếu arc cho ${definition.ARTIFACT_ID}`);
    assert.equal(arc.authored, true);
  }
});

for (const { definition, arc } of authored) {
  const seedId = definition.ARTIFACT_ID;

  test(`${arc.productTitle}: baseline chạy được nhưng trả sai, bản sửa trả đúng`, () => {
    const red = arc.parse(compileAndRun(definition, "red"));
    const green = arc.parse(compileAndRun(definition, "green"));
    assert.deepEqual(red, arc.redActual, `${seedId}: baseline phải trả đúng giá trị đỏ đã khai báo`);
    assert.notDeepEqual(red, arc.expected, `${seedId}: baseline không được vô tình đã đúng`);
    assert.deepEqual(green, arc.expected, `${seedId}: bản sửa phải đạt giá trị scenario cần`);
  });

  test(`${arc.productTitle}: scenario đủ giàu để kể một sản phẩm`, () => {
    for (const passed of [false, true]) {
      const model = modelFor(arc, { passed, seedId, stageIndex: 0 });
      assert.ok(model.entities.length >= 6, `${seedId}: cần ít nhất 6 đối tượng`);
      assert.ok(model.events.length >= 4, `${seedId}: cần ít nhất 4 mốc diễn biến`);
      assert.ok(model.outputs.length >= 1 && model.metrics.length >= 3);
      const changed = model.events.flatMap((event) => event.changedFields);
      assert.ok(changed.some((field) => field.before !== null && field.before !== undefined),
        `${seedId}: cần ít nhất một thay đổi có giá trị trước → sau`);
      assert.ok(model.controls.some((control) => control.type === "stepper"));
    }
  });

  test(`${arc.productTitle}: bản đỏ neo lỗi vào đúng hàm, bản xanh hết neo`, () => {
    const red = modelFor(arc, { passed: false, seedId, stageIndex: 0 });
    const green = modelFor(arc, { passed: true, seedId, stageIndex: 0 });
    assert.equal(green.anchors.length, 0, `${seedId}: bản xanh không được còn điểm neo lỗi`);
    assert.equal(red.anchors.length, 1, `${seedId}: bản đỏ cần đúng một điểm neo`);
    const [anchor] = red.anchors;
    assert.equal(anchor.sourceMappingId, MAPPING_ID);
    assert.equal(anchor.severity, "error");
    assert.ok(red.entities.some((entity) => entity.id === anchor.entityId));
    assert.ok(red.events[anchor.eventIndex].anchorIds.includes(anchor.id));
    assert.ok(anchor.display.description.length > 40, `${seedId}: mô tả điểm neo phải nói được cách sửa`);
  });

  test(`${arc.productTitle}: ViewPlanner chọn base từ dữ liệu, không từ tên thuật toán`, () => {
    for (const passed of [false, true]) {
      const model = modelFor(arc, { passed, seedId, stageIndex: 0 });
      assert.equal(planView(model, arc.recipe).base, arc.recipe.base,
        `${seedId}: planner chọn base khác thiết kế`);
    }
  });

  test(`${arc.productTitle}: giao đúng một hàm và nói rõ giả định bị phá`, () => {
    assert.ok(arc.sourceSymbol.includes("::"));
    assert.equal(arc.sourceSymbol.split("::")[0], definition.AUTHORED.className);
    for (const key of ["oldAssumption", "breakingEvent", "newCapability", "observableOutcome", "requirement"]) {
      assert.ok(String(arc.transformation[key]).length > 30, `${seedId}: transformation.${key} quá sơ sài`);
    }
    assert.equal(arc.learningBridge.editInstruction.split("\n").length, 3);
    assert.equal(arc.learningBridge.fileRoles.length, 3);
    // The requirement becomes the workbench headline, in the largest type on
    // screen. "…, hiện là 6." claimed the code already returned 6 while it was
    // returning 3 — the acceptance number stated as a fact about the present.
    assert.equal(/hiện là/.test(arc.transformation.requirement), false,
      `${seedId}: câu mục tiêu không được nói con số cần đạt như hiện trạng`);
    // Contract vocabulary a student never uses.
    for (const jargon of ["scenario", "seed", "overlay", "recipe", "observable"]) {
      assert.equal(new RegExp(jargon, "i").test(arc.transformation.requirement), false,
        `${seedId}: câu mục tiêu rò từ kỹ thuật "${jargon}"`);
    }
    // The file map must name three distinct suffixes, longest-match safe.
    const suffixes = arc.learningBridge.fileRoles.map((role) => role.suffix);
    assert.equal(new Set(suffixes).size, 3);
  });

  test(`${arc.productTitle}: file .cpp trả lời được đọc gì / viết gì / xoá gì`, () => {
    const scaffold = definition.buildScaffold({ createdAt: "2026-07-24T00:00:00.000Z" });
    const source = scaffold.files[definition.AUTHORED.sourceName];
    // Three zones, in this order, once each. A student who has only written a
    // single main() has to be able to answer "what do I read / write / delete"
    // without reading a word of the prose.
    for (const marker of [ZONE_READ, ZONE_WORK, CUT_OPEN, CUT_CLOSE]) {
      assert.equal(source.split(marker).length - 1, 1, `${seedId}: thiếu hoặc lặp mốc ${marker.slice(0, 24)}`);
    }
    assert.ok(source.indexOf(ZONE_READ) < source.indexOf(ZONE_WORK), `${seedId}: vùng chỉ đọc phải đứng trước vùng em sửa`);
    assert.ok(source.indexOf(ZONE_WORK) < source.indexOf(CUT_OPEN), `${seedId}: đoạn cần thay phải nằm trong vùng em sửa`);
    // The old numbering (PHẦN 1 → PHẦN 3, no PHẦN 2) made students look for a
    // section that did not exist.
    assert.equal(/PHẦN\s*\d/.test(source), false, `${seedId}: không đánh số phần nữa`);
    assert.ok(source.includes("using namespace std;"));
    assert.ok(source.includes("KHÔNG có main()"), `${seedId}: phải nói rõ main() nằm ở file nào`);
    // The editable function must be defined inside the VIỆC CỦA EM zone, and
    // the read-only helper outside it.
    const workZone = source.slice(source.indexOf(ZONE_WORK));
    assert.ok(workZone.includes(arc.sourceSymbol), `${seedId}: hàm em sửa phải nằm trong vùng VIỆC CỦA EM`);
  });

  test(`${arc.productTitle}: ba bước trong file trùng khít ba bước trên cột trái`, () => {
    const scaffold = definition.buildScaffold({ createdAt: "2026-07-24T00:00:00.000Z" });
    const source = scaffold.files[definition.AUTHORED.sourceName];
    const railSteps = arc.learningBridge.editInstruction.split("\n");
    const fileSteps = source
      .slice(source.indexOf(ZONE_WORK), source.indexOf("\n" + arc.sourceSymbol.split("::")[0]))
      .split("\n")
      .map((line) => /^\/\/ \d+\. (.+)$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => match[1]);
    assert.deepEqual(fileSteps, railSteps,
      `${seedId}: hướng dẫn trong file và trên cột trái phải là cùng một mảng`);
  });

  test(`${arc.productTitle}: nội dung cho học sinh không rò tên nội bộ`, () => {
    const shown = [
      arc.productTitle === definition.AUTHORED.className ? "" : arc.productTitle,
      arc.display.label, arc.display.description, arc.transformation.requirement,
      arc.transformation.breakingEvent, arc.inputSummary, arc.capability.summary,
    ].join("  ");
    for (const banned of [seedId, arc.id, "seed", "pathway", "overlay", "recipe", "adapter", arc.recipe.base]) {
      assert.equal(new RegExp(banned.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(shown), false,
        `${seedId}: copy hiển thị đang rò "${banned}"`);
    }
  });
}

test.after(() => { fs.rmSync(workRoot, { recursive: true, force: true }); });
