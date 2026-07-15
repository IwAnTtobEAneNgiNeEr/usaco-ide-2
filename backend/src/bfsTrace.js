"use strict";

// Deterministic semantic trace for one narrow slice only: unweighted shortest
// path on a rectangular character grid with S/T/# and a recognizable C++ BFS
// queue. This is deliberately not an arbitrary C++ execution tracer.

const { sha256 } = require("./verifiedArtifact");

const MAX_TRACE_CELLS = 2500;
const MAX_TRACE_STEPS = 512;

function rawFallback(input, reason) {
  return {
    kind: "input-visualizer",
    reason,
    input: typeof input === "string" ? input : "",
    visualizer: { kind: "raw-input" },
  };
}

function parseGridInput(input) {
  const raw = typeof input === "string" ? input : "";
  const lines = raw.replace(/\r/g, "").split("\n");
  const head = (lines[0] || "").trim().split(/\s+/).map(Number);
  if (head.length < 2 || !head.every(Number.isInteger) || head[0] <= 0 || head[1] <= 0) {
    return { ok: false, reason: "input-header", fallback: rawFallback(raw, "Không đọc được N M của grid BFS.") };
  }
  const [rows, cols] = head;
  if (rows * cols > MAX_TRACE_CELLS) {
    return { ok: false, reason: "input-too-large", fallback: rawFallback(raw, `Trace giới hạn ${MAX_TRACE_CELLS} ô; input có ${rows * cols} ô.`) };
  }
  const grid = lines.slice(1, rows + 1).map((line) => line.trim());
  if (grid.length !== rows || grid.some((line) => line.length !== cols)) {
    return { ok: false, reason: "input-grid-shape", fallback: rawFallback(raw, "Số hàng/cột thực tế không khớp N M.") };
  }

  let start = null;
  let target = null;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (grid[r][c] === "S") start = { r, c };
      if (grid[r][c] === "T") target = { r, c };
    }
  }
  if (!start || !target) {
    return { ok: false, reason: "input-markers", fallback: rawFallback(raw, "Grid cần đúng điểm S và T để trace slice này.") };
  }
  return {
    ok: true,
    rows,
    cols,
    grid,
    start,
    target,
    fallback: {
      kind: "input-visualizer",
      reason: "Fallback dùng đúng input của run evidence.",
      input: raw,
      visualizer: { kind: "grid", rows, cols, grid, start, target, coordinateBase: 0 },
    },
  };
}

function parseIntegerArray(code, name) {
  const match = String(code || "").match(new RegExp(`(?:const\\s+)?int\\s+${name}\\s*\\[\\s*\\]\\s*=\\s*\\{([^}]*)\\}`, "m"));
  if (!match) return null;
  const values = match[1].split(",").map((value) => Number(value.trim()));
  return values.length && values.every(Number.isInteger) ? values : null;
}

function lineOf(lines, pattern) {
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : null;
}

function recognizeSource(code) {
  const source = String(code || "");
  const lines = source.split(/\r?\n/);
  const queueMatch = source.match(/queue\s*<\s*pair\s*<\s*int\s*,\s*int\s*>\s*>\s*([A-Za-z_]\w*)/m);
  const queueName = queueMatch && queueMatch[1];
  const dx = parseIntegerArray(source, "dx");
  const dy = parseIntegerArray(source, "dy");
  const missing = [];
  if (!queueName) missing.push("queue<pair<int,int>>");
  if (!dx || !dy || dx.length !== dy.length || dx.length !== 4) missing.push("dx/dy bốn hướng");

  const escapedQueue = queueName ? queueName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "q";
  const markers = {
    queueDeclaration: lineOf(lines, /queue\s*</),
    loop: lineOf(lines, new RegExp(`while\\s*\\(\\s*!?${escapedQueue}\\.empty\\s*\\(\\s*\\)`)),
    front: lineOf(lines, new RegExp(`${escapedQueue}\\.front\\s*\\(`)),
    pop: lineOf(lines, new RegExp(`${escapedQueue}\\.pop\\s*\\(`)),
    enqueue: lineOf(lines, new RegExp(`${escapedQueue}\\.push\\s*\\(`)),
    visit: lineOf(lines, /d\s*\[\s*nx\s*\]\s*\[\s*ny\s*\]\s*=\s*d\s*\[\s*x\s*\]\s*\[\s*y\s*\]\s*\+\s*1/),
  };
  for (const [name, value] of Object.entries(markers)) {
    if (!value) missing.push(name);
  }
  if (/\bbfs\s*\(\s*nx\s*,\s*ny\s*\)/.test(source)) missing.push("BFS đệ quy không thuộc adapter queue");

  if (missing.length) {
    return { ok: false, reason: "unsupported-code-shape", details: missing, markers };
  }

  const warnings = [];
  const unsafeLine = lineOf(lines, /if\s*\([^\n]*d\s*\[\s*nx\s*\]\s*\[\s*ny\s*\][^\n]*nx\s*>=/);
  if (unsafeLine) {
    warnings.push({
      code: "bounds-after-index",
      line: unsafeLine,
      message: "Source đọc d[nx][ny] trước khi xác nhận nx/ny trong biên; semantic trace không mô phỏng undefined behavior này.",
    });
  }

  return {
    ok: true,
    queueName,
    directions: dx.map((dr, index) => ({ dr, dc: dy[index] })),
    markers,
    warnings,
  };
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function buildPath(parent, target) {
  const path = [];
  let key = cellKey(target.r, target.c);
  while (key) {
    const [r, c] = key.split(",").map(Number);
    path.push({ r, c });
    key = parent.get(key) || "";
  }
  return path.reverse();
}

function simulate(parsed, recognized) {
  const visited = Array.from({ length: parsed.rows }, () => Array(parsed.cols).fill(false));
  const distance = Array.from({ length: parsed.rows }, () => Array(parsed.cols).fill(-1));
  const parent = new Map();
  const queue = [{ ...parsed.start }];
  visited[parsed.start.r][parsed.start.c] = true;
  distance[parsed.start.r][parsed.start.c] = 0;
  let visitedCount = 1;
  const steps = [];

  while (queue.length) {
    const queueBefore = queue.map((cell) => ({ ...cell }));
    const current = queue.shift();
    const discovered = [];
    for (const { dr, dc } of recognized.directions) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      if (nr < 0 || nc < 0 || nr >= parsed.rows || nc >= parsed.cols) continue;
      if (visited[nr][nc] || parsed.grid[nr][nc] === "#") continue;
      visited[nr][nc] = true;
      distance[nr][nc] = distance[current.r][current.c] + 1;
      parent.set(cellKey(nr, nc), cellKey(current.r, current.c));
      queue.push({ r: nr, c: nc });
      discovered.push({ r: nr, c: nc, distance: distance[nr][nc] });
      visitedCount += 1;
    }
    if (steps.length < MAX_TRACE_STEPS) {
      steps.push({
        index: steps.length,
        action: "dequeue",
        cell: current,
        distance: distance[current.r][current.c],
        queueBefore,
        discovered,
        queueAfter: queue.map((cell) => ({ ...cell })),
        visitedCount,
      });
    }
    if (current.r === parsed.target.r && current.c === parsed.target.c) break;
  }

  const reachable = distance[parsed.target.r][parsed.target.c] >= 0;
  return {
    steps,
    truncated: visitedCount > MAX_TRACE_STEPS,
    result: {
      reachable,
      distance: reachable ? distance[parsed.target.r][parsed.target.c] : -1,
      path: reachable ? buildPath(parent, parsed.target) : [],
      visitedCount,
    },
  };
}

function traceGridBfs({ code, input, verdict } = {}) {
  const parsed = parseGridInput(input);
  if (!parsed.ok) {
    return {
      supported: false,
      reason: parsed.reason,
      details: [],
      fallback: parsed.fallback,
      nextAction: { id: "open-visualizer", state: "work", label: "Mở input visualizer", reason: parsed.fallback.reason },
    };
  }

  const recognized = recognizeSource(code);
  if (!recognized.ok) {
    return {
      supported: false,
      reason: recognized.reason,
      details: recognized.details,
      fallback: parsed.fallback,
      nextAction: { id: "open-visualizer", state: "work", label: "Mở input visualizer", reason: "Source không khớp adapter grid BFS; không bịa trace." },
    };
  }

  const simulation = simulate(parsed, recognized);
  const warning = recognized.warnings[0];
  return {
    supported: true,
    model: "recognized-grid-bfs-semantic-v1",
    deterministic: true,
    executionMode: "semantic-model-not-arbitrary-cpp-instrumentation",
    basis: { codeHash: sha256(code), inputHash: sha256(input) },
    coordinateBase: 0,
    sourceLines: recognized.markers,
    directions: recognized.directions,
    invariant: "Mỗi ô được enqueue tối đa một lần khi chuyển từ chưa thăm sang đã thăm; distance tăng đúng 1 theo mỗi cạnh.",
    warnings: recognized.warnings,
    ...simulation,
    fallback: parsed.fallback,
    nextAction: warning
      ? { id: "return-to-work", state: "work", label: "Sửa kiểm tra biên", reason: warning.message, line: warning.line }
      : verdict && verdict !== "AC"
        ? { id: "return-to-work", state: "work", label: "Đối chiếu queue/visited", reason: `Trace dùng input của Judge ${verdict}; sửa code rồi Verify lại.` }
        : { id: "add-edge-case", state: "verify", label: "Verify thêm edge case", reason: "Trace đã tái lập BFS; thêm check nếu cần trước khi Evolve." },
  };
}

module.exports = {
  MAX_TRACE_CELLS,
  MAX_TRACE_STEPS,
  parseGridInput,
  recognizeSource,
  traceGridBfs,
};
