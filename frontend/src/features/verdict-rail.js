// verdict-rail.js v2 — the flow connector, restyled per
// README-LOOPS-UX-CRITIQUE.md §4.1: mono glyphs (no emoji), and the rail
// carries the verdict's color via [data-verdict] so the moment the student
// just lived (green AC, red WA) flows visually into the next-step chips.
//
// The moment a verdict lands, the tools that matter for THAT outcome line up
// as chips right under the RESULT bar:
//
//   AC        → ▤ Xem lại ván đấu · § Lời giải chuẩn · ↗ Bản khó hơn ·
//               ✎ Giải thích lời giải · » Bài tiếp theo
//   WA/RE/TLE → Δ Pháp y (test nhỏ nhất) · ❯ Coach · ◉ Soi test fail · ≈ Stress Lab
//   CE        → ! Giải thích lỗi · ❯ Coach
//
// Nothing here is a new capability — every chip drives an entry point another
// feature already owns (button click / app.* API), so each tool keeps its own
// gating and this file stays a thin router. Listens on the app bus; renders
// only for the problem the verdict belongs to.

function byId(id) {
  return document.getElementById(id);
}

// A tool button that exists but is gated hidden (e.g. ↗ before first AC)
// shouldn't get a chip — the chip would "work" but confuse the gate's logic.
function visible(el) {
  return !!el && !el.classList.contains("hidden");
}

// The input of the first failing test — the raw material for Pháp y and Viz.
export function failingInput(app, kind) {
  if (kind === "run") {
    const v = app.el.ioInput ? app.el.ioInput.value : "";
    return v.trim() ? v : null;
  }
  const r = app.state.lastJudge;
  if (!r || !Array.isArray(r.results)) return null;
  const fail = r.results.find((t) => ["WA", "RE", "TLE"].includes(t.status));
  if (!fail) return null;
  if (fail.testId === "main") { // scratch input judged as an implicit test
    const v = app.el.ioInput ? app.el.ioInput.value : "";
    return v.trim() ? v : null;
  }
  const test = (app.state.tests || []).find((t) => t.id === fail.testId);
  return test && typeof test.input === "string" && test.input.trim() ? test.input : null;
}

export function chipsFor(app, { kind, verdict }) {
  const chips = [];
  const v = String(verdict || "").toUpperCase();

  if (v === "AC" && kind === "judge") {
    chips.push({
      g: "▤", label: "Xem lại ván đấu", hint: "điểm quy trình + nước hay", primary: true,
      run: () => app.openGameReview && app.openGameReview(),
    });
    if (visible(byId("btn-editorial"))) chips.push({ g: "§", label: "Lời giải chuẩn", run: () => byId("btn-editorial").click() });
    if (visible(byId("btn-synth"))) chips.push({ g: "↗", label: "Bản khó hơn", run: () => byId("btn-synth").click() });
    if (visible(byId("btn-defense"))) chips.push({ g: "✎", label: "Giải thích lời giải", run: () => byId("btn-defense").click() });
    if (byId("btn-random")) chips.push({ g: "»", label: "Bài tiếp theo", run: () => byId("btn-random").click() });
    return chips;
  }

  if (["WA", "RE", "TLE"].includes(v)) {
    const failing = failingInput(app, kind);
    if (failing != null && app.openAutopsy) {
      chips.push({
        g: "Δ", label: "Pháp y", hint: "tìm test nhỏ nhất làm em sai", primary: true,
        run: () => app.openAutopsy(failing, v),
      });
    }
    chips.push({
      g: "❯", label: v === "WA" ? "Vì sao WA?" : v === "TLE" ? "Vì sao TLE?" : "Hỏi Coach",
      run: () => app.coachAsk && app.coachAsk(v === "WA" ? "why-wa" : v === "TLE" ? "why-tle" : ""),
    });
    if (failing != null && app.openVisualizer) {
      chips.push({ g: "◉", label: "Soi test fail", run: () => app.openVisualizer(failing, "Test đang fail") });
    }
    if (byId("btn-stress")) chips.push({ g: "≈", label: "Stress Lab", run: () => byId("btn-stress").click() });
    return chips;
  }

  if (v === "CE") {
    const explain = byId("btn-ai-explain-ce");
    if (visible(explain)) chips.push({ g: "!", label: "Giải thích lỗi", primary: true, run: () => explain.click() });
    chips.push({ g: "❯", label: "Hỏi Coach", run: () => app.coachAsk && app.coachAsk("") });
    return chips;
  }

  return chips; // OK / — / unknown: no rail
}

export function initVerdictRail(app) {
  const rail = byId("verdict-rail");
  if (!rail || !app.bus) return;

  const hide = () => {
    rail.classList.add("hidden");
    rail.removeAttribute("data-verdict");
    rail.innerHTML = "";
  };

  function render(payload) {
    const pid = app.state.currentId;
    const chips = chipsFor(app, payload);
    if (!pid || chips.length === 0) { hide(); return; }

    const v = String(payload.verdict || "").toUpperCase();
    if (["AC", "WA", "RE", "TLE", "CE"].includes(v)) rail.dataset.verdict = v;
    else rail.removeAttribute("data-verdict");

    rail.innerHTML = `
      <div class="rail-title">Nước tiếp theo</div>
      <div class="rail-chips">${chips.map((c, i) => `
        <button type="button" class="rail-chip${c.primary ? " rail-primary" : ""}" data-chip="${i}">
          <span class="rc-g">${c.g}</span><span>${c.label}</span>${c.hint ? `<span class="rc-hint">· ${c.hint}</span>` : ""}
        </button>`).join("")}
      </div>`;
    rail.classList.remove("hidden");

    rail.querySelectorAll(".rail-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (app.state.currentId !== pid) { app.toast("Bài đã đổi — chạy lại để lấy gợi ý mới.", "err"); hide(); return; }
        const chip = chips[Number(btn.dataset.chip)];
        if (chip) chip.run();
      });
    });
  }

  app.bus.on("verdict", render);
  app.bus.on("problem:opened", hide);
}
