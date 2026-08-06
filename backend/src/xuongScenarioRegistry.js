"use strict";

// This is the trusted side of Xưởng.  AI may select/bind one of these arcs,
// but runners, expectations, trace semantics and verifier identity live here.
const REGISTRY_VERSION = "xuong-registry.2026-07-24.4";
const { c6Definitions } = require("./xuongC6NativeSeeds");
const { authoredArcs } = require("./xuongAuthoredArcs");

const MAZE_GRID = [
  ".........",
  ".........",
  "...#.#...",
  ".#.......",
  "..#...#..",
  ".#.......",
  "...#.#...",
  ".....#...",
  ".........",
];
const MAZE_START = [1, 1];
const MAZE_TARGET = [7, 7];
const FOUR_WAY = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const EIGHT_WAY = FOUR_WAY.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);

function mazeCellId(row, col) {
  return `cell-${row}-${col}`;
}

function mazeDistanceField(diagonal) {
  const rows = MAZE_GRID.length;
  const cols = MAZE_GRID[0].length;
  const distance = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const queue = [MAZE_TARGET];
  distance[MAZE_TARGET[0]][MAZE_TARGET[1]] = 0;
  const directions = diagonal ? EIGHT_WAY : FOUR_WAY;
  for (let head = 0; head < queue.length; head += 1) {
    const [row, col] = queue[head];
    for (const [rowStep, columnStep] of directions) {
      const nextRow = row + rowStep;
      const nextCol = col + columnStep;
      if (nextRow < 0 || nextCol < 0 || nextRow >= rows || nextCol >= cols) continue;
      if (MAZE_GRID[nextRow][nextCol] === "#" || distance[nextRow][nextCol] !== -1) continue;
      distance[nextRow][nextCol] = distance[row][col] + 1;
      queue.push([nextRow, nextCol]);
    }
  }
  return distance;
}

function mazeRoute(distance, diagonal) {
  const directions = diagonal ? EIGHT_WAY : FOUR_WAY;
  const route = [MAZE_START];
  let [row, col] = MAZE_START;
  while ((row !== MAZE_TARGET[0] || col !== MAZE_TARGET[1]) && route.length < 100) {
    const next = directions
      .map(([rowStep, columnStep]) => [row + rowStep, col + columnStep])
      .find(([nextRow, nextCol]) => (
        nextRow >= 0
        && nextCol >= 0
        && nextRow < distance.length
        && nextCol < distance[0].length
        && distance[nextRow][nextCol] === distance[row][col] - 1
      ));
    if (!next) break;
    route.push(next);
    [row, col] = next;
  }
  return route;
}

const arcs = {
  "grid-pathfinder": {
    authored: true,
    productTitle: "MazeNavigator",
    id: "maze-navigator-diagonal",
    display: { label: "Rút ngắn tuyến xe kho bằng lối đi chéo", description: "Xe đang đi vòng theo hàng và cột dù kho có các lối chéo hợp lệ." },
    domain: "grid",
    sourceSymbol: "GridPathfinder::shortestPath",
    sourceLabel: "Hàm tìm đường",
    capability: { summary: "Lời giải cũ tìm được đường ít bước theo bốn hướng.", label: "Tìm đường ít bước", claim: "Hàm duyệt các ô kề để tìm đường tới đích." },
    transformation: {
      oldAssumption: "Mỗi bước chỉ được đi theo bốn hướng.",
      breakingEvent: "Lối đi trong kho cho phép xe chuyển sang ô chéo kề, nhưng bộ hướng hiện tại không hề xét bước đó.",
      newCapability: "Dùng được cả tám hướng di chuyển trên những ô không bị chặn.",
      observableOutcome: "Preview cho thấy tuyến màu xanh cắt chéo qua kho và giảm từ 12 xuống 6 bước.",
      requirement: "Mở rộng bộ hướng để xe đi từ khu nhận A tới khu giao B trong 6 bước chéo hợp lệ.",
    },
    learningBridge: {
      intro: "BFS vẫn là BFS em từng viết trong main(). Xưởng chỉ đưa phần tìm đường vào một hàm để scenario có thể gọi lại với nhiều bản đồ.",
      familiarCode: `int main() {
  cout << GridPathfinder::shortestPath(
    /* bản đồ kho 9×9 */, {1, 1}, {7, 7}
  );
}`,
      editInstruction: [
        "Đọc mỗi pair theo thứ tự {đổi hàng, đổi cột}; ví dụ {1, 1} là xuống-phải.",
        "Trong directions, thêm bốn tổ hợp chéo của ±1 và ±1; không sửa queue, distance hay điều kiện tường.",
        "Tự kiểm: từ (1,1) tới (2,2) phải là một bước, rồi bấm Chạy build để nhìn tuyến giảm từ 12 xuống 6.",
      ].join("\n"),
      fileRoles: [
        { suffix: ".hpp", label: "Giao diện · chỉ đọc", description: "Tên hàm và kiểu dữ liệu mà scenario dùng để gọi BFS." },
        { suffix: ".cpp", label: "Phần em sửa", description: "BFS cũ đã được tách khỏi main(); build này chỉ sửa danh sách directions." },
        { suffix: ".requirement-change.test.cpp", label: "main() của scenario · chỉ đọc", description: "Tạo bản đồ, gọi shortestPath() và đối chiếu số bước." },
      ],
    },
    inputSummary: "Kho 9×9 có kệ chắn; xe đi từ (1,1) tới (7,7). Tuyến 4 hướng dài 12 bước, tuyến chéo hợp lệ dài 6 bước.",
    buildHarness: ({ header }) => `#include "${header}"
#include <iostream>
int main(){
  std::cout << GridPathfinder::shortestPath({
    ".........",
    ".........",
    "...#.#...",
    ".#.......",
    "..#...#..",
    ".#.......",
    "...#.#...",
    ".....#...",
    "........."
  }, {1,1}, {7,7}) << "\\n";
}
`,
    expected: 6,
    // What the untouched baseline prints: four-way BFS walks 12 steps.
    redActual: 12,
    parse: (output) => Number(String(output).trim()),
    model({ actual, passed, mappingId, runId, scenario }) {
      const field = mazeDistanceField(passed);
      const route = mazeRoute(field, passed);
      const routeIds = route.map(([row, col]) => mazeCellId(row, col));
      const routeSet = new Set(routeIds);
      const observed = Number.isFinite(actual) ? actual : "không hợp lệ";
      const anchor = passed ? [] : [{
        id: "anchor-diagonal",
        eventIndex: 2,
        entityId: mazeCellId(...MAZE_TARGET),
        sourceMappingId: mappingId,
        severity: "error",
        display: {
          label: `Xe vẫn đi vòng ${observed} bước`,
          description: "Kết quả cần là 6. directions hiện chỉ có bốn pair theo hàng/cột; thêm bốn pair chéo {±1, ±1}, rồi phát lại từ mốc này.",
        },
      }];
      const entities = [];
      for (let row = 0; row < MAZE_GRID.length; row += 1) {
        for (let col = 0; col < MAZE_GRID[row].length; col += 1) {
          const blocked = MAZE_GRID[row][col] === "#";
          const start = row === MAZE_START[0] && col === MAZE_START[1];
          const target = row === MAZE_TARGET[0] && col === MAZE_TARGET[1];
          entities.push({
            id: mazeCellId(row, col),
            kind: "cell",
            display: {
              label: blocked
                ? `Kệ chắn · (${row},${col})`
                : start
                  ? `Xe xuất phát · (${row},${col})`
                  : target
                    ? `Khu giao hàng · (${row},${col})`
                    : `Ô (${row},${col}) · còn ${field[row][col]} bước`,
            },
            state: {
              ...(blocked ? { blocked: true } : { distance: field[row][col] }),
              ...(start ? { start: true, role: "start", badge: "R" } : {}),
              ...(target ? { target: true, role: "target", badge: "G" } : {}),
              ...(routeSet.has(mazeCellId(row, col)) ? { routeUsed: true } : {}),
            },
            geometry: { x: col, y: row },
          });
        }
      }
      const relations = route.slice(1).map(([row, col], index) => ({
        id: `route-step-${index + 1}`,
        fromEntityId: routeIds[index],
        toEntityId: mazeCellId(row, col),
        kind: "route",
        display: { label: `Bước ${index + 1}` },
        state: { travelled: true },
      }));
      return {
        entities,
        relations,
        events: [
          {
            id: "event-map-loaded", index: 0, kind: "map-loaded",
            display: { label: "Nạp kho 9×9 và vị trí xe" },
            entityIds: [mazeCellId(...MAZE_START), mazeCellId(...MAZE_TARGET)],
            changedFields: [{
              entityId: mazeCellId(...MAZE_START), fieldId: "distance",
              display: { label: "Khoảng cách tới đích" }, before: null, after: field[MAZE_START[0]][MAZE_START[1]],
            }],
            anchorIds: [],
          },
          {
            id: "event-wave", index: 1, kind: "bfs-wave",
            display: { label: passed ? "BFS lan theo tám hướng" : "BFS mới lan theo bốn hướng" },
            entityIds: routeIds.slice(0, Math.min(4, routeIds.length)),
            changedFields: [],
            anchorIds: [],
          },
          {
            id: "event-route", index: 2, kind: passed ? "diagonal-route" : "orthogonal-route",
            display: { label: passed ? "Tuyến chéo 6 bước đã hình thành" : `Tuyến đang đi vòng ${observed} bước` },
            entityIds: routeIds,
            changedFields: [{
              fieldId: "route-length", display: { label: "Độ dài tuyến" },
              before: 12, after: observed,
            }],
            anchorIds: anchor.map((item) => item.id),
          },
          {
            id: "event-arrival", index: 3, kind: passed ? "arrived" : "route-too-long",
            display: { label: passed ? "Xe tới khu giao bằng tuyến ngắn hơn" : "Xe tới đích nhưng chưa dùng năng lực mới" },
            entityIds: [mazeCellId(...MAZE_TARGET)],
            changedFields: [],
            anchorIds: anchor.map((item) => item.id),
          },
        ],
        anchors: anchor,
        metrics: [
          { id: "route-length", display: { label: "Code đang trả" }, value: observed, unit: "bước" },
          { id: "expected-route-length", display: { label: "Tuyến cần đạt" }, value: 6, unit: "bước" },
        ],
        outputs: [{
          id: "route-result",
          display: { label: "Tuyến của xe" },
          value: passed ? "Đã dùng 6 bước chéo hợp lệ xuyên qua kho." : `Đang đi ${observed} bước theo hàng và cột; chưa dùng lối chéo.`,
        }],
        controls: [{ id: "trace-step", display: { label: "Xem từng mốc của tuyến" }, type: "stepper", value: 4 }],
      };
    },
    recipe: { base: "grid", overlays: ["path"], control: "stepper", layout: "focus" },
    // Stage 2 of the same arc.  It is only reachable through /evolve after the
    // stage above has real pass evidence, and it is deliberately red on the
    // source that solved stage 1: allowing diagonals without a corner guard
    // lets the cart slip through the gap between two shelves.
    stages: [{
      id: "maze-navigator-corner-guard",
      display: { label: "Chặn lối lách chéo giữa hai kệ hàng", description: "Bước chéo chỉ hợp lệ khi xe thật sự đi lọt." },
      transformation: {
        oldAssumption: "Đã cho đi chéo thì chỉ cần ô đích trống là bước chéo hợp lệ.",
        breakingEvent: "Hai kệ hàng xếp sát nhau tạo một khe chéo mà xe đẩy không lách qua được.",
        newCapability: "Chỉ cho bước chéo khi hai ô kề vuông góc cũng trống.",
        observableOutcome: "Preview cho thấy xe không còn lách qua khe giữa hai kệ; tuyến tới ô chéo báo không đi được.",
        requirement: "Chỉ đi chéo khi hai ô kề vuông góc cũng trống, nếu không thì báo không có tuyến.",
      },
      inputSummary: "Bản đồ 2×2 có hai kệ chắn chéo, cần đi từ (0,0) tới (1,1).",
      buildHarness: ({ header }) => `#include "${header}"
#include <iostream>
int main(){ std::cout << GridPathfinder::shortestPath({".#","#."},{0,0},{1,1}) << "\\n"; }
`,
      expected: -1,
      redActual: 1,
      model({ actual, passed, mappingId }) {
        const anchor = passed ? [] : [{ id: "anchor-corner-cut", eventIndex: 1, entityId: "cell-1-1", sourceMappingId: mappingId, severity: "error", display: { label: "Xe đang lách chéo qua khe giữa hai kệ", description: "Thêm điều kiện cho bước chéo: hai ô kề vuông góc phải cùng trống." } }];
        return {
          entities: [
            { id: "cell-0-0", kind: "cell", display: { label: "Điểm xuất phát" }, state: { start: true }, geometry: { x: 0, y: 0 } },
            { id: "cell-0-1", kind: "cell", display: { label: "Kệ hàng trên" }, state: { blocked: true }, geometry: { x: 1, y: 0 } },
            { id: "cell-1-0", kind: "cell", display: { label: "Kệ hàng dưới" }, state: { blocked: true }, geometry: { x: 0, y: 1 } },
            { id: "cell-1-1", kind: "cell", display: { label: "Ô chéo cần đến" }, state: { target: true, reachable: passed ? "không có tuyến" : `lách chéo ${actual} bước` }, geometry: { x: 1, y: 1 } },
          ],
          relations: [],
          events: [
            { id: "event-corner-request", index: 0, kind: "route-request", display: { label: "Yêu cầu tuyến qua khe giữa hai kệ" }, entityIds: ["cell-0-0", "cell-1-1"], changedFields: [], anchorIds: anchor.map((item) => item.id) },
            { id: "event-corner-result", index: 1, kind: passed ? "route-blocked" : "route-cut-corner", display: { label: passed ? "Đã từ chối lối lách chéo" : "Xe vẫn lách qua khe chéo" }, entityIds: ["cell-1-1"], changedFields: [{ entityId: "cell-1-1", fieldId: "reachable", display: { label: "Tuyến tới ô đích" }, before: null, after: passed ? "không có tuyến" : `lách chéo ${actual} bước` }], anchorIds: anchor.map((item) => item.id) },
          ],
          anchors: anchor,
          metrics: [{ id: "route-length", display: { label: "Số bước tìm được" }, value: actual }],
          outputs: [{ id: "route-result", display: { label: "Kết quả" }, value: passed ? "Không có tuyến hợp lệ giữa hai kệ." : `Vẫn tìm ra tuyến ${actual} bước bằng cách lách chéo.` }],
          controls: [{ id: "trace-step", display: { label: "Bước mô phỏng" }, type: "stepper", value: 2 }],
        };
      },
      recipe: { base: "grid", overlays: ["constraint"], control: "stepper", layout: "focus" },
    }],
  },
  "weighted-graph-router": {
    authored: true,
    productTitle: "RouteWatch",
    id: "route-watch-link-down", display: { label: "Định tuyến lại khi chi phí liên kết thay đổi", description: "Mạng giao hàng đang chạy thì tuyến trực tiếp được giảm phí; hệ thống phải dùng ngay dữ liệu mới." }, domain: "graph", sourceSymbol: "WeightedGraphRouter::updateDirectedEdge", sourceLabel: "Hàm cập nhật liên kết",
    capability: { summary: "Lời giải cũ chọn được tuyến có tổng trọng số thấp.", label: "Chọn tuyến ít chi phí", claim: "Hàm định tuyến tính đường đi từ các liên kết có trọng số." },
    transformation: { oldAssumption: "Trọng số liên kết không đổi sau khi đã thêm.", breakingEvent: "Tuyến trực tiếp A→F giảm phí từ 20 xuống 5 khi hệ thống đang điều phối.", newCapability: "Cập nhật liên kết đang có rồi tính lại tuyến.", observableOutcome: "Preview đổi tuyến đang chọn từ A→B→D→F (phí 6) sang A→F (phí 5).", requirement: "Khi A→F giảm còn 5, cập nhật đúng cạnh và chọn lại tuyến trực tiếp." },
    learningBridge: {
      intro: "Dijkstra em từng viết trong main() vẫn nằm nguyên ở shortestPath(). Build này chỉ thêm một hàm nhỏ để sản phẩm đổi dữ liệu đồ thị rồi gọi lại Dijkstra.",
      familiarCode: `int main() {
  WeightedGraphRouter router(6);
  // ... thêm các cạnh như bài đồ thị quen thuộc ...
  router.updateDirectedEdge(0, 5, 5);
  cout << router.shortestPath(0, 5).distance; // cần in 5
}`,
      editInstruction: [
        "Chỉ mở PHẦN 3 và viết trong updateDirectedEdge(from, to, newWeight); không sửa shortestPath().",
        "Từ graph_[from], duyệt từng pair {đỉnh đến, trọng số}; khi đỉnh đến bằng to thì ghi newWeight vào trọng số.",
        "Trả true ngay khi đã cập nhật; trả false nếu đỉnh/trọng số không hợp lệ hoặc không có cạnh cần tìm.",
        "Tự kiểm: sau updateDirectedEdge(0, 5, 5), Preview phải tô tuyến A→F và chi phí phải đổi từ 6 xuống 5.",
      ].join("\n"),
      fileRoles: [
        { suffix: ".hpp", label: "Giao diện · chỉ đọc", description: "Khai báo class, WeightedRoute và các hàm mà scenario được phép gọi." },
        { suffix: ".cpp", label: "Phần em sửa · một hàm", description: "shortestPath() đã hoạt động; chỉ viết ba bước TODO trong updateDirectedEdge()." },
        { suffix: ".requirement-change.test.cpp", label: "main() của scenario · chỉ đọc", description: "Dựng mạng 6 điểm, đổi phí A→F rồi gọi lại shortestPath()." },
      ],
    },
    inputSummary: "Mạng 6 điểm có tuyến A→B→D→F giá 6. Liên kết A→F đổi từ 20 xuống 5; tuyến mới phải đi thẳng.",
    buildHarness: ({ header }) => `#include "${header}"
#include <iostream>
int main() {
  WeightedGraphRouter router(6);
  router.addDirectedEdge(0, 1, 2);
  router.addDirectedEdge(1, 3, 2);
  router.addDirectedEdge(3, 5, 2);
  router.addDirectedEdge(0, 2, 4);
  router.addDirectedEdge(2, 4, 3);
  router.addDirectedEdge(4, 5, 3);
  router.addDirectedEdge(0, 5, 20);
  const bool updated = router.updateDirectedEdge(0, 5, 5);
  std::cout << (updated ? 1 : 0) << " "
            << router.shortestPath(0, 5).distance << "\\n";
}
`, expected: [1, 5], redActual: [0, 6], parse: (output) => String(output).trim().split(/\s+/).map(Number),
    model({ actual, passed, mappingId }) {
      const routeCost = Number(actual[1]);
      const anchor = passed ? [] : [{ id: "anchor-link-update", eventIndex: 2, entityId: "edge-0-5", sourceMappingId: mappingId, severity: "error", display: { label: "Tuyến chưa dùng chi phí mới của A→F", description: "updateDirectedEdge() chưa ghi trọng số 5 vào pair của cạnh A→F. Đi tới hàm, sửa đúng cạnh rồi phát lại từ sự kiện đổi phí." } }];
      return {
      entities: [
        { id: "node-0", kind: "node", display: { label: "A · Kho xuất phát" }, state: { role: "source" }, geometry: { x: 0, y: 1 } },
        { id: "node-1", kind: "node", display: { label: "B · Trạm Bắc" }, state: { role: "transit" }, geometry: { x: 1, y: 0 } },
        { id: "node-2", kind: "node", display: { label: "C · Trạm Nam" }, state: { role: "transit" }, geometry: { x: 1, y: 2 } },
        { id: "node-3", kind: "node", display: { label: "D · Hub Bắc" }, state: { role: "transit" }, geometry: { x: 2, y: 0 } },
        { id: "node-4", kind: "node", display: { label: "E · Hub Nam" }, state: { role: "transit" }, geometry: { x: 2, y: 2 } },
        { id: "node-5", kind: "node", display: { label: "F · Điểm nhận" }, state: { role: "target" }, geometry: { x: 3, y: 1 } },
        { id: "edge-0-5", kind: "link-state", display: { label: "Trạng thái liên kết A→F" }, state: { weight: passed ? 5 : 20 } },
      ],
      relations: [
        { id: "edge-0-1", fromEntityId: "node-0", toEntityId: "node-1", kind: "edge", display: { label: "2" }, state: { travelled: !passed } },
        { id: "edge-1-3", fromEntityId: "node-1", toEntityId: "node-3", kind: "edge", display: { label: "2" }, state: { travelled: !passed } },
        { id: "edge-3-5", fromEntityId: "node-3", toEntityId: "node-5", kind: "edge", display: { label: "2" }, state: { travelled: !passed } },
        { id: "edge-0-2", fromEntityId: "node-0", toEntityId: "node-2", kind: "edge", display: { label: "4" }, state: { travelled: false } },
        { id: "edge-2-4", fromEntityId: "node-2", toEntityId: "node-4", kind: "edge", display: { label: "3" }, state: { travelled: false } },
        { id: "edge-4-5", fromEntityId: "node-4", toEntityId: "node-5", kind: "edge", display: { label: "3" }, state: { travelled: false } },
        { id: "edge-0-5", fromEntityId: "node-0", toEntityId: "node-5", kind: "edge", display: { label: passed ? "20 → 5" : "vẫn là 20" }, state: { travelled: passed, failed: !passed } },
      ],
      events: [
        { id: "event-network-ready", index: 0, kind: "network-ready", display: { label: "Mạng 6 điểm đang dùng tuyến A→B→D→F, phí 6" }, entityIds: ["node-0", "node-1", "node-3", "node-5"], changedFields: [], anchorIds: [] },
        { id: "event-link-change", index: 1, kind: "link-change", display: { label: "Nhận sự kiện A→F giảm phí từ 20 xuống 5" }, entityIds: ["node-0", "node-5"], changedFields: [{ entityId: "edge-0-5", fieldId: "weight", display: { label: "Chi phí A→F" }, before: 20, after: passed ? 5 : 20 }], anchorIds: [] },
        { id: "event-update-applied", index: 2, kind: "edge-update", display: { label: passed ? "updateDirectedEdge() đã ghi trọng số mới" : "Cạnh A→F vẫn giữ trọng số cũ" }, entityIds: ["node-0", "node-5"], changedFields: [], anchorIds: anchor.map((a) => a.id) },
        { id: "event-reroute", index: 3, kind: "reroute", display: { label: passed ? "Dijkstra chọn tuyến trực tiếp A→F" : "Dijkstra vẫn chọn tuyến vòng A→B→D→F" }, entityIds: passed ? ["node-0", "node-5"] : ["node-0", "node-1", "node-3", "node-5"], changedFields: [{ fieldId: "route-cost", display: { label: "Chi phí tuyến" }, before: 6, after: routeCost }], anchorIds: anchor.map((a) => a.id) },
      ],
      anchors: anchor,
      metrics: [
        { id: "old-route-cost", display: { label: "Tuyến tốt nhất trước sự kiện" }, value: 6, unit: "đơn vị" },
        { id: "route-cost", display: { label: "Code đang chọn" }, value: routeCost, unit: "đơn vị" },
        { id: "expected-route-cost", display: { label: "Tuyến cần chọn" }, value: 5, unit: "đơn vị" },
      ],
      outputs: [{ id: "route", display: { label: "Tuyến sau sự kiện" }, value: passed ? "A → F · liên kết mới đã được dùng · chi phí 5" : `A → B → D → F · code vẫn đọc mạng cũ · chi phí ${Number.isFinite(routeCost) ? routeCost : "không hợp lệ"}` }],
      controls: [{ id: "trace-step", display: { label: "Phát lại từng sự kiện mạng" }, type: "stepper", value: 4 }],
    };
    }, recipe: { base: "graph", overlays: ["dependency", "compare"], control: "stepper", layout: "balanced" },
  },
  "range-sum-module": {
    authored: true,
    productTitle: "ShardBalancer",
    id: "shard-balancer-live-total", display: { label: "Cân bằng tải khi một vùng nhận thêm dữ liệu", description: "Một bảng điều phối phải cập nhật số liệu của một vùng mà không trả về tổng cũ." }, domain: "chart", sourceSymbol: "RangeSum::updateZeroBased", sourceLabel: "Hàm cập nhật số liệu",
    capability: { summary: "Lời giải cũ trả lời nhanh tổng trên một dãy cố định.", label: "Tổng hợp theo khoảng", claim: "Hàm truy vấn dùng dữ liệu đã tiền xử lý." },
    transformation: { oldAssumption: "Mảng cộng dồn chỉ đúng khi dữ liệu nguồn không đổi.", breakingEvent: "Vùng 2 nhận thêm 6 đơn vị: giá trị đổi từ 4 thành 10.", newCapability: "Cập nhật phần tử nguồn, dựng lại dữ liệu cộng dồn và trả lời truy vấn mới.", observableOutcome: "Preview cho thấy sáu vùng, cột Vùng 2 đổi 4→10 và tổng toàn hệ thống đổi 28→34.", requirement: "Sau khi Vùng 2 đổi từ 4 thành 10, tổng sáu vùng phải đổi từ 28 thành 34." },
    learningBridge: {
      intro: "Vẫn là C++ em đang dùng. main() không biến mất — Xưởng đã đặt nó trong file test để gọi phần xử lý nhiều lần.",
      familiarCode: `int main() {
  RangeSum totals({2, 4, 8, 3, 5, 6});
  totals.updateZeroBased(1, 10);
  cout << totals.queryZeroBased(0, 5); // cần in 34
}`,
      editInstruction: [
        "Chỉ viết trong PHẦN 3: updateZeroBased(index, value); các hàm query và helper rebuild() đã xong.",
        "Nếu index vượt khỏi values_ thì return false; nếu hợp lệ, gán values_[index] = value.",
        "Gọi rebuild() sau khi đổi dữ liệu, rồi return true. Nếu bỏ bước này, prefix_ vẫn giữ tổng cũ.",
        "Tự kiểm: Vùng 2 phải đổi 4→10 và thanh Tổng code đang trả phải là 34.",
      ].join("\n"),
      fileRoles: [
        { suffix: ".hpp", label: "Giao diện · chỉ đọc", description: "Khai báo class, query và update; không cần thêm include hay sửa contract." },
        { suffix: ".cpp", label: "Phần em sửa · một hàm", description: "Chỉ điền bốn TODO trong updateZeroBased(); rebuild() là helper void đã có." },
        { suffix: ".requirement-change.test.cpp", label: "main() của scenario · chỉ đọc", description: "Tạo sáu vùng, cập nhật index 1 rồi truy vấn tổng 0..5." },
      ],
    },
    inputSummary: "Sáu vùng đang có [2, 4, 8, 3, 5, 6] (tổng 28). Vùng 2 đổi thành 10; hệ thống phải trả tổng mới 34.", buildHarness: ({ header }) => `#include "${header}"
#include <iostream>
int main() {
  RangeSum totals({2, 4, 8, 3, 5, 6});
  const bool updated = totals.updateZeroBased(1, 10);
  std::cout << (updated ? 1 : 0) << " "
            << totals.queryZeroBased(0, 5) << "\\n";
}
`, expected: [1, 34], redActual: [0, 28], parse: (out) => String(out).trim().split(/\s+/).map(Number),
    model({ actual, passed, mappingId }) {
      const updateAccepted = Number(actual[0]) === 1;
      const total = Number(actual[1]);
      const anchor = passed ? [] : [{
        id: "anchor-shard-total", eventIndex: updateAccepted ? 3 : 1, entityId: "bar-zone-2",
        sourceMappingId: mappingId, severity: "error",
        display: {
          label: updateAccepted ? "Vùng 2 đã đổi nhưng tổng vẫn còn sai" : "Hàm cập nhật đang từ chối index hợp lệ",
          description: updateAccepted
            ? "values_ đã đổi nhưng prefix_ chưa được dựng lại. Mở updateZeroBased() và kiểm tra lời gọi rebuild()."
            : "Index 1 là hợp lệ. Mở updateZeroBased() và kiểm tra điều kiện biên cùng giá trị trả về.",
        },
      }];
      return {
        entities: [
          { id: "bar-zone-1", kind: "bar", display: { label: "Vùng 1" }, state: { value: 2, series: "dữ liệu nguồn" } },
          { id: "bar-zone-2", kind: "bar", display: { label: "Vùng 2" }, state: { value: updateAccepted ? 10 : 4, series: "dữ liệu nguồn" } },
          { id: "bar-zone-3", kind: "bar", display: { label: "Vùng 3" }, state: { value: 8, series: "dữ liệu nguồn" } },
          { id: "bar-zone-4", kind: "bar", display: { label: "Vùng 4" }, state: { value: 3, series: "dữ liệu nguồn" } },
          { id: "bar-zone-5", kind: "bar", display: { label: "Vùng 5" }, state: { value: 5, series: "dữ liệu nguồn" } },
          { id: "bar-zone-6", kind: "bar", display: { label: "Vùng 6" }, state: { value: 6, series: "dữ liệu nguồn" } },
        ],
        relations: [],
        events: [
          { id: "event-source-loaded", index: 0, kind: "source-loaded", display: { label: "Nạp sáu vùng [2, 4, 8, 3, 5, 6] · tổng 28" }, entityIds: ["bar-zone-1", "bar-zone-2", "bar-zone-3", "bar-zone-4", "bar-zone-5", "bar-zone-6"], changedFields: [], anchorIds: [] },
          { id: "event-shard-update", index: 1, kind: "bar-updated", display: { label: updateAccepted ? "updateZeroBased(1, 10) đã nhận cập nhật" : "updateZeroBased(1, 10) trả false" }, entityIds: ["bar-zone-2"], changedFields: [{ entityId: "bar-zone-2", fieldId: "value", display: { label: "Giá trị vùng 2" }, before: 4, after: updateAccepted ? 10 : 4 }], anchorIds: updateAccepted ? [] : anchor.map((a) => a.id) },
          { id: "event-prefix-rebuilt", index: 2, kind: "prefix-rebuilt", display: { label: passed ? "Dựng lại prefix [0, 2, 12, 20, 23, 28, 34]" : "Prefix chưa phản ánh dữ liệu mới" }, entityIds: ["bar-zone-2"], changedFields: [], anchorIds: passed ? [] : anchor.map((a) => a.id) },
          { id: "event-total", index: 3, kind: "total-recomputed", display: { label: passed ? "queryZeroBased(0, 5) trả 34" : `Truy vấn đang trả ${Number.isFinite(total) ? total : "kết quả không hợp lệ"}` }, entityIds: ["bar-zone-1", "bar-zone-2", "bar-zone-3", "bar-zone-4", "bar-zone-5", "bar-zone-6"], changedFields: [{ fieldId: "total", display: { label: "Tổng sáu vùng" }, before: 28, after: total }], anchorIds: anchor.map((a) => a.id) },
        ],
        anchors: anchor,
        metrics: [
          { id: "old-total", display: { label: "Tổng trước cập nhật" }, value: 28, unit: "đơn vị" },
          { id: "total", display: { label: "Tổng code đang trả" }, value: total, unit: "đơn vị" },
          { id: "expected-total", display: { label: "Tổng cần đạt" }, value: 34, unit: "đơn vị" },
        ],
        outputs: [
          { id: "update-result", display: { label: "Lời gọi cập nhật" }, value: updateAccepted ? "Đã nhận index 1, giá trị 10." : "Đang trả false dù index 1 hợp lệ." },
          { id: "prefix-result", display: { label: "Dữ liệu cộng dồn cần có" }, value: passed ? "[0, 2, 12, 20, 23, 28, 34]" : "Prefix chưa khớp sáu vùng sau cập nhật." },
          { id: "total-result", display: { label: "Kết quả scenario" }, value: passed ? "Tổng đã chuyển từ 28 thành 34." : `Cần 34, code đang trả ${Number.isFinite(total) ? total : "không hợp lệ"}.` },
        ],
        controls: [{ id: "trace-step", display: { label: "Bước mô phỏng" }, type: "stepper", value: 4 }],
      };
    }, recipe: { base: "chart", overlays: ["compare", "target"], control: "stepper", layout: "wide" },
  },
  "sliding-window-limiter": {
    authored: true,
    productTitle: "MergeForge",
    id: "merge-forge-active-window", display: { label: "Quan sát request còn hiệu lực theo từng người dùng", description: "Dashboard phải đếm đúng request của một key trong cửa sổ trượt mà không tạo thêm request." }, domain: "sequence", sourceSymbol: "SlidingWindowLimiter::activeCount", sourceLabel: "Hàm đếm sự kiện",
    capability: { summary: "Lời giải cũ giới hạn được yêu cầu trong cửa sổ thời gian.", label: "Giới hạn theo cửa sổ", claim: "Hàm lưu các mốc thời gian còn hiệu lực cho từng khóa." },
    transformation: { oldAssumption: "Chỉ cần biết có cho phép yêu cầu mới hay không.", breakingEvent: "Tại 1250ms, dashboard cần biết riêng user upload còn bao nhiêu request trong 1000ms gần nhất.", newCapability: "Đếm chính xác sự kiện còn trong cửa sổ theo từng key mà không ghi thêm dữ liệu.", observableOutcome: "Preview giữ lại upload@700 và upload@1200, loại hai mốc cũ, không lẫn request của search; kết quả là 2.", requirement: "Tại 1250ms, activeCount(\"upload\") phải trả 2 và không thêm request mới." },
    learningBridge: {
      intro: "Sliding window em từng duyệt bằng hai con trỏ/queue vẫn ở đây. Class chỉ giữ queue giữa nhiều lần gọi; main() của scenario sẽ bắn một dòng request theo thời gian.",
      familiarCode: `int main() {
  SlidingWindowLimiter limiter(1000, 5);
  // ... các request upload và search ...
  cout << limiter.activeCount("upload", 1250); // cần in 2
}`,
      editInstruction: [
        "Chỉ viết activeCount(key, timestampMs) trong PHẦN 3; allow() và helper void prune() đã hoạt động.",
        "Gọi prune(key, timestampMs) để xóa các mốc của đúng key đã ra khỏi cửa sổ.",
        "Trả size của queue thuộc key đó. Không push timestampMs vì activeCount chỉ quan sát, không tạo request.",
        "Tự kiểm: cửa sổ 250..1250 chỉ còn upload@700 và upload@1200; hai request search không được tính.",
      ].join("\n"),
      fileRoles: [
        { suffix: ".hpp", label: "Giao diện · chỉ đọc", description: "Cho biết object giữ queue theo key và expose allow()/activeCount()." },
        { suffix: ".cpp", label: "Phần em sửa · một hàm", description: "Chỉ điền hai TODO trong activeCount(); prune() đã tách thành helper void để gọi lại." },
        { suffix: ".requirement-change.test.cpp", label: "main() của scenario · chỉ đọc", description: "Phát sáu request xen kẽ hai key rồi hỏi số request upload còn hiệu lực." },
      ],
    },
    inputSummary: "Sáu request xen kẽ upload/search từ 0ms đến 1200ms. Tại 1250ms chỉ upload@700 và upload@1200 còn hiệu lực.", buildHarness: ({ header }) => `#include "${header}"
#include <iostream>
int main() {
  SlidingWindowLimiter limiter(1000, 5);
  limiter.allow("upload", 0);
  limiter.allow("search", 100);
  limiter.allow("upload", 250);
  limiter.allow("upload", 700);
  limiter.allow("search", 900);
  limiter.allow("upload", 1200);
  std::cout << limiter.activeCount("upload", 1250) << "\\n";
}
`, expected: 2, redActual: 0, parse: (out) => Number(String(out).trim()),
    model({ actual, passed, mappingId }) {
      const count = Number(actual);
      const anchor = passed ? [] : [{ id: "anchor-active-count", eventIndex: 2, entityId: "upload-1200", sourceMappingId: mappingId, severity: "error", display: { label: `Dashboard đang đếm ${Number.isFinite(count) ? count : "sai định dạng"} thay vì 2`, description: "activeCount() phải prune đúng key rồi đọc queue của key đó. Đi tới hàm và kiểm tra hai TODO; không gọi allow() ở đây." } }];
      return {
        entities: [
          { id: "upload-0", kind: "request", display: { label: "upload · 0ms", description: "Request upload gửi lúc 0ms; cửa sổ hiệu lực là 1000ms gần nhất." }, state: { active: false, key: "upload", at: 0, order: 0, count: 1 } },
          { id: "search-100", kind: "request", display: { label: "search · 100ms", description: "Request search gửi lúc 100ms; cửa sổ hiệu lực là 1000ms gần nhất." }, state: { active: false, key: "search", at: 100, order: 1, count: 1 } },
          { id: "upload-250", kind: "request", display: { label: "upload · 250ms", description: "Request upload gửi lúc 250ms; cửa sổ hiệu lực là 1000ms gần nhất." }, state: { active: false, key: "upload", at: 250, order: 2, count: 1 } },
          { id: "upload-700", kind: "request", display: { label: "upload · 700ms", description: "Request upload gửi lúc 700ms; cửa sổ hiệu lực là 1000ms gần nhất." }, state: { active: true, key: "upload", at: 700, order: 3, count: 1 } },
          { id: "search-900", kind: "request", display: { label: "search · 900ms", description: "Request search gửi lúc 900ms; cửa sổ hiệu lực là 1000ms gần nhất." }, state: { active: false, key: "search", at: 900, order: 4, count: 1 } },
          { id: "upload-1200", kind: "request", display: { label: "upload · 1200ms", description: "Request upload gửi lúc 1200ms; cửa sổ hiệu lực là 1000ms gần nhất." }, state: { active: true, key: "upload", at: 1200, order: 5, count: 1 } },
        ],
        relations: [],
        events: [
          { id: "event-stream", index: 0, kind: "requests-loaded", display: { label: "Nhận sáu request xen kẽ hai người dùng" }, entityIds: ["upload-0", "search-100", "upload-250", "upload-700", "search-900", "upload-1200"], changedFields: [{ entityId: "upload-0", fieldId: "at", display: { label: "Mốc gửi" }, before: null, after: 0 }, { entityId: "upload-0", fieldId: "key", display: { label: "Người dùng" }, before: null, after: "upload" }, { entityId: "upload-0", fieldId: "order", display: { label: "Thứ tự trong dòng" }, before: null, after: 0 }, { entityId: "upload-0", fieldId: "count", display: { label: "Số request của mục" }, before: null, after: 1 }], anchorIds: [] },
          { id: "event-window", index: 1, kind: "window-moved", display: { label: "Dịch cửa sổ upload tới mốc 1250ms" }, entityIds: ["upload-700", "search-900", "upload-1200"], changedFields: [{ entityId: "upload-250", fieldId: "active", display: { label: "Còn trong cửa sổ" }, before: true, after: false }], anchorIds: [] },
          { id: "event-prune", index: 2, kind: "expired-pruned", display: { label: passed ? "Đã loại upload@0 và upload@250" : "Queue upload chưa được prune/đọc đúng" }, entityIds: ["upload-0", "upload-250", "upload-700", "upload-1200"], changedFields: [], anchorIds: anchor.map((a) => a.id) },
          { id: "event-count", index: 3, kind: "count-active", display: { label: passed ? "Dashboard hiển thị 2 request upload" : `Dashboard đang hiển thị ${Number.isFinite(count) ? count : "kết quả không hợp lệ"}` }, entityIds: ["upload-700", "upload-1200"], changedFields: [{ fieldId: "active-count", display: { label: "Số request upload" }, before: 4, after: count }], anchorIds: anchor.map((a) => a.id) },
        ],
        anchors: anchor,
        metrics: [
          { id: "window-size", display: { label: "Độ rộng cửa sổ" }, value: 1000, unit: "ms" },
          { id: "active-count", display: { label: "Code đang đếm" }, value: count, unit: "request" },
          { id: "expected-count", display: { label: "Cần hiển thị" }, value: 2, unit: "request" },
        ],
        outputs: [{ id: "count-result", display: { label: "Trạng thái dashboard" }, value: passed ? "upload@700 và upload@1200 còn hiệu lực; request search được giữ độc lập." : `Cần 2 request upload, code đang trả ${Number.isFinite(count) ? count : "không hợp lệ"}.` }],
        controls: [{ id: "trace-step", display: { label: "Phát lại dòng request" }, type: "stepper", value: 4 }],
      };
    }, recipe: { base: "sequence", overlays: ["window"], control: "stepper", layout: "wide" },
  },
  "dependency-planner": {
    authored: true,
    productTitle: "LogMatcher",
    id: "log-matcher-dependency-change", display: { label: "Gỡ dependency cũ khỏi pipeline build", description: "Pipeline đã bỏ bước kiểm tra legacy nhưng quan hệ chờ cũ vẫn còn trong kế hoạch." }, domain: "text", sourceSymbol: "DependencyPlanner::removeDependency", sourceLabel: "Hàm gỡ phụ thuộc",
    capability: { summary: "Lời giải cũ xếp được thứ tự build hợp lệ.", label: "Sắp xếp phụ thuộc", claim: "Hàm xây thứ tự từ quan hệ phụ thuộc." },
    transformation: { oldAssumption: "Quan hệ phụ thuộc chỉ được thêm vào.", breakingEvent: "Bước package-app không còn phải chờ legacy-check, nhưng pipeline vẫn giữ cạnh cũ.", newCapability: "Gỡ đúng một quan hệ phụ thuộc rồi để topo-sort tính lại kế hoạch.", observableOutcome: "Preview gạch bỏ dòng legacy-check → package-app và giữ nguyên các dependency còn cần thiết.", requirement: "Gỡ dependency legacy-check→package-app, trả true đúng một lần và không đụng các cạnh khác." },
    learningBridge: {
      intro: "Topological sort em đã biết vẫn nằm trong buildOrder(). Build này không bắt viết lại topo-sort; em chỉ bổ sung thao tác xóa một cạnh trong map<task, set<task>>.",
      familiarCode: `int main() {
  DependencyPlanner planner;
  planner.addDependency("legacy-check", "package-app");
  cout << planner.removeDependency(
    "legacy-check", "package-app"
  ); // cần in 1
}`,
      editInstruction: [
        "Chỉ viết removeDependency(before, after) trong PHẦN 3; buildOrder() đã hoàn chỉnh.",
        "Tìm before trong edges_. Nếu không có danh sách cạnh đi ra, return false.",
        "Gọi erase(after) trên set của before; return true chỉ khi erase thực sự gỡ được một cạnh.",
        "Tự kiểm: dòng legacy-check→package-app phải bị gạch bỏ; compile-api→test và test→package-app vẫn còn.",
      ].join("\n"),
      fileRoles: [
        { suffix: ".hpp", label: "Giao diện · chỉ đọc", description: "Cho biết graph được lưu bằng set task và map các cạnh phụ thuộc." },
        { suffix: ".cpp", label: "Phần em sửa · một hàm", description: "Chỉ điền hai TODO trong removeDependency(); topo-sort không cần sửa." },
        { suffix: ".requirement-change.test.cpp", label: "main() của scenario · chỉ đọc", description: "Dựng pipeline, gỡ cạnh legacy rồi yêu cầu buildOrder() chạy lại." },
      ],
    },
    inputSummary: "Pipeline 6 bước còn giữ dependency legacy-check→package-app đã lỗi thời; chỉ cạnh đó được phép gỡ.", buildHarness: ({ header }) => `#include "${header}"
#include <iostream>
int main() {
  DependencyPlanner planner;
  planner.addDependency("fetch", "compile-api");
  planner.addDependency("fetch", "compile-ui");
  planner.addDependency("compile-api", "test");
  planner.addDependency("compile-ui", "test");
  planner.addDependency("test", "package-app");
  planner.addDependency("legacy-check", "package-app");
  std::cout << (planner.removeDependency(
    "legacy-check", "package-app"
  ) ? 1 : 0) << "\\n";
}
`, expected: 1, redActual: 0, parse: (out) => Number(String(out).trim()),
    model({ actual, passed, mappingId }) {
      const removed = Number(actual) === 1;
      const anchor = passed ? [] : [{ id: "anchor-dependency", eventIndex: 2, entityId: "log-legacy", sourceMappingId: mappingId, severity: "error", display: { label: "Dependency legacy vẫn còn trong pipeline", description: "removeDependency() chưa tìm đúng set cạnh của before hoặc chưa dùng kết quả erase(after). Đi tới hàm rồi phát lại từ dòng thay đổi." } }];
      return {
        entities: [
          { id: "log-fetch-api", kind: "line", display: { label: "Nạp mã nguồn → biên dịch API" }, state: { text: "fetch -> compile-api", status: "giữ nguyên" } },
          { id: "log-fetch-ui", kind: "line", display: { label: "Nạp mã nguồn → biên dịch UI" }, state: { text: "fetch -> compile-ui", status: "giữ nguyên" } },
          { id: "log-api-test", kind: "line", display: { label: "Biên dịch API → chạy test" }, state: { text: "compile-api -> test", status: "giữ nguyên" } },
          { id: "log-ui-test", kind: "line", display: { label: "Biên dịch UI → chạy test" }, state: { text: "compile-ui -> test", status: "giữ nguyên" } },
          { id: "log-test-package", kind: "line", display: { label: "Test → đóng gói ứng dụng" }, state: { text: "test -> package-app", status: "giữ nguyên" } },
          { id: "log-legacy", kind: "line", display: { label: "Legacy check → đóng gói ứng dụng" }, state: { text: passed ? "legacy-check -/-> package-app" : "legacy-check -> package-app", status: passed ? "đã gỡ" : "vẫn còn" } },
        ],
        relations: [],
        events: [
          { id: "event-plan-loaded", index: 0, kind: "plan-loaded", display: { label: "Nạp pipeline 6 dependency" }, entityIds: ["log-fetch-api", "log-fetch-ui", "log-api-test", "log-ui-test", "log-test-package", "log-legacy"], changedFields: [], anchorIds: [] },
          { id: "event-change-request", index: 1, kind: "change-request", display: { label: "Nhận yêu cầu bỏ legacy-check khỏi đường tới package-app" }, entityIds: ["log-legacy"], changedFields: [], anchorIds: [] },
          { id: "event-dependency", index: 2, kind: "text-removed", display: { label: passed ? "Đã gỡ đúng dependency legacy" : "Dependency legacy vẫn còn" }, entityIds: ["log-legacy"], changedFields: [{ entityId: "log-legacy", fieldId: "text", display: { label: "Dòng dependency" }, before: "legacy-check -> package-app", after: passed ? "legacy-check -/-> package-app" : "legacy-check -> package-app" }, { entityId: "log-legacy", fieldId: "status", display: { label: "Trạng thái" }, before: "vẫn còn", after: passed ? "đã gỡ" : "vẫn còn" }], anchorIds: anchor.map((a) => a.id) },
          { id: "event-plan-ready", index: 3, kind: "plan-ready", display: { label: passed ? "Topo-sort có thể tính lại với năm dependency còn lại" : "Kế hoạch vẫn mang ràng buộc đã lỗi thời" }, entityIds: ["log-test-package", "log-legacy"], changedFields: [], anchorIds: anchor.map((a) => a.id) },
        ],
        anchors: anchor,
        metrics: [
          { id: "dependencies-before", display: { label: "Dependency ban đầu" }, value: 6, unit: "cạnh" },
          { id: "changes", display: { label: "Code đã gỡ" }, value: removed ? 1 : 0, unit: "cạnh" },
          { id: "dependencies-after", display: { label: "Dependency cần còn lại" }, value: 5, unit: "cạnh" },
        ],
        outputs: [{ id: "build-result", display: { label: "Kế hoạch sau thay đổi" }, value: passed ? "Đã bỏ legacy-check → package-app; năm dependency còn lại không đổi." : "Pipeline vẫn chờ legacy-check dù bước này đã bị bỏ." }],
        controls: [{ id: "trace-step", display: { label: "Phát lại thay đổi pipeline" }, type: "stepper", value: 4 }],
      };
    }, recipe: { base: "text", overlays: ["diff", "selection-range"], control: "stepper", layout: "wide" },
  },
};

const C6_OVERLAY = {
  tree: ["path", "dependency"], timeline: ["interval", "compare"], geometry: ["path", "constraint"],
  "request-response": ["diff", "threshold"], "runtime-resource": ["resource-usage", "threshold"], "state-machine": ["dependency", "constraint"],
};

function c6Arc(definition) {
  const adapter = definition.C6_ADAPTER;
  const overlays = C6_OVERLAY[adapter.base];
  return {
    productTitle: adapter.family,
    id: `c6-${adapter.base}-${adapter.family}`,
    display: { label: `Adapter ${adapter.base}: ${adapter.family}`, description: "Scenario C++ cục bộ có runner và oracle trusted." },
    domain: adapter.base,
    sourceSymbol: `${adapter.className}::evaluate`,
    sourceLabel: "Hàm adapter có thể sửa",
    capability: { summary: `Adapter ${adapter.family} đã tính được kết quả cục bộ.`, label: adapter.family, claim: "Source C++ hiện tại trả giá trị qua adapter đã đăng ký." },
    transformation: { oldAssumption: "Kết quả adapter luôn đúng với input đã đăng ký.", breakingEvent: "Oracle cục bộ nhận một kết quả khác giá trị dự kiến.", newCapability: "Giữ kết quả adapter đúng qua runner cục bộ.", observableOutcome: "Preview cho thấy giá trị adapter và điểm neo khi kết quả lệch.", requirement: `Giữ evaluate(${adapter.input}) trả về ${adapter.expected}.` },
    inputSummary: `Input local ${adapter.input}, oracle độc lập mong đợi ${adapter.expected}.`,
    buildHarness: ({ header }) => `#include "${header}"\n#include <iostream>\nint main(){ std::cout << ${adapter.className}::evaluate(${adapter.input}) << "\\n"; }\n`,
    expected: adapter.expected,
    parse: (output) => Number(String(output).trim()),
    model({ actual, passed, mappingId }) {
      const anchor = passed ? [] : [{ id: `anchor-${adapter.base}-${adapter.family}`, eventIndex: 1, entityId: "adapter-result", sourceMappingId: mappingId, severity: "error", display: { label: "Kết quả adapter không khớp oracle", description: "Mở hàm adapter và sửa giá trị trả về." } }];
      const metrics = [{ id: "adapter-result", display: { label: "Kết quả thực tế" }, value: actual }];
      if (adapter.base === "runtime-resource") metrics.push({ id: "resource-usage", display: { label: "Tài nguyên adapter" }, value: Math.abs(actual), unit: "đơn vị" });
      return { entities: [{ id: "adapter-result", kind: "adapter-item", display: { label: adapter.family }, state: { actual, expected: adapter.expected, passed } }], relations: [], events: [{ id: "adapter-input", index: 0, kind: "input", display: { label: "Runner nhận input local" }, entityIds: ["adapter-result"], changedFields: [], anchorIds: anchor.map((item) => item.id) }, { id: "adapter-oracle", index: 1, kind: passed ? "oracle-pass" : "oracle-fail", display: { label: passed ? "Oracle xác nhận kết quả" : "Oracle phát hiện sai khác" }, entityIds: ["adapter-result"], changedFields: [{ entityId: "adapter-result", fieldId: "actual", display: { label: "Kết quả adapter" }, before: null, after: actual }], anchorIds: anchor.map((item) => item.id) }], anchors: anchor, metrics, outputs: [{ id: "oracle-result", display: { label: "Oracle" }, value: passed ? "Đạt giá trị dự kiến." : `Cần ${adapter.expected}, hiện có ${actual}.` }], controls: [{ id: "trace-step", display: { label: "Bước mô phỏng" }, type: "stepper", value: 2 }] };
    },
    recipe: { base: adapter.base, overlays, control: "stepper", layout: "balanced" },
    c6Gate: { runner: true, oracle: true, errorAnchor: true, replay: true, inspector: true, family: adapter.family },
  };
}

for (const definition of c6Definitions) arcs[definition.ARTIFACT_ID] = c6Arc(definition);

// Second wave of authored product arcs (docs/HANDOVER.md §4). These are full
// designs, not adapters: brief, learning bridge, rich scenario, trusted runner.
for (const [seedId, arc] of Object.entries(authoredArcs)) arcs[seedId] = arc;

function c6Coverage() {
  const byBase = new Map();
  for (const definition of c6Definitions) {
    const adapter = definition.C6_ADAPTER;
    const list = byBase.get(adapter.base) || [];
    list.push({ ...adapter, id: definition.ARTIFACT_ID });
    byBase.set(adapter.base, list);
  }
  return Object.fromEntries([...byBase].map(([base, adapters]) => [base, {
    families: adapters.map((item) => item.family),
    admitted: adapters.length >= 2 && new Set(adapters.map((item) => item.family)).size >= 2 && adapters.every((item) => Boolean(getArc(item.id).c6Gate)),
  }]));
}

// Stage 0 is the arc entry itself; later stages inherit its source symbol,
// capability and parser and override only what the new breaking event changes.
function getArc(seedId, stageIndex = 0) {
  const arc = arcs[String(seedId || "")] || null;
  if (!arc) return null;
  const index = Number(stageIndex) || 0;
  if (index === 0) return arc;
  const stage = (arc.stages || [])[index - 1];
  return stage ? { ...arc, ...stage, stages: undefined } : null;
}

function stageCount(seedId) {
  const arc = arcs[String(seedId || "")];
  return arc ? 1 + (arc.stages || []).length : 0;
}

// Resolving by scenario id keeps `/run` honest: a scenario the project has not
// unlocked yet must not be runnable just because the registry knows it.
function findStageIndex(seedId, scenarioId) {
  for (let index = 0; index < stageCount(seedId); index += 1) {
    if (getArc(seedId, index).id === String(scenarioId || "")) return index;
  }
  return -1;
}

function listArcIds() { return Object.keys(arcs); }

function scenarioSpec(seedId, stageIndex = 0) {
  const arc = getArc(seedId, stageIndex); if (!arc) return null;
  return { id: arc.id, version: REGISTRY_VERSION, display: arc.display, inputSchema: {}, initialState: {}, controlDefaults: { "trace-step": 0 }, observation: { entityKinds: [arc.domain], metricKinds: ["result"], maxEntities: 400, maxEvents: 500 }, runnerBinding: `trusted:${seedId}:runner`, oracleBinding: `trusted:${seedId}:oracle`, verifierBindings: [`trusted:${seedId}:requirement`] };
}

function starterTask(seedId, stageIndex = 0) {
  const key = `${String(seedId || "")}:${Number(stageIndex) || 0}`;
  const tasks = {
    "grid-pathfinder:0": {
      marker: "TODO Xưởng 01",
      comment: [
        "    // TODO Xưởng 01 — em chỉ sửa danh sách directions:",
        "    // Mỗi pair là {đổi hàng, đổi cột}. Bốn dòng đầu là phải/trái/lên/xuống.",
        "    // Thêm bốn bước chéo bằng các tổ hợp {±1, ±1}; vòng for bên dưới tự dùng chúng.",
        "",
      ].join("\n"),
      before: "    const vector<pair<int, int>> directions",
    },
    "grid-pathfinder:1": {
      marker: "TODO Xưởng 02",
      comment: "            // TODO Xưởng 02: nếu đi chéo, chỉ nhận bước khi hai ô kề vuông góc đều trống.\n",
      before: "            if (grid[nr][nc] == '#'",
    },
    "weighted-graph-router:0": {
      marker: "TODO Xưởng 01",
      comment: "// TODO Xưởng 01: tìm cạnh from→to, cập nhật newWeight hợp lệ rồi trả true.\n",
      before: "bool WeightedGraphRouter::updateDirectedEdge",
    },
    "range-sum-module:0": {
      marker: "TODO Xưởng 01",
      comment: "// TODO Xưởng 01: cập nhật values_ và dữ liệu tổng để truy vấn sau đó vẫn đúng.\n",
      before: "bool RangeSum::updateZeroBased",
    },
    "sliding-window-limiter:0": {
      marker: "TODO Xưởng 01",
      comment: "// TODO Xưởng 01: kiểm tra thời gian, prune key này rồi trả số sự kiện còn hiệu lực.\n",
      before: "std::size_t SlidingWindowLimiter::activeCount",
    },
    "dependency-planner:0": {
      marker: "TODO Xưởng 01",
      comment: "// TODO Xưởng 01: gỡ đúng cạnh phụ thuộc và cho biết cạnh có tồn tại hay không.\n",
      before: "bool DependencyPlanner::removeDependency",
    },
  };
  return tasks[key] || null;
}

function applyStarterTask(seedId, stageIndex, source) {
  const task = starterTask(seedId, stageIndex);
  let next = String(source == null ? "" : source);
  if (!task || next.includes(task.marker)) return next;
  if (task.replace && next.includes(task.replace)) return next.replace(task.replace, task.with);
  if (task.before && next.includes(task.before)) return next.replace(task.before, `${task.comment}${task.before}`);
  return next;
}

function applyLearningLayout(seedId, source) {
  let next = String(source == null ? "" : source);
  if (!["grid-pathfinder", "weighted-graph-router", "range-sum-module", "sliding-window-limiter", "dependency-planner"].includes(seedId)) {
    return next;
  }
  if (!next.includes("using namespace std;")) {
    const includeLines = [...next.matchAll(/^#include[^\n]*$/gm)];
    const last = includeLines.at(-1);
    if (last) {
      const at = last.index + last[0].length;
      next = `${next.slice(0, at)}\nusing namespace std;\n${next.slice(at)}`;
    }
  }
  if (!next.includes("Trong bài thi em thường")) {
    const marker = "using namespace std;\n";
    next = next.replace(marker, `${marker}\n// Trong bài thi em thường đặt toàn bộ xử lý trong main().\n// Ở Xưởng, main() nằm trong demo/test; file này giữ phần xử lý để gọi lại.\n`);
  }
  if (seedId === "range-sum-module") {
    next = next
      .replace(
        /RangeSum::RangeSum\(std::vector<long long> values\)\s*:\s*values_\(std::move\(values\)\)\s*\{\s*rebuild\(\);\s*\}/,
        "RangeSum::RangeSum(vector<long long> values) : values_(move(values)) {\n  rebuild();\n}",
      )
      .replace(
        /void RangeSum::rebuild\(\)\s*\{\s*prefix_\.assign\(values_\.size\(\)\+1,0\);\s*for\(std::size_t i=0;i<values_\.size\(\);\+\+i\)\s*prefix_\[i\+1\]=prefix_\[i\]\+values_\[i\];\s*\}/,
        "void RangeSum::rebuild() {\n  prefix_.assign(values_.size() + 1, 0);\n  for (size_t index = 0; index < values_.size(); ++index) {\n    prefix_[index + 1] = prefix_[index] + values_[index];\n  }\n}",
      )
      .replace(
        /std::size_t RangeSum::size\(\) const\s*\{\s*return values_\.size\(\);\s*\}/,
        "// Các hàm truy vấn bên dưới đã hoạt động; build này không yêu cầu sửa.\nsize_t RangeSum::size() const {\n  return values_.size();\n}",
      )
      .replace(
        /long long RangeSum::queryZeroBased\(std::size_t l,std::size_t r\) const\s*\{\s*if\(l>r\|\|r>=values_\.size\(\)\) throw std::out_of_range\(\"invalid zero-based range\"\);\s*return prefix_\[r\+1\]-prefix_\[l\];\s*\}/,
        "long long RangeSum::queryZeroBased(size_t left, size_t right) const {\n  if (left > right || right >= values_.size()) {\n    throw out_of_range(\"invalid zero-based range\");\n  }\n  return prefix_[right + 1] - prefix_[left];\n}",
      )
      .replace(
        /long long RangeSum::queryOneBased\(std::size_t l,std::size_t r\) const\s*\{\s*if\(l==0\|\|l>r\|\|r>values_\.size\(\)\) throw std::out_of_range\(\"invalid one-based range\"\);\s*return prefix_\[r\]-prefix_\[l-1\];\s*\}/,
        "long long RangeSum::queryOneBased(size_t left, size_t right) const {\n  if (left == 0 || left > right || right > values_.size()) {\n    throw out_of_range(\"invalid one-based range\");\n  }\n  return prefix_[right] - prefix_[left - 1];\n}",
      )
      .replace(
        /bool RangeSum::updateZeroBased\(std::size_t index,long long value\)\s*\{\s*if\(index>=values_\.size\(\)\) return false;\s*values_\[index\]=value;\s*rebuild\(\);\s*return true;\s*\}/,
        "// VIỆC CỦA EM: cập nhật dữ liệu nguồn rồi dựng lại prefix_.\nbool RangeSum::updateZeroBased(size_t index, long long value) {\n  if (index >= values_.size()) return false;\n  values_[index] = value;\n  rebuild();\n  return true;\n}",
      )
      .replace(
        /bool RangeSum::updateZeroBased\(std::size_t,long long\)\s*\{\s*return false;\s*\/\* TODO v2 \*\/\s*\}/,
        "// VIỆC CỦA EM: cập nhật dữ liệu nguồn rồi dựng lại prefix_.\nbool RangeSum::updateZeroBased(size_t, long long) {\n  return false; /* TODO v2 */\n}",
      );
  }
  if (seedId === "grid-pathfinder") {
    next = next
      .replace(
        /    \/\/ TODO Xưởng 01:[^\n]*\n    const int dr\[4\] = \{0, 1, 0, -1\};\n    const int dc\[4\] = \{1, 0, -1, 0\};/,
        [
          "    // TODO Xưởng 01 — em chỉ sửa danh sách directions:",
          "    // Mỗi pair là {đổi hàng, đổi cột}. Ví dụ {1, 1} nghĩa là xuống-phải.",
          "    // Thêm bốn tổ hợp chéo của ±1 và ±1. Không cần sửa phần BFS bên dưới.",
          "    const vector<pair<int, int>> directions = {",
          "        {0, 1},   // phải",
          "        {1, 0},   // xuống",
          "        {0, -1},  // trái",
          "        {-1, 0},  // lên",
          "        // Em thêm 4 pair chéo ở đây.",
          "    };",
        ].join("\n"),
      )
      .replace(
        /        for \(int direction = 0; direction < 4; \+\+direction\) \{\n            const int nr = current\.first \+ dr\[direction\];\n            const int nc = current\.second \+ dc\[direction\];/,
        [
          "        // Vòng lặp đọc từng pair em khai báo; thêm hướng ở trên là đủ.",
          "        for (const auto& [rowStep, columnStep] : directions) {",
          "            const int nr = current.first + rowStep;",
          "            const int nc = current.second + columnStep;",
        ].join("\n"),
      );
  }
  // v3 only upgrades untouched placeholder bodies. Student implementations
  // never match these exact stubs, so reopening an old project cannot erase
  // work that was already written.
  if (seedId === "weighted-graph-router") {
    next = next.replace(
      /bool WeightedGraphRouter::updateDirectedEdge\([\s\S]*?\)\s*\{\s*return false;\s*\/\* TODO v2 \*\/\s*\}/,
      [
        "bool WeightedGraphRouter::updateDirectedEdge(",
        "    int from,",
        "    int to,",
        "    long long newWeight",
        ") {",
        "  // TODO Xưởng 01.1 — kiểm tra from, to và newWeight.",
        "",
        "  // TODO Xưởng 01.2 — duyệt graph_[from], tìm edge.first == to,",
        "  // đổi edge.second rồi return true.",
        "",
        "  // TODO Xưởng 01.3 — không tìm thấy cạnh thì return false.",
        "  return false;",
        "}",
      ].join("\n"),
    );
  }
  if (seedId === "range-sum-module") {
    next = next.replace(
      /bool RangeSum::updateZeroBased\([^)]*\)\s*\{\s*return false;\s*\/\* TODO v2 \*\/\s*\}/,
      [
        "bool RangeSum::updateZeroBased(size_t index, long long value) {",
        "  // TODO Xưởng 01.1 — index ngoài values_ thì return false.",
        "",
        "  // TODO Xưởng 01.2 — cập nhật values_[index].",
        "",
        "  // TODO Xưởng 01.3 — gọi rebuild(), rồi return true.",
        "  return false;",
        "}",
      ].join("\n"),
    );
  }
  if (seedId === "sliding-window-limiter") {
    next = next.replace(
      /size_t SlidingWindowLimiter::activeCount\([^)]*\)\s*\{\s*return 0;\s*\/\* TODO requirement-change-v2 \*\/\s*\}/,
      [
        "size_t SlidingWindowLimiter::activeCount(",
        "    const string& key,",
        "    long long timestampMs",
        ") {",
        "  // TODO Xưởng 01.1 — prune đúng key tại timestampMs.",
        "",
        "  // TODO Xưởng 01.2 — trả size queue; không thêm request mới.",
        "  return 0;",
        "}",
      ].join("\n"),
    );
  }
  if (seedId === "dependency-planner") {
    next = next.replace(
      /bool DependencyPlanner::removeDependency\([^)]*\)\s*\{\s*return false;\s*\/\* TODO requirement-change-v2 \*\/\s*\}/,
      [
        "bool DependencyPlanner::removeDependency(",
        "    const string& before,",
        "    const string& after",
        ") {",
        "  // TODO Xưởng 01.1 — tìm before trong edges_; không có thì false.",
        "",
        "  // TODO Xưởng 01.2 — erase(after) và return cạnh có tồn tại hay không.",
        "  return false;",
        "}",
      ].join("\n"),
    );
  }
  return next;
}

module.exports = { REGISTRY_VERSION, getArc, stageCount, findStageIndex, listArcIds, scenarioSpec, c6Coverage, starterTask, applyStarterTask, applyLearningLayout };
