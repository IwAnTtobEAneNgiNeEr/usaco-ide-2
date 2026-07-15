// Core Fill activity adapter — "khung kỹ thuật" edition. The shared
// activity-workspace owns every visual and editor concern; this file sources a
// verified drill (now MULTI-GAP: 2-4 labeled core segments carved out of one
// reference solution) and maps Run / Judge to the Core Fill APIs. The gap
// checklist rendered into the controls rail is the student's task list: each
// row jumps the editor to that gap's TODO stub.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const DRAFT_PREFIX = "usaco.activity.corefill";

function storageGet(key, fallback = "") {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* best effort */ }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* best effort */ }
}

// Locate gap k's TODO stub in the current code: v2 stubs are
// "/* [k] TODO: …". Falls back to the legacy single "/* TODO:" stub.
function gapRange(code, index) {
  const text = String(code || "");
  let from = text.indexOf(`/* [${index}] TODO`);
  if (from < 0 && index === 1) from = text.indexOf("/* TODO:");
  if (from < 0) return null;
  const end = text.indexOf("*/", from);
  return { from, to: end < 0 ? from : end + 2 };
}

function firstGapRange(code, gaps) {
  for (const gap of gaps) {
    const range = gapRange(code, gap.index);
    if (range) return range;
  }
  return null;
}

export function initCorefill(app) {
  async function loadNext() {
    if (!app.activityWorkspace) {
      app.toast && app.toast("Activity workspace chưa sẵn sàng.", "err");
      return;
    }
    const topic = (app.state.meta && app.state.meta.topic) || "";
    app.activityWorkspace.openLoading({
      kind: "corefill",
      kicker: "Điền lõi",
      title: "Đang dựng bài luyện",
      message: "Đang chọn một lời giải đã kiểm chứng và khoét các đoạn tư duy cốt lõi."
    });
    try {
      const response = await api.corefillNext(topic);
      await openDrill(response.drill);
    } catch (error) {
      if (error && error.aborted) return;
      const noKey = error && (error.code === "NO_KEY" || (error.data && error.data.code === "NO_KEY"));
      app.activityWorkspace.showError({
        kind: "corefill",
        kicker: "Điền lõi",
        title: "Chưa mở được bài luyện",
        message: noKey
          ? "Cần API key trong Settings → AI để tạo bài Điền lõi mới."
          : ((error && error.message) || "Không tải được bài Điền lõi."),
        retry: loadNext
      });
    }
  }

  async function openDrill(drill) {
    if (!drill) throw new Error("Core Fill không trả về drill hợp lệ.");
    const codeKey = `${DRAFT_PREFIX}.${drill.drillId}.code`;
    const inputKey = `${DRAFT_PREFIX}.${drill.drillId}.input`;
    const expectedKey = `${DRAFT_PREFIX}.${drill.drillId}.expected`;
    const code = storageGet(codeKey, drill.scaffold || "");
    const gaps = Array.isArray(drill.gaps) && drill.gaps.length
      ? drill.gaps
      : [{ index: 1, label: drill.gapContract || "viết đoạn lõi vào đây" }];
    let workspaceApi = null;

    // The gap checklist: mỗi đoạn lõi một hàng — nhấn để nhảy tới đúng stub
    // trong editor; hàng gạch đi khi stub không còn trong code (em đã điền).
    const mountGapList = (host, ws) => {
      workspaceApi = ws;
      let lastSignature = "";
      const paint = () => {
        const current = ws.getCode();
        // Repaint only when a gap's open/filled state actually flips —
        // rebuilding innerHTML on every tick would eat in-flight clicks.
        const signature = gaps.map((gap) => (gapRange(current, gap.index) ? "o" : "x")).join("");
        if (signature === lastSignature) return;
        lastSignature = signature;
        host.innerHTML = `
          <div class="cf-gaps">
            <div class="cf-gaps-head">Khung kỹ thuật · ${gaps.length} đoạn lõi cần em tự viết</div>
            ${gaps.map((gap) => {
              const open = !!gapRange(current, gap.index);
              return `<button type="button" class="cf-gap ${open ? "" : "is-filled"}" data-gap="${gap.index}">
                <span class="cf-gap-index">${gap.index}</span>
                <span class="cf-gap-label">${escapeHtml(gap.label || "viết đoạn lõi vào đây")}</span>
                <span class="cf-gap-state">${open ? "chưa điền" : "đã sửa"}</span>
              </button>`;
            }).join("")}
            <div class="cf-gaps-hint">Điền theo cách hiểu và cách đặt tên của em — máy chấm chỉ quan tâm chương trình chạy đúng.</div>
          </div>`;
        host.querySelectorAll("[data-gap]").forEach((button) => {
          button.addEventListener("click", () => {
            const range = gapRange(ws.getCode(), Number(button.dataset.gap));
            if (range) ws.selectRange(range.from, range.to);
            else app.toast && app.toast("Đoạn này em đã sửa — không còn stub TODO.", "ok");
          });
        });
      };
      paint();
      const timer = setInterval(paint, 2500);
      return () => clearInterval(timer);
    };

    await app.activityWorkspace.open({
      kind: "corefill",
      kicker: "Điền lõi",
      title: drill.title || "Bài luyện Điền lõi",
      statement: drill.statement || "",
      samples: drill.samples || [],
      sheetMeta: { title: drill.title, elo: drill.rating, topic: drill.topic, kicker: "ĐIỀN LÕI" },
      code,
      input: storageGet(inputKey, ""),
      expected: storageGet(expectedKey, ""),
      expectedEnabled: true,
      fileName: "main.cpp",
      taskNote: `${gaps.length} đoạn lõi · khung kỹ thuật giữ nguyên`,
      status: [
        { label: "Chủ đề", value: drill.topic || "tổng hợp", tone: "accent" },
        { label: "Elo", value: drill.rating || "—" },
        { label: "Đoạn lõi", value: gaps.length, tone: "accent" },
        { label: "Test", value: "ẩn đến khi Judge" }
      ],
      selectRange: firstGapRange(code, gaps),
      mountControls: mountGapList,
      saveCode: async (nextCode) => storageSet(codeKey, nextCode),
      saveInput: async (input) => storageSet(inputKey, input),
      saveExpected: async (expected) => storageSet(expectedKey, expected),
      run: ({ code: source, input, expected, signal }) => api.corefillRun(drill.drillId, source, input, expected, { signal }),
      judge: async ({ code: source, signal }) => {
        const result = await api.corefillAttempt(drill.drillId, source, { signal });
        if (result.verdict === "AC") {
          storageRemove(codeKey);
          storageRemove(inputKey);
          result.feedback = `Cả ${gaps.length} đoạn lõi đã qua toàn bộ test ẩn đã được kiểm chứng.`;
          result.followup = { label: "Bài kế tiếp", onClick: loadNext };
        } else if (workspaceApi) {
          const open = gaps.filter((gap) => gapRange(workspaceApi.getCode(), gap.index));
          if (open.length) {
            result.feedback = `Còn ${open.length} đoạn chưa điền: ${open.map((g) => `[${g.index}]`).join(" ")} — xem danh sách đoạn lõi bên phải.`;
          }
        }
        return result;
      }
    });
  }

  app.openCorefill = loadNext;
}
