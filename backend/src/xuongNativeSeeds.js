"use strict";

function createDefinition(spec) {
  const testFile = `${spec.baseName}.test.cpp`;
  const changeFile = `${spec.baseName}.requirement-change.test.cpp`;
  return {
    ARTIFACT_ID: spec.id,
    SOURCE_FILE: `${spec.baseName}.cpp`,
    buildScaffold({ createdAt } = {}) {
      const at = createdAt || new Date().toISOString();
      return {
        manifest: {
          version: 1,
          id: spec.id,
          title: spec.title,
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
          [`${spec.baseName}.hpp`]: spec.header,
          [`${spec.baseName}.cpp`]: spec.source,
          [testFile]: spec.baselineTest,
          [changeFile]: spec.changeTest,
        },
      };
    },
    composeHiddenTranslationUnit(files, suite) {
      const headerName = `${spec.baseName}.hpp`;
      const sourceName = `${spec.baseName}.cpp`;
      const stripInclude = (value) => String(value || "").replace(new RegExp(`^#include\\s+"${headerName.replace(".", "\\.")}"\\s*$`, "gm"), "");
      const test = suite === "requirement-change" ? spec.hiddenChangeTest : spec.hiddenBaselineTest;
      return [files[headerName], stripInclude(files[sourceName]), stripInclude(test)].join("\n");
    },
  };
}

const slidingWindowLimiter = createDefinition({
  id: "sliding-window-limiter",
  baseName: "SlidingWindowLimiter",
  title: "SlidingWindowLimiter",
  concept: "sliding-window",
  purpose: "Giới hạn số sự kiện theo từng khóa trong một cửa sổ thời gian trượt.",
  changePurpose: "Báo số sự kiện đang còn hiệu lực mà không ghi thêm sự kiện mới.",
  header: `#pragma once
#include <cstddef>
#include <deque>
#include <string>
#include <unordered_map>
class SlidingWindowLimiter {
 public:
  SlidingWindowLimiter(long long windowMs, std::size_t limit);
  bool allow(const std::string& key, long long timestampMs);
  std::size_t activeCount(const std::string& key, long long timestampMs);
 private:
  long long windowMs_;
  std::size_t limit_;
  std::unordered_map<std::string, std::deque<long long>> events_;
  std::unordered_map<std::string, long long> lastTimestamp_;
  void prune(const std::string& key, long long timestampMs);
};
`,
  source: `#include "SlidingWindowLimiter.hpp"
#include <stdexcept>
using namespace std;

// Trong bài thi em thường xử lý từng request ngay trong main().
// Ở Xưởng, main() nằm trong demo/test; class này giữ dữ liệu giữa nhiều lần gọi.
SlidingWindowLimiter::SlidingWindowLimiter(long long windowMs, std::size_t limit)
    : windowMs_(windowMs), limit_(limit) {
  if (windowMs <= 0 || limit == 0) {
    throw invalid_argument("window and limit must be positive");
  }
}

// PHẦN 1: Bỏ các sự kiện đã nằm ngoài cửa sổ thời gian.
void SlidingWindowLimiter::prune(const string& key, long long timestampMs) {
  auto& queue = events_[key];
  while (!queue.empty() && queue.front() <= timestampMs - windowMs_) {
    queue.pop_front();
  }
}

// PHẦN 2: Logic giới hạn cũ đã hoạt động; em không cần sửa ở build này.
bool SlidingWindowLimiter::allow(const string& key, long long timestampMs) {
  auto seen = lastTimestamp_.find(key);
  if (seen != lastTimestamp_.end() && timestampMs < seen->second) {
    throw invalid_argument("timestamps must be nondecreasing per key");
  }
  lastTimestamp_[key] = timestampMs;
  prune(key, timestampMs);
  auto& queue = events_[key];
  if (queue.size() >= limit_) return false;
  queue.push_back(timestampMs);
  return true;
}

// PHẦN 3: VIỆC CỦA EM.
// Em chỉ viết trong hàm này. prune() là helper đã có sẵn ở PHẦN 1.
size_t SlidingWindowLimiter::activeCount(
    const string& key,
    long long timestampMs
) {
  // TODO Xưởng 01.1 — gọi prune(key, timestampMs) để bỏ mốc đã hết hạn.

  // TODO Xưởng 01.2 — trả kích thước queue của đúng key.
  // Không push timestampMs: đây là thao tác đọc, không phải request mới.
  return 0;
}
`,
  baselineTest: `#include "SlidingWindowLimiter.hpp"
#include <iostream>
#include <stdexcept>
int main(){
  SlidingWindowLimiter limiter(1000, 2);
  if(!limiter.allow("alice",0)||!limiter.allow("alice",500)||limiter.allow("alice",700)) return 1;
  if(!limiter.allow("alice",1001)||!limiter.allow("bob",700)) return 2;
  try{limiter.allow("alice",900);return 3;}catch(const std::invalid_argument&){}
  std::cout<<"OK\\n";
}
`,
  changeTest: `#include "SlidingWindowLimiter.hpp"
#include <iostream>
int main(){
  SlidingWindowLimiter limiter(1000,3);
  limiter.allow("api",0); limiter.allow("api",500);
  if(limiter.activeCount("api",500)!=2) return 1;
  if(limiter.activeCount("api",1001)!=1) return 2;
  std::cout<<"OK\\n";
}
`,
  hiddenBaselineTest: `#include "SlidingWindowLimiter.hpp"
#include <iostream>
int main(){
  SlidingWindowLimiter limiter(10,1);
  if(!limiter.allow("x",4)||limiter.allow("x",13)||!limiter.allow("x",14)) return 1;
  if(!limiter.allow("y",13)) return 2;
  std::cout<<"OK\\n";
}
`,
  hiddenChangeTest: `#include "SlidingWindowLimiter.hpp"
#include <iostream>
int main(){
  SlidingWindowLimiter limiter(100,4);
  limiter.allow("x",10); limiter.allow("x",20); limiter.allow("x",30);
  if(limiter.activeCount("x",30)!=3||limiter.activeCount("x",111)!=2) return 1;
  if(limiter.activeCount("missing",111)!=0) return 2;
  std::cout<<"OK\\n";
}
`,
});

const dependencyPlanner = createDefinition({
  id: "dependency-planner",
  baseName: "DependencyPlanner",
  title: "DependencyPlanner",
  concept: "topological-sort",
  purpose: "Lập thứ tự build ổn định từ các dependency và phát hiện chu trình.",
  changePurpose: "Gỡ một dependency rồi lập lại thứ tự build mà không dựng lại project.",
  header: `#pragma once
#include <map>
#include <set>
#include <string>
#include <vector>
class DependencyPlanner {
 public:
  void addTask(const std::string& task);
  void addDependency(const std::string& before, const std::string& after);
  std::vector<std::string> buildOrder() const;
  bool removeDependency(const std::string& before, const std::string& after);
 private:
  std::set<std::string> tasks_;
  std::map<std::string, std::set<std::string>> edges_;
};
`,
  source: `#include "DependencyPlanner.hpp"
#include <functional>
#include <queue>
#include <stdexcept>
using namespace std;

// Trong bài thi em thường dựng đồ thị và topo-sort trong main().
// Ở Xưởng, main() nằm trong demo/test; class này giữ kế hoạch để sản phẩm
// có thể thêm hoặc gỡ dependency rồi tính lại thứ tự build.

// PHẦN 1: Tạo task và quan hệ phụ thuộc.
void DependencyPlanner::addTask(const string& task) {
  if (task.empty()) throw invalid_argument("task cannot be empty");
  tasks_.insert(task);
}

void DependencyPlanner::addDependency(const string& before, const string& after) {
  if (before == after) throw invalid_argument("self dependency");
  addTask(before);
  addTask(after);
  edges_[before].insert(after);
}

// PHẦN 2: Topological sort cũ đã hoạt động; build này không bắt em viết lại.
vector<string> DependencyPlanner::buildOrder() const {
  map<string, int> indegree;
  for (const auto& task : tasks_) indegree[task] = 0;
  for (const auto& [from, nextTasks] : edges_) {
    for (const auto& next : nextTasks) ++indegree[next];
  }
  priority_queue<string, vector<string>, greater<string>> ready;
  for (const auto& [task, degree] : indegree) {
    if (degree == 0) ready.push(task);
  }
  vector<string> order;
  while (!ready.empty()) {
    auto current = ready.top();
    ready.pop();
    order.push_back(current);
    auto found = edges_.find(current);
    if (found == edges_.end()) continue;
    for (const auto& next : found->second) {
      if (--indegree[next] == 0) ready.push(next);
    }
  }
  if (order.size() != tasks_.size()) throw runtime_error("dependency cycle");
  return order;
}

// PHẦN 3: VIỆC CỦA EM.
// Em chỉ viết trong hàm này. buildOrder() phía trên sẽ tự tính lại thứ tự.
bool DependencyPlanner::removeDependency(
    const string& before,
    const string& after
) {
  // TODO Xưởng 01.1 — tìm before trong edges_.
  // Nếu before chưa có danh sách cạnh đi ra, return false.

  // TODO Xưởng 01.2 — erase(after) khỏi set cạnh đi ra.
  // erase() trả số phần tử bị gỡ: đổi kết quả đó thành bool và return.
  return false;
}
`,
  baselineTest: `#include "DependencyPlanner.hpp"
#include <iostream>
#include <stdexcept>
#include <vector>
int main(){
  DependencyPlanner planner; planner.addDependency("compile-a","link"); planner.addDependency("compile-b","link");
  if(planner.buildOrder()!=std::vector<std::string>({"compile-a","compile-b","link"})) return 1;
  planner.addDependency("link","compile-a");
  try{planner.buildOrder();return 2;}catch(const std::runtime_error&){}
  std::cout<<"OK\\n";
}
`,
  changeTest: `#include "DependencyPlanner.hpp"
#include <iostream>
#include <vector>
int main(){
  DependencyPlanner planner; planner.addDependency("a","b");
  if(!planner.removeDependency("a","b")||planner.removeDependency("a","b")) return 1;
  planner.addDependency("b","a");
  if(planner.buildOrder()!=std::vector<std::string>({"b","a"})) return 2;
  std::cout<<"OK\\n";
}
`,
  hiddenBaselineTest: `#include "DependencyPlanner.hpp"
#include <iostream>
#include <vector>
int main(){
  DependencyPlanner planner; planner.addTask("z"); planner.addDependency("a","c"); planner.addDependency("b","c");
  if(planner.buildOrder()!=std::vector<std::string>({"a","b","c","z"})) return 1;
  std::cout<<"OK\\n";
}
`,
  hiddenChangeTest: `#include "DependencyPlanner.hpp"
#include <iostream>
#include <vector>
int main(){
  DependencyPlanner planner; planner.addDependency("fetch","build"); planner.addDependency("build","test");
  if(!planner.removeDependency("build","test")) return 1;
  planner.addDependency("test","build");
  if(planner.buildOrder()!=std::vector<std::string>({"fetch","test","build"})) return 2;
  std::cout<<"OK\\n";
}
`,
});

module.exports = { slidingWindowLimiter, dependencyPlanner };
