import test from "node:test";
import assert from "node:assert/strict";

import { normalizePathway, normalizeProject } from "../src/core/xuong-model.js";

test("Xưởng pathway keeps the real-world context separate from algorithm application", () => {
  const pathway = normalizePathway({
    id: "rescue-map",
    title: "Bản đồ cứu hộ",
    purpose: "Điều phối đội cứu hộ trên bản đồ có vật cản.",
    context: "Điều phối viên cần đưa đội gần nhất tới người đang bị cô lập.",
    application: "Thuật toán tìm số bước ngắn nhất giữa hai vị trí có thể đi qua.",
    target: "cpp",
    seedId: "grid-pathfinder",
    verification: "Bộ test kiểm tra khoảng cách và trường hợp không thể tới.",
  });
  assert.equal(pathway.context, "Điều phối viên cần đưa đội gần nhất tới người đang bị cô lập.");
  assert.equal(pathway.application, "Thuật toán tìm số bước ngắn nhất giữa hai vị trí có thể đi qua.");
});

test("Xưởng project normalizes demo and sequential milestones without treating demo as evidence", () => {
  const project = normalizeProject({
    id: "project-1",
    title: "Bản đồ cứu hộ",
    status: "work",
    pathway: { id: "p1", title: "Bản đồ cứu hộ", purpose: "Điều phối cứu hộ.", context: "Đội cứu hộ cần đường đi.", application: "BFS tìm đường ngắn nhất.", target: "cpp" },
    brief: { context: "Đội cứu hộ cần đường đi.", application: "BFS tìm đường ngắn nhất.", mission: "Hoàn thiện hàm tìm đường.", acceptance: "Verifier kiểm tra khoảng cách." },
    files: [], requirements: [], evidence: [],
    demo: { title: "Điều phối cứu hộ", description: "Xem số bước ngắn nhất.", actionLabel: "Chạy demo", latestRun: { id: "demo-1", at: "2026-07-20T00:00:00.000Z", status: "completed", durationMs: 12, output: "KET_QUA: 7", detail: "Demo đã chạy." } },
    milestones: [
      { id: "understand-demo", title: "1. Hiểu sản phẩm", description: "Chạy demo.", status: "done" },
      { id: "build-core", title: "2. Hoàn thiện lõi", description: "Sửa code.", status: "active" },
      { id: "evolve-product", title: "3. Tiến hóa sản phẩm", description: "Nhận yêu cầu.", status: "locked" },
    ],
    nextAction: { label: "Hoàn thiện lõi", reason: "Đã xem demo." },
  });
  assert.equal(project.demo.latestRun.status, "completed");
  assert.equal(project.evidence.length, 0);
  assert.deepEqual(project.milestones.map((item) => item.status), ["done", "active", "locked"]);
});
