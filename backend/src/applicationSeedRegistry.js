"use strict";

// These are technical seed definitions only. Product routes never branch on a
// seed id; the generic Xưởng verifier consumes the plan returned below.
const grid = require("./gridPathfinder");
const weighted = require("./weightedGraphRouter");
const range = require("./rangeSum");
const { slidingWindowLimiter, dependencyPlanner } = require("./xuongNativeSeeds");
const { c6Definitions } = require("./xuongC6NativeSeeds");
const { authoredDefinitions } = require("./xuongAuthoredSeeds");
const { AUTHORED_DEMOS } = require("./xuongAuthoredDemos");

// A demo is a readable product scenario, not a verifier. It compiles the
// student's current implementation with one read-only harness and prints the
// observable result that explains why the algorithm exists.
const DEMOS = {
  "grid-pathfinder": {
    title: "Điều phối đường đi trong khu cứu hộ",
    description: "Quan sát hệ thống tính số bước ngắn nhất từ đội cứu hộ tới người cần hỗ trợ khi bản đồ có vật cản.",
    mission: "Đọc interface shortestPath và source hiện tại, chạy Verify để xác lập baseline trước khi nhận yêu cầu thay đổi đầu tiên.",
    acceptance: "Compiler biên dịch project thật; public test, hidden test và benchmark cùng xác nhận hành vi shortestPath.",
    requirements: [
      "shortestPath trả đúng số bước khi hai ô kề nhau, trùng nhau hoặc bị vật cản chia cắt.",
      "Grid rỗng, hàng lệch kích thước, tọa độ ngoài biên và ô bị chặn đều trả về -1 an toàn.",
    ],
    source: `#include "GridPathfinder.hpp"
#include <iostream>
#include <string>
#include <vector>
int main() {
  std::vector<std::string> map = {".....", ".###.", "...#.", ".#..."};
  const int steps = GridPathfinder::shortestPath(map, {0, 0}, {3, 4});
  std::cout << "TÌNH HUỐNG: Đội cứu hộ cần đến điểm bị cô lập trên bản đồ có vật cản.\\n";
  std::cout << "BẢN ĐỒ: 4 hàng x 5 cột, # là vật cản.\\n";
  std::cout << "KẾT QUẢ: Số bước ngắn nhất = " << steps << "\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Tìm đường ít bước nhất thay vì thử mọi lộ trình.\\n";
}
`,
  },
  "weighted-graph-router": {
    title: "Chọn tuyến giao hàng ít chi phí",
    description: "Quan sát hệ thống chọn tuyến giao hàng có tổng chi phí thấp nhất, thay vì chọn đường có ít chặng nhất.",
    mission: "Đọc interface định tuyến và source hiện tại, chạy Verify để xác lập baseline trước khi thay đổi trọng số cạnh.",
    acceptance: "Compiler, unit test, benchmark và mô phỏng cùng kiểm tra distance, path và trường hợp không thể tới.",
    requirements: [
      "shortestPath trả đúng tổng trọng số và dựng lại đúng dãy đỉnh của tuyến rẻ nhất.",
      "Đỉnh ngoài biên hoặc trọng số âm bị từ chối; đích không thể tới được trả trạng thái unreachable.",
    ],
    source: `#include "WeightedGraphRouter.hpp"
#include <iostream>
int main() {
  WeightedGraphRouter router(5);
  router.addDirectedEdge(0, 1, 8); router.addDirectedEdge(0, 2, 2);
  router.addDirectedEdge(2, 1, 1); router.addDirectedEdge(1, 3, 3);
  router.addDirectedEdge(2, 3, 9); router.addDirectedEdge(3, 4, 2);
  const auto route = router.shortestPath(0, 4);
  std::cout << "TÌNH HUỐNG: Chuyển hàng từ kho đến cửa hàng với chi phí thấp nhất.\\n";
  std::cout << "TUYẾN ĐƯỢC CHỌN:";
  for (int node : route.path) std::cout << ' ' << node;
  std::cout << "\\nTỔNG CHI PHÍ: " << route.distance << "\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Cân nhắc trọng số từng chặng để chọn toàn tuyến rẻ nhất.\\n";
}
`,
  },
  "range-sum-module": {
    title: "Tổng hợp số liệu theo khoảng thời gian",
    description: "Quan sát dashboard trả lời nhiều truy vấn tổng doanh thu theo khoảng mà không cộng lại toàn bộ dữ liệu mỗi lần.",
    mission: "Đọc hai API truy vấn đoạn và source hiện tại, chạy Verify để xác lập baseline trước khi thêm cập nhật điểm.",
    acceptance: "Compiler, public test, hidden test và benchmark cùng kiểm tra tổng đoạn 0-based/1-based và các biên sai.",
    requirements: [
      "queryZeroBased và queryOneBased trả đúng tổng inclusive cho đoạn một phần tử, toàn mảng và đoạn có số âm.",
      "Khoảng rỗng, đảo chiều hoặc vượt biên bị từ chối bằng out_of_range.",
    ],
    source: `#include "RangeSum.hpp"
#include <iostream>
int main() {
  RangeSum revenue({120, 80, 150, 90, 160, 110, 140});
  std::cout << "TÌNH HUỐNG: Dashboard cần tổng doanh thu theo nhiều khoảng ngày.\\n";
  std::cout << "NGÀY 1 ĐẾN 3: " << revenue.queryOneBased(1, 3) << "\\n";
  std::cout << "NGÀY 4 ĐẾN 7: " << revenue.queryOneBased(4, 7) << "\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Tiền xử lý để mỗi truy vấn khoảng được trả lời ngay.\\n";
}
`,
  },
  "sliding-window-limiter": {
    title: "Bảo vệ API khỏi yêu cầu dồn dập",
    description: "Quan sát cổng API cho phép hoặc từ chối từng request theo số lượt gần đây của mỗi người dùng.",
    mission: "Đọc interface rate limiter và source hiện tại, chạy Verify để xác lập baseline trước khi thêm truy vấn activeCount.",
    acceptance: "Compiler, public test, hidden test và benchmark cùng kiểm tra giới hạn theo từng key trong cửa sổ trượt.",
    requirements: [
      "allow cho phép đúng số request trong cửa sổ và mở lượt mới khi mốc cũ hết hiệu lực.",
      "Mỗi key có lịch sử độc lập; timestamp đi lùi bị từ chối an toàn.",
    ],
    source: `#include "SlidingWindowLimiter.hpp"
#include <iostream>
int main() {
  SlidingWindowLimiter limiter(1000, 2);
  const long long times[] = {0, 400, 700, 1100};
  std::cout << "TÌNH HUỐNG: Mỗi tài khoản chỉ được gửi 2 request trong 1 giây.\\n";
  for (long long time : times) {
    std::cout << "REQUEST lúc " << time << "ms: "
              << (limiter.allow("phuc", time) ? "CHO PHÉP" : "TỪ CHỐI") << "\\n";
  }
  std::cout << "VAI TRÒ THUẬT TOÁN: Chỉ giữ các mốc thời gian còn nằm trong cửa sổ gần nhất.\\n";
}
`,
  },
  "dependency-planner": {
    title: "Lập thứ tự build cho một ứng dụng",
    description: "Quan sát hệ thống xếp các bước build sao cho dependency luôn hoàn tất trước phần phụ thuộc vào nó.",
    mission: "Đọc interface lập thứ tự build và source hiện tại, chạy Verify để xác lập baseline trước khi hỗ trợ gỡ dependency.",
    acceptance: "Compiler, public test, hidden test và benchmark cùng kiểm tra thứ tự build ổn định và phát hiện chu trình.",
    requirements: [
      "buildOrder đặt mọi dependency trước bước phụ thuộc và cho kết quả ổn định khi có nhiều bước sẵn sàng.",
      "Task rỗng, self-dependency và chu trình dependency đều bị từ chối bằng lỗi đọc được.",
    ],
    source: `#include "DependencyPlanner.hpp"
#include <iostream>
int main() {
  DependencyPlanner planner;
  planner.addDependency("compile-api", "link-server");
  planner.addDependency("compile-db", "link-server");
  planner.addDependency("link-server", "package-app");
  std::cout << "TÌNH HUỐNG: Build backend đúng thứ tự để không link khi dependency chưa xong.\\n";
  std::cout << "THỨ TỰ BUILD:";
  for (const auto& task : planner.buildOrder()) std::cout << ' ' << task;
  std::cout << "\\nVAI TRÒ THUẬT TOÁN: Sắp xếp dependency và phát hiện quy trình không hợp lệ.\\n";
}
`,
  },
};

// The second wave of authored arcs keeps its demos beside its seeds.
Object.assign(DEMOS, AUTHORED_DEMOS);

const definitions = [grid, weighted, range, slidingWindowLimiter, dependencyPlanner, ...c6Definitions, ...authoredDefinitions].map((definition) => {
  const scaffold = definition.buildScaffold({
    problemId: "xuong-seed",
    sourceTitle: "Xưởng seed registry",
    evidence: { id: "seed", runId: "seed", codeHash: "seed", inputHash: "seed", verdict: "AC" },
    createdAt: "2026-07-17T00:00:00.000Z",
  });
  const sourceFile = definition.SOURCE_FILE
    || Object.keys(scaffold.files).find((name) => /\.cpp$/i.test(name) && !/test/i.test(name));
  return {
    id: definition.ARTIFACT_ID,
    target: "cpp",
    title: scaffold.manifest.title,
    concepts: [scaffold.manifest.concept].filter(Boolean),
    purpose: (scaffold.manifest.requirements || [])[0]?.brief
      || (scaffold.manifest.requirements || [])[0]?.summary
      || "Reusable C++ algorithm component",
    files: scaffold.files,
    sourceFile,
    definition,
  };
});

const byId = new Map(definitions.map((item) => [item.id, item]));

function c6Demo(seed) {
  const adapter = seed && seed.definition && seed.definition.C6_ADAPTER;
  if (!adapter) return null;
  return {
    title: `Bộ kiểm tra ${adapter.base}`,
    description: `Chạy adapter C++ ${adapter.family} bằng scenario trusted cục bộ.`,
    mission: "Chạy scenario, đọc evidence và sửa source theo điểm neo khi oracle báo sai.",
    acceptance: "Compiler, runner cục bộ và oracle trusted cùng xác nhận kết quả adapter.",
    requirements: [`Giữ kết quả evaluate(${adapter.input}) bằng ${adapter.expected} cho scenario đã đăng ký.`],
    source: `#include "${adapter.className}.hpp"\n#include <iostream>\nint main(){ std::cout << ${adapter.className}::evaluate(${adapter.input}) << "\\n"; }\n`,
  };
}

function listSeeds() {
  return definitions.map(({ id, title, concepts, purpose, files }) => ({
    id,
    title,
    concepts: [...concepts],
    purpose,
    fileNames: Object.keys(files),
  }));
}

function getSeed(id) {
  return byId.get(String(id || "")) || null;
}

function seedError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function fileLabel(filePath) {
  if (filePath === "demo/main.cpp") return "Demo · demo/main.cpp";
  if (/\.test\.cpp$/i.test(filePath)) return `Unit test · ${filePath}`;
  if (/\.hpp$/i.test(filePath)) return `Contract · ${filePath}`;
  if (/\.cpp$/i.test(filePath)) return `Implementation · ${filePath}`;
  return filePath;
}

function materializeSeed(id) {
  const seed = getSeed(id);
  if (!seed) throw seedError("Xưởng seed does not exist.");
  const demo = DEMOS[seed.id] || c6Demo(seed);
  if (!demo) throw seedError("Xưởng seed does not have a demo.", 422);
  return {
    seedId: seed.id,
    files: [...Object.entries(seed.files), ["demo/main.cpp", demo.source]].map(([filePath, content]) => ({
      path: filePath,
      label: fileLabel(filePath),
      editable: filePath === seed.sourceFile && filePath !== "demo/main.cpp",
      content,
    })),
    sourceFile: seed.sourceFile,
    demo: {
      title: demo.title,
      description: demo.description,
      mission: demo.mission,
      acceptance: demo.acceptance,
      requirements: [...demo.requirements],
    },
  };
}

function demoPlan(seedId, files) {
  const seed = getSeed(seedId);
  const demo = seed && (DEMOS[seed.id] || c6Demo(seed));
  if (!seed || !demo) throw seedError("No demo is registered for this Xưởng seed.", 422);
  const byPath = Object.fromEntries((files || []).map((file) => [file.path, file.content]));
  const requiredPaths = Object.keys(seed.files)
    .filter((filePath) => /\.hpp$/i.test(filePath) || filePath === seed.sourceFile)
    .concat("demo/main.cpp");
  const planFiles = requiredPaths.map((filePath) => ({
    path: filePath,
    content: filePath === "demo/main.cpp" ? (byPath[filePath] || demo.source) : byPath[filePath],
  }));
  if (planFiles.some((file) => !String(file.content || "").trim())) {
    throw seedError("Project demo files are incomplete.", 422);
  }
  return { files: planFiles, input: "", timeMs: 3000 };
}

function demoDefinition(seedId) {
  const seed = getSeed(seedId);
  const demo = seed && (DEMOS[seed.id] || c6Demo(seed));
  return demo ? {
    title: demo.title,
    description: demo.description,
    mission: demo.mission,
    acceptance: demo.acceptance,
    requirements: [...demo.requirements],
  } : null;
}

function weightedSimulation(files) {
  const byPath = Object.fromEntries(files.map((file) => [file.path, file.content]));
  const harness = `#include "WeightedGraphRouter.hpp"
#include <iostream>
int main(){
  int n,m; if(!(std::cin>>n>>m)) return 2; WeightedGraphRouter router(n);
  for(int i=0;i<m;++i){int u,v; long long w; std::cin>>u>>v>>w; router.addDirectedEdge(u,v,w);}
  int s,t; std::cin>>s>>t; auto result=router.shortestPath(s,t);
  if(!result.reachable){std::cout<<"UNREACHABLE\\n";return 0;}
  std::cout<<"DISTANCE "<<result.distance<<"\\nPATH";
  for(int node:result.path) std::cout<<' '<<node; std::cout<<"\\n";
}
`;
  const cases = [
    {
      name: "shorter indirect route",
      input: "4 3\n0 1 5\n1 3 2\n0 3 20\n0 3\n",
      expected: { reachable: true, distance: 7, path: [0, 1, 3] },
    },
    {
      name: "unreachable target",
      input: "3 1\n0 1 1\n0 2\n",
      expected: { reachable: false, distance: null, path: [] },
    },
  ];
  return {
    files: [
      { path: "WeightedGraphRouter.hpp", content: byPath["WeightedGraphRouter.hpp"] },
      { path: "WeightedGraphRouter.cpp", content: byPath["WeightedGraphRouter.cpp"] },
      { path: "simulation.cpp", content: harness },
    ],
    cases,
    validate(testCase, output) {
      const lines = String(output || "").trim().split(/\r?\n/);
      let actual;
      if (lines[0] === "UNREACHABLE") {
        actual = { reachable: false, distance: null, path: [] };
      } else {
        const distance = Number((lines[0] || "").replace(/^DISTANCE\s+/, ""));
        const route = (lines[1] || "").replace(/^PATH\s*/, "").trim();
        actual = { reachable: true, distance, path: route ? route.split(/\s+/).map(Number) : [] };
      }
      const ok = JSON.stringify(actual) === JSON.stringify(testCase.expected);
      return {
        ok,
        detail: ok
          ? `${testCase.name}: distance/path đúng.`
          : `${testCase.name}: expected ${JSON.stringify(testCase.expected)}, got ${JSON.stringify(actual)}.`,
      };
    },
  };
}

function verificationPlan(seedId, files, suite = "baseline") {
  const seed = getSeed(seedId);
  if (!seed) throw seedError("No verifier is registered for this Xưởng seed.", 422);
  if (!["baseline", "requirement-change"].includes(suite)) throw seedError("Unknown verifier suite.", 422);
  const byPath = Object.fromEntries((files || []).map((file) => [file.path, file.content]));
  const testFile = suite === "requirement-change"
    ? Object.keys(seed.files).find((name) => /requirement-change\.test\.cpp$/i.test(name))
    : Object.keys(seed.files).find((name) => /\.test\.cpp$/i.test(name) && !/requirement-change/i.test(name));
  if (!testFile || !byPath[seed.sourceFile]) throw seedError("Seed verifier files are incomplete.", 422);
  const publicPaths = Object.keys(seed.files).filter((name) => /\.hpp$/i.test(name) || name === seed.sourceFile || name === testFile);
  return {
    suite,
    publicFiles: publicPaths.map((filePath) => ({ path: filePath, content: byPath[filePath] })),
    hiddenCode: seed.definition.composeHiddenTranslationUnit(byPath, suite),
    benchmark: { iterations: 3, input: "", maxAverageMs: 2000 },
    simulation: seed.id === weighted.ARTIFACT_ID ? weightedSimulation(files) : null,
  };
}

module.exports = { listSeeds, getSeed, materializeSeed, demoPlan, demoDefinition, verificationPlan };
