"use strict";

// Pure scaffold/read-model for the one approved derived artifact. The source
// is a fixed interface module, not an AI rewrite of the student's solution.

const { sha256 } = require("./verifiedArtifact");

const ARTIFACT_ID = "grid-pathfinder";
const BASELINE_REQUIREMENT = "shortest-path-4-way-v1";
const CHANGE_REQUIREMENT = "allow-diagonal-v2";

const HEADER = `#pragma once
#include <string>
#include <utility>
#include <vector>

class GridPathfinder {
public:
    static int shortestPath(
        const std::vector<std::string>& grid,
        std::pair<int, int> start,
        std::pair<int, int> target
    );
};
`;

const SOURCE = `#include "GridPathfinder.hpp"
#include <queue>
using namespace std;

// Trong bài thi em đặt BFS trong main(). Ở Xưởng, main() nằm trong demo/test;
// hàm dưới đây chính là phần BFS cũ được tách ra để sản phẩm gọi lại.
int GridPathfinder::shortestPath(
    const vector<string>& grid,
    pair<int, int> start,
    pair<int, int> target
) {
    // PHẦN 1: Kiểm tra dữ liệu đầu vào.
    const int rows = static_cast<int>(grid.size());
    if (rows == 0) return -1;
    const int cols = static_cast<int>(grid[0].size());
    if (cols == 0) return -1;
    for (const string& row : grid) {
        if (static_cast<int>(row.size()) != cols) return -1;
    }

    const auto inside = [rows, cols](pair<int, int> cell) {
        return cell.first >= 0 && cell.second >= 0
            && cell.first < rows && cell.second < cols;
    };
    if (!inside(start) || !inside(target)) return -1;
    if (grid[start.first][start.second] == '#' || grid[target.first][target.second] == '#') return -1;

    // PHẦN 2: BFS cũ của em. Build hiện tại chỉ thay đổi bộ hướng bên dưới.
    vector<vector<int>> distance(rows, vector<int>(cols, -1));
    queue<pair<int, int>> pending;

    // TODO Xưởng 01 — em chỉ sửa danh sách directions:
    // Mỗi pair là {đổi hàng, đổi cột}. Ví dụ {1, 1} nghĩa là xuống-phải.
    // Thêm bốn tổ hợp chéo của ±1 và ±1. Không cần sửa phần BFS bên dưới.
    const vector<pair<int, int>> directions = {
        {0, 1},   // phải
        {1, 0},   // xuống
        {0, -1},  // trái
        {-1, 0},  // lên
        // Em thêm 4 pair chéo ở đây.
    };
    distance[start.first][start.second] = 0;
    pending.push(start);

    while (!pending.empty()) {
        const auto current = pending.front();
        pending.pop();
        if (current == target) return distance[current.first][current.second];
        // Vòng lặp đọc từng pair em khai báo; thêm hướng ở trên là đủ.
        for (const auto& [rowStep, columnStep] : directions) {
            const int nr = current.first + rowStep;
            const int nc = current.second + columnStep;
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
            if (grid[nr][nc] == '#' || distance[nr][nc] != -1) continue;
            distance[nr][nc] = distance[current.first][current.second] + 1;
            pending.push({nr, nc});
        }
    }
    return -1;
}
`;

const BASELINE_TEST = `#include "GridPathfinder.hpp"
#include <iostream>
#include <string>

static int failures = 0;

static void expectEqual(const std::string& name, int actual, int expected) {
    if (actual != expected) {
        ++failures;
        std::cout << name << ": expected " << expected << ", got " << actual << "\\n";
    }
}

int main() {
    expectEqual("adjacent", GridPathfinder::shortestPath({".."}, {0, 0}, {0, 1}), 1);
    expectEqual("same-cell", GridPathfinder::shortestPath({"."}, {0, 0}, {0, 0}), 0);
    expectEqual("unreachable", GridPathfinder::shortestPath({".#", "#."}, {0, 0}, {1, 1}), -1);
    expectEqual("rectangular", GridPathfinder::shortestPath({"...", ".#."}, {0, 0}, {1, 2}), 3);
    expectEqual("blocked-target", GridPathfinder::shortestPath({".#"}, {0, 0}, {0, 1}), -1);
    expectEqual("outside-grid", GridPathfinder::shortestPath({".."}, {-1, 0}, {0, 1}), -1);
    expectEqual("ragged-grid", GridPathfinder::shortestPath({"..", "."}, {0, 0}, {1, 0}), -1);
    std::cout << (failures == 0 ? "OK\\n" : "FAIL\\n");
    return 0;
}
`;

const REQUIREMENT_CHANGE_TEST = `#include "GridPathfinder.hpp"
#include <iostream>

int main() {
    const int actual = GridPathfinder::shortestPath({"..", ".."}, {0, 0}, {1, 1});
    if (actual == 1) std::cout << "OK\\n";
    else std::cout << "allow-diagonal: expected 1, got " << actual << "\\nFAIL\\n";
    return 0;
}
`;

const HIDDEN_BASELINE_TEST = `#include "GridPathfinder.hpp"
#include <iostream>
int main(){
  const std::vector<std::string> grid={"....",".##.","...."};
  if(GridPathfinder::shortestPath(grid,{0,0},{2,3})!=5) return 1;
  if(GridPathfinder::shortestPath(grid,{0,0},{2,3})!=5) return 2;
  if(GridPathfinder::shortestPath({}, {0,0}, {0,0})!=-1) return 3;
  std::cout<<"OK\\n";
}
`;

const HIDDEN_CHANGE_TEST = `#include "GridPathfinder.hpp"
#include <iostream>
int main(){
  const std::vector<std::string> grid={"...","...","..."};
  if(GridPathfinder::shortestPath(grid,{0,0},{2,2})!=2) return 1;
  if(GridPathfinder::shortestPath(grid,{2,0},{0,2})!=2) return 2;
  std::cout<<"OK\\n";
}
`;

function buildScaffold({ problemId, sourceTitle, evidence, createdAt } = {}) {
  const at = createdAt || new Date().toISOString();
  return {
    manifest: {
      version: 1,
      id: ARTIFACT_ID,
      title: "GridPathfinder",
      activityKind: "algorithm-module",
      track: "algorithm-engineering",
      provider: "local",
      collection: sourceTitle || "",
      origin: "derived",
      derivedFrom: {
        problemId,
        runId: evidence && evidence.runId,
        evidenceId: evidence && evidence.id,
        evidenceHref: evidence && evidence.href,
        codeHash: evidence && evidence.codeHash,
        verdict: evidence && evidence.verdict,
      },
      currentRequirementId: BASELINE_REQUIREMENT,
      requirements: [
        {
          id: BASELINE_REQUIREMENT,
          version: 1,
          status: "active",
          brief: "Trả số bước ngắn nhất trên grid chữ nhật với di chuyển 4 hướng; trả -1 khi input không hợp lệ hoặc không tới được.",
          acceptanceCriteria: ["adjacent", "same-cell", "unreachable", "rectangular", "blocked endpoint", "out-of-bounds", "ragged grid"],
        },
        {
          id: CHANGE_REQUIREMENT,
          version: 2,
          status: "proposed",
          derivedFrom: BASELINE_REQUIREMENT,
          brief: "Requirement change: cho phép đi chéo; (0,0) tới (1,1) trên grid trống phải có distance 1.",
          acceptanceCriteria: ["diagonal-adjacent distance = 1"],
        },
      ],
      checks: {
        baseline: { requirementId: BASELINE_REQUIREMENT, file: "GridPathfinder.test.cpp" },
        "requirement-change": { requirementId: CHANGE_REQUIREMENT, file: "GridPathfinder.requirement-change.test.cpp" },
      },
      createdAt: at,
      updatedAt: at,
    },
    files: {
      "GridPathfinder.hpp": HEADER,
      "GridPathfinder.cpp": SOURCE,
      "GridPathfinder.test.cpp": BASELINE_TEST,
      "GridPathfinder.requirement-change.test.cpp": REQUIREMENT_CHANGE_TEST,
    },
  };
}

function composeTranslationUnit(files, suite) {
  const testName = suite === "requirement-change"
    ? "GridPathfinder.requirement-change.test.cpp"
    : "GridPathfinder.test.cpp";
  const stripLocalInclude = (value) => String(value || "").replace(/^#include\s+"GridPathfinder\.hpp"\s*$/gm, "");
  return [
    files["GridPathfinder.hpp"],
    stripLocalInclude(files["GridPathfinder.cpp"]),
    stripLocalInclude(files[testName]),
  ].join("\n");
}

function composeHiddenTranslationUnit(files, suite) {
  const stripLocalInclude = (value) => String(value || "").replace(/^#include\s+"GridPathfinder\.hpp"\s*$/gm, "");
  const test = suite === "requirement-change" ? HIDDEN_CHANGE_TEST : HIDDEN_BASELINE_TEST;
  return [files["GridPathfinder.hpp"], stripLocalInclude(files["GridPathfinder.cpp"]), stripLocalInclude(test)].join("\n");
}

function latestRun(runs, suite) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run && run.suite === suite)
    .slice()
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}

function deriveStatus(manifest, runs, files) {
  const suite = manifest && manifest.currentRequirementId === CHANGE_REQUIREMENT
    ? "requirement-change"
    : "baseline";
  const run = latestRun(runs, suite);
  if (!run) return suite === "baseline" ? "unverified" : "needs-work";
  if (run.verdict !== "AC") return "needs-work";
  if (files && run.codeHash !== sourceHash(files, suite)) return "needs-work";
  return "verified";
}

function nextAction(manifest, runs, files) {
  const status = deriveStatus(manifest, runs, files);
  const change = manifest && Array.isArray(manifest.requirements)
    ? manifest.requirements.find((item) => item.id === CHANGE_REQUIREMENT)
    : null;
  if (manifest.currentRequirementId === CHANGE_REQUIREMENT) {
    if (status === "verified") {
      return { id: "continue-from-derived", state: "evolve", label: "Tiếp tục từ module", reason: "Checks của requirement change đã pass." };
    }
    return { id: "open-derived-work", state: "work", label: "Sửa GridPathfinder", reason: "Requirement đi chéo đang active nhưng check chưa pass." };
  }
  if (status !== "verified") {
    return { id: "verify-derived-baseline", state: "verify", label: "Chạy unit tests", reason: "Module scaffold cần pass baseline checks trước khi đổi requirement." };
  }
  if (change && change.status === "proposed") {
    return { id: "activate-requirement-change", state: "evolve", label: "Mở requirement đi chéo", reason: "Baseline đã pass; activation explicit sẽ mở vòng Brief/Work mới." };
  }
  return { id: "continue-from-derived", state: "evolve", label: "Tiếp tục từ module", reason: "Module hiện tại đã verify." };
}

function sourceHash(files, suite) {
  return sha256(`${composeTranslationUnit(files, suite)}\n${composeHiddenTranslationUnit(files, suite)}`);
}

module.exports = {
  ARTIFACT_ID,
  BASELINE_REQUIREMENT,
  CHANGE_REQUIREMENT,
  buildScaffold,
  composeTranslationUnit,
  composeHiddenTranslationUnit,
  deriveStatus,
  nextAction,
  sourceHash,
};
