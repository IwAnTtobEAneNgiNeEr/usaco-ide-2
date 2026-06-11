// timer.js — compact Pomodoro-style focus timer in the top bar. You choose how
// long to study (preset OR a custom minute count); when it finishes it just
// signals you're done. (The AI Coach is always available — no timer gate.)

export function initTimer(app) {
  const { el } = app;
  const customEl = document.getElementById("timer-custom");

  let savedTotal = 25 * 60;
  let savedPreset = "25";
  let savedCustom = "";
  try {
    const t = localStorage.getItem("usaco.timer.total");
    if (t) savedTotal = Number(t) || 25 * 60;
    const p = localStorage.getItem("usaco.timer.preset");
    if (p != null) savedPreset = p;
    const c = localStorage.getItem("usaco.timer.custom");
    if (c != null) savedCustom = c;
  } catch (e) {
    console.error("Failed to load timer settings from localStorage:", e);
  }

  const state = { total: savedTotal, remaining: savedTotal, running: false, intervalId: null, endAt: 0 };
  app._timer = state;

  if (el.timerPreset) el.timerPreset.value = savedPreset;
  if (customEl) customEl.value = savedCustom;

  function saveTimerSettings(total, preset, custom) {
    try {
      localStorage.setItem("usaco.timer.total", String(total));
      localStorage.setItem("usaco.timer.preset", String(preset));
      localStorage.setItem("usaco.timer.custom", String(custom));
    } catch (e) {
      console.error("Failed to save timer settings to localStorage:", e);
    }
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function render() {
    el.timerDisplay.textContent = fmt(Math.max(0, state.remaining));
    el.timerDisplay.classList.toggle("running", state.running);
    el.timerToggle.textContent = state.running ? "⏸" : "▶";
  }
  function tick() {
    state.remaining = Math.max(0, Math.round((state.endAt - Date.now()) / 1000));
    render();
    if (state.remaining <= 0) finish();
  }
  function start() {
    if (state.remaining <= 0) state.remaining = state.total;
    state.running = true;
    state.endAt = Date.now() + state.remaining * 1000;
    clearInterval(state.intervalId);
    state.intervalId = setInterval(tick, 250);
    el.timerDisplay.classList.remove("done");
    render();
  }
  function pause() {
    state.running = false;
    clearInterval(state.intervalId);
    render();
  }
  function reset() {
    pause();
    state.remaining = state.total;
    el.timerDisplay.classList.remove("done");
    render();
  }
  function finish() {
    pause();
    state.remaining = 0;
    el.timerDisplay.classList.add("done");
    render();
    if (app.playSound) app.playSound("timer");
    // Pure focus timer now — the Coach is always available, so just celebrate
    // without hijacking the panel the user is looking at.
    app.toast("Hết giờ tập trung 🎉", "ok");
  }

  // Apply a minute count from either the preset select or the custom input.
  function setMinutes(min, { fromCustom } = {}) {
    const m = Math.min(180, Math.max(1, Math.round(Number(min) || 0)));
    if (!m) return;
    state.total = m * 60;
    if (!fromCustom && customEl) {
      customEl.value = "";
      saveTimerSettings(state.total, min, "");
    } else if (fromCustom && el.timerPreset) {
      saveTimerSettings(state.total, "", min);
    }
    reset();
  }

  el.timerToggle.addEventListener("click", () => (state.running ? pause() : start()));
  el.timerReset.addEventListener("click", reset);
  el.timerPreset.addEventListener("change", () => setMinutes(el.timerPreset.value));
  if (customEl) {
    customEl.addEventListener("change", () => {
      if (customEl.value) setMinutes(customEl.value, { fromCustom: true });
    });
  }
  render();
}
