"use strict";

// Ten authored product arcs — the second wave after MazeNavigator, RouteWatch,
// ShardBalancer, MergeForge and LogMatcher.
//
// The rule this file follows (docs/HANDOVER.md §4, "Checklist cho agent nhân
// rộng"): a design is authored only when the breaking event invalidates a real
// assumption of the old code, the scenario carries concrete domain data, the
// projection is chosen from the ObservableModel's axes rather than from an
// algorithm name, and a trusted runner proves red → green with the compiler.
//
// Every model below therefore states, in its own data:
//   · what the world looks like     (entities + geometry + labelled state)
//   · what happened, in order       (events with changedFields before → after)
//   · where the failure lives       (an EventAnchor onto the editable symbol)
//   · what the run measured         (metrics, including the target to reach)
//   · what a person would read out  (outputs, in Vietnamese)
//
// No entity, number or label here is invented at render time: the surface may
// only draw what these models say.

const { authoredDefinitions } = require("./xuongAuthoredSeeds");

const byId = new Map(authoredDefinitions.map((definition) => [definition.ARTIFACT_ID, definition]));

// The three steps live in the seed, because that is where they are printed for
// the student to read while typing. The rail shows the SAME array — a brief
// that disagreed with the comment in the file would be worse than no brief.
function stepsFor(seedId) {
  return byId.get(seedId).AUTHORED.steps.join("\n");
}

// What the read-only zone of the .cpp actually does, so the file map can say it
// instead of leaving the student to guess why there is a second function.
function readOnlyRoleOf(seedId) {
  return byId.get(seedId).AUTHORED.readOnlyRole;
}

// The scenario harness is the component's own test main(), re-pointed at the
// project's header path. Using one source for both keeps the number a student
// sees in Preview identical to the number the verifier read.
function harnessFor(seedId) {
  const authored = byId.get(seedId).AUTHORED;
  return ({ header }) => String(authored.testSource).replace(
    new RegExp(`#include\\s+"${authored.headerName.replace(".", "\\.")}"`),
    `#include "${header}"`,
  );
}

const FILE_ROLES = (seedId, className, symbol) => ([
  {
    suffix: ".hpp",
    label: "Bản mô tả · chỉ đọc",
    description: `Khai báo ${className} có những hàm nào, nhận gì, trả gì. Không chứa xử lý.`,
  },
  {
    suffix: ".cpp",
    label: "File em sửa",
    description: `Phần xử lý — thứ em từng viết thẳng trong main(). Build này chỉ đụng ${symbol}; ${readOnlyRoleOf(seedId)}`,
  },
  {
    suffix: ".requirement-change.test.cpp",
    label: "Bài chạy · chỉ đọc",
    description: "Đây là main() của tình huống: dựng dữ liệu, gọi hàm của em, rồi so kết quả với đáp án.",
  },
]);

// --- tiny model builders ----------------------------------------------------

const entity = (id, kind, label, state, geometry, description) => ({
  id, kind,
  display: description ? { label, description } : { label },
  state,
  ...(geometry ? { geometry } : {}),
});

const event = (index, id, kind, label, entityIds, changedFields = [], anchorIds = []) => ({
  id, index, kind, display: { label }, entityIds, changedFields, anchorIds,
});

const change = (entityId, fieldId, label, before, after) => ({
  entityId, fieldId, display: { label }, before, after,
});

const metric = (id, label, value, unit) => ({ id, display: { label }, value, ...(unit ? { unit } : {}) });
const output = (id, label, value) => ({ id, display: { label }, value });
const stepper = (label, value) => [{ id: "trace-step", display: { label }, type: "stepper", value }];

const anchorOn = (passed, { id, eventIndex, entityId, mappingId, label, description }) => (passed ? [] : [{
  id, eventIndex, entityId, sourceMappingId: mappingId, severity: "error", display: { label, description },
}]);

const ids = (anchors) => anchors.map((anchor) => anchor.id);

// ---------------------------------------------------------------------------
// 1. BuildOrderTree — base: tree
// ---------------------------------------------------------------------------

const BUILD_MODULES = [
  ["mod-app", "app · ứng dụng", 0, 2, 0, "gốc", 2, "Điểm bắt đầu của toàn bộ quy trình build."],
  ["mod-api", "api · dịch vụ", 1, 1, 1, "nhánh", 2, "Nhánh sâu nhất; còn hai module con phía dưới."],
  ["mod-ui", "ui · giao diện", 1, 3, 1, "nhánh", 1, "Nhánh nông, chỉ còn một bậc."],
  ["mod-core", "core · lõi dùng chung", 2, 0, 2, "nhánh", 1, "Bậc thứ hai mà code cũ đã bỏ qua."],
  ["mod-db", "db · truy cập dữ liệu", 2, 2, 2, "lá", 0, "Module này không nằm trên chuỗi dài nhất."],
  ["mod-theme", "theme · bộ giao diện", 2, 3, 2, "lá", 0, "Lá của nhánh ui."],
  ["mod-logging", "logging · ghi nhật ký", 3, 0, 3, "lá", 0, "Lá sâu nhất; chuỗi build thật kết thúc ở đây."],
];

const buildOrderTree = {
  authored: true,
  productTitle: "BuildOrderTree",
  id: "build-order-deep-chain",
  display: {
    label: "Đo đúng chuỗi build sâu nhất của dự án",
    description: "Bảng build của đội đã có module con của module con, nhưng công cụ vẫn báo chuỗi dài 1 bậc.",
  },
  domain: "tree",
  sourceSymbol: "BuildOrderTree::deepestChain",
  sourceLabel: "Hàm đo chuỗi build",
  capability: {
    summary: "Lời giải cũ đã dựng được bảng module con từ danh sách cạnh.",
    label: "Đo chuỗi build",
    claim: "Hàm đọc danh sách cạnh và tra ra các module con của một module.",
  },
  transformation: {
    oldAssumption: "Cây build chỉ sâu đúng một bậc, nên đếm module con trực tiếp là đủ.",
    breakingEvent: "Đội tách core ra khỏi api và tách logging ra khỏi core, tạo chuỗi app → api → core → logging dài ba bậc.",
    newCapability: "Đo được chuỗi dài nhất qua mọi bậc con, không giới hạn độ sâu.",
    observableOutcome: "Preview cho thấy nhánh api sáng đủ tới logging và số bậc tăng từ 1 lên 3.",
    requirement: "Trả về số bậc của chuỗi build dài nhất tính từ app — bài chạy phải ra 3.",
  },
  learningBridge: {
    intro: "Đây vẫn là duyệt cây em từng viết trong main(). Xưởng chỉ đưa phần đo độ sâu vào một hàm để scenario gọi lại với nhiều bảng build.",
    familiarCode: `int main() {
  cout << BuildOrderTree::deepestChain(edges, "app");
}`,
    editInstruction: stepsFor("build-order-tree"),
    fileRoles: FILE_ROLES("build-order-tree", "BuildOrderTree", "deepestChain()"),
  },
  inputSummary: "Bảng build 7 module, 6 cạnh phụ thuộc. Chuỗi dài nhất là app → api → core → logging (3 bậc).",
  buildHarness: harnessFor("build-order-tree"),
  expected: 3,
  redActual: 1,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "tree", overlays: ["path", "dependency"], control: "stepper", layout: "balanced" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-deep-chain", eventIndex: 2, entityId: "mod-logging", mappingId,
      label: `Chuỗi build mới dừng ở ${actual} bậc`,
      description: "Cần 3. deepestChain() đang trả 1 ngay khi thấy module có con; hãy gọi lại chính nó cho từng con rồi cộng 1.",
    });
    const reached = passed ? 3 : 1;
    const entities = BUILD_MODULES.map(([id, label, depth, x, y, phase, children, description]) => entity(
      id, "module", label,
      {
        depth,
        phase,
        count: children,
        rank: depth,
        text: label,
        ...(passed || depth <= 1 ? { counted: "đã tính" } : { counted: "chưa tính" }),
      },
      { x, y }, description,
    ));
    return {
      entities,
      relations: [
        { id: "edge-app-api", fromEntityId: "mod-app", toEntityId: "mod-api", kind: "depends", display: { label: "app cần api" }, state: { travelled: true } },
        { id: "edge-app-ui", fromEntityId: "mod-app", toEntityId: "mod-ui", kind: "depends", display: { label: "app cần ui" }, state: { travelled: true } },
        { id: "edge-api-core", fromEntityId: "mod-api", toEntityId: "mod-core", kind: "depends", display: { label: "api cần core" }, state: { travelled: passed } },
        { id: "edge-api-db", fromEntityId: "mod-api", toEntityId: "mod-db", kind: "depends", display: { label: "api cần db" }, state: { travelled: false } },
        { id: "edge-ui-theme", fromEntityId: "mod-ui", toEntityId: "mod-theme", kind: "depends", display: { label: "ui cần theme" }, state: { travelled: false } },
        { id: "edge-core-logging", fromEntityId: "mod-core", toEntityId: "mod-logging", kind: "depends", display: { label: "core cần logging" }, state: { travelled: passed } },
      ],
      events: [
        event(0, "event-graph-loaded", "graph-loaded", "Nạp bảng build 7 module và 6 cạnh phụ thuộc",
          ["mod-app", "mod-api", "mod-ui"],
          [
            change("mod-app", "depth", "Bậc trong cây", null, 0),
            change("mod-api", "phase", "Vai trò trong cây", null, "nhánh"),
            change("mod-api", "count", "Số module con", null, 2),
            change("mod-app", "rank", "Thứ tự bậc", null, 0),
            change("mod-app", "text", "Tên module", null, "app · ứng dụng"),
          ]),
        event(1, "event-direct-children", "scan-direct", "Đếm module con trực tiếp của app",
          ["mod-app", "mod-api", "mod-ui"],
          [change("mod-api", "counted", "Đã tính vào chuỗi", "chưa tính", "đã tính")]),
        event(2, "event-deep-children", passed ? "scan-deep" : "scan-stopped",
          passed ? "Đi tiếp xuống core rồi logging" : "Dừng lại ngay sau bậc đầu tiên",
          ["mod-core", "mod-logging"],
          [change("mod-logging", "counted", "Đã tính vào chuỗi", "chưa tính", passed ? "đã tính" : "chưa tính")],
          ids(anchors)),
        event(3, "event-chain-result", passed ? "chain-measured" : "chain-short",
          passed ? "Chuỗi dài nhất được chốt ở 3 bậc" : `Chuỗi dài nhất vẫn báo ${actual} bậc`,
          ["mod-app"],
          [change("mod-app", "count", "Số module con", 2, 2)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("chain-length", "Code đang trả", actual, "bậc"),
        metric("expected-chain", "Cần đạt", 3, "bậc"),
        metric("modules", "Số module trong bảng", 7),
        metric("reached", "Bậc đã đi tới", reached),
      ],
      outputs: [output("chain", "Chuỗi build dài nhất", passed
        ? "app → api → core → logging · 3 bậc"
        : `app → api · dừng ở ${actual} bậc, chưa xuống core và logging`)],
      controls: stepper("Phát lại từng bước duyệt cây", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. PrefixRouter — base: tree
// ---------------------------------------------------------------------------

const PREFIX_NODES = [
  ["pfx-8", "8 · đầu số quốc gia", "8", 1, 3, 0, 620],
  ["pfx-84", "84 · mã vùng cũ", "84", 2, 2, 1, 310],
  ["pfx-842", "842 · cụm miền Trung", "842", 3, 1, 2, 140],
  ["pfx-849", "849 · cụm di động", "849", 3, 5, 2, 96],
  ["pfx-8424", "8424 · tổng đài khu vực", "8424", 4, 0, 3, 58],
  ["pfx-8425", "8425 · tổng đài dự phòng", "8425", 4, 2, 3, 22],
  ["pfx-84242", "84242 · nhánh tổng đài mới", "84242", 5, 1, 4, 12],
];

const prefixRouter = {
  authored: true,
  productTitle: "PrefixRouter",
  id: "prefix-router-longest",
  display: {
    label: "Chọn tuyến theo tiền tố dài nhất",
    description: "Tổng đài vừa mở nhánh mã 5 chữ số, nhưng bộ định tuyến vẫn chỉ nhận mã vùng 2 chữ số.",
  },
  domain: "tree",
  sourceSymbol: "PrefixRouter::longestPrefixMatch",
  sourceLabel: "Hàm chọn tiền tố",
  capability: {
    summary: "Lời giải cũ đã so khớp được tiền tố với số máy.",
    label: "So khớp tiền tố",
    claim: "Hàm dùng startsWith() để kiểm tra một tiền tố có mở đầu số máy hay không.",
  },
  transformation: {
    oldAssumption: "Mã vùng luôn dài đúng hai ký tự nên chỉ cần xét tiền tố hai ký tự.",
    breakingEvent: "Tổng đài phát hành nhánh 84242; số 842421357 phải đi theo mã 5 chữ số chứ không phải mã 84.",
    newCapability: "So khớp mọi độ dài và chọn tiền tố dài nhất.",
    observableOutcome: "Preview cho thấy nhánh sáng đi sâu tới 84242 và độ dài khớp tăng từ 2 lên 5.",
    requirement: "Trả về độ dài tiền tố dài nhất khớp số 842421357 — bài chạy phải ra 5.",
  },
  learningBridge: {
    intro: "Vẫn là duyệt danh sách và so tiền tố như em viết trong main(); Xưởng chỉ tách phần chọn tuyến ra để tổng đài gọi lại.",
    familiarCode: `int main() {
  cout << PrefixRouter::longestPrefixMatch(table, "842421357");
}`,
    editInstruction: stepsFor("prefix-router-tree"),
    fileRoles: FILE_ROLES("prefix-router-tree", "PrefixRouter", "longestPrefixMatch()"),
  },
  inputSummary: "Bảng 6 tiền tố (8, 84, 842, 8424, 84242, 849) và số gọi 842421357. Tiền tố dài nhất khớp là 84242.",
  buildHarness: harnessFor("prefix-router-tree"),
  expected: 5,
  redActual: 2,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "tree", overlays: ["path", "target"], control: "stepper", layout: "balanced" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-prefix-length", eventIndex: 2, entityId: "pfx-84242", mappingId,
      label: `Tuyến đang dừng ở tiền tố dài ${actual}`,
      description: "Cần 5. Dòng chặn `prefix.size() != 2` khiến 842, 8424 và 84242 bị bỏ qua trước cả khi so khớp.",
    });
    const chosen = passed ? "pfx-84242" : "pfx-84";
    const entities = PREFIX_NODES.map(([id, label, text, length, x, y, calls]) => entity(
      id, "prefix", label,
      {
        text,
        length,
        count: calls,
        rank: length,
        phase: length <= 2 ? "mã cũ" : "mã mới",
        selected: id === chosen ? "đang chọn" : "không chọn",
        ...(id === chosen ? { role: "target", target: true } : {}),
      },
      { x, y }, `Nhánh phục vụ ${calls} cuộc gọi mỗi giờ.`,
    ));
    return {
      entities,
      relations: [
        { id: "edge-8-84", fromEntityId: "pfx-8", toEntityId: "pfx-84", kind: "prefix-edge", display: { label: "+4" }, state: { travelled: true } },
        { id: "edge-84-842", fromEntityId: "pfx-84", toEntityId: "pfx-842", kind: "prefix-edge", display: { label: "+2" }, state: { travelled: passed } },
        { id: "edge-84-849", fromEntityId: "pfx-84", toEntityId: "pfx-849", kind: "prefix-edge", display: { label: "+9" }, state: { travelled: false } },
        { id: "edge-842-8424", fromEntityId: "pfx-842", toEntityId: "pfx-8424", kind: "prefix-edge", display: { label: "+4" }, state: { travelled: passed } },
        { id: "edge-842-8425", fromEntityId: "pfx-842", toEntityId: "pfx-8425", kind: "prefix-edge", display: { label: "+5" }, state: { travelled: false } },
        { id: "edge-8424-84242", fromEntityId: "pfx-8424", toEntityId: "pfx-84242", kind: "prefix-edge", display: { label: "+2" }, state: { travelled: passed } },
      ],
      events: [
        event(0, "event-table-loaded", "table-loaded", "Nạp bảng 6 tiền tố của tổng đài",
          ["pfx-8", "pfx-84", "pfx-842"],
          [
            change("pfx-84", "text", "Tiền tố", null, "84"),
            change("pfx-84", "length", "Độ dài tiền tố", null, 2),
            change("pfx-84", "count", "Cuộc gọi mỗi giờ", null, 310),
            change("pfx-84", "phase", "Thế hệ mã", null, "mã cũ"),
            change("pfx-84", "rank", "Bậc trong cây", null, 2),
          ]),
        event(1, "event-call-arrives", "call-arrives", "Nhận cuộc gọi tới số 842421357",
          ["pfx-8", "pfx-84"],
          [change("pfx-84", "selected", "Tuyến đang chọn", "không chọn", "đang chọn")]),
        event(2, "event-match", passed ? "deep-match" : "short-match",
          passed ? "So khớp tiếp 842 → 8424 → 84242" : "Bỏ qua mọi tiền tố dài hơn hai ký tự",
          ["pfx-842", "pfx-8424", "pfx-84242"],
          [change("pfx-84242", "selected", "Tuyến đang chọn", "không chọn", passed ? "đang chọn" : "không chọn")],
          ids(anchors)),
        event(3, "event-route-chosen", passed ? "route-chosen" : "route-coarse",
          passed ? "Chốt tuyến 84242 cho cuộc gọi" : `Chốt tuyến mã ${actual} ký tự`,
          ["pfx-84"],
          [change("pfx-84", "selected", "Tuyến đang chọn", "đang chọn", passed ? "không chọn" : "đang chọn")],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("match-length", "Code đang chọn", actual, "ký tự"),
        metric("expected-length", "Cần đạt", 5, "ký tự"),
        metric("table-size", "Số tiền tố trong bảng", 6),
      ],
      outputs: [output("route", "Tuyến cho số 842421357", passed
        ? "84242 · nhánh tổng đài mới · khớp 5 ký tự"
        : `84 · mã vùng cũ · mới khớp ${actual} ký tự`)],
      controls: stepper("Phát lại từng bước so khớp", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 3. ShiftPlanner — base: timeline
// ---------------------------------------------------------------------------

const SHIFTS = [
  ["shift-1", "Ca 1 · trực sáng", 0, 120, "sáng"],
  ["shift-2", "Ca 2 · giao sáng", 60, 180, "sáng"],
  ["shift-3", "Ca 3 · trực trưa", 100, 200, "sáng"],
  ["shift-4", "Ca 4 · trực chiều", 240, 300, "chiều"],
  ["shift-5", "Ca 5 · giao chiều", 280, 360, "chiều"],
  ["shift-6", "Ca 6 · trực tối", 400, 460, "tối"],
];

const shiftPlanner = {
  authored: true,
  productTitle: "ShiftPlanner",
  id: "shift-planner-all-pairs",
  display: {
    label: "Đếm đủ số phút hai ca trực chồng nhau",
    description: "Bảng phân ca mới cho ba ca cùng phủ buổi sáng, nhưng công cụ chỉ so hai ca đứng cạnh nhau.",
  },
  domain: "timeline",
  sourceSymbol: "ShiftPlanner::overlapMinutes",
  sourceLabel: "Hàm cộng phút chồng ca",
  capability: {
    summary: "Lời giải cũ đã tính đúng phần chồng của một cặp ca.",
    label: "Đo chồng ca",
    claim: "Hàm overlapOf() lấy phần giao của hai khoảng thời gian.",
  },
  transformation: {
    oldAssumption: "Hai ca chỉ chồng nhau khi chúng đứng liền nhau trong danh sách.",
    breakingEvent: "Ca 1 (0–120) và Ca 3 (100–200) chồng nhau 20 phút dù giữa chúng còn Ca 2, nên tổng bị thiếu.",
    newCapability: "Cộng phần chồng của mọi cặp ca, kể cả cặp cách nhau trong danh sách.",
    observableOutcome: "Preview cho thấy mốc Ca 1 ↔ Ca 3 xuất hiện thêm và tổng tăng từ 160 lên 180 phút.",
    requirement: "Trả về tổng số phút chồng ca của cả sáu ca — bài chạy phải ra 180.",
  },
  learningBridge: {
    intro: "Vẫn là hai vòng lặp lồng nhau em từng viết; Xưởng chỉ tách phần cộng ra để bảng phân ca nào cũng gọi lại được.",
    familiarCode: `int main() {
  cout << ShiftPlanner::overlapMinutes(shifts);
}`,
    editInstruction: stepsFor("shift-planner-timeline"),
    fileRoles: FILE_ROLES("shift-planner-timeline", "ShiftPlanner", "overlapMinutes()"),
  },
  inputSummary: "Sáu ca trực trong ngày (phút thứ 0 tới 460). Các cặp chồng nhau: 1↔2 60 phút, 2↔3 80 phút, 1↔3 20 phút, 4↔5 20 phút.",
  buildHarness: harnessFor("shift-planner-timeline"),
  expected: 180,
  redActual: 160,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "timeline", overlays: ["interval", "compare"], control: "stepper", layout: "wide" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-skipped-pair", eventIndex: 2, entityId: "shift-3", mappingId,
      label: `Tổng chồng ca mới có ${actual} phút`,
      description: "Cần 180. Cặp Ca 1 ↔ Ca 3 chồng 20 phút nhưng không đứng cạnh nhau nên vòng lặp hiện tại bỏ qua.",
    });
    const paired = { "shift-1": passed ? 80 : 60, "shift-2": 140, "shift-3": passed ? 100 : 80, "shift-4": 20, "shift-5": 20, "shift-6": 0 };
    const entities = SHIFTS.map(([id, label, start, end, group]) => entity(
      id, "shift", label,
      {
        startMs: start,
        at: start,
        endsAt: end,
        length: end - start,
        group,
        overlap: paired[id],
        active: start < 200,
        counted: id === "shift-3" && !passed ? "thiếu cặp" : "đủ cặp",
      },
      null, `Ca kéo dài ${end - start} phút, thuộc nhóm ${group}.`,
    ));
    return {
      entities,
      relations: [
        { id: "pair-1-2", fromEntityId: "shift-1", toEntityId: "shift-2", kind: "overlap", display: { label: "60 phút" }, state: { travelled: true } },
        { id: "pair-2-3", fromEntityId: "shift-2", toEntityId: "shift-3", kind: "overlap", display: { label: "80 phút" }, state: { travelled: true } },
        { id: "pair-1-3", fromEntityId: "shift-1", toEntityId: "shift-3", kind: "overlap", display: { label: passed ? "20 phút" : "chưa đếm" }, state: { travelled: passed, failed: !passed } },
        { id: "pair-4-5", fromEntityId: "shift-4", toEntityId: "shift-5", kind: "overlap", display: { label: "20 phút" }, state: { travelled: true } },
      ],
      events: [
        event(0, "event-roster-loaded", "roster-loaded", "Nạp bảng phân ca 6 ca của ngày mai",
          ["shift-1", "shift-2", "shift-3"],
          [
            change("shift-1", "startMs", "Phút bắt đầu", null, 0),
            change("shift-1", "endsAt", "Phút kết thúc", null, 120),
            change("shift-1", "length", "Độ dài ca", null, 120),
            change("shift-1", "group", "Buổi trực", null, "sáng"),
            change("shift-3", "overlap", "Phút chồng của ca", null, 80),
            change("shift-1", "active", "Đang trong buổi sáng", null, true),
          ]),
        event(1, "event-adjacent-pairs", "pairs-adjacent", "Cộng phần chồng của các cặp ca liền nhau",
          ["shift-1", "shift-2", "shift-4", "shift-5"],
          [change("shift-2", "overlap", "Phút chồng của ca", 60, 140)]),
        event(2, "event-far-pair", passed ? "pair-found" : "pair-missed",
          passed ? "Tìm thêm cặp Ca 1 ↔ Ca 3 cách nhau một ca" : "Bỏ qua cặp Ca 1 ↔ Ca 3 vì không liền nhau",
          ["shift-1", "shift-3"],
          [
            change("shift-3", "overlap", "Phút chồng của ca", 80, passed ? 100 : 80),
            change("shift-3", "counted", "Trạng thái đếm cặp", "thiếu cặp", passed ? "đủ cặp" : "thiếu cặp"),
          ],
          ids(anchors)),
        event(3, "event-total", passed ? "total-complete" : "total-short",
          passed ? "Tổng chồng ca chốt ở 180 phút" : `Tổng chồng ca dừng ở ${actual} phút`,
          ["shift-4", "shift-5"],
          [change("shift-5", "overlap", "Phút chồng của ca", 0, 20)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("overlap-total", "Code đang trả", actual, "phút"),
        metric("expected-total", "Cần đạt", 180, "phút"),
        metric("shift-count", "Số ca trong bảng", 6),
        metric("pairs-checked", "Số cặp đã xét", passed ? 15 : 5),
      ],
      outputs: [output("overlap", "Tổng phút chồng ca", passed
        ? "180 phút · đã tính cả cặp Ca 1 ↔ Ca 3"
        : `${actual} phút · còn thiếu 20 phút của cặp Ca 1 ↔ Ca 3`)],
      controls: stepper("Phát lại từng bước so cặp ca", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. SweepMonitor — base: timeline
// ---------------------------------------------------------------------------

const SESSIONS = [
  ["sess-1", "Phiên 1 · sáng sớm", 0, 10, 1],
  ["sess-2", "Phiên 2 · sáng sớm", 5, 15, 2],
  ["sess-3", "Phiên 3 · cao điểm", 100, 200, 3],
  ["sess-4", "Phiên 4 · cao điểm", 110, 210, 4],
  ["sess-5", "Phiên 5 · cao điểm", 120, 220, 5],
  ["sess-6", "Phiên 6 · cao điểm", 130, 230, 6],
];

const sweepMonitor = {
  authored: true,
  productTitle: "SweepMonitor",
  id: "sweep-monitor-peak",
  display: {
    label: "Tìm đúng đỉnh phiên truy cập đồng thời",
    description: "Bảng theo dõi báo cao điểm 1 phiên trong khi khung giờ trưa có tới 4 phiên cùng mở.",
  },
  domain: "timeline",
  sourceSymbol: "SweepMonitor::peakConcurrency",
  sourceLabel: "Hàm tìm đỉnh đồng thời",
  capability: {
    summary: "Lời giải cũ đã đếm được số phiên đang mở tại một mốc bất kỳ.",
    label: "Đếm phiên đang mở",
    claim: "Hàm activeAt() đếm số phiên bao trùm một mốc thời gian.",
  },
  transformation: {
    oldAssumption: "Cao điểm luôn rơi đúng vào lúc phiên đầu tiên vừa mở.",
    breakingEvent: "Bốn phiên buổi trưa mở lệch nhau 10 phút; đỉnh thật nằm ở phút 130 chứ không phải phút 0.",
    newCapability: "Quét mọi mốc mở phiên và giữ số đồng thời lớn nhất.",
    observableOutcome: "Preview cho thấy mốc quét chạy tới phút 130 và đỉnh tăng từ 1 lên 4 phiên.",
    requirement: "Trả về số phiên mở đồng thời cao nhất trong ngày — bài chạy phải ra 4.",
  },
  learningBridge: {
    intro: "Vẫn là quét mốc rồi lấy max như em quen; Xưởng chỉ tách phần quét ra để bảng theo dõi gọi lại mỗi ngày.",
    familiarCode: `int main() {
  cout << SweepMonitor::peakConcurrency(sessions);
}`,
    editInstruction: stepsFor("sweep-monitor-timeline"),
    fileRoles: FILE_ROLES("sweep-monitor-timeline", "SweepMonitor", "peakConcurrency()"),
  },
  inputSummary: "Sáu phiên trong ngày. Hai phiên sáng sớm chồng nhau, bốn phiên trưa mở lệch 10 phút và cùng mở tại phút 130.",
  buildHarness: harnessFor("sweep-monitor-timeline"),
  expected: 4,
  redActual: 1,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "timeline", overlays: ["window", "threshold"], control: "stepper", layout: "wide" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-single-probe", eventIndex: 2, entityId: "sess-6", mappingId,
      label: `Đỉnh vẫn báo ${actual} phiên`,
      description: "Cần 4. Hàm mới quét đúng một mốc là sessions[0].first; hãy lặp qua mọi phiên và giữ giá trị activeAt lớn nhất.",
    });
    const entities = SESSIONS.map(([id, label, open, close, rank]) => entity(
      id, "session", label,
      {
        at: open,
        startMs: open,
        endsAt: close,
        length: close - open,
        rank,
        group: open < 50 ? "sáng sớm" : "cao điểm trưa",
        active: passed ? open <= 130 && close >= 130 : open === 0,
        count: open >= 100 ? 4 : 2,
        probed: passed || open === 0 ? "đã quét" : "chưa quét",
      },
      null, `Phiên mở lúc phút ${open} và đóng lúc phút ${close}.`,
    ));
    return {
      entities,
      relations: [
        { id: "ov-1-2", fromEntityId: "sess-1", toEntityId: "sess-2", kind: "concurrent", display: { label: "chồng 5 phút" }, state: { travelled: true } },
        { id: "ov-3-4", fromEntityId: "sess-3", toEntityId: "sess-4", kind: "concurrent", display: { label: "chồng 90 phút" }, state: { travelled: passed } },
        { id: "ov-4-5", fromEntityId: "sess-4", toEntityId: "sess-5", kind: "concurrent", display: { label: "chồng 90 phút" }, state: { travelled: passed } },
        { id: "ov-5-6", fromEntityId: "sess-5", toEntityId: "sess-6", kind: "concurrent", display: { label: "chồng 90 phút" }, state: { travelled: passed } },
      ],
      events: [
        event(0, "event-log-loaded", "log-loaded", "Nạp nhật ký 6 phiên trong ngày",
          ["sess-1", "sess-2", "sess-3"],
          [
            change("sess-1", "at", "Phút mở phiên", null, 0),
            change("sess-1", "endsAt", "Phút đóng phiên", null, 10),
            change("sess-3", "length", "Độ dài phiên", null, 100),
            change("sess-3", "group", "Khung giờ", null, "cao điểm trưa"),
            change("sess-3", "rank", "Thứ tự mở", null, 3),
            change("sess-1", "active", "Đang mở tại mốc quét", null, true),
            change("sess-3", "count", "Số phiên cùng khung", null, 4),
          ]),
        event(1, "event-first-probe", "probe-first", "Quét tại mốc phiên đầu tiên (phút 0)",
          ["sess-1", "sess-2"],
          [change("sess-1", "probed", "Trạng thái quét", "chưa quét", "đã quét")]),
        event(2, "event-noon-probe", passed ? "probe-all" : "probe-skipped",
          passed ? "Quét tiếp các mốc trưa, tới phút 130 đếm được 4 phiên" : "Không quét mốc nào khác ngoài phút 0",
          ["sess-3", "sess-4", "sess-5", "sess-6"],
          [
            change("sess-6", "probed", "Trạng thái quét", "chưa quét", passed ? "đã quét" : "chưa quét"),
            change("sess-6", "active", "Đang mở tại mốc quét", false, passed),
          ],
          ids(anchors)),
        event(3, "event-peak", passed ? "peak-found" : "peak-underreported",
          passed ? "Đỉnh đồng thời chốt ở 4 phiên lúc phút 130" : `Đỉnh đồng thời vẫn báo ${actual} phiên`,
          ["sess-6"],
          [change("sess-6", "count", "Số phiên cùng khung", 4, 4)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("peak", "Code đang trả", actual, "phiên"),
        metric("expected-peak", "Cần đạt", 4, "phiên"),
        metric("sessions", "Số phiên trong nhật ký", 6),
        metric("probes", "Số mốc đã quét", passed ? 6 : 1),
      ],
      outputs: [output("peak-report", "Đỉnh phiên đồng thời", passed
        ? "4 phiên cùng mở tại phút 130"
        : `${actual} phiên · mới quét mốc phút 0, chưa chạm khung trưa`)],
      controls: stepper("Phát lại từng mốc quét", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 5. FieldSurvey — base: geometry
// ---------------------------------------------------------------------------

const SENSORS = [
  ["sensor-a", "Trạm A · trung tâm xã", 1, 1, 1.41, true],
  ["sensor-b", "Trạm B · ven đường", 4.5, 0.5, 4.53, true],
  ["sensor-c", "Trạm C · góc đông bắc", 4.5, 4.5, 6.36, false],
  ["sensor-d", "Trạm D · trường học", -3, 4, 5.0, true],
  ["sensor-e", "Trạm E · bến đò", 0, -4.8, 4.8, true],
  ["sensor-f", "Trạm F · góc tây nam", -4.9, -4.9, 6.93, false],
];

const fieldSurvey = {
  authored: true,
  productTitle: "FieldSurvey",
  id: "field-survey-circle",
  display: {
    label: "Đo vùng phủ sóng theo đường tròn thật",
    description: "Bản đồ phủ sóng đang vẽ hình vuông quanh cột phát nên hai trạm ở góc bị báo nhầm là có sóng.",
  },
  domain: "geometry",
  sourceSymbol: "FieldSurvey::withinRange",
  sourceLabel: "Hàm đo vùng phủ",
  capability: {
    summary: "Lời giải cũ đã tính được khoảng cách ngang và dọc tới cột phát.",
    label: "Đo khoảng cách",
    claim: "Hàm dùng helper dx() để lấy chênh lệch theo từng trục.",
  },
  transformation: {
    oldAssumption: "Vùng phủ của cột phát là khung vuông cạnh 2R quanh cột.",
    breakingEvent: "Đội đo thực địa báo Trạm C và Trạm F mất sóng dù nằm trong khung vuông; sóng thật lan theo đường tròn bán kính 5.",
    newCapability: "Xác định trạm trong vùng phủ bằng bình phương khoảng cách so với bình phương bán kính.",
    observableOutcome: "Preview cho thấy hai điểm góc rơi ra ngoài đường tròn và số trạm phủ giảm từ 6 xuống 4.",
    requirement: "Trả về số trạm nằm trong bán kính 5 tính từ cột phát — bài chạy phải ra 4.",
  },
  learningBridge: {
    intro: "Vẫn là công thức khoảng cách em từng dùng; Xưởng chỉ tách phần đo ra để bản đồ phủ sóng gọi lại cho mọi cột.",
    familiarCode: `int main() {
  cout << FieldSurvey::withinRange(points, 0.0, 0.0, 5.0);
}`,
    editInstruction: stepsFor("field-survey-geometry"),
    fileRoles: FILE_ROLES("field-survey-geometry", "FieldSurvey", "withinRange()"),
  },
  inputSummary: "Cột phát tại (0,0), bán kính 5. Sáu trạm khảo sát; hai trạm góc cách 6.36 và 6.93 nên nằm ngoài vùng phủ.",
  buildHarness: harnessFor("field-survey-geometry"),
  expected: 4,
  redActual: 6,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "geometry", overlays: ["constraint", "target"], control: "stepper", layout: "balanced" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-square-range", eventIndex: 2, entityId: "sensor-c", mappingId,
      label: `Vùng phủ vẫn nhận ${actual} trạm`,
      description: "Cần 4. Điều kiện khung vuông nhận cả Trạm C (6.36) và Trạm F (6.93); đổi sang so bình phương khoảng cách với bình phương bán kính.",
    });
    const entities = [
      entity("tower", "tower", "Cột phát · trung tâm xã",
        { distance: 0, phase: "cột phát", inRange: "gốc", count: passed ? 4 : 6, role: "source", start: true },
        { x: 0, y: 0 }, "Cột phát sóng, bán kính thiết kế 5 km."),
      ...SENSORS.map(([id, label, x, y, distance, inCircle]) => entity(
        id, "sensor", label,
        {
          distance,
          expected: 5,
          limit: 5,
          inRange: passed ? (inCircle ? "trong vùng" : "ngoài vùng") : "trong vùng",
          phase: inCircle ? "phủ thật" : "báo nhầm",
          count: 1,
        },
        { x, y }, `Cách cột phát ${distance} km theo đường chim bay.`,
      )),
    ];
    return {
      entities,
      relations: SENSORS.map(([id, , , , distance]) => ({
        id: `beam-${id}`, fromEntityId: "tower", toEntityId: id, kind: "coverage",
        display: { label: `${distance} km` },
        state: { travelled: passed ? distance <= 5 : true },
      })),
      events: [
        event(0, "event-survey-loaded", "survey-loaded", "Nạp toạ độ cột phát và 6 trạm khảo sát",
          ["tower", "sensor-a", "sensor-b"],
          [
            change("sensor-a", "distance", "Khoảng cách tới cột", null, 1.41),
            change("sensor-a", "expected", "Bán kính thiết kế", null, 5),
            change("sensor-a", "limit", "Ngưỡng bán kính", null, 5),
            change("sensor-a", "phase", "Kết luận khảo sát", null, "phủ thật"),
            change("tower", "count", "Số trạm được phủ", null, passed ? 4 : 6),
            change("sensor-a", "count", "Số trạm được phủ", null, 1),
          ]),
        event(1, "event-square-check", "square-check", "Đo theo khung vuông quanh cột phát",
          ["sensor-a", "sensor-b", "sensor-d", "sensor-e"],
          [change("sensor-b", "inRange", "Kết quả phủ sóng", "trong vùng", "trong vùng")]),
        event(2, "event-circle-check", passed ? "circle-check" : "corner-false-positive",
          passed ? "Đo lại theo đường tròn: hai trạm góc rơi ra ngoài" : "Hai trạm góc vẫn được tính là có sóng",
          ["sensor-c", "sensor-f"],
          [
            change("sensor-c", "inRange", "Kết quả phủ sóng", "trong vùng", passed ? "ngoài vùng" : "trong vùng"),
            change("sensor-f", "inRange", "Kết quả phủ sóng", "trong vùng", passed ? "ngoài vùng" : "trong vùng"),
          ],
          ids(anchors)),
        event(3, "event-coverage", passed ? "coverage-correct" : "coverage-overcounted",
          passed ? "Bản đồ phủ sóng chốt ở 4 trạm" : `Bản đồ phủ sóng vẫn báo ${actual} trạm`,
          ["tower"],
          [change("tower", "count", "Số trạm được phủ", 6, actual)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("covered", "Code đang trả", actual, "trạm"),
        metric("expected-covered", "Cần đạt", 4, "trạm"),
        metric("radius", "Bán kính thiết kế", 5, "km"),
      ],
      outputs: [output("coverage", "Kết quả khảo sát phủ sóng", passed
        ? "4 trạm trong bán kính 5 km · Trạm C và Trạm F nằm ngoài"
        : `${actual} trạm được báo có sóng · Trạm C (6.36 km) và Trạm F (6.93 km) là báo nhầm`)],
      controls: stepper("Phát lại từng bước đo phủ sóng", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 6. ApiGateway — base: request-response
// ---------------------------------------------------------------------------

const GATEWAY_CALLS = [
  ["call-orders", "GET /don-hang", "/don-hang", "orders", 200, 200, false],
  ["call-billing", "GET /thanh-toan", "/thanh-toan", "billing", 200, 503, true],
  ["call-stock", "GET /kho", "/kho", "stock", 200, 200, false],
  ["call-users", "GET /nguoi-dung", "/nguoi-dung", "users", 200, 200, false],
  ["call-reports", "GET /bao-cao", "/bao-cao", "reports", 200, 503, true],
  ["call-legacy", "GET /cu", "/cu", "", 404, 404, false],
];

const GATEWAY_SERVICES = [
  ["svc-orders", "orders · dịch vụ đơn hàng", "orders", false, 0],
  ["svc-billing", "billing · dịch vụ thanh toán", "billing", true, 1],
  ["svc-stock", "stock · dịch vụ kho", "stock", false, 2],
  ["svc-reports", "reports · dịch vụ báo cáo", "reports", true, 3],
];

const apiGateway = {
  authored: true,
  productTitle: "ApiGateway",
  id: "api-gateway-service-down",
  display: {
    label: "Báo đúng trạng thái khi dịch vụ đích đang tắt",
    description: "Cổng API vẫn trả 200 cho hai dịch vụ đã ngừng chạy, nên phía gọi tưởng mọi thứ bình thường.",
  },
  domain: "request-response",
  sourceSymbol: "ApiGateway::statusFor",
  sourceLabel: "Hàm trả mã trạng thái",
  capability: {
    summary: "Lời giải cũ đã tra được đường dẫn ra tên dịch vụ.",
    label: "Định tuyến đường dẫn",
    claim: "Hàm serviceOf() dò bảng định tuyến để lấy dịch vụ của một đường dẫn.",
  },
  transformation: {
    oldAssumption: "Đường dẫn có trong bảng định tuyến thì dịch vụ chắc chắn còn sống.",
    breakingEvent: "Đội vận hành tắt billing và reports để bảo trì; cổng vẫn trả 200 nên phía gọi không hề biết.",
    newCapability: "Trả 503 cho đường dẫn thuộc dịch vụ đang tắt, giữ 404 cho đường dẫn không tồn tại.",
    observableOutcome: "Preview cho thấy hai lượt gọi đổi từ 200 sang 503 và tổng mã tăng từ 1404 lên 2010.",
    requirement: "Trả về tổng mã trạng thái của sáu lượt gọi — bài chạy phải ra 2010.",
  },
  learningBridge: {
    intro: "Vẫn là tra bảng rồi trả kết quả như em quen; Xưởng chỉ tách phần quyết định mã ra để cổng gọi lại cho mọi yêu cầu.",
    familiarCode: `int main() {
  total += ApiGateway::statusFor(table, path, down);
}`,
    editInstruction: stepsFor("api-gateway-exchange"),
    fileRoles: FILE_ROLES("api-gateway-exchange", "ApiGateway", "statusFor()"),
  },
  inputSummary: "Bảng 5 đường dẫn, 6 lượt gọi, hai dịch vụ đang tắt là billing và reports. Tổng mã đúng là 2010.",
  buildHarness: harnessFor("api-gateway-exchange"),
  expected: 2010,
  redActual: 1404,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "request-response", overlays: ["diff", "compare"], control: "stepper", layout: "wide" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-service-down", eventIndex: 2, entityId: "call-billing", mappingId,
      label: `Cổng vẫn trả 200 cho dịch vụ đang tắt`,
      description: "Tổng cần 2010, hiện là " + actual + ". Sau khi lấy được service, hãy kiểm tra downServices trước khi trả 200.",
    });
    const entities = [
      ...GATEWAY_CALLS.map(([id, label, path, service, red, green, affected]) => entity(
        id, "exchange", label,
        {
          request: path,
          response: passed ? green : red,
          service: service || "không có tuyến",
          phase: affected ? "dịch vụ tắt" : "dịch vụ chạy",
          count: 1,
          group: affected ? "cần 503" : "giữ nguyên",
        },
        null, `Cổng nhận ${path} và chuyển tới ${service || "không dịch vụ nào"}.`,
      )),
      ...GATEWAY_SERVICES.map(([id, label, name, down, index]) => entity(
        id, "service", label,
        { phase: down ? "đang tắt" : "đang chạy", count: down ? 0 : 1, rank: index, service: name },
        null, down ? "Đang bảo trì theo lịch của đội vận hành." : "Dịch vụ trả lời bình thường.",
      )),
    ];
    return {
      entities,
      relations: [
        { id: "route-orders", fromEntityId: "call-orders", toEntityId: "svc-orders", kind: "routes-to", display: { label: "200" }, state: { travelled: true } },
        { id: "route-billing", fromEntityId: "call-billing", toEntityId: "svc-billing", kind: "routes-to", display: { label: passed ? "503" : "200" }, state: { travelled: passed, failed: !passed } },
        { id: "route-stock", fromEntityId: "call-stock", toEntityId: "svc-stock", kind: "routes-to", display: { label: "200" }, state: { travelled: true } },
        { id: "route-reports", fromEntityId: "call-reports", toEntityId: "svc-reports", kind: "routes-to", display: { label: passed ? "503" : "200" }, state: { travelled: passed, failed: !passed } },
      ],
      events: [
        event(0, "event-gateway-ready", "gateway-ready", "Cổng nạp bảng định tuyến và nhận 6 lượt gọi",
          ["call-orders", "call-billing", "call-stock"],
          [
            change("call-orders", "request", "Đường dẫn yêu cầu", null, "/don-hang"),
            change("call-orders", "response", "Mã trả về", null, 200),
            change("call-orders", "service", "Dịch vụ đích", null, "orders"),
            change("call-billing", "phase", "Tình trạng dịch vụ", null, "dịch vụ tắt"),
            change("call-orders", "count", "Số lượt gọi", null, 1),
            change("svc-billing", "rank", "Thứ tự dịch vụ", null, 1),
            change("call-billing", "group", "Nhóm xử lý", null, "cần 503"),
          ]),
        event(1, "event-route-lookup", "route-lookup", "Tra bảng: 5 đường dẫn có tuyến, /cu không có",
          ["call-legacy", "call-users"],
          [change("call-legacy", "response", "Mã trả về", 200, 404)]),
        event(2, "event-health-check", passed ? "health-applied" : "health-ignored",
          passed ? "Áp trạng thái dịch vụ: billing và reports trả 503" : "Bỏ qua trạng thái dịch vụ, vẫn trả 200",
          ["call-billing", "call-reports", "svc-billing", "svc-reports"],
          [
            change("call-billing", "response", "Mã trả về", 200, passed ? 503 : 200),
            change("call-reports", "response", "Mã trả về", 200, passed ? 503 : 200),
          ],
          ids(anchors)),
        event(3, "event-total", passed ? "total-correct" : "total-optimistic",
          passed ? "Tổng mã trạng thái chốt ở 2010" : `Tổng mã trạng thái vẫn là ${actual}`,
          ["call-orders", "call-users"],
          [change("call-users", "count", "Số lượt gọi", 1, 1)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("status-total", "Code đang trả", actual),
        metric("expected-total", "Cần đạt", 2010),
        metric("calls", "Số lượt gọi", 6),
        metric("down-services", "Dịch vụ đang tắt", 2),
      ],
      outputs: [output("gateway", "Kết quả cổng API", passed
        ? "3 lượt 200 · 2 lượt 503 · 1 lượt 404 · tổng 2010"
        : `5 lượt 200 · 1 lượt 404 · tổng ${actual}; billing và reports đang tắt nhưng vẫn báo thành công`)],
      controls: stepper("Phát lại từng lượt gọi", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 7. RetryBudget — base: request-response
// ---------------------------------------------------------------------------

const RETRY_CALLS = [
  ["retry-1", "Lượt 1 · lưu đơn", 500, true, "máy chủ"],
  ["retry-2", "Lượt 2 · tra mã giảm giá", 404, false, "người gọi"],
  ["retry-3", "Lượt 3 · gọi kho", 503, true, "máy chủ"],
  ["retry-4", "Lượt 4 · lấy hồ sơ", 200, false, "thành công"],
  ["retry-5", "Lượt 5 · gửi thông báo", 429, false, "người gọi"],
  ["retry-6", "Lượt 6 · ghi nhật ký", 500, true, "máy chủ"],
];

const retryBudget = {
  authored: true,
  productTitle: "RetryBudget",
  id: "retry-budget-server-only",
  display: {
    label: "Chỉ thử lại lỗi phía máy chủ",
    description: "Client đang thử lại cả lỗi 404 và 429, làm tốn gấp rưỡi số lượt gọi mà kết quả không đổi.",
  },
  domain: "request-response",
  sourceSymbol: "RetryBudget::retryable",
  sourceLabel: "Hàm quyết định thử lại",
  capability: {
    summary: "Lời giải cũ đã cộng đúng ngân sách thử lại cho mỗi lượt gọi.",
    label: "Đếm lượt gọi",
    claim: "Hàm attemptsUsed() cộng một lượt gọi gốc và ngân sách thử lại cho từng phản hồi.",
  },
  transformation: {
    oldAssumption: "Cứ phản hồi khác 200 là đáng thử lại.",
    breakingEvent: "Đội vận hành đo được 404 và 429 lặp lại y hệt sau mỗi lần thử, chỉ tốn lượt gọi chứ không bao giờ thành công.",
    newCapability: "Chỉ thử lại mã 5xx, để 4xx trả về ngay cho phía gọi.",
    observableOutcome: "Preview cho thấy hai lượt 404 và 429 hết cờ thử lại và tổng lượt gọi giảm từ 16 xuống 12.",
    requirement: "Trả về tổng số lượt gọi thực tế cho sáu phản hồi — bài chạy phải ra 12.",
  },
  learningBridge: {
    intro: "Vẫn là một điều kiện if như em quen; Xưởng chỉ tách chính sách thử lại ra thành hàm riêng để client gọi lại.",
    familiarCode: `int main() {
  cout << RetryBudget::attemptsUsed(statuses, 2);
}`,
    editInstruction: stepsFor("retry-budget-exchange"),
    fileRoles: FILE_ROLES("retry-budget-exchange", "RetryBudget", "retryable()"),
  },
  inputSummary: "Sáu phản hồi (500, 404, 503, 200, 429, 500) với ngân sách 2 lần thử lại mỗi lỗi. Tổng lượt gọi đúng là 12.",
  buildHarness: harnessFor("retry-budget-exchange"),
  expected: 12,
  redActual: 16,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "request-response", overlays: ["threshold", "compare"], control: "stepper", layout: "balanced" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-retry-4xx", eventIndex: 2, entityId: "retry-2", mappingId,
      label: `Vẫn tiêu ${actual} lượt gọi`,
      description: "Cần 12. Lỗi 404 và 429 đang được thử lại 2 lần mỗi lỗi; retryable() phải chỉ nhận mã từ 500 trở lên.",
    });
    const retriesOf = (status, serverSide) => ((passed ? serverSide : status !== 200) ? 2 : 0);
    const entities = [
      ...RETRY_CALLS.map(([id, label, status, serverSide, group]) => entity(
        id, "exchange", label,
        {
          request: label,
          response: status,
          retries: retriesOf(status, serverSide),
          limit: 2,
          group,
          count: 1 + retriesOf(status, serverSide),
          phase: serverSide ? "thử lại" : status === 200 ? "thành công" : "không thử lại",
        },
        null, `Phản hồi ${status} thuộc nhóm lỗi ${group}.`,
      )),
      entity("policy-server", "policy", "Chính sách · lỗi máy chủ",
        { phase: "thử lại", count: 3, rank: 0, response: 500 }, null, "Mã 5xx thường hết lỗi sau vài giây."),
      entity("policy-client", "policy", "Chính sách · lỗi người gọi",
        { phase: passed ? "trả ngay" : "thử lại", count: 2, rank: 1, response: 404 }, null, "Mã 4xx lặp lại y hệt nếu thử lại."),
    ];
    return {
      entities,
      relations: RETRY_CALLS.map(([id, , , serverSide]) => ({
        id: `policy-${id}`,
        fromEntityId: id,
        toEntityId: serverSide ? "policy-server" : "policy-client",
        kind: "governed-by",
        display: { label: serverSide ? "5xx" : "4xx/200" },
        state: { travelled: serverSide || !passed },
      })),
      events: [
        event(0, "event-batch-loaded", "batch-loaded", "Nạp 6 phản hồi và ngân sách 2 lần thử lại",
          ["retry-1", "retry-2", "retry-3"],
          [
            change("retry-1", "request", "Lượt gọi", null, "Lượt 1 · lưu đơn"),
            change("retry-1", "response", "Mã phản hồi", null, 500),
            change("retry-1", "limit", "Ngân sách thử lại", null, 2),
            change("retry-2", "group", "Nhóm lỗi", null, "người gọi"),
            change("retry-1", "rank", "Thứ tự chính sách", null, 0),
            change("retry-1", "count", "Tổng lượt gọi của mục", null, 3),
          ]),
        event(1, "event-server-errors", "server-retries", "Thử lại ba lỗi máy chủ: 500, 503, 500",
          ["retry-1", "retry-3", "retry-6", "policy-server"],
          [change("retry-3", "retries", "Số lần thử lại", 0, 2)]),
        event(2, "event-client-errors", passed ? "client-short-circuit" : "client-retries",
          passed ? "Trả ngay lỗi 404 và 429 cho phía gọi" : "Thử lại cả 404 và 429 dù kết quả không đổi",
          ["retry-2", "retry-5", "policy-client"],
          [
            change("retry-2", "retries", "Số lần thử lại", 2, passed ? 0 : 2),
            change("retry-5", "retries", "Số lần thử lại", 2, passed ? 0 : 2),
            change("policy-client", "phase", "Cách xử lý", "thử lại", passed ? "trả ngay" : "thử lại"),
          ],
          ids(anchors)),
        event(3, "event-attempts", passed ? "attempts-trimmed" : "attempts-wasted",
          passed ? "Tổng lượt gọi chốt ở 12" : `Tổng lượt gọi vẫn là ${actual}`,
          ["retry-4"],
          [change("retry-4", "count", "Tổng lượt gọi của mục", 1, 1)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("attempts", "Code đang trả", actual, "lượt"),
        metric("expected-attempts", "Cần đạt", 12, "lượt"),
        metric("budget", "Ngân sách mỗi lỗi", 2, "lần"),
        metric("responses", "Số phản hồi", 6),
      ],
      outputs: [output("attempts-report", "Tổng lượt gọi sau chính sách", passed
        ? "12 lượt · chỉ ba lỗi 5xx được thử lại"
        : `${actual} lượt · 404 và 429 tốn thêm 4 lượt mà không đổi kết quả`)],
      controls: stepper("Phát lại từng nhóm phản hồi", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 8. MemoryPool — base: runtime-resource
// ---------------------------------------------------------------------------

const BLOCKS = [
  ["block-1", "Khối 1 · bộ đệm ảnh", 1000],
  ["block-2", "Khối 2 · bảng chỉ mục", 3000],
  ["block-3", "Khối 3 · hàng đợi", 500],
  ["block-4", "Khối 4 · vùng nén", 4096],
  ["block-5", "Khối 5 · nhật ký", 100],
  ["block-6", "Khối 6 · bộ nhớ tạm", 2500],
];

const memoryPool = {
  authored: true,
  productTitle: "MemoryPool",
  id: "memory-pool-per-block",
  display: {
    label: "Cấp trang bộ nhớ theo từng khối",
    description: "Bộ cấp phát đang chia tổng byte cho cỡ trang, nên báo cần 3 trang trong khi thực tế phải cấp 6.",
  },
  domain: "runtime-resource",
  sourceSymbol: "MemoryPool::pagesNeeded",
  sourceLabel: "Hàm tính số trang",
  capability: {
    summary: "Lời giải cũ đã làm tròn lên đúng số trang cho một lượng byte.",
    label: "Làm tròn theo trang",
    claim: "Hàm pagesFor() làm tròn lên số trang cho một khối byte bất kỳ.",
  },
  transformation: {
    oldAssumption: "Các khối được xếp liền nhau nên chia tổng byte cho cỡ trang là đủ.",
    breakingEvent: "Trình cấp phát mới không cho hai khối dùng chung một trang; sáu khối nhỏ vẫn chiếm sáu trang riêng.",
    newCapability: "Cộng số trang của từng khối thay vì cộng byte trước rồi mới chia.",
    observableOutcome: "Preview cho thấy mỗi khối có mức chiếm trang riêng và tổng trang tăng từ 3 lên 6.",
    requirement: "Trả về số trang 4096 byte cần cấp cho sáu khối — bài chạy phải ra 6.",
  },
  learningBridge: {
    intro: "Vẫn là vòng lặp cộng dồn em quen, chỉ khác chỗ gọi pagesFor() sớm hơn một nhịp.",
    familiarCode: `int main() {
  cout << MemoryPool::pagesNeeded(blocks, 4096);
}`,
    editInstruction: stepsFor("memory-pool-runtime"),
    fileRoles: FILE_ROLES("memory-pool-runtime", "MemoryPool", "pagesNeeded()"),
  },
  inputSummary: "Sáu khối (1000, 3000, 500, 4096, 100, 2500 byte), cỡ trang 4096 byte. Cấp riêng từng khối cần 6 trang.",
  buildHarness: harnessFor("memory-pool-runtime"),
  expected: 6,
  redActual: 3,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "runtime-resource", overlays: ["resource-usage", "threshold"], control: "stepper", layout: "balanced" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-shared-page", eventIndex: 2, entityId: "block-5", mappingId,
      label: `Bộ cấp phát mới xin ${actual} trang`,
      description: "Cần 6. Khối 100 byte vẫn phải chiếm trọn một trang; hãy gọi pagesFor() cho từng khối trước khi cộng.",
    });
    const entities = BLOCKS.map(([id, label, bytes]) => entity(
      id, "block", label,
      {
        bytes,
        pages: passed ? 1 : 0,
        used: bytes,
        limit: 4096,
        count: 1,
        group: bytes >= 2500 ? "khối lớn" : "khối nhỏ",
        phase: passed ? "trang riêng" : "gộp chung",
      },
      null, `Khối chiếm ${bytes} byte trong tổng 11196 byte.`,
    ));
    return {
      entities,
      relations: [
        { id: "pool-1", fromEntityId: "block-1", toEntityId: "block-2", kind: "shares-page", display: { label: passed ? "trang riêng" : "chung trang" }, state: { travelled: !passed } },
        { id: "pool-2", fromEntityId: "block-3", toEntityId: "block-5", kind: "shares-page", display: { label: passed ? "trang riêng" : "chung trang" }, state: { travelled: !passed } },
      ],
      events: [
        event(0, "event-pool-loaded", "pool-loaded", "Nạp 6 khối dữ liệu, cỡ trang 4096 byte",
          ["block-1", "block-2", "block-3"],
          [
            change("block-1", "bytes", "Byte của khối", null, 1000),
            change("block-1", "used", "Bộ nhớ khối dùng", null, 1000),
            change("block-1", "limit", "Cỡ một trang", null, 4096),
            change("block-1", "group", "Nhóm khối", null, "khối nhỏ"),
            change("block-1", "count", "Số khối", null, 1),
            change("block-1", "phase", "Cách cấp phát", null, passed ? "trang riêng" : "gộp chung"),
          ]),
        event(1, "event-sum-bytes", "sum-bytes", "Cộng tổng byte của sáu khối: 11196 byte",
          ["block-4", "block-6"],
          [change("block-4", "pages", "Trang khối chiếm", 0, 1)]),
        event(2, "event-per-block", passed ? "pages-per-block" : "pages-merged",
          passed ? "Tính trang riêng cho từng khối" : "Chia tổng byte một lần nên các khối bị gộp chung trang",
          ["block-5", "block-3"],
          [
            change("block-5", "pages", "Trang khối chiếm", 0, passed ? 1 : 0),
            change("block-3", "pages", "Trang khối chiếm", 0, passed ? 1 : 0),
          ],
          ids(anchors)),
        event(3, "event-allocated", passed ? "allocation-correct" : "allocation-short",
          passed ? "Bộ cấp phát xin đủ 6 trang" : `Bộ cấp phát chỉ xin ${actual} trang`,
          ["block-1"],
          [change("block-1", "pages", "Trang khối chiếm", 0, passed ? 1 : 0)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("pages", "Code đang trả", actual, "trang"),
        metric("expected-pages", "Cần đạt", 6, "trang"),
        metric("memory-requested", "Bộ nhớ đã xin", actual * 4096, "byte"),
        metric("memory-used", "Bộ nhớ dữ liệu thật dùng", 11196, "byte"),
        metric("page-size", "Giới hạn mỗi trang", 4096, "byte"),
      ],
      outputs: [output("allocation", "Kết quả cấp phát", passed
        ? "6 trang · mỗi khối một trang riêng · 24576 byte đã xin"
        : `${actual} trang · các khối bị coi là nằm chung trang nên thiếu ${6 - actual} trang`)],
      controls: stepper("Phát lại từng bước cấp phát", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 9. OrderFlow — base: state-machine
// ---------------------------------------------------------------------------

const ORDER_STATES = [
  ["state-pending", "Chờ xác nhận", "cho-xac-nhan", 0, 0, 18, 0],
  ["state-packing", "Đang đóng gói", "dang-goi", 1, 1, 12, 1],
  ["state-shipping", "Đang giao", "dang-giao", 2, 0, 9, 2],
  ["state-delivered", "Đã giao", "da-giao", 3, 1, 41, 3],
  ["state-failed", "Giao thất bại", "giao-that-bai", 4, 0, 3, 4],
  ["state-returned", "Hoàn hàng", "hoan-hang", 4, 2, 5, 5],
];

const orderFlow = {
  authored: true,
  productTitle: "OrderFlow",
  id: "order-flow-return-step",
  display: {
    label: "Mở bước hoàn hàng sau khi đã giao",
    description: "Bảng trạng thái đơn coi 'đã giao' là điểm cuối, nên yêu cầu hoàn hàng của khách bị hệ thống từ chối.",
  },
  domain: "state-machine",
  sourceSymbol: "OrderFlow::allowed",
  sourceLabel: "Bảng chuyển trạng thái",
  capability: {
    summary: "Lời giải cũ đã dò được một bước chuyển có nằm trong bảng hay không.",
    label: "Kiểm tra bước chuyển",
    claim: "Hàm canTransition() duyệt bảng allowed() để xác nhận một bước chuyển.",
  },
  transformation: {
    oldAssumption: "Đơn đã giao là điểm cuối, không còn bước chuyển nào phía sau.",
    breakingEvent: "Chính sách mới cho khách hoàn hàng trong 7 ngày, nên 'đã giao → hoàn hàng' phải là bước hợp lệ.",
    newCapability: "Chấp nhận bước hoàn hàng sau khi giao, vẫn chặn bước quay ngược về chờ xác nhận.",
    observableOutcome: "Preview cho thấy mũi tên 'Đã giao → Hoàn hàng' được nối và số bước hợp lệ tăng từ 3 lên 4.",
    requirement: "Trả về số bước chuyển hợp lệ trong sáu lần thử — bài chạy phải ra 4.",
  },
  learningBridge: {
    intro: "Bảng chuyển trạng thái chỉ là một danh sách cặp; thêm một cặp là thêm một bước hợp lệ.",
    familiarCode: `int main() {
  if (OrderFlow::canTransition(from, to)) ++valid;
}`,
    editInstruction: stepsFor("order-flow-state"),
    fileRoles: FILE_ROLES("order-flow-state", "OrderFlow", "allowed()"),
  },
  inputSummary: "Sáu trạng thái đơn hàng và sáu lần thử chuyển. Bốn bước phải hợp lệ, hai bước (quay về chờ xác nhận, hoàn hàng → đang giao) phải bị chặn.",
  buildHarness: harnessFor("order-flow-state"),
  expected: 4,
  redActual: 3,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "state-machine", overlays: ["dependency", "diff"], control: "stepper", layout: "balanced" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-return-blocked", eventIndex: 2, entityId: "state-returned", mappingId,
      label: `Bước hoàn hàng vẫn bị từ chối`,
      description: `Số bước hợp lệ cần là 4, hiện là ${actual}. Bảng allowed() chưa có cặp {"da-giao", "hoan-hang"}.`,
    });
    const entities = ORDER_STATES.map(([id, label, code, x, y, orders, rank]) => entity(
      id, "state", label,
      {
        phase: id === "state-returned" && !passed ? "chưa mở" : "đang dùng",
        stateName: code,
        text: label,
        count: orders,
        rank,
        reachable: id === "state-returned" ? (passed ? "có lối vào" : "không có lối vào") : "có lối vào",
      },
      { x, y }, `Hiện có ${orders} đơn đang ở trạng thái này.`,
    ));
    return {
      entities,
      relations: [
        { id: "tr-pending-packing", fromEntityId: "state-pending", toEntityId: "state-packing", kind: "transition", display: { label: "xác nhận" }, state: { travelled: true } },
        { id: "tr-packing-shipping", fromEntityId: "state-packing", toEntityId: "state-shipping", kind: "transition", display: { label: "bàn giao" }, state: { travelled: true } },
        { id: "tr-shipping-delivered", fromEntityId: "state-shipping", toEntityId: "state-delivered", kind: "transition", display: { label: "giao xong" }, state: { travelled: true } },
        { id: "tr-shipping-failed", fromEntityId: "state-shipping", toEntityId: "state-failed", kind: "transition", display: { label: "giao hụt" }, state: { travelled: false } },
        { id: "tr-delivered-returned", fromEntityId: "state-delivered", toEntityId: "state-returned", kind: "transition", display: { label: passed ? "hoàn hàng" : "chưa mở" }, state: { travelled: passed, failed: !passed } },
      ],
      events: [
        event(0, "event-flow-loaded", "flow-loaded", "Nạp vòng đời đơn hàng với 6 trạng thái",
          ["state-pending", "state-packing", "state-shipping"],
          [
            change("state-pending", "phase", "Tình trạng trạng thái", null, "đang dùng"),
            change("state-pending", "stateName", "Mã trạng thái", null, "cho-xac-nhan"),
            change("state-pending", "text", "Tên hiển thị", null, "Chờ xác nhận"),
            change("state-pending", "count", "Số đơn đang ở", null, 18),
            change("state-pending", "rank", "Thứ tự trong vòng đời", null, 0),
            change("state-returned", "reachable", "Lối vào trạng thái", null, passed ? "có lối vào" : "không có lối vào"),
          ]),
        event(1, "event-forward-steps", "forward-steps", "Ba bước tiến đầu tiên đều hợp lệ",
          ["state-pending", "state-packing", "state-shipping", "state-delivered"],
          [change("state-delivered", "count", "Số đơn đang ở", 41, 41)]),
        event(2, "event-return-request", passed ? "return-allowed" : "return-rejected",
          passed ? "Chấp nhận yêu cầu hoàn hàng sau khi đã giao" : "Từ chối yêu cầu hoàn hàng vì bảng chưa có bước này",
          ["state-delivered", "state-returned"],
          [
            change("state-returned", "phase", "Tình trạng trạng thái", "chưa mở", passed ? "đang dùng" : "chưa mở"),
            change("state-returned", "reachable", "Lối vào trạng thái", "không có lối vào", passed ? "có lối vào" : "không có lối vào"),
          ],
          ids(anchors)),
        event(3, "event-illegal-step", passed ? "illegal-blocked" : "illegal-blocked",
          "Chặn đúng bước quay ngược từ Đã giao về Chờ xác nhận",
          ["state-delivered", "state-pending"],
          [change("state-pending", "count", "Số đơn đang ở", 18, 18)],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("valid-steps", "Code đang trả", actual, "bước"),
        metric("expected-steps", "Cần đạt", 4, "bước"),
        metric("attempts", "Số lần thử chuyển", 6),
        metric("states", "Số trạng thái", 6),
      ],
      outputs: [output("flow", "Kết quả kiểm tra vòng đời", passed
        ? "4 bước hợp lệ · đã mở Đã giao → Hoàn hàng · vẫn chặn hai bước sai"
        : `${actual} bước hợp lệ · yêu cầu hoàn hàng của khách bị từ chối`)],
      controls: stepper("Phát lại từng bước chuyển", 4),
    };
  },
};

// ---------------------------------------------------------------------------
// 10. LedgerAudit — base: table
// ---------------------------------------------------------------------------

const LEDGER_ROWS = [
  ["row-1", "Ngày 01 · bán lẻ", 1200, 1200],
  ["row-2", "Ngày 02 · bán buôn", 800, 950],
  ["row-3", "Ngày 03 · hoàn tiền", 2400, 2310],
  ["row-4", "Ngày 04 · bán lẻ", 500, 500],
  ["row-5", "Ngày 05 · bán buôn", 1750, 1900],
  ["row-6", "Ngày 06 · phí dịch vụ", 620, 500],
];

const ledgerAudit = {
  authored: true,
  productTitle: "LedgerAudit",
  id: "ledger-audit-signed-gap",
  display: {
    label: "Soát cả phần ngân hàng ghi thiếu",
    description: "Bảng đối soát chỉ cộng khi ngân hàng ghi nhiều hơn sổ, nên 210 nghìn ghi thiếu bị bỏ qua.",
  },
  domain: "table",
  sourceSymbol: "LedgerAudit::mismatchTotal",
  sourceLabel: "Hàm cộng chênh lệch",
  capability: {
    summary: "Lời giải cũ đã tính đúng chênh lệch của từng dòng.",
    label: "Tính chênh lệch dòng",
    claim: "Hàm gap() lấy hiệu giữa sao kê ngân hàng và sổ nội bộ.",
  },
  transformation: {
    oldAssumption: "Chỉ cần soát khi ngân hàng ghi nhiều hơn sổ nội bộ.",
    breakingEvent: "Kiểm toán phát hiện hai ngày ngân hàng ghi THIẾU 90 và 120 so với sổ; bảng đối soát vẫn báo khớp.",
    newCapability: "Cộng chênh lệch theo trị tuyệt đối để lệch hai chiều đều lộ ra.",
    observableOutcome: "Preview cho thấy hai dòng âm đổi từ 'bỏ qua' sang 'đã soát' và tổng tăng từ 300 lên 510.",
    requirement: "Trả về tổng chênh lệch tuyệt đối của sáu dòng sổ — bài chạy phải ra 510.",
  },
  learningBridge: {
    intro: "Vẫn là cộng dồn trong vòng lặp; chỉ đổi cách lấy giá trị cộng vào.",
    familiarCode: `int main() {
  cout << LedgerAudit::mismatchTotal(rows);
}`,
    editInstruction: stepsFor("ledger-audit-table"),
    fileRoles: FILE_ROLES("ledger-audit-table", "LedgerAudit", "mismatchTotal()"),
  },
  inputSummary: "Sáu dòng sổ. Ngân hàng ghi dư 150 và 150, ghi thiếu 90 và 120, hai dòng khớp. Tổng lệch tuyệt đối là 510.",
  buildHarness: harnessFor("ledger-audit-table"),
  expected: 510,
  redActual: 300,
  parse: (out) => Number(String(out).trim()),
  recipe: { base: "table", overlays: ["diff", "compare"], control: "stepper", layout: "wide" },
  model({ actual, passed, mappingId }) {
    const anchors = anchorOn(passed, {
      id: "anchor-negative-gap", eventIndex: 2, entityId: "row-3", mappingId,
      label: `Tổng lệch mới có ${actual} nghìn`,
      description: "Cần 510. Hai dòng ngân hàng ghi thiếu (-90 và -120) đang bị điều kiện difference > 0 loại khỏi tổng.",
    });
    const entities = LEDGER_ROWS.map(([id, label, book, bank]) => {
      const gap = bank - book;
      const counted = gap > 0 || (passed && gap !== 0);
      return entity(
        id, "row", label,
        {
          book,
          bank,
          gap,
          previousValue: book,
          counted: counted ? "đã soát" : gap === 0 ? "khớp" : "bỏ qua",
          group: gap === 0 ? "khớp" : gap > 0 ? "ngân hàng ghi dư" : "ngân hàng ghi thiếu",
          count: counted ? Math.abs(gap) : 0,
        },
        null, `Sổ ghi ${book}, sao kê ghi ${bank}.`,
      );
    });
    return {
      entities,
      relations: [],
      events: [
        event(0, "event-ledger-loaded", "ledger-loaded", "Nạp 6 dòng sổ và sao kê ngân hàng tương ứng",
          ["row-1", "row-2", "row-3"],
          [
            change("row-2", "book", "Sổ nội bộ", null, 800),
            change("row-2", "bank", "Sao kê ngân hàng", null, 950),
            change("row-2", "gap", "Chênh lệch", null, 150),
            change("row-2", "previousValue", "Giá trị đối chiếu", null, 800),
            change("row-2", "group", "Loại lệch", null, "ngân hàng ghi dư"),
            change("row-2", "count", "Phần đưa vào tổng", null, 150),
          ]),
        event(1, "event-positive-gaps", "positive-gaps", "Cộng hai dòng ngân hàng ghi dư: 150 và 150",
          ["row-2", "row-5"],
          [change("row-5", "counted", "Trạng thái soát", "bỏ qua", "đã soát")]),
        event(2, "event-negative-gaps", passed ? "negative-counted" : "negative-skipped",
          passed ? "Cộng tiếp hai dòng ngân hàng ghi thiếu: 90 và 120" : "Bỏ qua hai dòng ngân hàng ghi thiếu",
          ["row-3", "row-6"],
          [
            change("row-3", "counted", "Trạng thái soát", "bỏ qua", passed ? "đã soát" : "bỏ qua"),
            change("row-6", "counted", "Trạng thái soát", "bỏ qua", passed ? "đã soát" : "bỏ qua"),
            change("row-3", "count", "Phần đưa vào tổng", 0, passed ? 90 : 0),
          ],
          ids(anchors)),
        event(3, "event-audit-total", passed ? "audit-complete" : "audit-partial",
          passed ? "Tổng lệch chốt ở 510 nghìn" : `Tổng lệch vẫn là ${actual} nghìn`,
          ["row-1", "row-4"],
          [change("row-1", "counted", "Trạng thái soát", "khớp", "khớp")],
          ids(anchors)),
      ],
      anchors,
      metrics: [
        metric("mismatch-total", "Code đang trả", actual, "nghìn"),
        metric("expected-total", "Cần đạt", 510, "nghìn"),
        metric("rows", "Số dòng sổ", 6),
        metric("missed", "Phần còn bỏ sót", passed ? 0 : 210, "nghìn"),
      ],
      outputs: [output("audit", "Kết quả đối soát", passed
        ? "510 nghìn lệch · đã soát cả hai chiều · 2 dòng khớp"
        : `${actual} nghìn lệch · còn bỏ sót 210 nghìn ngân hàng ghi thiếu`)],
      controls: stepper("Phát lại từng nhóm dòng sổ", 4),
    };
  },
};

const authoredArcs = {
  "build-order-tree": buildOrderTree,
  "prefix-router-tree": prefixRouter,
  "shift-planner-timeline": shiftPlanner,
  "sweep-monitor-timeline": sweepMonitor,
  "field-survey-geometry": fieldSurvey,
  "api-gateway-exchange": apiGateway,
  "retry-budget-exchange": retryBudget,
  "memory-pool-runtime": memoryPool,
  "order-flow-state": orderFlow,
  "ledger-audit-table": ledgerAudit,
};

module.exports = { authoredArcs };
