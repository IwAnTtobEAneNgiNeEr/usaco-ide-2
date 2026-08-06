"use strict";

// Authored C++ components for the second wave of Xưởng product arcs.
//
// Unlike the C6 adapters (one `evaluate(int)` toy per projection base, admitted
// only to prove the base has a runner), every component here is a small but
// real product part: a header a scenario calls, an implementation, and exactly
// ONE function whose old assumption the build breaks.
//
// --------------------------------------------------------------------------
// Why the .cpp is assembled here instead of written out per seed
//
// The first version of these scaffolds was hand-written per file. They drifted:
// some numbered their zones PHẦN 1 / PHẦN 3 with no PHẦN 2, the work items were
// `// TODO` lines that looked exactly like the explanatory comments beside them,
// and the code the student had to REPLACE sat directly under the code they had
// to KEEP with nothing between them. A student arriving from a single main()
// could not answer, at a glance, the only three questions that matter:
//
//   what do I read?      → ĐÃ CHẠY ĐÚNG · CHỈ ĐỌC
//   what do I write?     → VIỆC CỦA EM  (one function, numbered steps)
//   what do I delete?    → ĐOẠN CẦN THAY (explicit open/close markers)
//
// So a seed no longer supplies a whole file. It supplies the parts, and the
// assembler below guarantees all ten files answer those questions the same way.
//
// `source` is the red baseline — it compiles and prints a WRONG answer.
// `solvedSource` is the same file after the one edit the build asks for; it
// exists so the arc tests can prove red → green with the real compiler instead
// of trusting the prose.

const ZONE_READ = "// ===== ĐÃ CHẠY ĐÚNG · CHỈ ĐỌC =============================================";
const ZONE_WORK = "// ===== VIỆC CỦA EM · CHỈ SỬA HÀM NGAY DƯỚI ĐÂY ============================";
const CUT_OPEN = "  // ----- ĐOẠN CẦN THAY · đây là giả định cũ -----";
const CUT_CLOSE = "  // ----- hết ĐOẠN CẦN THAY -----";

function assembleSource(spec) {
  const extra = (spec.includes || []).map((line) => `${line}\n`).join("");
  const steps = spec.steps.map((step, index) => `// ${index + 1}. ${step}`).join("\n");
  return `#include "${spec.className}.hpp"
${extra}using namespace std;

// File này KHÔNG có main(). Bài chạy nằm trong ${spec.className}.test.cpp và nó
// gọi các hàm dưới đây — đúng như cách main() của em từng gọi hàm em tự viết.

${ZONE_READ}
// ${spec.readOnlyRole}
${spec.readOnlyCode.trim()}

${ZONE_WORK}
${steps}
${spec.editableHead.trim()}

${CUT_OPEN}
${spec.oldCode.trim().split("\n").map((line) => `  ${line.replace(/^ {2}/, "")}`).join("\n")}
${CUT_CLOSE}
}
`;
}

function definition(spec) {
  const headerName = `${spec.className}.hpp`;
  const sourceName = `${spec.className}.cpp`;
  const testName = `${spec.className}.test.cpp`;
  const changeName = `${spec.className}.requirement-change.test.cpp`;
  const source = assembleSource(spec);
  return {
    ARTIFACT_ID: spec.id,
    SOURCE_FILE: sourceName,
    AUTHORED: {
      base: spec.base,
      className: spec.className,
      solvedSource: spec.solvedSource,
      testSource: spec.test,
      // The workbench rail reads these; the scaffold prints these. One array,
      // so the three steps a student is told can never differ from the three
      // steps written where they actually type.
      steps: [...spec.steps],
      readOnlyRole: spec.readOnlyRole,
      headerName,
      sourceName,
      testName,
    },
    buildScaffold({ createdAt } = {}) {
      const at = createdAt || new Date().toISOString();
      return {
        manifest: {
          version: 1,
          id: spec.id,
          title: spec.className,
          concept: spec.concept,
          currentRequirementId: "baseline-v1",
          requirements: [
            { id: "baseline-v1", status: "active", summary: spec.purpose },
            { id: "requirement-change-v2", status: "proposed", summary: spec.changePurpose },
          ],
          createdAt: at,
          updatedAt: at,
        },
        files: {
          [headerName]: spec.header,
          [sourceName]: source,
          [testName]: spec.test,
          [changeName]: spec.test,
        },
      };
    },
    composeHiddenTranslationUnit(files, suite) {
      const strip = (value) => String(value || "").replace(
        new RegExp(`^#include\\s+"${headerName.replace(".", "\\.")}"\\s*$`, "gm"), "",
      );
      const testFile = suite === "requirement-change" ? changeName : testName;
      return [files[headerName], strip(files[sourceName]), strip(files[testFile])].join("\n");
    },
  };
}

// --------------------------------------------------------------------------
// 1. BuildOrderTree — cây module build (base: tree)
// --------------------------------------------------------------------------

const buildOrderTree = definition({
  id: "build-order-tree",
  className: "BuildOrderTree",
  base: "tree",
  concept: "tree-depth",
  purpose: "Đo chuỗi build dài nhất từ một module gốc.",
  changePurpose: "Đếm đủ mọi bậc con thay vì chỉ bậc trực tiếp.",
  header: `#pragma once
#include <map>
#include <string>
#include <utility>
#include <vector>
class BuildOrderTree {
 public:
  // Trả về số bậc của chuỗi build dài nhất tính từ \`root\`.
  static int deepestChain(const std::vector<std::pair<std::string, std::string>>& edges,
                          const std::string& root);
 private:
  static std::map<std::string, std::vector<std::string>> childrenOf(
      const std::vector<std::pair<std::string, std::string>>& edges);
};
`,
  readOnlyRole: "childrenOf(edges) gom sẵn danh sách module con của từng module.",
  readOnlyCode: `map<string, vector<string>> BuildOrderTree::childrenOf(
    const vector<pair<string, string>>& edges) {
  map<string, vector<string>> children;
  for (const auto& edge : edges) {
    children[edge.first].push_back(edge.second);
  }
  return children;
}`,
  steps: [
    "children[\"api\"] đã cho sẵn danh sách module con của api — không phải dựng lại.",
    "Không có con thì trả 0; có con thì lấy deepestChain(edges, con) + 1 rồi giữ giá trị lớn nhất.",
    "Tự kiểm: từ core phải ra 1 (vì còn logging), từ app phải ra 3.",
  ],
  editableHead: `int BuildOrderTree::deepestChain(
    const vector<pair<string, string>>& edges,
    const string& root
) {
  map<string, vector<string>> children = childrenOf(edges);
`,
  oldCode: `// Cây build chỉ sâu đúng một bậc, nên thấy có con là trả 1 ngay.
return children[root].empty() ? 0 : 1;`,
  solvedSource: `#include "BuildOrderTree.hpp"
#include <algorithm>
using namespace std;

map<string, vector<string>> BuildOrderTree::childrenOf(
    const vector<pair<string, string>>& edges) {
  map<string, vector<string>> children;
  for (const auto& edge : edges) {
    children[edge.first].push_back(edge.second);
  }
  return children;
}

int BuildOrderTree::deepestChain(
    const vector<pair<string, string>>& edges,
    const string& root
) {
  map<string, vector<string>> children = childrenOf(edges);
  if (children[root].empty()) return 0;
  int best = 0;
  for (const string& child : children[root]) {
    best = max(best, deepestChain(edges, child) + 1);
  }
  return best;
}
`,
  test: `#include "BuildOrderTree.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<std::string, std::string>> edges = {
      {"app", "api"}, {"app", "ui"}, {"api", "core"}, {"api", "db"},
      {"ui", "theme"}, {"core", "logging"}};
  std::cout << BuildOrderTree::deepestChain(edges, "app") << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 2. PrefixRouter — tra cứu tiền tố (base: tree)
// --------------------------------------------------------------------------

const prefixRouter = definition({
  id: "prefix-router-tree",
  className: "PrefixRouter",
  base: "tree",
  concept: "trie-prefix",
  purpose: "Chọn tuyến theo tiền tố dài nhất khớp với số máy.",
  changePurpose: "Bỏ giới hạn tiền tố hai ký tự để tuyến chi tiết được ưu tiên.",
  header: `#pragma once
#include <string>
#include <vector>
class PrefixRouter {
 public:
  // Trả về độ dài tiền tố dài nhất trong bảng khớp với \`number\`; 0 nếu không có.
  static int longestPrefixMatch(const std::vector<std::string>& table,
                                const std::string& number);
 private:
  static bool startsWith(const std::string& number, const std::string& prefix);
};
`,
  readOnlyRole: "startsWith(number, prefix) kiểm tra một tiền tố có mở đầu số máy không.",
  readOnlyCode: `bool PrefixRouter::startsWith(const string& number, const string& prefix) {
  if (prefix.size() > number.size()) return false;
  return number.compare(0, prefix.size(), prefix) == 0;
}`,
  steps: [
    "Xoá dòng chặn độ dài trong đoạn cần thay; đó chính là giả định cũ.",
    "Giữ nguyên phần so khớp và cập nhật best — phần đó đã đúng cho mọi độ dài.",
    "Tự kiểm: với số 842421357, hàm phải trả 5 (khớp 84242) chứ không phải 2.",
  ],
  editableHead: `int PrefixRouter::longestPrefixMatch(
    const vector<string>& table,
    const string& number
) {
  int best = 0;
`,
  oldCode: `for (const string& prefix : table) {
  // Mã vùng luôn dài đúng hai ký tự.
  if (prefix.size() != 2) continue;
  if (startsWith(number, prefix) && (int)prefix.size() > best) {
    best = (int)prefix.size();
  }
}
return best;`,
  solvedSource: `#include "PrefixRouter.hpp"
using namespace std;

bool PrefixRouter::startsWith(const string& number, const string& prefix) {
  if (prefix.size() > number.size()) return false;
  return number.compare(0, prefix.size(), prefix) == 0;
}

int PrefixRouter::longestPrefixMatch(
    const vector<string>& table,
    const string& number
) {
  int best = 0;
  for (const string& prefix : table) {
    if (startsWith(number, prefix) && (int)prefix.size() > best) {
      best = (int)prefix.size();
    }
  }
  return best;
}
`,
  test: `#include "PrefixRouter.hpp"
#include <iostream>
int main() {
  std::vector<std::string> table = {"84", "8424", "84242", "8", "8425", "849"};
  std::cout << PrefixRouter::longestPrefixMatch(table, "842421357") << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 3. ShiftPlanner — chồng ca trực (base: timeline)
// --------------------------------------------------------------------------

const shiftPlanner = definition({
  id: "shift-planner-timeline",
  className: "ShiftPlanner",
  base: "timeline",
  concept: "interval-overlap",
  purpose: "Tính tổng số phút hai ca trực chồng lên nhau.",
  changePurpose: "Xét mọi cặp ca, không chỉ hai ca liền kề trong danh sách.",
  includes: ["#include <algorithm>"],
  header: `#pragma once
#include <utility>
#include <vector>
class ShiftPlanner {
 public:
  // Tổng số phút bị chồng của mọi cặp ca trong danh sách (đã sắp theo giờ bắt đầu).
  static int overlapMinutes(const std::vector<std::pair<int, int>>& shifts);
 private:
  static int overlapOf(const std::pair<int, int>& left, const std::pair<int, int>& right);
};
`,
  readOnlyRole: "overlapOf(a, b) trả số phút giao nhau của đúng hai ca.",
  readOnlyCode: `int ShiftPlanner::overlapOf(const pair<int, int>& left, const pair<int, int>& right) {
  const int from = max(left.first, right.first);
  const int to = min(left.second, right.second);
  return to > from ? to - from : 0;
}`,
  steps: [
    "Đổi một vòng lặp thành hai: i chạy mọi ca, j chạy từ i + 1 tới hết danh sách.",
    "Với mỗi cặp, cộng overlapOf(shifts[i], shifts[j]) — helper này đã đúng, không sửa.",
    "Tự kiểm: cặp Ca 1 ↔ Ca 3 phải đóng góp 20 phút, tổng cuối là 180.",
  ],
  editableHead: `int ShiftPlanner::overlapMinutes(
    const vector<pair<int, int>>& shifts
) {
  int total = 0;
`,
  oldCode: `// Hai ca chỉ chồng nhau khi chúng đứng cạnh nhau trong danh sách.
for (size_t index = 0; index + 1 < shifts.size(); ++index) {
  total += overlapOf(shifts[index], shifts[index + 1]);
}
return total;`,
  solvedSource: `#include "ShiftPlanner.hpp"
#include <algorithm>
using namespace std;

int ShiftPlanner::overlapOf(const pair<int, int>& left, const pair<int, int>& right) {
  const int from = max(left.first, right.first);
  const int to = min(left.second, right.second);
  return to > from ? to - from : 0;
}

int ShiftPlanner::overlapMinutes(
    const vector<pair<int, int>>& shifts
) {
  int total = 0;
  for (size_t i = 0; i < shifts.size(); ++i) {
    for (size_t j = i + 1; j < shifts.size(); ++j) {
      total += overlapOf(shifts[i], shifts[j]);
    }
  }
  return total;
}
`,
  test: `#include "ShiftPlanner.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<int, int>> shifts = {
      {0, 120}, {60, 180}, {100, 200}, {240, 300}, {280, 360}, {400, 460}};
  std::cout << ShiftPlanner::overlapMinutes(shifts) << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 4. SweepMonitor — đỉnh phiên đồng thời (base: timeline)
// --------------------------------------------------------------------------

const sweepMonitor = definition({
  id: "sweep-monitor-timeline",
  className: "SweepMonitor",
  base: "timeline",
  concept: "event-sweep",
  purpose: "Báo số phiên mở đồng thời cao nhất trong ngày.",
  changePurpose: "Quét mọi mốc bắt đầu thay vì chỉ mốc của phiên đầu tiên.",
  includes: ["#include <algorithm>"],
  header: `#pragma once
#include <utility>
#include <vector>
class SweepMonitor {
 public:
  // Số phiên mở cùng lúc cao nhất; mỗi phiên là {mở, đóng}.
  static int peakConcurrency(const std::vector<std::pair<int, int>>& sessions);
 private:
  static int activeAt(const std::vector<std::pair<int, int>>& sessions, int moment);
};
`,
  readOnlyRole: "activeAt(sessions, mốc) đếm số phiên đang mở tại một mốc thời gian.",
  readOnlyCode: `int SweepMonitor::activeAt(const vector<pair<int, int>>& sessions, int moment) {
  int active = 0;
  for (const auto& session : sessions) {
    if (session.first <= moment && moment <= session.second) ++active;
  }
  return active;
}`,
  steps: [
    "Duyệt mọi phiên, lấy session.first của từng phiên làm một mốc quét.",
    "Với mỗi mốc, gọi activeAt(sessions, mốc) rồi giữ giá trị lớn nhất — helper đã đúng.",
    "Tự kiểm: tại phút 130 phải đếm ra 4 phiên, đó cũng là kết quả cuối.",
  ],
  editableHead: `int SweepMonitor::peakConcurrency(
    const vector<pair<int, int>>& sessions
) {
  if (sessions.empty()) return 0;
`,
  oldCode: `// Cao điểm luôn rơi đúng vào lúc phiên đầu tiên vừa mở.
return activeAt(sessions, sessions[0].first);`,
  solvedSource: `#include "SweepMonitor.hpp"
#include <algorithm>
using namespace std;

int SweepMonitor::activeAt(const vector<pair<int, int>>& sessions, int moment) {
  int active = 0;
  for (const auto& session : sessions) {
    if (session.first <= moment && moment <= session.second) ++active;
  }
  return active;
}

int SweepMonitor::peakConcurrency(
    const vector<pair<int, int>>& sessions
) {
  if (sessions.empty()) return 0;
  int peak = 0;
  for (const auto& session : sessions) {
    peak = max(peak, activeAt(sessions, session.first));
  }
  return peak;
}
`,
  test: `#include "SweepMonitor.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<int, int>> sessions = {
      {0, 10}, {5, 15}, {100, 200}, {110, 210}, {120, 220}, {130, 230}};
  std::cout << SweepMonitor::peakConcurrency(sessions) << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 5. FieldSurvey — vùng phủ sóng (base: geometry)
// --------------------------------------------------------------------------

const fieldSurvey = definition({
  id: "field-survey-geometry",
  className: "FieldSurvey",
  base: "geometry",
  concept: "euclidean-range",
  purpose: "Đếm số trạm nằm trong vùng phủ của một cột phát.",
  changePurpose: "Đo bán kính phủ theo đường tròn thật thay vì khung vuông.",
  includes: ["#include <cmath>"],
  header: `#pragma once
#include <utility>
#include <vector>
class FieldSurvey {
 public:
  // Số điểm nằm trong bán kính phủ tính từ (centerX, centerY).
  static int withinRange(const std::vector<std::pair<double, double>>& points,
                         double centerX, double centerY, double radius);
 private:
  static double dx(double a, double b);
};
`,
  readOnlyRole: "dx(a, b) trả khoảng cách theo một trục, luôn không âm.",
  readOnlyCode: `double FieldSurvey::dx(double a, double b) {
  return fabs(a - b);
}`,
  steps: [
    "Đổi điều kiện sang đường tròn: horizontal*horizontal + vertical*vertical <= radius*radius.",
    "Dùng bình phương hai vế để khỏi gọi sqrt; helper dx() và vòng lặp giữ nguyên.",
    "Tự kiểm: Trạm D ở (-3, 4) cách đúng 5 nên vẫn được tính, còn Trạm C thì không.",
  ],
  editableHead: `int FieldSurvey::withinRange(
    const vector<pair<double, double>>& points,
    double centerX,
    double centerY,
    double radius
) {
  int covered = 0;
`,
  oldCode: `for (const auto& point : points) {
  const double horizontal = dx(point.first, centerX);
  const double vertical = dx(point.second, centerY);
  // Vùng phủ là khung vuông quanh cột phát.
  if (horizontal <= radius && vertical <= radius) ++covered;
}
return covered;`,
  solvedSource: `#include "FieldSurvey.hpp"
#include <cmath>
using namespace std;

double FieldSurvey::dx(double a, double b) {
  return fabs(a - b);
}

int FieldSurvey::withinRange(
    const vector<pair<double, double>>& points,
    double centerX,
    double centerY,
    double radius
) {
  int covered = 0;
  for (const auto& point : points) {
    const double horizontal = dx(point.first, centerX);
    const double vertical = dx(point.second, centerY);
    if (horizontal * horizontal + vertical * vertical <= radius * radius) ++covered;
  }
  return covered;
}
`,
  test: `#include "FieldSurvey.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<double, double>> points = {
      {1.0, 1.0}, {4.5, 0.5}, {4.5, 4.5}, {-3.0, 4.0}, {0.0, -4.8}, {-4.9, -4.9}};
  std::cout << FieldSurvey::withinRange(points, 0.0, 0.0, 5.0) << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 6. ApiGateway — định tuyến yêu cầu (base: request-response)
// --------------------------------------------------------------------------

const apiGateway = definition({
  id: "api-gateway-exchange",
  className: "ApiGateway",
  base: "request-response",
  concept: "routing-status",
  purpose: "Trả mã trạng thái cho từng đường dẫn mà cổng nhận được.",
  changePurpose: "Trả 503 khi dịch vụ đích đang tắt thay vì vẫn báo 200.",
  header: `#pragma once
#include <set>
#include <string>
#include <utility>
#include <vector>
class ApiGateway {
 public:
  // Mã trạng thái cho một đường dẫn: 200 / 404 / 503.
  static int statusFor(const std::vector<std::pair<std::string, std::string>>& table,
                       const std::string& path,
                       const std::set<std::string>& downServices);
 private:
  static std::string serviceOf(const std::vector<std::pair<std::string, std::string>>& table,
                               const std::string& path);
};
`,
  readOnlyRole: "serviceOf(table, path) tra bảng định tuyến ra tên dịch vụ đích.",
  readOnlyCode: `string ApiGateway::serviceOf(
    const vector<pair<string, string>>& table,
    const string& path) {
  for (const auto& route : table) {
    if (route.first == path) return route.second;
  }
  return "";
}`,
  steps: [
    "Nếu downServices có chứa service thì trả 503.",
    "Giữ nguyên nhánh 404 ở trên và nhánh 200 ở cuối — chỉ thêm một nhánh ở giữa.",
    "Tự kiểm: /thanh-toan phải ra 503, /kho vẫn 200, /cu vẫn 404.",
  ],
  editableHead: `int ApiGateway::statusFor(
    const vector<pair<string, string>>& table,
    const string& path,
    const set<string>& downServices
) {
  const string service = serviceOf(table, path);
  if (service.empty()) return 404;
`,
  oldCode: `// Đường dẫn có trong bảng thì dịch vụ chắc chắn còn sống.
return 200;`,
  solvedSource: `#include "ApiGateway.hpp"
using namespace std;

string ApiGateway::serviceOf(
    const vector<pair<string, string>>& table,
    const string& path) {
  for (const auto& route : table) {
    if (route.first == path) return route.second;
  }
  return "";
}

int ApiGateway::statusFor(
    const vector<pair<string, string>>& table,
    const string& path,
    const set<string>& downServices
) {
  const string service = serviceOf(table, path);
  if (service.empty()) return 404;
  if (downServices.count(service) > 0) return 503;
  return 200;
}
`,
  test: `#include "ApiGateway.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<std::string, std::string>> table = {
      {"/don-hang", "orders"}, {"/thanh-toan", "billing"}, {"/kho", "stock"},
      {"/nguoi-dung", "users"}, {"/bao-cao", "reports"}};
  std::set<std::string> down = {"billing", "reports"};
  const char* paths[] = {"/don-hang", "/thanh-toan", "/kho", "/nguoi-dung", "/bao-cao", "/cu"};
  int total = 0;
  for (const char* path : paths) total += ApiGateway::statusFor(table, path, down);
  std::cout << total << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 7. RetryBudget — ngân sách thử lại (base: request-response)
// --------------------------------------------------------------------------

const retryBudget = definition({
  id: "retry-budget-exchange",
  className: "RetryBudget",
  base: "request-response",
  concept: "retry-policy",
  purpose: "Đếm tổng số lần gọi sau khi áp dụng chính sách thử lại.",
  changePurpose: "Chỉ thử lại lỗi phía máy chủ, không thử lại lỗi phía người gọi.",
  header: `#pragma once
#include <vector>
class RetryBudget {
 public:
  // Tổng số lần gọi thực tế cho danh sách phản hồi, với \`budget\` lần thử lại.
  static int attemptsUsed(const std::vector<int>& statuses, int budget);
 private:
  static bool retryable(int status);
};
`,
  readOnlyRole: "attemptsUsed() cộng một lượt gọi gốc rồi hỏi retryable() có thử lại không.",
  readOnlyCode: `int RetryBudget::attemptsUsed(const vector<int>& statuses, int budget) {
  int attempts = 0;
  for (int status : statuses) {
    attempts += 1;
    if (retryable(status)) attempts += budget;
  }
  return attempts;
}`,
  steps: [
    "Đổi thân hàm thành return status >= 500 — chỉ lỗi phía máy chủ mới đáng thử lại.",
    "Không cần sửa attemptsUsed() ở trên; nó vốn đã hỏi lại hàm này cho từng phản hồi.",
    "Tự kiểm: 404 và 429 phải trả false, còn 500 và 503 phải trả true.",
  ],
  editableHead: `bool RetryBudget::retryable(
    int status
) {
`,
  oldCode: `// Cứ khác 200 là thử lại.
return status != 200;`,
  solvedSource: `#include "RetryBudget.hpp"
using namespace std;

int RetryBudget::attemptsUsed(const vector<int>& statuses, int budget) {
  int attempts = 0;
  for (int status : statuses) {
    attempts += 1;
    if (retryable(status)) attempts += budget;
  }
  return attempts;
}

bool RetryBudget::retryable(
    int status
) {
  return status >= 500;
}
`,
  test: `#include "RetryBudget.hpp"
#include <iostream>
int main() {
  std::vector<int> statuses = {500, 404, 503, 200, 429, 500};
  std::cout << RetryBudget::attemptsUsed(statuses, 2) << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 8. MemoryPool — cấp phát trang (base: runtime-resource)
// --------------------------------------------------------------------------

const memoryPool = definition({
  id: "memory-pool-runtime",
  className: "MemoryPool",
  base: "runtime-resource",
  concept: "page-allocation",
  purpose: "Ước lượng số trang bộ nhớ cần cấp cho các khối dữ liệu.",
  changePurpose: "Mỗi khối chiếm trang riêng, không được gộp chung một trang.",
  header: `#pragma once
#include <vector>
class MemoryPool {
 public:
  // Số trang cần cấp cho danh sách khối, mỗi trang \`pageSize\` byte.
  static long long pagesNeeded(const std::vector<long long>& blocks, long long pageSize);
 private:
  static long long pagesFor(long long bytes, long long pageSize);
};
`,
  readOnlyRole: "pagesFor(bytes, pageSize) làm tròn LÊN số trang cho một lượng byte.",
  readOnlyCode: `long long MemoryPool::pagesFor(long long bytes, long long pageSize) {
  if (pageSize <= 0) return 0;
  return (bytes + pageSize - 1) / pageSize;
}`,
  steps: [
    "Trong vòng lặp, cộng pagesFor(block, pageSize) cho TỪNG khối thay vì cộng block.",
    "Bỏ lần làm tròn ở dòng return, trả thẳng total — đã làm tròn từng khối rồi.",
    "Tự kiểm: khối 100 byte vẫn phải chiếm trọn 1 trang, tổng cuối là 6.",
  ],
  editableHead: `long long MemoryPool::pagesNeeded(
    const vector<long long>& blocks,
    long long pageSize
) {
  long long total = 0;
`,
  oldCode: `// Các khối được xếp liền nhau nên chia tổng byte là đủ.
for (long long block : blocks) total += block;
return pagesFor(total, pageSize);`,
  solvedSource: `#include "MemoryPool.hpp"
using namespace std;

long long MemoryPool::pagesFor(long long bytes, long long pageSize) {
  if (pageSize <= 0) return 0;
  return (bytes + pageSize - 1) / pageSize;
}

long long MemoryPool::pagesNeeded(
    const vector<long long>& blocks,
    long long pageSize
) {
  long long total = 0;
  for (long long block : blocks) total += pagesFor(block, pageSize);
  return total;
}
`,
  test: `#include "MemoryPool.hpp"
#include <iostream>
int main() {
  std::vector<long long> blocks = {1000, 3000, 500, 4096, 100, 2500};
  std::cout << MemoryPool::pagesNeeded(blocks, 4096) << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 9. OrderFlow — vòng đời đơn hàng (base: state-machine)
// --------------------------------------------------------------------------

const orderFlow = definition({
  id: "order-flow-state",
  className: "OrderFlow",
  base: "state-machine",
  concept: "state-transition",
  purpose: "Kiểm tra một bước chuyển trạng thái đơn hàng có hợp lệ không.",
  changePurpose: "Cho phép hoàn hàng sau khi đã giao, và chặn quay ngược về chờ xác nhận.",
  header: `#pragma once
#include <string>
#include <utility>
#include <vector>
class OrderFlow {
 public:
  // Bước chuyển \`from\` → \`to\` có nằm trong bảng chuyển tiếp không.
  static bool canTransition(const std::string& from, const std::string& to);
 private:
  static std::vector<std::pair<std::string, std::string>> allowed();
};
`,
  readOnlyRole: "canTransition(from, to) dò bảng bên dưới xem bước chuyển có hợp lệ không.",
  readOnlyCode: `bool OrderFlow::canTransition(const string& from, const string& to) {
  for (const auto& step : allowed()) {
    if (step.first == from && step.second == to) return true;
  }
  return false;
}`,
  steps: [
    "Thêm đúng một dòng {\"da-giao\", \"hoan-hang\"} vào danh sách trong đoạn cần thay.",
    "Không thêm bước quay ngược về \"cho-xac-nhan\"; bài chạy có một lần thử như vậy và nó phải bị chặn.",
    "Tự kiểm: sáu lần thử của bài chạy phải cho ra đúng 4 bước hợp lệ.",
  ],
  editableHead: `vector<pair<string, string>> OrderFlow::allowed(
) {
`,
  oldCode: `// Đơn đã giao là điểm cuối, không còn bước nào phía sau.
return {
    {"cho-xac-nhan", "dang-goi"},
    {"dang-goi", "dang-giao"},
    {"dang-giao", "da-giao"},
};`,
  solvedSource: `#include "OrderFlow.hpp"
using namespace std;

bool OrderFlow::canTransition(const string& from, const string& to) {
  for (const auto& step : allowed()) {
    if (step.first == from && step.second == to) return true;
  }
  return false;
}

vector<pair<string, string>> OrderFlow::allowed(
) {
  return {
      {"cho-xac-nhan", "dang-goi"},
      {"dang-goi", "dang-giao"},
      {"dang-giao", "da-giao"},
      {"da-giao", "hoan-hang"},
  };
}
`,
  test: `#include "OrderFlow.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<std::string, std::string>> attempts = {
      {"cho-xac-nhan", "dang-goi"}, {"dang-goi", "dang-giao"},
      {"dang-giao", "da-giao"}, {"da-giao", "hoan-hang"},
      {"da-giao", "cho-xac-nhan"}, {"hoan-hang", "dang-giao"}};
  int valid = 0;
  for (const auto& step : attempts) {
    if (OrderFlow::canTransition(step.first, step.second)) ++valid;
  }
  std::cout << valid << "\\n";
}
`,
});

// --------------------------------------------------------------------------
// 10. LedgerAudit — đối soát sổ (base: table)
// --------------------------------------------------------------------------

const ledgerAudit = definition({
  id: "ledger-audit-table",
  className: "LedgerAudit",
  base: "table",
  concept: "reconciliation",
  purpose: "Cộng tổng chênh lệch giữa sổ nội bộ và sao kê ngân hàng.",
  changePurpose: "Tính cả chênh lệch âm, không chỉ phần ngân hàng ghi nhiều hơn.",
  header: `#pragma once
#include <utility>
#include <vector>
class LedgerAudit {
 public:
  // Tổng chênh lệch tuyệt đối giữa {sổ nội bộ, sao kê} của mọi dòng.
  static long long mismatchTotal(const std::vector<std::pair<long long, long long>>& rows);
 private:
  static long long gap(long long book, long long bank);
};
`,
  readOnlyRole: "gap(book, bank) trả hiệu sao kê − sổ, giữ nguyên dấu âm hay dương.",
  readOnlyCode: `long long LedgerAudit::gap(long long book, long long bank) {
  return bank - book;
}`,
  steps: [
    "Bỏ điều kiện difference > 0 và cộng trị tuyệt đối của difference.",
    "Không sửa helper gap(): dấu của hiệu vẫn có ích cho báo cáo sau này.",
    "Tự kiểm: dòng Ngày 03 lệch −90 phải đóng góp 90, tổng cuối là 510.",
  ],
  editableHead: `long long LedgerAudit::mismatchTotal(
    const vector<pair<long long, long long>>& rows
) {
  long long total = 0;
`,
  oldCode: `for (const auto& row : rows) {
  const long long difference = gap(row.first, row.second);
  // Chỉ cần soát khi ngân hàng ghi nhiều hơn sổ.
  if (difference > 0) total += difference;
}
return total;`,
  solvedSource: `#include "LedgerAudit.hpp"
using namespace std;

long long LedgerAudit::gap(long long book, long long bank) {
  return bank - book;
}

long long LedgerAudit::mismatchTotal(
    const vector<pair<long long, long long>>& rows
) {
  long long total = 0;
  for (const auto& row : rows) {
    const long long difference = gap(row.first, row.second);
    total += difference < 0 ? -difference : difference;
  }
  return total;
}
`,
  test: `#include "LedgerAudit.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<long long, long long>> rows = {
      {1200, 1200}, {800, 950}, {2400, 2310}, {500, 500}, {1750, 1900}, {620, 500}};
  std::cout << LedgerAudit::mismatchTotal(rows) << "\\n";
}
`,
});

const authoredDefinitions = [
  buildOrderTree, prefixRouter, shiftPlanner, sweepMonitor, fieldSurvey,
  apiGateway, retryBudget, memoryPool, orderFlow, ledgerAudit,
];

module.exports = { authoredDefinitions, ZONE_READ, ZONE_WORK, CUT_OPEN, CUT_CLOSE };
