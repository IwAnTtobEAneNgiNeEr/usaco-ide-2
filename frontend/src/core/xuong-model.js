// xuong-model.js — pure normalizers + a localStorage-backed fixture engine for
// the Xưởng (Build) surface. Shapes follow docs/XUONG-API-CONTRACT.md exactly:
// the UI is built against THESE normalizers, so when the real /api/xuong/*
// routes land, api.js flips from fixtures to fetch and nothing else changes.
//
// The fixture engine is NOT a mock left to rot: it is the offline/no-backend
// fallback (same doctrine as every AI feature degrading gracefully without a
// key). It simulates analyze/select/verify/evolve deterministically so the
// full S4→S5 flow is walkable and testable without AI or the new routes.

const VN_STATUS = Object.freeze({
  "work": "Đang build",
  "needs-verification": "Chờ kiểm chứng",
  "needs-work": "Cần sửa",
  "verified": "Đã kiểm chứng",
  "evolving": "Đang tiến hóa",
});

const VN_TARGET = Object.freeze({
  cpp: "C++",
  frontend: "Web · sắp có",
  backend: "Backend · sắp có",
  python: "Python · sắp có",
});

const VN_EVIDENCE_KIND = Object.freeze({
  "compile": "Biên dịch",
  "unit-test": "Unit test",
  "benchmark": "Benchmark",
  "simulation": "Mô phỏng",
});

const VN_REQUIREMENT = Object.freeze({
  pending: "Chưa tới",
  active: "Đang làm",
  met: "Đạt",
  failing: "Đang fail",
});

const text = (v, max = 2000) => String(v == null ? "" : v).trim().slice(0, max);
const list = (v) => (Array.isArray(v) ? v : []);
const strings = (v, max = 12) => list(v).map((s) => text(s, 400)).filter(Boolean).slice(0, max);

export function statusLabel(status) { return VN_STATUS[status] || VN_STATUS.work; }
export function targetLabel(target) { return VN_TARGET[target] || target || "C++"; }
export function evidenceKindLabel(kind) { return VN_EVIDENCE_KIND[kind] || kind || "Kiểm chứng"; }
export function requirementLabel(status) { return VN_REQUIREMENT[status] || status || ""; }

export function normalizePathway(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const p = {
    id: text(raw.id, 80) || `pathway-${index + 1}`,
    title: text(raw.title, 160),
    purpose: text(raw.purpose, 800),
    context: text(raw.context, 1000),
    application: text(raw.application, 1000),
    target: ["cpp", "frontend", "backend", "python"].includes(raw.target) ? raw.target : "cpp",
    seedId: text(raw.seedId || raw.templateId, 100),
    deliverables: strings(raw.deliverables, 8),
    verification: text(raw.verification, 500),
    tasks: strings(raw.tasks),
    contractCriteria: strings(raw.contractCriteria),
  };
  return p.title && p.purpose && p.context && p.application ? p : null;
}

export function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const analysis = raw.analysis && typeof raw.analysis === "object" ? raw.analysis : {};
  return {
    id: text(raw.id, 100),
    status: raw.status === "selected" ? "selected" : "analyzed",
    origin: raw.origin && typeof raw.origin === "object" ? raw.origin : { type: "direct-input" },
    analysis: {
      summary: text(analysis.summary, 1800),
      concepts: strings(analysis.concepts, 8),
      constraints: strings(analysis.constraints, 8),
      evidenceRefs: strings(analysis.evidenceRefs, 8),
    },
    pathways: list(raw.pathways).map(normalizePathway).filter(Boolean).slice(0, 5),
    selectedPathwayId: raw.selectedPathwayId || null,
    projectId: raw.projectId || null,
  };
}

export function normalizeRequirement(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: text(raw.id, 80) || `req-${index + 1}`,
    summary: text(raw.summary, 500),
    status: ["pending", "active", "met", "failing"].includes(raw.status) ? raw.status : "pending",
    verifierIds: strings(raw.verifierIds, 12),
  };
}

export function normalizeEvidence(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: text(raw.id, 80) || `ev-${index + 1}`,
    at: text(raw.at, 40),
    kind: ["compile", "unit-test", "benchmark", "simulation"].includes(raw.kind) ? raw.kind : "unit-test",
    outcome: raw.outcome === "pass" ? "pass" : "fail",
    durationMs: Number(raw.durationMs) || 0,
    detail: text(raw.detail, 2000),
    requirementId: raw.requirementId || null,
  };
}

export function normalizeDemoRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: text(raw.id, 100),
    at: text(raw.at, 40),
    status: raw.status === "completed" ? "completed" : "failed",
    durationMs: Number(raw.durationMs) || 0,
    output: text(raw.output, 12000),
    detail: text(raw.detail, 12000),
  };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pathway = raw.pathway && typeof raw.pathway === "object" ? raw.pathway : {};
  return {
    id: text(raw.id, 100),
    title: text(raw.title, 200),
    status: Object.keys(VN_STATUS).includes(raw.status) ? raw.status : "work",
    pathway: {
      id: text(pathway.id, 80),
      title: text(pathway.title, 160),
      purpose: text(pathway.purpose, 800),
      context: text(pathway.context, 1000) || text(raw.brief && raw.brief.context, 1000) || text(pathway.purpose, 800),
      application: text(pathway.application, 1000) || text(raw.brief && raw.brief.application, 1000) || text(pathway.purpose, 800),
      target: pathway.target || "cpp",
    },
    brief: {
      context: text(raw.brief && raw.brief.context, 1200) || text(pathway.context || pathway.purpose, 1200),
      application: text(raw.brief && raw.brief.application, 1200) || text(pathway.application || pathway.purpose, 1200),
      mission: text(raw.brief && raw.brief.mission, 1200) || text(list(raw.requirements)[0] && list(raw.requirements)[0].summary, 1200),
      acceptance: text(raw.brief && raw.brief.acceptance, 1200) || "Compiler và verifier thật xác nhận toàn bộ yêu cầu.",
    },
    files: list(raw.files).map((f) => ({
      path: text(f && f.path, 200),
      label: text(f && (f.label || f.path), 200),
      editable: (f && f.editable) !== false,
      source: f && typeof f.source === "string" ? f.source : undefined,
    })).filter((f) => f.path),
    requirements: list(raw.requirements).map(normalizeRequirement).filter(Boolean),
    evidence: list(raw.evidence).map(normalizeEvidence).filter(Boolean),
    demo: {
      title: text(raw.demo && raw.demo.title, 240) || "Bản demo lõi",
      description: text(raw.demo && raw.demo.description, 1000) || "Chạy source hiện tại để quan sát sản phẩm.",
      actionLabel: "Chạy demo",
      latestRun: normalizeDemoRun(raw.demo && raw.demo.latestRun),
    },
    milestones: list(raw.milestones).map((milestone) => ({
      id: text(milestone && milestone.id, 80),
      title: text(milestone && milestone.title, 200),
      description: text(milestone && milestone.description, 600),
      status: ["active", "done", "locked"].includes(milestone && milestone.status) ? milestone.status : "locked",
    })).filter((milestone) => milestone.id && milestone.title),
    nextAction: {
      label: text(raw.nextAction && raw.nextAction.label, 160) || "Mở project",
      reason: text(raw.nextAction && raw.nextAction.reason, 400),
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture engine (no-backend fallback)
// ---------------------------------------------------------------------------

const STORE_KEY = "usaco.xuong.fixture.v1";

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { projects: {}, sessions: {} }; }
  catch { return { projects: {}, sessions: {} }; }
}
function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* best effort */ }
}
const uid = (prefix) => `${prefix}-fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Deterministic-ish pathway synthesis from the problem's topic/title so two
// different problems visibly produce DIFFERENT pathways (contract rule 1),
// even in fixture mode.
function fixturePathways(origin) {
  const t = `${origin.title || ""}`.toLocaleLowerCase("vi");
  const flavor = /bfs|mê cung|maze|đường đi|grid/.test(t) ? "grid"
    : /dijkstra|trọng số|weight|route|ngắn nhất/.test(t) ? "route"
    : /tổng|sum|prefix|đoạn|mảng/.test(t) ? "range" : "generic";
  const base = {
    grid: [
      { title: "Bộ giải mê cung tái sử dụng", purpose: "Đóng gói BFS của em thành module tìm đường trên lưới, xử lý tường, biên và ô không tới được.", seedId: "grid-pathfinder", verification: "Bộ unit test lưới: kề nhau, cùng ô, bị chặn, không tới được." },
      { title: "Flood fill cho ảnh bitmap", purpose: "Dùng chính BFS đó để tô vùng liên thông — nền của công cụ xử lý ảnh.", seedId: "grid-pathfinder", verification: "Test tô vùng: vùng kín, vùng chạm biên, ảnh 1×1." },
      { title: "Robot dò kho hàng", purpose: "Mô phỏng robot đi trong kho có kệ chắn, trả về đường ngắn nhất từng bước.", seedId: "grid-pathfinder", verification: "Mô phỏng 20 layout kho, so path với đáp án chuẩn." },
    ],
    route: [
      { title: "Route planner cho bản đồ nhỏ", purpose: "Biến Dijkstra của em thành bộ định tuyến có addEdge/updateEdge và tái dựng đường đi.", seedId: "weighted-graph-router", verification: "Unit test: đường ngắn nhất, cùng đỉnh, không tới được, cập nhật cạnh." },
      { title: "Bộ cân bằng tải giả lập", purpose: "Dùng shortest-path làm lõi chọn server có chi phí thấp nhất trong cụm giả lập.", seedId: "weighted-graph-router", verification: "Mô phỏng 100 request, kiểm tổng chi phí so với brute force." },
      { title: "Phân tích phụ thuộc build", purpose: "Đồ thị có trọng số thành thời gian build — tìm chuỗi phụ thuộc đắt nhất.", seedId: "weighted-graph-router", verification: "Unit test trên DAG mẫu, so critical path với đáp án tay." },
    ],
    range: [
      { title: "Thư viện thống kê đoạn", purpose: "Đóng gói prefix sum thành API truy vấn đoạn 0-based/1-based rõ ràng, có xử lý biên.", seedId: "range-sum-module", verification: "Unit test: đoạn rỗng, một phần tử, biên trái/phải, số âm." },
      { title: "Bảng điểm realtime", purpose: "Truy vấn tổng/trung bình điểm theo khoảng thời gian — thêm yêu cầu update điểm.", seedId: "range-sum-module", verification: "Unit test truy vấn + update xen kẽ, so với tính lại từ đầu." },
      { title: "Phát hiện đoạn bất thường", purpose: "Dùng tổng đoạn để quét cửa sổ trượt tìm đoạn vượt ngưỡng trong dữ liệu cảm biến.", seedId: "range-sum-module", verification: "Test trên chuỗi cảm biến mẫu có đoạn bất thường đã đánh dấu." },
    ],
    generic: [
      { title: "Đóng gói lời giải thành thư viện", purpose: "Tách phần lõi thuật toán của em thành module .hpp/.cpp có interface rõ và test riêng.", seedId: "grid-pathfinder", verification: "Bộ unit test bao phủ happy path + 3 ca biên." },
      { title: "Công cụ dòng lệnh từ lời giải", purpose: "Bọc lời giải thành CLI đọc file, báo lỗi input tử tế thay vì crash.", seedId: "range-sum-module", verification: "Test CLI với input hợp lệ, input rỗng, input hỏng." },
      { title: "Bộ sinh dữ liệu kiểm thử", purpose: "Từ ràng buộc của đề, viết generator sinh test có kiểm soát để stress chính lời giải.", seedId: "weighted-graph-router", verification: "Generator chạy 50 seed không sinh input phạm ràng buộc." },
    ],
  };
  return base[flavor].map((p, i) => ({
    ...p, id: `fx-${flavor}-${i + 1}`, target: "cpp",
    context: `Một nhóm vận hành cần ${p.purpose.charAt(0).toLocaleLowerCase("vi")}${p.purpose.slice(1)} Thử từng phương án bằng tay sẽ chậm và dễ sai.`,
    application: `Thuật toán trong lời giải đảm nhiệm phần ra quyết định cốt lõi: ${p.purpose.charAt(0).toLocaleLowerCase("vi")}${p.purpose.slice(1)}`,
    deliverables: ["Interface .hpp", "Triển khai .cpp", "Bộ test chạy được"],
    tasks: ["Đọc brief và interface", "Hoàn thiện phần triển khai", "Chạy verify tới khi xanh", "Nhận yêu cầu tiến hóa đầu tiên"],
    contractCriteria: ["Biên dịch sạch với -Wall", "Toàn bộ unit test pass", "Không đổi chữ ký interface"],
  }));
}

const FIXTURE_FILES = {
  "grid-pathfinder": [
    { path: "GridPathfinder.hpp", editable: false, source: "#pragma once\n#include <string>\n#include <utility>\n#include <vector>\n\n// Interface cố định — verify chấm dựa trên chữ ký này.\nclass GridPathfinder {\npublic:\n  // Trả về số bước ngắn nhất từ start tới target, -1 nếu không tới được\n  // hoặc input không hợp lệ. '#' là tường.\n  static int shortestPath(const std::vector<std::string>& grid,\n                          std::pair<int,int> start,\n                          std::pair<int,int> target);\n};\n" },
    { path: "GridPathfinder.cpp", editable: true, source: "#include \"GridPathfinder.hpp\"\n#include <queue>\n\nint GridPathfinder::shortestPath(const std::vector<std::string>& grid,\n                                 std::pair<int,int> start,\n                                 std::pair<int,int> target) {\n  // TODO: chuyển BFS từ lời giải của em vào đây.\n  // Nhớ: grid rỗng / start ngoài biên / target là tường → -1.\n  (void)grid; (void)start; (void)target;\n  return -1;\n}\n" },
    { path: "tests/baseline.cpp", editable: false, source: "// Bộ test baseline — verify biên dịch và chạy file này.\n// Ca chính: kề nhau=1, cùng ô=0, bị tường chặn=-1, grid rỗng=-1.\n#include \"../GridPathfinder.hpp\"\n#include <cassert>\nint main() {\n  assert(GridPathfinder::shortestPath({\"..\", \"..\"}, {0,0}, {0,1}) == 1);\n  assert(GridPathfinder::shortestPath({\"..\", \"..\"}, {0,0}, {0,0}) == 0);\n  assert(GridPathfinder::shortestPath({\".#\", \"#.\"}, {0,0}, {1,1}) == -1);\n  assert(GridPathfinder::shortestPath({}, {0,0}, {0,0}) == -1);\n  return 0;\n}\n" },
  ],
  "weighted-graph-router": [
    { path: "WeightedGraphRouter.hpp", editable: false, source: "#pragma once\n#include <vector>\n\nclass WeightedGraphRouter {\npublic:\n  explicit WeightedGraphRouter(int nodeCount);\n  void addDirectedEdge(int from, int to, long long weight);\n  // {distance, path}; distance=-1 nếu không tới được.\n  std::pair<long long, std::vector<int>> shortestPath(int start, int target);\n};\n" },
    { path: "WeightedGraphRouter.cpp", editable: true, source: "#include \"WeightedGraphRouter.hpp\"\n\nWeightedGraphRouter::WeightedGraphRouter(int nodeCount) { (void)nodeCount; }\nvoid WeightedGraphRouter::addDirectedEdge(int from, int to, long long weight) {\n  // TODO: lưu cạnh.\n  (void)from; (void)to; (void)weight;\n}\nstd::pair<long long, std::vector<int>> WeightedGraphRouter::shortestPath(int start, int target) {\n  // TODO: Dijkstra của em vào đây, kèm tái dựng path.\n  (void)start; (void)target;\n  return {-1, {}};\n}\n" },
    { path: "tests/baseline.cpp", editable: false, source: "#include \"../WeightedGraphRouter.hpp\"\n#include <cassert>\nint main() {\n  WeightedGraphRouter r(3);\n  r.addDirectedEdge(0, 1, 4);\n  r.addDirectedEdge(1, 2, 7);\n  auto [d, path] = r.shortestPath(0, 2);\n  assert(d == 11);\n  assert((path == std::vector<int>{0, 1, 2}));\n  return 0;\n}\n" },
  ],
  "range-sum-module": [
    { path: "RangeSum.hpp", editable: false, source: "#pragma once\n#include <cstddef>\n#include <vector>\n\nclass RangeSum {\npublic:\n  explicit RangeSum(std::vector<long long> values);\n  long long queryZeroBased(std::size_t l, std::size_t r) const; // inclusive\n  long long queryOneBased(std::size_t l, std::size_t r) const;  // inclusive\n};\n" },
    { path: "RangeSum.cpp", editable: true, source: "#include \"RangeSum.hpp\"\n#include <stdexcept>\n\nRangeSum::RangeSum(std::vector<long long> values) {\n  // TODO: dựng prefix sum.\n  (void)values;\n}\nlong long RangeSum::queryZeroBased(std::size_t l, std::size_t r) const {\n  // TODO. Biên sai → throw std::out_of_range.\n  (void)l; (void)r;\n  return 0;\n}\nlong long RangeSum::queryOneBased(std::size_t l, std::size_t r) const {\n  (void)l; (void)r;\n  return 0;\n}\n" },
    { path: "tests/baseline.cpp", editable: false, source: "#include \"../RangeSum.hpp\"\n#include <cassert>\nint main() {\n  RangeSum rs({1, 2, 3, 4});\n  assert(rs.queryZeroBased(0, 3) == 10);\n  assert(rs.queryZeroBased(1, 2) == 5);\n  assert(rs.queryOneBased(1, 4) == 10);\n  return 0;\n}\n" },
  ],
};

export const fixtureXuong = {
  async analyze({ problemId, title }) {
    const store = loadStore();
    const origin = problemId ? { type: "problem", problemId, title: title || problemId } : { type: "direct-input" };
    const session = {
      id: uid("session"),
      status: "analyzed",
      origin,
      analysis: {
        summary: origin.title
          ? `Đã đọc lời giải "${origin.title}" — phần lõi tái sử dụng được và có thể phát triển theo ${3} hướng dưới đây.`
          : "Đã phân tích input — chọn một hướng để dựng project.",
        concepts: [],
        constraints: ["Giữ nguyên độ phức tạp của lời giải gốc", "Interface phải có xử lý input không hợp lệ"],
        evidenceRefs: problemId ? [`problem:${problemId}:verdict:AC`] : [],
      },
      pathways: fixturePathways(origin),
      selectedPathwayId: null,
      projectId: null,
    };
    store.sessions[session.id] = session;
    saveStore(store);
    return { session };
  },

  async select(sessionId, pathwayId) {
    const store = loadStore();
    const session = store.sessions[sessionId];
    if (!session) throw new Error("Session không tồn tại (fixture).");
    const pathway = (session.pathways || []).find((p) => p.id === pathwayId);
    if (!pathway) throw new Error("Pathway không tồn tại (fixture).");
    const files = (FIXTURE_FILES[pathway.seedId] || FIXTURE_FILES["grid-pathfinder"])
      .map((f) => ({ ...f, label: f.path }))
      .concat({
        path: "demo/main.cpp",
        label: "Demo · demo/main.cpp",
        editable: false,
        source: "// Fixture: backend thật sẽ cung cấp harness demo C++ đọc được.\n",
      });
    const project = {
      id: uid("project"),
      title: pathway.title,
      status: "work",
      pathway: {
        id: pathway.id,
        title: pathway.title,
        purpose: pathway.purpose,
        context: pathway.context,
        application: pathway.application,
        target: pathway.target,
      },
      brief: {
        context: pathway.context,
        application: pathway.application,
        mission: pathway.tasks[0],
        acceptance: pathway.verification,
      },
      files,
      requirements: [
        { id: "req-1", summary: pathway.contractCriteria[1] || "Toàn bộ unit test baseline pass.", status: "active", verifierIds: [] },
        { id: "req-2", summary: "Xử lý input không hợp lệ không được crash.", status: "pending", verifierIds: [] },
      ],
      evidence: [],
      demo: {
        title: "Bản demo lõi của sản phẩm",
        description: "Quan sát dữ liệu đi qua thuật toán và trở thành một kết quả có ích cho người dùng.",
        actionLabel: "Chạy demo",
        latestRun: null,
      },
      milestones: [
        { id: "understand-demo", title: "1. Hiểu sản phẩm", description: "Chạy demo và đọc vai trò của thuật toán.", status: "active" },
        { id: "build-core", title: "2. Hoàn thiện lõi", description: "Sửa code rồi Verify.", status: "locked" },
        { id: "evolve-product", title: "3. Tiến hóa sản phẩm", description: "Nhận yêu cầu mới sau evidence pass.", status: "locked" },
      ],
      nextAction: { label: "Chạy demo", reason: "Xem sản phẩm hoạt động trước khi sửa code." },
      createdAt: new Date().toISOString(),
    };
    session.status = "selected";
    session.selectedPathwayId = pathwayId;
    session.projectId = project.id;
    store.projects[project.id] = project;
    saveStore(store);
    return { session, project };
  },

  async listProjects() {
    const store = loadStore();
    const projects = Object.values(store.projects)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((p) => ({ ...p, files: p.files.map(({ source, ...rest }) => rest) }));
    return { projects };
  },

  async getProject(id) {
    const store = loadStore();
    const project = store.projects[id];
    if (!project) throw new Error("Project không tồn tại (fixture).");
    return { project };
  },

  async saveFile(id, path, source) {
    const store = loadStore();
    const project = store.projects[id];
    if (!project) throw new Error("Project không tồn tại (fixture).");
    const file = project.files.find((f) => f.path === path);
    if (!file) throw new Error("File không tồn tại trong project (fixture).");
    if (!file.editable) throw new Error("File này là hợp đồng cố định — không sửa được.");
    file.source = String(source || "");
    project.status = "needs-verification";
    project.nextAction = { label: "Chạy verify", reason: "Code vừa đổi, chưa có bằng chứng mới." };
    saveStore(store);
    return { project };
  },

  async demo(id) {
    const store = loadStore();
    const project = store.projects[id];
    if (!project) throw new Error("Project không tồn tại (fixture).");
    const demoRun = {
      id: uid("demo"),
      at: new Date().toISOString(),
      status: "completed",
      durationMs: 0,
      output: "[FIXTURE — backend /api/xuong chưa chạy]\nTINH_HUONG: Sản phẩm cần xử lý một nhu cầu thật.\nVAI_TRO_THUAT_TOAN: Biến input thành quyết định mà sản phẩm cần.",
      detail: "Bản xem trước giao diện; backend thật mới compile và chạy C++.",
    };
    project.demo.latestRun = demoRun;
    project.milestones[0].status = "done";
    project.milestones[1].status = "active";
    project.nextAction = { label: "Hoàn thiện lõi", reason: "Em đã xem demo; tiếp theo sửa code rồi Verify." };
    saveStore(store);
    return { project, demoRun };
  },

  // Fixture verify: no g++ in the browser — it greps for a leftover TODO as an
  // honest stand-in ("chưa làm thì fail, có làm thì pass") and says so in the
  // evidence detail, so nobody mistakes it for the real verifier.
  async verify(id) {
    const store = loadStore();
    const project = store.projects[id];
    if (!project) throw new Error("Project không tồn tại (fixture).");
    const impl = project.files.find((f) => f.editable) || {};
    const untouched = /TODO:/.test(impl.source || "");
    const active = project.requirements.find((r) => r.status === "active" || r.status === "failing");
    const ev = {
      id: uid("ev"),
      at: new Date().toISOString(),
      kind: "unit-test",
      outcome: untouched ? "fail" : "pass",
      durationMs: 0,
      detail: untouched
        ? `[FIXTURE — backend /api/xuong chưa chạy, đây KHÔNG phải g++ thật] ${impl.path || "impl"} vẫn còn khung TODO — bộ test baseline chắc chắn fail. Hoàn thiện phần triển khai rồi verify lại.`
        : `[FIXTURE — backend /api/xuong chưa chạy, đây KHÔNG phải g++ thật] Code đã được triển khai. Khi backend nối vào, bước này sẽ compile + chạy tests/baseline.cpp thật.`,
      requirementId: active ? active.id : null,
    };
    project.evidence = [ev, ...(project.evidence || [])].slice(0, 30);
    if (active) {
      active.status = ev.outcome === "pass" ? "met" : "failing";
      active.verifierIds = [ev.id, ...(active.verifierIds || [])].slice(0, 10);
    }
    project.status = ev.outcome === "pass" ? "verified" : "needs-work";
    project.nextAction = ev.outcome === "pass"
      ? { label: "Nhận yêu cầu tiến hóa", reason: "Mọi yêu cầu hiện tại đã đạt — project sẵn sàng khó lên." }
      : { label: "Sửa theo bằng chứng fail", reason: ev.detail.slice(0, 160) };
    saveStore(store);
    return { project, evidence: [ev] };
  },

  async evolve(id) {
    const store = loadStore();
    const project = store.projects[id];
    if (!project) throw new Error("Project không tồn tại (fixture).");
    const pending = project.requirements.find((r) => r.status === "pending");
    if (pending) {
      pending.status = "active";
      project.status = "work";
      project.nextAction = { label: "Đáp ứng yêu cầu mới", reason: pending.summary };
    } else {
      const n = project.requirements.length + 1;
      project.requirements.push({ id: `req-${n}`, summary: `Yêu cầu tiến hóa #${n} (fixture — backend thật sẽ để AI sinh yêu cầu từ code hiện tại).`, status: "active", verifierIds: [] });
      project.status = "work";
    }
    saveStore(store);
    return { project };
  },
};
