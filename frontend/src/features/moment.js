// moment.js v2 — "Khoảnh Khắc": the autopilot surface (README-AUTOPILOT.md).
//
// v2 turns the card into a real CTA STATE MACHINE: every state ends in exactly
// ONE loud "Nước tiếp theo" (the .mo-next pattern), everything else is a quiet
// chip. The student never has to pick from a menu:
//
//   WA/RE/TLE (lần đầu)  → primary: "Sửa theo gợi ý — dòng N" (jump editor)
//   WA lặp (streak ≥ 2)  → primary: "Mở Coach" (escalation — tự sửa chưa ăn)
//   không có chẩn đoán   → primary: "Hỏi Coach"
//   AC                   → primary: nước đi của Giáo Án Động (ôn / bài mới /
//                          Flash Quiz — planner.js quyết, kèm lý do)
//   CE                   → primary: "Giải thích lỗi"
//   hết giờ tập trung    → primary: "Tiếp tục +10 phút" (bus "timer:done")
//
// Every number here traces to lastJudge, /api/progress or a recorded event
// (README-LOOPS §1.2). The AI diagnosis is labeled a hypothesis ("giả
// thuyết") and arrives with clickable line-number evidence. Tool chips reuse
// chipsFor() from verdict-rail.js — same gating, new stage, never primary.

import { api } from "../api.js";
import { escapeHtml } from "../md.js";
import { chipsFor } from "./verdict-rail.js?v=2.2";
import { tierOf, tierMeter, derivePositives, fmtDuration } from "./game-review.js?v=3.1";
import { friendlyReasons } from "./arena.js?v=1.5"; // pure helper — safe across module instances

const RING_MINI_C = 125.66; // 2π · r(20) — .mo-ring arc

// ---- small utilities -------------------------------------------------------

function pickFailing(results) {
  if (!Array.isArray(results)) return null;
  return results.find((t) => ["WA", "RE", "TLE"].includes(t.status)) || null;
}

function displayProblemTitle(title) {
  return String(title || "").replace(/^\s*[⚔️🐲]+\s*/u, "");
}

/** First differing line between expected and actual (loose: trailing ws off). */
function firstDiff(expected, actual) {
  const norm = (s) => String(s == null ? "" : s).replace(/\r/g, "").replace(/\s+$/, "").split("\n");
  const e = norm(expected);
  const a = norm(actual);
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i += 1) {
    const el = (e[i] ?? "").replace(/\s+$/, "");
    const al = (a[i] ?? "").replace(/\s+$/, "");
    if (el !== al) return { line: i + 1, expected: el, actual: al };
  }
  return null;
}

function clip(s, n) {
  const str = String(s == null ? "" : s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function jumpToLine(app, lineNo) {
  const ed = app.el && app.el.codeEditor;
  const view = ed && ed._cmView;
  if (!view) return;
  const doc = view.state.doc;
  const n = Math.max(1, Math.min(Number(lineNo) || 1, doc.lines));
  const line = doc.line(n);
  view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
  // Keep the legacy textarea/status bridge in sync with programmatic CM jumps.
  // Keyboard/click updates already flow the other way through editor.js, but
  // without this the editor opened the correct line while still saying Ln 1.
  if (typeof ed.setSelectionRange === "function") ed.setSelectionRange(line.from, line.to);
  const cursor = document.getElementById("cursor-pos");
  if (cursor) cursor.textContent = `Ln ${n} · Col 1`;
  view.focus();
}

// ---- the ONE primary CTA (same visual pattern in every state) ----------------

function ctaHtml({ action, title, why, kicker = "Nước tiếp theo", data = {} }) {
  const attrs = Object.entries(data)
    .map(([k, v]) => `data-${k}="${escapeHtml(String(v))}"`)
    .join(" ");
  return `<button type="button" class="mo-next" data-mo-action="${escapeHtml(action)}" ${attrs}>
    <span class="mo-next-kicker">${escapeHtml(kicker)}</span>
    <span class="mo-next-title">${title}</span>
    ${why ? `<span class="mo-next-why">${escapeHtml(why)}</span>` : ""}
  </button>`;
}

// ---- chips row (the tools — quiet supporting cast, NEVER primary in v2) ------
// CTA policy (README-VERIFIED-ARTIFACT-LOOP §7): tối đa HAI chip nhìn thấy
// ngay; mọi tool còn lại gấp vào "⋯ Thêm" — không xóa feature nào, nhưng hết
// cảnh 5 nút ngang hàng sau mỗi verdict.

const VISIBLE_CHIPS = 2;

function ceErrorLine(app) {
  const r = app.state.lastJudge || {};
  const stderr = (r.compile && r.compile.stderr) || "";
  const m = /(?:^|\n)[^\s:]*\.(?:cpp|cc|h|hpp):(\d+):/.exec(stderr);
  return m ? Number(m[1]) : null;
}

function chipListFor(app, payload) {
  const v = String(payload.verdict || "").toUpperCase();
  const base = chipsFor(app, payload).map((c) =>
    c.label === "Pháp y" ? { ...c, label: "Biên bản đầy đủ", hint: null } : c
  );
  const list = [];
  const evidenceRef = app.state.lastJudge && app.state.lastJudge.evidence;

  // AC: Xưởng phải là chip 0 — NCKH §7: kích hoạt tự động sau AC, không để
  // user tự tìm. Lấy chip từ base (verdict-rail đã guard app.openXuongPathways).
  if (v === "AC" && payload.kind === "judge") {
    const xuong = base.find((c) => c.label === "Phát triển lời giải");
    if (xuong) list.push(xuong);
  }
  if (payload.kind === "judge" && ["AC", "WA", "RE", "TLE"].includes(v) && app.openCodeAnalysis && evidenceRef) {
    list.push({ g: "◎", label: "Phân tích code này", run: () => app.openCodeAnalysis(evidenceRef) });
  }
  if (payload.kind === "judge" && v === "AC" && app.openDerivedModule && evidenceRef) {
    const dmLabel = app.derivedModuleLabelFor ? app.derivedModuleLabelFor(app.state.meta) : "Phát triển thành module";
    list.push({ g: "⑂", label: dmLabel, run: () => app.openDerivedModule(evidenceRef) });
  }
  for (const c of base) {
    if (v === "CE" && c.label === "Giải thích lỗi" && ceErrorLine(app) == null) continue;
    if (v === "AC" && c.label === "Phát triển lời giải") continue; // đã ở vị trí 0
    list.push(c);
  }
  return list;
}

function renderChips(app, payload, overflowExtraHtml = "") {
  const chips = chipListFor(app, payload);
  if (chips.length === 0 && !overflowExtraHtml) return "";
  const head = chips.slice(0, VISIBLE_CHIPS);
  const tail = chips.slice(VISIBLE_CHIPS);
  const hasMore = tail.length > 0 || Boolean(overflowExtraHtml);
  const chipBtn = (c, i) => `
    <button type="button" class="rail-chip" data-chip="${i}">
      <span class="rc-g">${c.g}</span><span>${c.label}</span>
    </button>`;
  const moreBtn = hasMore
    ? `<button type="button" class="rail-chip mo-more-toggle" data-mo-action="more" aria-expanded="false">
        <span class="rc-g">⋯</span><span>Thêm</span>
      </button>`
    : "";
  const overflow = hasMore
    ? `<div class="mo-overflow hidden" id="mo-overflow">
        ${overflowExtraHtml}
        ${tail.length ? `<div class="rail-chips mo-actions">${tail.map((c, i) => chipBtn(c, i + head.length)).join("")}</div>` : ""}
      </div>`
    : "";
  return `<div class="rail-chips mo-actions">${head.map(chipBtn).join("")}${moreBtn}</div>${overflow}`;
}

function wireChips(rail, app, payload, pid) {
  const chips = chipListFor(app, payload);
  rail.querySelectorAll(".mo-actions .rail-chip[data-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (app.state.currentId !== pid) { app.toast("Bài đã đổi — chạy lại để lấy gợi ý mới.", "err"); return; }
      const chip = chips[Number(btn.dataset.chip)];
      if (chip) chip.run();
    });
  });
}

// ---- the failing-verdict card (the automatic forensics) ---------------------

function renderFailCard(app, payload, fail) {
  const r = app.state.lastJudge || {};
  const sum = r.summary || {};
  const v = payload.verdict;
  const diff = v === "WA" ? firstDiff(fail.expected, fail.actual) : null;
  const meta = [
    fail.name ? escapeHtml(fail.name) : "",
    sum.total != null ? `${sum.passed}/${sum.total} test qua` : "",
    fail.timeMs != null ? `${fail.timeMs}ms` : "",
  ].filter(Boolean).join(" · ");

  return `<section class="mo-card" data-kind="fail">
    <header class="mo-head">
      <span class="mo-glyph">Δ</span>
      <span class="mo-kicker">Khoảnh khắc</span>
      <span class="vbadge v-${escapeHtml(v)}">${escapeHtml(v)}</span>
      <span class="mo-meta">${meta}</span>
    </header>
    <div class="mo-shrink-note hidden" id="mo-shrink-note"></div>
    <div class="mo-evidence">
      <div class="mo-io"><div class="mo-io-label" id="mo-input-label">Vào</div><pre class="mo-pre" id="mo-input-pre">${escapeHtml(clip(fail.input, 400)) || "<i>(rỗng)</i>"}</pre></div>
      <div class="mo-io is-exp"><div class="mo-io-label" id="mo-expected-label">Chờ đợi</div><pre class="mo-pre" id="mo-expected-pre">${escapeHtml(clip(fail.expected, 300)) || "<i>(rỗng)</i>"}</pre></div>
      <div class="mo-io is-got"><div class="mo-io-label">Em in ra</div><pre class="mo-pre" id="mo-actual-pre">${escapeHtml(clip(v === "RE" ? (fail.stderr || fail.actual) : fail.actual, 300)) || "<i>(không có output)</i>"}</pre></div>
    </div>
    ${diff ? `<div class="mo-firstdiff" id="mo-firstdiff">Lệch đầu tiên ở dòng ${diff.line}: chờ <code class="fd-exp">${escapeHtml(clip(diff.expected, 40)) || "␀"}</code> — em in <code class="fd-got">${escapeHtml(clip(diff.actual, 40)) || "␀"}</code></div>` : `<div id="mo-firstdiff"></div>`}
    <div class="mo-coach" id="mo-coach">
      <div class="mo-coach-head"><span class="mo-coach-who">Coach</span><span class="mo-tag hidden" id="mo-tag"></span></div>
      <div class="mo-coach-status mo-wait" id="mo-status">Đang soi test này…</div>
      <p class="mo-why hidden" id="mo-why"></p>
      <div class="mo-lines hidden" id="mo-lines"></div>
      <div class="mo-hint-zone hidden" id="mo-hint-zone">
        <button type="button" class="btn btn-ghost btn-sm" id="mo-hint-btn">Gợi ý một bước</button>
        <div class="mo-hint hidden" id="mo-hint"></div>
      </div>
      <div class="mo-coach-note hidden" id="mo-coach-note">Coach sẽ nhớ chẩn đoán này nếu em mở chat.</div>
    </div>
    <div id="mo-bug-slot"></div>
    <div id="mo-arb-slot"></div>
    <div id="mo-cta-slot"></div>
  </section>`;
}

// ---- ⚔ WA loot: the Bug Card line (S5) --------------------------------------
// The backend mints/levels the card as a side effect of the diagnosis we just
// streamed — give that fire-and-forget write a beat to land, then show the loot.
function showBugCard(rail, app, pid, tag) {
  if (!app.arena || !tag || tag === "khac") return;
  setTimeout(async () => {
    const res = await app.arena.cardFor(tag);
    if (app.state.currentId !== pid) return;
    const slot = rail.querySelector("#mo-bug-slot");
    if (!slot || !res || !res.ok || !res.card || !res.card.count) return;
    const c = res.card;
    slot.innerHTML = `<div class="ar-card-line">
      <span class="ar-cl-g">❏</span>
      <span><b>Thẻ «${escapeHtml(c.label)}»</b>
        ${c.count === 1 ? `<span class="ar-cl-new">LỖI MỚI</span>` : `· lần thứ ${c.count}`}
        · mức ${c.level} «${escapeHtml(c.levelName)}»${c.tamed ? " · đã nắm vững" : ""}</span>
      <button type="button" class="ar-cl-train">Luyện thẻ</button>
    </div>`;
    slot.querySelector(".ar-cl-train").addEventListener("click", () => {
      if (app.openFlashQuiz) app.openFlashQuiz();
    });
  }, 700);
}

// ---- ⚔ Arbitration: "code sai hay test sai?" (S12) ---------------------------
// Only offered for AI-born tests — official samples are never on trial, and
// hand-written tests are the student's own word. One click; the trusted
// reference testifies; a bad test gets corrected in place, never deleted.
function offerArbitration(rail, app, pid, fail) {
  const slot = rail.querySelector("#mo-arb-slot");
  if (!slot || !fail || !fail.testId || fail.testId === "main") return;
  const test = (app.state.tests || []).find((t) => t.id === fail.testId);
  if (!test || test.generatedBy !== "ai" || test.provenance === "official-sample") return;

  slot.innerHTML = `<div class="ar-arb"><button type="button" class="rail-chip" id="ar-arb-btn">
    <span class="rc-g">≠</span><span>Xử án test này</span><span class="rc-hint">· test AI — code sai hay test sai?</span>
  </button></div>`;

  slot.querySelector("#ar-arb-btn").addEventListener("click", async () => {
    if (app.state.currentId !== pid) return;
    const zone = slot.querySelector(".ar-arb");
    zone.innerHTML = `<div class="ar-arb-verdict">Đang xử — chạy lời giải tham chiếu trên chính test này…</div>`;
    let r = null;
    try {
      r = await api.arenaArbitrate(pid, fail.testId, { code: (app.el.codeEditor && app.el.codeEditor.value) || "" });
    } catch (err) {
      zone.innerHTML = `<div class="ar-arb-verdict">${escapeHtml((err && err.message) || "Không xử được.")}</div>`;
      return;
    }
    if (app.state.currentId !== pid || !zone.isConnected) return;
    zone.dataset.verdict = r.verdict || "";
    const followUp = r.verdict === "bad-test"
      ? `<div style="margin-top:6px"><button type="button" class="rail-chip" id="ar-arb-rejudge"><span class="rc-g">↻</span><span>Chấm lại với đáp án đã sửa</span></button></div>`
      : "";
    zone.innerHTML = `<div class="ar-arb-verdict">${escapeHtml(r.message || "")}</div>${followUp}`;
    if (r.testUpdated && app.reloadTests) app.reloadTests().catch(() => {});
    const again = zone.querySelector("#ar-arb-rejudge");
    if (again) again.addEventListener("click", () => { if (app.judgeAll) app.judgeAll(); });
  });
}

/** The fail card's primary, decided by escalation state + diagnosis outcome. */
function renderFailCta(rail, app, v, { streak, diagnosis }) {
  const slot = rail.querySelector("#mo-cta-slot");
  if (!slot) return;
  if (streak >= 2) {
    slot.innerHTML = ctaHtml({
      action: "coach",
      title: "Mở Coach",
      why: `${streak} lần nộp chưa qua thêm test — đến lúc hỏi thẳng`,
      data: { ask: v === "TLE" ? "why-tle" : "why-wa" },
    });
    return;
  }
  if (diagnosis && diagnosis.ok && diagnosis.lines && diagnosis.lines.length) {
    slot.innerHTML = ctaHtml({
      action: "jump",
      title: `Sửa theo gợi ý — dòng ${diagnosis.lines[0]}`,
      why: `giả thuyết: ${diagnosis.tagLabel || "xem phân tích ở trên"}`,
      data: { line: diagnosis.lines[0] },
    });
    return;
  }
  if (diagnosis) { // arrived but unusable (no lines / not ok) — hand over to the Coach
    slot.innerHTML = ctaHtml({
      action: "coach",
      title: "Hỏi Coach",
      why: "chẩn đoán tự động chưa đủ chắc cho ván này",
      data: { ask: v === "TLE" ? "why-tle" : "why-wa" },
    });
  }
  // No diagnosis yet (still streaming) → no primary; the evidence is the content.
}

// ---- streaming diagnosis (labels appear as their lines complete) ------------

function applyDiagnosisText(rail, buffer, doneDiagnosis) {
  const el = (id) => rail.querySelector(`#${id}`);
  const status = el("mo-status");
  const tagEl = el("mo-tag");
  const whyEl = el("mo-why");
  const linesEl = el("mo-lines");
  const hintZone = el("mo-hint-zone");
  const hintEl = el("mo-hint");
  if (!whyEl) return;

  let tag = null, lines = null, why = null, hint = null, whyStreaming = false;
  if (doneDiagnosis) {
    ({ tagLabel: tag, lines, why, hint } = doneDiagnosis);
  } else {
    const grab = (label) => {
      const m = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "mi").exec(buffer);
      return m ? m[1] : null;
    };
    const linesRaw = grab("LINES");
    if (linesRaw != null && /GOIY|VISAO/i.test(buffer)) {
      lines = (linesRaw.match(/\d+/g) || []).map(Number).slice(0, 3);
    }
    const vi = /VISAO\s*:\s*([\s\S]*?)(?:\n\s*GOIY\s*:|$)/i.exec(buffer);
    if (vi) { why = vi[1].trim(); whyStreaming = !/GOIY\s*:/i.test(buffer); }
    const go = /GOIY\s*:\s*([\s\S]*)$/i.exec(buffer);
    if (go) hint = go[1].trim();
  }

  if (why) {
    status.classList.add("hidden");
    whyEl.classList.remove("hidden");
    whyEl.textContent = why + (whyStreaming ? " ▌" : "");
  }
  if (tag) {
    tagEl.textContent = `giả thuyết: ${tag}`;
    tagEl.classList.remove("hidden");
  }
  if (lines && lines.length && linesEl.children.length === 0) {
    linesEl.innerHTML = lines.map((n) => `<button type="button" class="mo-line" data-line="${n}">dòng ${n}</button>`).join("");
    linesEl.classList.remove("hidden");
  }
  if (hint && doneDiagnosis) {
    hintEl.textContent = hint;
    hintZone.classList.remove("hidden");
  }
  if (doneDiagnosis) {
    const note = el("mo-coach-note");
    if (note) note.classList.remove("hidden"); // M3 is real — say so, quietly
  }
}

// README-AUTOPILOT.md M4 — the backend shrank a large input before diagnosing;
// swap the evidence grid to the smaller, still-failing input so the student
// reads a 3-line certificate instead of a wall of text.
function applyShrunk(rail, obj) {
  const inputPre = rail.querySelector("#mo-input-pre");
  if (inputPre && obj.minimalInput != null) inputPre.textContent = clip(obj.minimalInput, 400);
  const note = rail.querySelector("#mo-shrink-note");
  if (note) {
    note.textContent = obj.trustworthy
      ? `Đã tự thu nhỏ input (${obj.fromBytes}→${obj.toBytes} byte, ${obj.runs} lần chạy) — vẫn giữ nguyên lỗi.`
      : `Đã tự thu nhỏ input (${obj.fromBytes}→${obj.toBytes} byte, ${obj.runs} lần chạy) — "Chờ đợi" bên dưới là của test gốc, chỉ dùng để đối chiếu.`;
    note.classList.remove("hidden");
  }
  const actualPre = rail.querySelector("#mo-actual-pre");
  if (actualPre && obj.studentOutput != null) actualPre.textContent = clip(obj.stderr || obj.studentOutput, 300);
  if (obj.trustworthy) {
    const expPre = rail.querySelector("#mo-expected-pre");
    if (expPre && obj.expectedOutput != null) expPre.textContent = clip(obj.expectedOutput, 300);
    const firstdiff = rail.querySelector("#mo-firstdiff");
    const diff = firstDiff(obj.expectedOutput, obj.studentOutput);
    if (firstdiff && diff) {
      firstdiff.textContent = `Lệch đầu tiên ở dòng ${diff.line}: chờ ${diff.expected || "␀"} — em in ${diff.actual || "␀"}`;
    }
  } else {
    const expLabel = rail.querySelector("#mo-expected-label");
    if (expLabel) expLabel.textContent = "Chờ đợi (test gốc)";
  }
}

async function streamDiagnosis(rail, app, pid, payload, fail, signal, onDone) {
  const status = rail.querySelector("#mo-status");
  try {
    const res = await fetch(`/api/problems/${encodeURIComponent(pid)}/moment-diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        verdict: payload.verdict,
        code: (app.el.codeEditor && app.el.codeEditor.value) || "",
        timeMs: fail.timeMs,
        limitMs: app.state.settings && app.state.settings.timeMs,
        test: {
          testId: fail.testId, input: fail.input || "",
          expected: fail.expected || "", actual: fail.actual || "", stderr: fail.stderr || "",
        },
      }),
    });

    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("text/event-stream")) {
      const data = await res.json().catch(() => ({}));
      if (data.code === "NO_KEY") {
        status.classList.remove("mo-wait");
        status.textContent = "Thêm API key (Settings → AI) để Coach tự chẩn đoán khoảnh khắc này.";
        onDone(null);
        return;
      }
      throw new Error(data.error || "Chẩn đoán thất bại.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop();
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line.slice(6)); } catch { continue; }
        if (obj.stage === "shrunk") {
          applyShrunk(rail, obj);
        } else if (obj.delta) {
          text += obj.delta;
          applyDiagnosisText(rail, text, null);
        } else if (obj.done) {
          if (obj.diagnosis && obj.diagnosis.ok) {
            applyDiagnosisText(rail, "", obj.diagnosis);
            rememberDiagnosis(pid, fail, app, obj.diagnosis);
          } else {
            status.classList.remove("mo-wait", "hidden");
            status.textContent = "Coach chưa chẩn đoán được ván này.";
          }
          onDone(obj.diagnosis || { ok: false });
        } else if (obj.error) {
          status.classList.remove("mo-wait");
          status.textContent = `Coach gặp trục trặc: ${obj.error}`;
          onDone({ ok: false });
        }
      }
    }
  } catch (err) {
    if (err && err.name === "AbortError") return;
    if (status) { status.classList.remove("mo-wait"); status.textContent = "Coach gặp trục trặc khi chẩn đoán."; }
    onDone({ ok: false });
  }
}

// Same code + same failing test re-judged = instant replay, zero tokens.
const memory = [];
function diagKey(pid, fail, app) {
  const code = (app.el.codeEditor && app.el.codeEditor.value) || "";
  return `${pid}|${fail.testId}|${fail.input}|${code}`;
}
function rememberDiagnosis(pid, fail, app, diagnosis) {
  memory.push({ key: diagKey(pid, fail, app), diagnosis });
  if (memory.length > 4) memory.shift();
}
function recallDiagnosis(pid, fail, app) {
  const key = diagKey(pid, fail, app);
  const hit = memory.find((m) => m.key === key);
  return hit ? hit.diagnosis : null;
}

// ---- ⚔ Đấu Trường pieces (S1-S12 backend; every block degrades to "" ) -------

/** Rating reveal row — numbers only, the count-up IS the ceremony. */
function arenaRevealHtml(entry, ratingState) {
  if (!entry) return "";
  const up = entry.delta >= 0;
  const band = ratingState && ratingState.gamesPlayed < 30 ? ratingState.band : 0;
  return `<div class="ar-reveal">
    <span>Elo</span>
    <span class="ar-reveal-num" id="ar-reveal-num" data-from="${entry.ratingBefore}" data-to="${entry.ratingAfter}">${entry.ratingBefore}</span>
    <span class="ar-delta ${up ? "up" : "down"}">${up ? "+" : ""}${entry.delta}</span>
    ${band ? `<span class="ar-reveal-band">±${band} · tạm tính</span>` : ""}
  </div>`;
}

/** One line that names THIS win — every branch traces to a real field. */
function arenaMomentLine(entry, match) {
  if (entry) {
    if (entry.delta > 0 && entry.problemRating - entry.ratingBefore >= 100) {
      return `<div class="ar-moment-line"><b>Upset</b> — hạ một bài trên cơ (~${entry.problemRating}).</div>`;
    }
    if ((entry.waBeforeAc || 0) >= 2) {
      return `<div class="ar-moment-line"><b>Comeback</b> — AC sau ${entry.waBeforeAc} lần WA. Điểm này nặng ký.</div>`;
    }
    if ((entry.waBeforeAc || 0) === 0) {
      return `<div class="ar-moment-line"><b>Sạch</b> — nộp phát ăn ngay.</div>`;
    }
    return "";
  }
  if (match && match.rated === false) {
    const why = friendlyReasons(match.ratedEligible).join(" · ");
    return `<div class="ar-moment-line">Bài luyện tự do${why ? ` — ${escapeHtml(why)}` : ""}. AC vẫn thật, điểm thì chưa.</div>`;
  }
  return "";
}

/** Count-up on the reveal number. Finite (~0.9s); reduced-motion jumps. */
function animateReveal(rail) {
  const el = rail.querySelector("#ar-reveal-num");
  if (!el) return;
  const from = Number(el.dataset.from), to = Number(el.dataset.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to
    || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    el.textContent = String(to);
    return;
  }
  const t0 = performance.now(), dur = 900;
  const tick = (t) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const RISK_VN = { safe: "an toàn", standard: "chuẩn", upset: "upset" };
// Professional test-case vocabulary. The Gauntlet is adversarial TESTING, not a
// brawl — each probe is a "ca" (test case), not a "đòn" (blow). The three phases
// map to how the case was produced: boundary/edge, randomly generated, and
// adversarial (deep-seed) cases.
const PHASE_VN = { boundary: "ca biên", random: "ca ngẫu sinh", adversarial: "ca đối kháng" };

// ---- Ấn (Seal) — the deterministic kintsugi rank of this solve. Cheap local
// derive on the backend; shown after AC and refreshed after the Gauntlet
// (surviving it is exactly what lifts Thô → Đã Tôi). Absent = silent.
const SEAL_GLYPH = { 1: "◇", 2: "◆", 3: "✦", 4: "❖" };

async function showSealLine(rail, app, pid) {
  if (!app.arena || !app.arena.sealFor) return;
  const r = await app.arena.sealFor(pid);
  if (app.state.currentId !== pid) return;
  const slot = rail.querySelector("#ar-seal");
  if (!slot || !r || !r.ok || !r.seal || !r.seal.tier) return;
  const s = r.seal;
  const scars = (s.kintsugi && s.kintsugi.waCount) || 0;
  // A re-derive with the SAME tier (post-gauntlet refresh) must not re-stamp —
  // the stamp ceremony fires once per tier change, not once per fetch.
  if (slot.dataset.tier === String(s.tier)) return;
  slot.dataset.tier = String(s.tier);
  slot.innerHTML = `
    <span class="ar-seal-medal" data-tier="${s.tier}"><span class="ar-seal-g">${SEAL_GLYPH[s.tier] || "◇"}</span></span>
    <span class="ar-seal-text">Ấn: <b>${escapeHtml(s.tierName)}</b>
      <span class="ar-seal-sub">${scars ? `${scars} vết vá vàng — từng gãy, đã liền` : "không vết — nộp phát ăn ngay"}</span>
    </span>`;
  slot.classList.add("on");
}

/** Post-AC Sealed Gauntlet: the system tries to BREAK the fresh AC, and the
 *  reveal narrates the REAL seed search phase by phase (arena/gauntlet.js's
 *  onProgress — never a fake animation). Backend degrades softly (no key /
 *  no reference / no compiler → {ok:false, reason, note}). */
// The gauntlet's phase track: three segments sized like the REAL seed buckets
// (arena/gauntlet.js phaseForSeed: ~20% boundary / ~50% random / ~30%
// adversarial). The fill advances only when a real SSE frame lands — the bar
// IS the data. `pos` (0..1) is where the fill currently stands.
function gauntletTrackHtml(pos = 0, { notchAt = null } = {}) {
  return `<div class="ar-g-track" aria-hidden="true">
    <span class="ar-g-fill" style="transform:scaleX(${Math.max(0, Math.min(1, pos))})"></span>
    <i class="ar-g-div" style="left:20%"></i><i class="ar-g-div" style="left:70%"></i>
    ${notchAt != null ? `<span class="ar-g-notch" style="left:${(Math.max(0, Math.min(1, notchAt)) * 100).toFixed(1)}%"></span>` : ""}
  </div>
  <div class="ar-g-phases">
    <span data-ph="boundary">biên</span><span data-ph="random">ngẫu sinh</span><span data-ph="adversarial">đối kháng</span>
  </div>`;
}

// The Gauntlet's generator + reference are AI-written, so its verdict is a
// CLAIM, not gospel — a generated input can quietly break the statement's
// constraints, or the reference can be wrong. This block makes the claim
// auditable: it names WHO judged (provenance) and gives the student a way to
// reject an illegitimate attack, so they're never stuck AC-ing against a bogus
// case. `r.addedTest.id` is the phantom test to pull if rejected.
const REF_SOURCE_VN = { "ai-brute": "AI tự viết (brute)", ai: "AI tự viết", manual: "em tự lưu" };
function gauntletAuditHtml(r) {
  const info = r.referenceInfo || {};
  const src = REF_SOURCE_VN[info.source] || info.source || "AI tự viết";
  const checked = info.samplesChecked > 0 ? ` · khớp ${info.samplesChecked} sample chính thức` : "";
  const testId = r.addedTest && r.addedTest.id ? String(r.addedTest.id) : "";
  return `
    <div class="ar-g-audit">
      <div class="ar-g-prov">Đối chứng: <b>${escapeHtml(src)}</b>${checked}. Ca này do máy sinh — kiểm lại ràng buộc của đề trước khi tin.</div>
      <button type="button" class="ar-g-audit-toggle" data-mo-action="gauntlet-audit-toggle" aria-expanded="false">Ca thử này sai luật? ▾</button>
      <div class="ar-g-audit-body hidden">
        <p class="ar-g-audit-hint">Nếu input phạm ràng buộc của đề, hoặc đáp án đối chứng sai, loại ca này: món nợ được gỡ và máy sẽ dựng lại đối chứng mới.</p>
        <div class="ar-g-audit-acts">
          <button type="button" class="ar-g-reject" data-mo-action="gauntlet-reject" data-fault="input" data-test-id="${escapeHtml(testId)}">Input phạm ràng buộc</button>
          <button type="button" class="ar-g-reject" data-mo-action="gauntlet-reject" data-fault="reference" data-test-id="${escapeHtml(testId)}">Đáp án đối chứng sai</button>
        </div>
      </div>
    </div>`;
}

async function runGauntletZone(rail, app, pid) {
  const zone = rail.querySelector("#ar-gauntlet");
  if (!zone || !app.arena) return;
  if (app.state.settings && app.state.settings.momentAuto === false) return; // same gate as auto-diagnosis
  const stillHere = () => app.state.currentId === pid && zone.isConnected;

  zone.dataset.state = "trying";
  zone.innerHTML = `<div class="ar-g-head"><span class="ar-g-glyph" aria-hidden="true">≠</span><span class="ar-g-live">Đang kiểm định lời giải của em…</span></div>${gauntletTrackHtml(0)}`;

  const code = (app.el.codeEditor && app.el.codeEditor.value) || "";
  let lastMax = 0; // remembered so the final render can place the death notch honestly
  const onEvent = (f) => {
    if (!stillHere()) return;
    const el = zone.querySelector(".ar-g-live");
    if (f.stage === "phase-start") {
      zone.dataset.phase = f.phase;
      const lbl = zone.querySelector(`.ar-g-phases [data-ph="${f.phase}"]`);
      if (lbl) lbl.classList.add("on");
      if (el) el.textContent = `Kiểm định — nhóm ${PHASE_VN[f.phase] || f.phase}…`;
    } else if (f.stage === "progress" && f.maxSeeds) {
      lastMax = f.maxSeeds;
      if (el) el.innerHTML = `Kiểm định — ${escapeHtml(PHASE_VN[f.phase] || f.phase)} · ca <b>${f.seed}</b>/${f.maxSeeds}`;
      const fill = zone.querySelector(".ar-g-fill");
      if (fill) fill.style.transform = `scaleX(${f.seed / f.maxSeeds})`;
    }
  };
  const r = (app.arena.runGauntletStream
    ? await app.arena.runGauntletStream(pid, code, onEvent)
    : await app.arena.runGauntlet(pid, code));
  if (!stillHere()) return;
  if (!r) { zone.dataset.state = "idle"; return; } // aborted (problem switched)

  if (r.ok && r.survived) {
    zone.dataset.state = "survived";
    zone.removeAttribute("data-phase");
    zone.innerHTML = `<div class="ar-g-head"><span class="ar-g-glyph" aria-hidden="true">≠</span>
      <span>Vượt <b>${r.ran}</b> ca kiểm định — biên, ngẫu sinh, đối kháng${r.budgetHit ? " (hết giờ thử)" : ""}. AC này có trọng lượng.</span></div>
      ${r.replayed ? "" : gauntletTrackHtml(1)}`;
    showSealLine(rail, app, pid); // surviving is what lifts the Ấn — re-derive
    return;
  }
  if (r.ok && r.survived === false) {
    zone.dataset.state = "broken";
    zone.removeAttribute("data-phase");
    // Honest near-miss: WHERE in the fight it died is real data (seed + phase).
    const nearMiss = r.seed
      ? `Gục ở ca <b>${r.seed}</b>${r.ran ? `/${r.ran}` : ""}${r.phase ? ` — ${escapeHtml(PHASE_VN[r.phase] || r.phase)}` : ""}.`
      : `Đã tìm được input làm code em sai.`;
    // The frozen track: fill stops where the code died, the notch marks the
    // exact blow. Replays and buffered fallbacks (no frames) skip the track.
    const max = lastMax || r.ran || 0;
    const deathTrack = !r.replayed && r.seed && max
      ? gauntletTrackHtml(r.seed / max, { notchAt: r.seed / max })
      : "";
    // Đối Thủ v1: a recurring counterexample earns a NAME. First bite = a
    // warning; the promotion moment (justPromoted) is the loudest line here.
    const boss = r.boss
      ? (r.boss.promoted
        ? `<div class="ar-g-boss${r.boss.justPromoted ? " is-new" : ""}"><span class="ar-gb-g">⟁</span>${r.boss.justPromoted ? "Đối thủ vừa có tên" : "Đối thủ có tên"}: <b>«${escapeHtml(r.boss.name)}»</b> — đã phá em ${r.boss.count} lần.</div>`
        : `<div class="ar-g-boss"><span class="ar-gb-g">⟁</span>Input này cắn em lần đầu — nó phá em lần nữa là thành đối thủ có tên.</div>`)
      : "";
    zone.innerHTML = `
      <div class="ar-g-head"><span class="ar-g-glyph" aria-hidden="true">≠</span><span><b>Khoan.</b> ${nearMiss}</span></div>
      ${deathTrack}
      <pre class="mo-pre">${escapeHtml(clip(r.minimalInput, 300))}</pre>
      <div class="ar-g-note">chờ <code>${escapeHtml(clip(r.expectedOutput, 60))}</code> — em in <code>${escapeHtml(clip(r.studentOutput, 60)) || "␀"}</code>
      ${r.addedTest ? ` · test «${escapeHtml(r.addedTest.name)}» đã vào bộ` : ""}</div>
      ${boss}
      ${gauntletAuditHtml(r)}`;
    if (r.addedTest && app.reloadTests) app.reloadTests().catch(() => {});
    // The match just changed meaning — the ONE next move flips with it.
    const cta = rail.querySelector("#mo-ac-cta");
    if (cta) cta.innerHTML = ctaHtml({
      action: "rejudge",
      title: "Sửa tiếp — chấm lại với test mới",
      why: "AC cũ chưa thoát; trận thật mới bắt đầu",
    });
    showSealLine(rail, app, pid);
    return;
  }
  // Soft skip — say why in one quiet line, never block the celebration.
  const noteByReason = {
    "no-key": "Cần API key (Settings → AI) để dựng test đối chứng lần đầu.",
    "reference-untrusted": "Tham chiếu chưa khớp sample — tạm bỏ qua bước thử phá.",
    "no-compiler": "g++ chưa sẵn sàng — tạm bỏ qua bước thử phá.",
  };
  const note = noteByReason[r.reason] || r.note || "";
  if (!note) { zone.dataset.state = "idle"; return; }
  zone.dataset.state = "note";
  zone.innerHTML = `<div class="ar-g-head"><span class="ar-g-glyph" aria-hidden="true">≠</span><span class="ar-g-note">${escapeHtml(note)}</span></div>`;
}

// ---- the AC celebration card (the Duolingo chain) ---------------------------

// README-AUTOPILOT.md M7 — derived ONLY from /api/progress; never invented.
function momentumLine(progress) {
  if (!progress) return "";
  const solvedToday = progress.week && progress.week.length ? progress.week[progress.week.length - 1].ac : 0;
  const streak = (progress.streak && progress.streak.current) || 0;
  const parts = [];
  if (solvedToday >= 1) parts.push(`Bài thứ <b>${solvedToday}</b> hôm nay`);
  if (streak >= 1) parts.push(`streak <b>${streak}</b> ngày`);
  if (!parts.length) return "";
  return `<div class="mo-momentum">${parts.join(" · ")}</div>`;
}

/** The planner's pick → one CTA. Every planner item kind maps to an action.
 *  With stakes (S4), the next problem stops being homework and becomes a bet. */
function planCta(item, stakes) {
  if (!item) return "";
  if (item.kind === "quiz") {
    return ctaHtml({
      action: "quiz",
      title: "Ôn lỗi nhanh — nhắc lại lỗi hay gặp",
      why: item.reason || "",
    });
  }
  let why = item.reason || "";
  if (stakes && stakes.ok && Number.isFinite(stakes.win)) {
    const bet = `+${stakes.win} / ${stakes.lose} điểm`;
    why = why ? `${why} · ${bet}` : bet;
  }
  return ctaHtml({
    action: "open",
    kicker: "Nước đi tiếp theo",
    title: `${item.kind === "review" ? "Ôn lại: " : ""}${escapeHtml(displayProblemTitle(item.title || item.id))}`,
    why,
    data: { target: item.id },
  });
}

// ---- Nước đi tiếp theo (Next Bet) --------------------------------------------
// The ONE-primary-CTA law holds: an unfinished (nợ WA) match outranks the
// planner's pick (unfinished business is the strongest reason to come back —
// chess.com's "resume adjourned game"). Everything else stays a quiet chip. The
// sealed option shows only the band + stakes — identity stays hidden until the
// student commits (interleaved practice, just wearing a stake).
function stakeStr(c) {
  return c && c.stakes && Number.isFinite(c.stakes.win) ? `+${c.stakes.win}/${c.stakes.lose}` : "";
}

function nextMovesHtml(planItem, arena) {
  const nb = arena.nextBet;
  const revenge = nb && Array.isArray(nb.revenge) && nb.revenge.length ? nb.revenge[0] : null;

  let primary;
  if (revenge) {
    const debtWhy = revenge.gauntletLastResult === "broken"
      ? "AC cũ bị một test khó phá — món nợ chưa trả"
      : "trận đã buông — món nợ chưa trả";
    const st = stakeStr(revenge);
    primary = ctaHtml({
      action: "open",
      kicker: "Nợ WA",
      title: escapeHtml(revenge.title || revenge.id),
      why: st ? `${debtWhy} · ${st}` : debtWhy,
      data: { target: revenge.id },
    });
  } else {
    primary = planItem ? planCta(planItem, arena.stakes)
      : (document.getElementById("btn-random")
        ? ctaHtml({ action: "random", title: "Bài mới ngẫu nhiên", why: "không có bài nào đến hạn ôn — đi tiếp" })
        : "");
  }

  // Door chips — never more than two, never louder than the primary. Each
  // carries its stagger index (--i) for the one-time entrance rise.
  const doors = [];
  const primaryTarget = revenge ? revenge.id : (planItem && planItem.id) || null;
  const self = nb && Array.isArray(nb.selfSelect)
    ? nb.selfSelect.find((c) => c.id !== primaryTarget)
    : null;
  if (self) {
    doors.push(`<button type="button" class="ar-door" style="--i:${doors.length}" data-mo-action="open" data-target="${escapeHtml(self.id)}">
      <span class="ar-door-g">◈</span><span>Tự chọn: ${escapeHtml(clip(self.title || self.id, 40))}</span><span class="ar-door-st">${stakeStr(self)}</span>
    </button>`);
  }
  const my = nb && nb.mysteryBet;
  if (my && my.opened && my.id && my.id !== primaryTarget) {
    doors.push(`<button type="button" class="ar-door" style="--i:${doors.length}" data-mo-action="open" data-target="${escapeHtml(my.id)}">
      <span class="ar-door-g">◍</span><span>Bài niêm phong (đã mở): ${escapeHtml(clip(my.title || my.id, 36))}</span><span class="ar-door-st">${stakeStr(my)}</span>
    </button>`);
  } else if (my && !my.opened) {
    doors.push(`<button type="button" class="ar-door is-sealed" style="--i:${doors.length}" data-mo-action="mystery-open">
      <span class="ar-door-g">◍</span><span>Bài niêm phong ~${my.cfRating || "?"} — đề giấu tới khi mở</span><span class="ar-door-st">${stakeStr(my)}</span>
    </button>`);
  }

  // Doors không còn đứng cạnh primary: CTA policy giới hạn 2 secondary nhìn
  // thấy, nên kèo tự chọn / bài niêm phong nằm trong "⋯ Thêm" (mo-overflow).
  return { primary, doorsHtml: doors.length ? `<div class="ar-doors">${doors.join("")}</div>` : "" };
}

function renderAcCard(app, review, planItem, progress, arena = {}) {
  const a = review && review.analysis;
  const hasGame = a && a.attempts > 0 && a.score;
  const score = hasGame ? a.score.value : null;
  const tier = hasGame ? tierOf(score) : null;
  const positive = hasGame ? derivePositives(a)[0] : "Bài đã <b>AC</b> — dữ liệu ván đấu sẽ dày lên từ lần nộp sau.";
  const line = hasGame
    ? `AC sau <b>${a.attempts}</b> lần nộp · ${fmtDuration(a.totalMs)}`
    : "AC!";

  const ring = hasGame ? `
    <div class="mo-ring" style="--tier-rgb:${tier.rgb}">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle class="mo-ring-track" cx="24" cy="24" r="20"></circle>
        <circle class="mo-ring-arc" cx="24" cy="24" r="20" style="stroke-dashoffset:${(RING_MINI_C * (1 - score / 100)).toFixed(2)}"></circle>
      </svg>
      <span class="mo-ring-num">${score}</span>
    </div>` : "";

  const next = nextMovesHtml(planItem, arena).primary;

  // ⚔ Arena layer: badge in the header, the rating reveal, the story line,
  // the ghost race, and the gauntlet zone. Every piece is "" when absent.
  const entry = arena.entry || null;                 // rating history entry (rated AC only)
  const match = arena.match || null;                 // closed match state from the judge response
  const badge = "";                                  // NCKH §9: Arena đóng băng — badge ẩn
  const ghost = arena.ghost && arena.ghost.ok && arena.ghost.available && arena.ghost.faster
    ? `<div class="ar-ghost-line">Nhanh hơn chính em ở các bài cùng tầm: ×${arena.ghost.ratio} (so với ${arena.ghost.sampleCount} trận cũ).</div>`
    : "";

  return `<section class="mo-card" data-kind="ac">
    <header class="mo-head">
      <span class="mo-glyph">✓</span>
      <span class="mo-kicker">Khoảnh khắc</span>
      <span class="vbadge v-AC">AC</span>
      ${badge}
      <span class="mo-meta">${line}</span>
    </header>
    <div class="mo-ac">
      ${ring}
      <div class="mo-ac-copy">
        ${hasGame ? `<div class="doc-tier" style="--tier-rgb:${tier.rgb}">${tierMeter(tier.level)} ${tier.label}</div>` : ""}
        <div class="mo-ac-line">✦ ${positive}</div>
      </div>
    </div>
    ${arenaRevealHtml(entry, arena.ratingState)}
    ${arenaMomentLine(entry, match)}
    ${ghost}
    <div class="ar-gauntlet" id="ar-gauntlet" data-state="idle"></div>
    <div class="ar-seal-line" id="ar-seal"></div>
    ${momentumLine(progress)}
    <div id="mo-ac-cta">${next}</div>
  </section>`;
}

// ---- the CE card -------------------------------------------------------------

function renderCeCard(app) {
  const r = app.state.lastJudge || {};
  const stderr = (r.compile && r.compile.stderr) || "";
  const firstLines = stderr.split("\n").slice(0, 3).join("\n");
  const explain = document.getElementById("btn-ai-explain-ce");
  const canExplain = explain && !explain.classList.contains("hidden");
  // CTA policy: CE primary là ĐI ĐÚNG DÒNG lỗi khi g++ cho biết dòng
  // (main.cpp:N:), AI-explain lùi làm secondary chip. Không parse được dòng
  // mới rơi về AI-explain / Coach.
  const errLine = ceErrorLine(app);
  const primary = errLine != null
    ? ctaHtml({ action: "jump", title: `Mở lỗi tại dòng ${errLine}`, why: "g++ chỉ đúng chỗ này — sửa rồi chạy lại", data: { line: errLine } })
    : (canExplain
      ? ctaHtml({ action: "ce-explain", title: "Giải thích lỗi biên dịch", why: "AI đọc thông báo g++ và chỉ chỗ sửa" })
      : ctaHtml({ action: "coach", title: "Hỏi Coach", why: "dán lỗi biên dịch vào chat", data: { ask: "" } }));
  return `<section class="mo-card" data-kind="ce">
    <header class="mo-head">
      <span class="mo-glyph">!</span>
      <span class="mo-kicker">Khoảnh khắc</span>
      <span class="vbadge v-CE">CE</span>
      <span class="mo-meta">code chưa biên dịch được</span>
    </header>
    ${firstLines ? `<pre class="mo-pre mo-ce-err">${escapeHtml(clip(firstLines, 400))}</pre>` : ""}
    ${primary}
  </section>`;
}

// ---- the session-end card (bus "timer:done") ---------------------------------

function renderSessionEndCard(app, totalSec) {
  const mins = Math.round((Number(totalSec) || 0) / 60);
  const hasProblem = Boolean(app.state.currentId);
  return `<section class="mo-card" data-kind="session-end">
    <header class="mo-head">
      <span class="mo-glyph">◷</span>
      <span class="mo-kicker">Khoảnh khắc</span>
      <span class="mo-meta">hết ${mins || "?"} phút tập trung — em tự chọn nước kết</span>
    </header>
    ${ctaHtml({ action: "timer-extend", title: "Tiếp tục +10 phút", why: "đang vào mạch thì đừng dừng", data: { minutes: 10 } })}
    <div class="rail-chips mo-actions">
      ${hasProblem ? `<button type="button" class="rail-chip" data-mo-action="review-game"><span class="rc-g">▤</span><span>Xem lại ván đấu</span></button>` : ""}
      <button type="button" class="rail-chip" data-mo-action="dismiss"><span class="rc-g">·</span><span>Nghỉ — chốt phiên ở đây</span></button>
    </div>
  </section>`;
}

// ---- init --------------------------------------------------------------------

export function initMoment(app) {
  const rail = document.getElementById("verdict-rail");
  if (!rail || !app.bus) return;

  app.jumpToLine = (n) => jumpToLine(app, n); // shared: Coach/code-review reuse

  let abort = null;
  // Escalation memory: consecutive judge fails without passing more tests.
  const failTrack = { pid: null, passed: null, streak: 0 };

  const hide = () => {
    if (abort) { abort.abort(); abort = null; }
    rail.classList.add("hidden");
    rail.removeAttribute("data-verdict");
    rail.innerHTML = "";
  };

  // ONE delegated handler for every primary CTA + late-arriving suspect-line
  // chips (they stream in AFTER render — direct binding would miss them).
  rail.addEventListener("click", (e) => {
    const ln = e.target.closest(".mo-line");
    if (ln) { jumpToLine(app, ln.dataset.line); return; }
    const btn = e.target.closest("[data-mo-action]");
    if (!btn) return;
    const pid = rail.dataset.pid || "";
    const guard = () => {
      if (pid && app.state.currentId !== pid) { app.toast("Bài đã đổi — chạy lại để lấy gợi ý mới.", "err"); return false; }
      return true;
    };
    switch (btn.dataset.moAction) {
      case "jump": if (guard()) jumpToLine(app, btn.dataset.line); break;
      case "coach": if (guard() && app.coachAsk) app.coachAsk(btn.dataset.ask || ""); break;
      case "open": if (btn.dataset.target) app.loadProblem(btn.dataset.target); break;
      case "mystery-open": {
        // Bài niêm phong: opening IS the reveal — one click, no take-backs (the
        // backend refuses reroll once opened; that's the point of a sealed problem).
        btn.disabled = true;
        const label = btn.querySelector("span:nth-child(2)");
        if (label) label.textContent = "Đang mở đề…";
        (app.arena && app.arena.mysteryOpen ? app.arena.mysteryOpen() : Promise.resolve(null)).then((r) => {
          if (r && r.ok && r.problem && r.problem.id) app.loadProblem(r.problem.id);
          else { app.toast("Chưa mở được bài niêm phong — thử lại từ trang chủ.", "err"); btn.disabled = false; }
        });
        break;
      }
      case "random": document.getElementById("btn-random")?.click(); break;
      case "quiz": if (app.openFlashQuiz) app.openFlashQuiz(); break;
      case "ce-explain": if (guard()) document.getElementById("btn-ai-explain-ce")?.click(); break;
      case "timer-extend": if (app.timerExtend) app.timerExtend(Number(btn.dataset.minutes) || 10); hide(); break;
      case "review-game": if (guard() && app.openGameReview) app.openGameReview(); break;
      case "rejudge": if (guard() && app.judgeAll) app.judgeAll(); break;
      case "gauntlet-audit-toggle": {
        const body = btn.parentElement && btn.parentElement.querySelector(".ar-g-audit-body");
        if (body) {
          const open = body.classList.toggle("hidden") === false;
          btn.setAttribute("aria-expanded", String(open));
          btn.textContent = open ? "Ca thử này sai luật? ▴" : "Ca thử này sai luật? ▾";
        }
        break;
      }
      case "gauntlet-reject": {
        if (!guard()) break;
        const zone = rail.querySelector("#ar-gauntlet");
        const fault = btn.dataset.fault === "reference" ? "reference" : "input";
        const testId = btn.dataset.testId || "";
        rail.querySelectorAll(".ar-g-reject").forEach((b) => { b.disabled = true; });
        (app.arena && app.arena.gauntletReject
          ? app.arena.gauntletReject(pid, { testId, fault })
          : Promise.resolve(null)).then((res) => {
          if (!res || !res.ok) { app.toast("Chưa loại được ca thử — thử lại.", "err"); rail.querySelectorAll(".ar-g-reject").forEach((b) => { b.disabled = false; }); return; }
          if (zone) {
            zone.dataset.state = "note";
            zone.removeAttribute("data-phase");
            zone.innerHTML = `<div class="ar-g-head"><span class="ar-g-glyph" aria-hidden="true">≠</span><span>Đã loại ca thử${fault === "reference" ? " (đáp án đối chứng sai)" : " (input phạm ràng buộc)"}. AC của em vẫn nguyên — lần kiểm định sau máy sẽ dựng đối chứng mới.</span></div>`;
          }
          // The "nợ WA / chấm lại" CTA no longer applies — the debt is gone.
          const cta = rail.querySelector("#mo-ac-cta");
          if (cta) cta.innerHTML = "";
          if (app.reloadTests) app.reloadTests().catch(() => {});
          showSealLine(rail, app, pid);
        });
        break;
      }
      case "more": {
        const ov = rail.querySelector("#mo-overflow");
        if (ov) {
          const open = ov.classList.toggle("hidden") === false;
          btn.setAttribute("aria-expanded", String(open));
        }
        break;
      }
      case "dismiss": hide(); break;
    }
  });

  function wireCommon(pid, payload) {
    wireChips(rail, app, payload, pid);
    const hintBtn = rail.querySelector("#mo-hint-btn");
    if (hintBtn) hintBtn.addEventListener("click", () => {
      hintBtn.classList.add("hidden");
      const hint = rail.querySelector("#mo-hint");
      if (hint) hint.classList.remove("hidden");
    });
  }

  async function render(payload) {
    const pid = app.state.currentId;
    if (!pid) { hide(); return; }
    if (abort) { abort.abort(); abort = null; }

    const v = String(payload.verdict || "").toUpperCase();
    if (!["AC", "WA", "RE", "TLE", "CE"].includes(v)) { hide(); return; }
    rail.dataset.verdict = v;
    rail.dataset.pid = pid;

    // Manual runs keep the light touch: chips only, no auto-AI (a run is a
    // scratchpad move, not a match move — README-AUTOPILOT.md).
    if (payload.kind !== "judge") {
      const chips = renderChips(app, payload);
      if (!chips) { hide(); return; }
      rail.innerHTML = `<div class="rail-title">Nước tiếp theo</div>${chips}`;
      rail.classList.remove("hidden");
      wireChips(rail, app, payload, pid);
      return;
    }

    if (v === "AC") {
      failTrack.pid = null; failTrack.passed = null; failTrack.streak = 0;
      // ⚔ The arena result rode in ON the judge response — the reveal is
      // instant, zero extra fetches (đắt chạy nền, rẻ hiện tức thì).
      const arenaRes = payload.arena || (app.state.lastJudge && app.state.lastJudge.arena) || null;
      const arenaCtx = {
        entry: arenaRes && arenaRes.rating ? arenaRes.rating : null,
        match: arenaRes ? arenaRes.match : null,
        ratingState: app.arena ? app.arena.rating() : null,
      };
      rail.innerHTML = renderAcCard(app, null, null, null, arenaCtx);
      rail.classList.remove("hidden");
      animateReveal(rail);
      // Enrich with the (local, free) game review + plan + progress + ghost +
      // the three options (Nợ WA / tự chọn / bài niêm phong).
      const [review, plan, progress, ghost, nextBet] = await Promise.allSettled([
        api.gameReview(pid), api.plannerSession(), api.progress(),
        app.arena ? app.arena.ghostFor(pid) : Promise.resolve(null),
        app.arena && app.arena.nextBet ? app.arena.nextBet() : Promise.resolve(null),
      ]);
      if (app.state.currentId !== pid) return;
      const rev = review.status === "fulfilled" ? review.value : null;
      const planItems = plan.status === "fulfilled" && plan.value.plan && Array.isArray(plan.value.plan.items) ? plan.value.plan.items : [];
      // First actionable pick that isn't the problem we just closed.
      const planItem = planItems.find((it) => it.kind === "quiz" || (it.id && it.id !== pid)) || null;
      const prog = progress.status === "fulfilled" ? progress.value : null;
      arenaCtx.ghost = ghost.status === "fulfilled" ? ghost.value : null;
      const nb = nextBet.status === "fulfilled" && nextBet.value && nextBet.value.ok ? nextBet.value : null;
      // The problem just solved may still ride in stale doors — drop it.
      arenaCtx.nextBet = nb ? {
        ...nb,
        revenge: (nb.revenge || []).filter((c) => c.id !== pid),
        selfSelect: (nb.selfSelect || []).filter((c) => c.id !== pid),
      } : null;
      // Stakes for the picked next problem — the bet line on the CTA (S4).
      if (planItem && planItem.id && app.arena) {
        arenaCtx.stakes = await app.arena.stakesFor(planItem.id);
        if (app.state.currentId !== pid) return;
      }
      const doorsHtml = nextMovesHtml(planItem, arenaCtx).doorsHtml;
      rail.innerHTML = renderAcCard(app, rev, planItem, prog, arenaCtx) + renderChips(app, payload, doorsHtml);
      animateReveal(rail);
      wireCommon(pid, payload);
      showSealLine(rail, app, pid); // the Ấn this AC earned (Thô at minimum)
      // The Gauntlet only fights REAL closed matches, never scratch re-runs.
      if (arenaRes && arenaRes.event === "closed-ac") runGauntletZone(rail, app, pid);
      return;
    }

    if (v === "CE") {
      rail.innerHTML = renderCeCard(app) + renderChips(app, payload);
      rail.classList.remove("hidden");
      wireCommon(pid, payload);
      return;
    }

    // WA / RE / TLE — the automatic forensics + escalation tracking.
    const fail = pickFailing((app.state.lastJudge || {}).results);
    const sum = (app.state.lastJudge || {}).summary || {};
    if (failTrack.pid !== pid) { failTrack.pid = pid; failTrack.passed = null; failTrack.streak = 0; }
    failTrack.streak = failTrack.passed != null && sum.passed != null && sum.passed <= failTrack.passed
      ? failTrack.streak + 1
      : 1;
    failTrack.passed = sum.passed != null ? sum.passed : failTrack.passed;

    if (!fail) { // no per-test details (shouldn't happen on judge) — chips only
      rail.innerHTML = `<div class="rail-title">Nước tiếp theo</div>${renderChips(app, payload)}`;
      rail.classList.remove("hidden");
      wireChips(rail, app, payload, pid);
      return;
    }

    rail.innerHTML = renderFailCard(app, { ...payload, verdict: v }, fail) + renderChips(app, payload);
    rail.classList.remove("hidden");
    wireCommon(pid, payload);
    offerArbitration(rail, app, pid, fail); // S12 — only appears for AI-born tests

    const streak = failTrack.streak;
    if (streak >= 2) renderFailCta(rail, app, v, { streak, diagnosis: null }); // escalate immediately

    const cached = recallDiagnosis(pid, fail, app);
    if (cached) {
      applyDiagnosisText(rail, "", cached);
      if (cached.ok) showBugCard(rail, app, pid, cached.tag); // S5 — loot line
      if (streak < 2) renderFailCta(rail, app, v, { streak, diagnosis: cached });
      return;
    }
    if (app.state.settings && app.state.settings.momentAuto === false) {
      const status = rail.querySelector("#mo-status");
      if (status) {
        status.classList.remove("mo-wait");
        status.textContent = "Tự động chẩn đoán đang tắt (Settings → Editor).";
      }
      if (streak < 2) renderFailCta(rail, app, v, { streak, diagnosis: { ok: false } });
      return;
    }
    abort = new AbortController();
    streamDiagnosis(rail, app, pid, { ...payload, verdict: v }, fail, abort.signal, (diagnosis) => {
      if (app.state.currentId !== pid) return;
      if (diagnosis && diagnosis.ok) showBugCard(rail, app, pid, diagnosis.tag); // S5 — WA drops loot
      if (failTrack.streak < 2) renderFailCta(rail, app, v, { streak: failTrack.streak, diagnosis: diagnosis || { ok: false } });
    });
  }

  app.bus.on("verdict", render);
  app.bus.on("problem:opened", hide);

  // Session end (timer.js emits) — only take the stage if no verdict card owns it.
  app.bus.on("timer:done", async ({ totalSec } = {}) => {
    if (!rail.classList.contains("hidden") && rail.querySelector('.mo-card:not([data-kind="session-end"])')) return;
    rail.removeAttribute("data-verdict");
    rail.dataset.pid = app.state.currentId || "";
    rail.innerHTML = renderSessionEndCard(app, totalSec);
    rail.classList.remove("hidden");
    // ⚔ S10 — the day's reel, peak-end style: best match, rating arc, new loot.
    // Best-effort; the card is already complete without it.
    if (!app.arena) return;
    const reel = await app.arena.reel();
    const card = rail.querySelector('.mo-card[data-kind="session-end"]');
    if (!card || !reel || !reel.ok || !reel.hasMatches) return;
    const lines = [];
    lines.push(`<div><span class="ar-reel-g" aria-hidden="true">≠</span><b>${reel.matchCount}</b> trận rated hôm nay` +
      (reel.ratingStart != null && reel.ratingEnd != null ? ` · Elo <b>${reel.ratingStart} → ${reel.ratingEnd}</b>` : "") + `</div>`);
    if (reel.bestMatch && reel.bestMatch.ratingDelta) {
      const bm = reel.bestMatch.ratingDelta;
      const p = (app.state.problems || []).find((x) => x.id === bm.problemId);
      lines.push(`<div><span class="ar-reel-g">✦</span>Trận hay nhất: <b>${escapeHtml((p && p.title) || bm.problemId)}</b> (${bm.delta >= 0 ? "+" : ""}${bm.delta})</div>`);
    }
    if (reel.newCardsCount > 0) {
      lines.push(`<div><span class="ar-reel-g">❏</span><b>${reel.newCardsCount}</b> lỗi mới ghi vào Hồ sơ lỗi lặp</div>`);
    }
    const reelEl = document.createElement("div");
    reelEl.className = "ar-reel";
    reelEl.innerHTML = lines.join("");
    const cta = card.querySelector(".mo-next");
    if (cta) card.insertBefore(reelEl, cta); else card.appendChild(reelEl);
  });
}
