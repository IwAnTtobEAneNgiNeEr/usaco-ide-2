// Rush activity adapter — "tự săn bug" edition. The shared activity-workspace
// owns the primary C++ editor and Run/Judge console; this file owns the server
// run state, countdown, lives/score, progressive hints, and drill transitions.
//
// Design doctrine (đổi 2026-07-10): sai KHÔNG bị lộ đáp án và KHÔNG bị đẩy
// sang bài khác — mất 1 mạng, vẫn bài đó, vẫn đồng hồ đó. Bí thì bấm gợi ý
// (cấp 1 khoanh vùng miễn phí, cấp 2 kỹ thuật trừ 1 điểm). bugSummary chỉ
// hiện khi bài đã ngã ngũ: sửa đúng, hết giờ, hoặc hết mạng.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";

const DRAFT_PREFIX = "usaco.activity.rush";
const TICK_MS = 200;

function storageGet(key, fallback = "") {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* best effort */ }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* best effort */ }
}

function secondsLeft(run) {
  if (!run || !run.deadlineAt) return 0;
  return Math.max(0, Math.ceil((run.deadlineAt - Date.now()) / 1000));
}

function statusFor(run) {
  const left = secondsLeft(run);
  return [
    { label: "Mạng", value: `${run.lives}/3`, tone: run.lives <= 1 ? "danger" : "accent" },
    { label: "Điểm", value: run.score },
    { label: "Cấp", value: run.level },
    { label: "Còn", value: `${left}s`, tone: left <= 5 ? "danger" : "accent" },
    { label: "Kỷ lục", value: run.highScore || 0 }
  ];
}

function rushStatement(run) {
  const difficulty = (run.drill && run.drill.difficultyLabel) || "medium";
  return `Đoạn chương trình bên cạnh **biên dịch được nhưng sai đúng một lỗi logic**. Tìm và sửa lỗi trước khi đồng hồ về 0 — không ai chỉ trước lỗi nằm đâu.

## Luật chơi

- **Run**: thử input tuỳ chỉnh — không trừ mạng, dùng thoải mái để khoanh vùng.
- **Judge**: chấm bằng test ẩn. Đúng → +1 điểm, sang bài mới. Sai → mất 1 mạng nhưng **vẫn bài này, vẫn đồng hồ này** — bug vẫn là của em.
- **Gợi ý**: bí quá thì lấy gợi ý ở cột phải — cấp 1 khoanh vùng (miễn phí), cấp 2 gọi tên kỹ thuật (trừ 1 điểm). Lỗi cụ thể chỉ được tiết lộ khi bài ngã ngũ.

## Ràng buộc

Giữ nguyên định dạng input/output và ý tưởng tổng thể của chương trình. Mức hiện tại: ${difficulty}.`;
}

export function initRush(app) {
  function makeConfig(run) {
    if (!run || run.state !== "active" || !run.drill) throw new Error("Rush không có bài đang hoạt động.");
    const drill = run.drill;
    const codeKey = `${DRAFT_PREFIX}.${drill.drillId}.code`;
    const inputKey = `${DRAFT_PREFIX}.${drill.drillId}.input`;
    const expectedKey = `${DRAFT_PREFIX}.${drill.drillId}.expected`;
    const statementKey = `${DRAFT_PREFIX}.${drill.drillId}.statement`;
    // Live run snapshot — wrong submits and hints mutate lives/score/hintLevel
    // without remounting the workspace, so the status strip reads this ref.
    let liveRun = run;
    let hintBusy = false;

    const paintHints = (host, ws) => {
      const level = liveRun.hintLevel || 0;
      const rows = [];
      if (host.dataset.hint1) rows.push(`<div class="rush-hint"><b>Gợi ý 1 · khoanh vùng</b>${escapeHtml(host.dataset.hint1)}</div>`);
      if (host.dataset.hint2) rows.push(`<div class="rush-hint is-tech"><b>Gợi ý 2 · kỹ thuật</b>${escapeHtml(host.dataset.hint2)}</div>`);
      const nextLabel = level === 0
        ? "💡 Gợi ý 1 — khoanh vùng (miễn phí)"
        : (level === 1 ? "🔍 Gợi ý 2 — kỹ thuật (−1 điểm)" : "");
      host.innerHTML = `
        <div class="rush-hints">
          ${rows.join("")}
          ${nextLabel ? `<button type="button" class="btn btn-ghost btn-sm" data-rush-hint ${hintBusy ? "disabled" : ""}>${nextLabel}</button>` : ""}
          ${!rows.length && nextLabel ? `<div class="rush-hint-note">Tự săn trước đã — gợi ý luôn nằm đây khi cần.</div>` : ""}
        </div>`;
      const button = host.querySelector("[data-rush-hint]");
      if (button) button.addEventListener("click", async () => {
        if (hintBusy) return;
        hintBusy = true;
        paintHints(host, ws);
        try {
          const response = await api.rushHint();
          if (response && response.ok) {
            if (response.level === 1) host.dataset.hint1 = response.hint;
            else host.dataset.hint2 = response.hint;
            liveRun = { ...liveRun, ...response.run, drill: liveRun.drill };
            ws.setStatus(statusFor(liveRun));
          }
        } catch (error) {
          app.toast && app.toast((error && error.message) || "Chưa lấy được gợi ý.", "err");
        } finally {
          hintBusy = false;
          paintHints(host, ws);
        }
      });
    };

    return {
      kind: "rush",
      kicker: "Luyện debug tốc độ",
      title: drill.title || `Săn một lỗi · ${drill.difficultyLabel || "medium"}`,
      // A rush drill is generated code-first, but students still need room to
      // rewrite the brief in their own words. Keep that annotation per drill
      // and never pretend it mutates the sealed hidden-test contract.
      statement: storageGet(statementKey, rushStatement(run)),
      samples: drill.samples || [],
      sheetMeta: { title: drill.title || `Săn một lỗi · ${drill.difficultyLabel || "medium"}`, kicker: "DEBUG TỐC ĐỘ" },
      code: storageGet(codeKey, drill.buggyCode || ""),
      input: storageGet(inputKey, ""),
      expected: storageGet(expectedKey, ""),
      expectedEnabled: true,
      fileName: "main.cpp",
      taskNote: "Code đã biên dịch · đúng một lỗi logic",
      status: statusFor(run),
      mountControls: (host, ws) => { paintHints(host, ws); },
      saveCode: async (code) => storageSet(codeKey, code),
      saveInput: async (input) => storageSet(inputKey, input),
      saveExpected: async (expected) => storageSet(expectedKey, expected),
      saveStatement: async (statement) => storageSet(statementKey, statement),
      run: ({ code, input, expected, signal }) => api.rushRun(code, input, expected, { signal }),
      judge: async ({ code, signal }) => {
        const response = await api.rushSubmit(code, { signal });
        const nextRun = response.run || {};
        const result = {
          verdict: response.judge && response.judge.verdict,
          summary: response.judge && response.judge.summary,
          // Rush intentionally returns no hidden test input/expected rows.
          results: []
        };

        if (response.outcome === "wrong" && nextRun.state === "active" && nextRun.drill && nextRun.drill.drillId === drill.drillId) {
          // Still alive, same drill: no reveal, no remount — keep hunting.
          liveRun = { ...liveRun, ...nextRun };
          result.feedback = `Chưa đúng — mất 1 mạng, còn ${nextRun.lives}/3. Vẫn bài này, vẫn đồng hồ này. Bí quá thì lấy gợi ý ở trên.`;
          return result;
        }

        // The drill resolved (correct / timeout / run over) — clear the draft
        // and show the earned reveal.
        storageRemove(codeKey);
        storageRemove(inputKey);
        const outcome = response.outcome === "correct"
          ? "Đã sửa đúng"
          : response.outcome === "timeout" ? "Hết giờ" : "Chưa đúng";
        const reveal = response.result && response.result.bugSummary ? ` · Lỗi là: ${response.result.bugSummary}` : "";
        result.feedback = `${outcome}${reveal}`;
        if (nextRun.state === "active" && nextRun.drill) {
          result.nextConfig = makeConfig(nextRun);
        } else {
          result.feedback += ` · Kết thúc lượt với ${nextRun.score != null ? nextRun.score : run.score} điểm.`;
          result.followup = { label: "Chơi lại", onClick: startNew };
        }
        return result;
      },
      onActivate: (workspace) => {
        const paint = () => workspace.setStatus(statusFor(liveRun));
        const timer = setInterval(paint, TICK_MS);
        paint();
        return () => clearInterval(timer);
      }
    };
  }

  async function startNew() {
    app.activityWorkspace.openLoading({
      kind: "rush",
      kicker: "Luyện debug tốc độ",
      title: "Đang chuẩn bị lỗi tiếp theo",
      message: "Đang lấy một đoạn code có đúng một lỗi logic đã được kiểm chứng."
    });
    try {
      const response = await api.rushStart();
      await app.activityWorkspace.open(makeConfig(response.run));
    } catch (error) {
      if (error && error.aborted) return;
      const noKey = error && (error.code === "NO_KEY" || (error.data && error.data.code === "NO_KEY"));
      app.activityWorkspace.showError({
        kind: "rush",
        kicker: "Luyện debug tốc độ",
        title: "Chưa bắt đầu được",
        message: noKey
          ? "Cần API key trong Settings → AI để bổ sung bài debug mới khi bộ bài đã hết."
          : ((error && error.message) || "Không khởi động được lượt debug."),
        retry: startNew
      });
    }
  }

  async function openRush() {
    if (!app.activityWorkspace) {
      app.toast && app.toast("Activity workspace chưa sẵn sàng.", "err");
      return;
    }
    app.activityWorkspace.openLoading({
      kind: "rush",
      kicker: "Luyện debug tốc độ",
      title: "Đang khôi phục lượt luyện",
      message: "Nếu còn một lượt đang chạy, app sẽ mở lại đúng bài và đồng hồ cũ."
    });
    try {
      const response = await api.rushState();
      if (response.expired) {
        const reveal = response.expiredReveal ? ` Lỗi của bài đó: ${response.expiredReveal}` : "";
        app.toast && app.toast(`Bài trước hết giờ trong lúc em rời đi — tính là trượt, trừ 1 mạng.${reveal}`, "warn");
      }
      if (response.run && response.run.state === "active" && response.run.drill) {
        await app.activityWorkspace.open(makeConfig(response.run));
      } else {
        await startNew();
      }
    } catch (error) {
      if (error && error.aborted) return;
      app.activityWorkspace.showError({
        kind: "rush",
        kicker: "Luyện debug tốc độ",
        title: "Không đọc được trạng thái",
        message: (error && error.message) || "Backend chưa sẵn sàng.",
        retry: openRush
      });
    }
  }

  app.openRush = openRush;
}
