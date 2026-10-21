// settings.js — Settings tab: compiler/judge config, code template, AI config
// (key/baseUrl/model), compiler probe, AI connection test, and the old-tracker importer.

import { api } from "./api.js?v=2.2";
import { escapeHtml } from "./md.js?v=2.2";

const APP_FONT_KEY = "usaco-app-font";
const APP_FONTS = {
  geist: {
    label: "Geist",
    note: "Gọn, trung tính",
    stack: '"Geist", -apple-system, "Segoe UI", system-ui, sans-serif'
  },
  manrope: {
    label: "Manrope",
    note: "Mềm và hiện đại",
    stack: '"Manrope", "Geist", system-ui, sans-serif'
  },
  space: {
    label: "Space Grotesk",
    note: "Cá tính kỹ thuật",
    stack: '"Space Grotesk", "Geist", system-ui, sans-serif'
  },
  vietnam: {
    label: "Be Vietnam Pro",
    note: "Tối ưu tiếng Việt",
    stack: '"Be Vietnam Pro", "Geist", system-ui, sans-serif'
  }
};

function getAppFont() {
  try {
    const saved = localStorage.getItem(APP_FONT_KEY);
    return APP_FONTS[saved] ? saved : "geist";
  } catch {
    return "geist";
  }
}

function applyAppFont(fontKey) {
  const key = APP_FONTS[fontKey] ? fontKey : "geist";
  const root = document.documentElement;
  root.dataset.appFont = key;
  root.style.setProperty("--sans", APP_FONTS[key].stack);
  root.style.setProperty("--display", APP_FONTS[key].stack);
  try { localStorage.setItem(APP_FONT_KEY, key); } catch { /* storage may be disabled */ }
}

applyAppFont(getAppFont());

function opt(value, label, selected) {
  return `<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;
}

function localizeSettingsToEnglish(host) {
  const copy = new Map([
    ["Trình biên dịch", "Compiler"], ["Đường dẫn / lệnh g++", "Compiler path / command"],
    ["Giữ g++ nếu lệnh đã có trong PATH. Trên Windows, cài MinGW-w64.", "Keep g++ when it is on PATH. On Windows, install MinGW-w64."],
    ["Chuẩn C++", "C++ standard"], ["Tối ưu hóa", "Optimization"], ["Kiểm tra trình biên dịch", "Check compiler"],
    ["Chấm bài", "Judge"], ["Giới hạn thời gian (ms)", "Time limit (ms)"], ["Chế độ so sánh", "Comparison mode"],
    ["Thoáng (bỏ khoảng trắng cuối / dòng cuối)", "Loose (ignore trailing spaces / final newline)"], ["Chính xác tuyệt đối", "Exact"],
    ["Theo token (bỏ mọi khoảng trắng)", "Tokens (ignore all whitespace)"], ["Số thực (sai số ε)", "Floating point (ε tolerance)"],
    ["Sai số tuyệt đối hoặc tương đối cho token số, ví dụ", "Absolute or relative tolerance for numeric tokens, for example"],
    ["Trình soạn thảo", "Editor"], ["Tự động lưu code khi gõ", "Autosave code while typing"], ["Bật hiệu ứng hạt nền", "Enable background particles"],
    ["Bật minh họa trực quan đề bài", "Enable statement visualizer"], ["Khoảnh Khắc: Coach tự chẩn đoán khi WA/RE/TLE (không cần bấm)", "Moment: Coach automatically diagnoses WA/RE/TLE"],
    ["Kích thước Tab", "Tab size"], ["Giao diện", "Interface"], ["Màu nhấn", "Accent color"], ["Phông chữ giao diện", "Interface font"],
    ["Đề bài nổi bật", "Focused problem statement"], ["Đọc rõ hơn · tập trung lâu hơn · giải bài tốt hơn", "Read clearly · focus longer · solve better"],
    ["Lưu cài đặt", "Save settings"], ["Mẫu code", "Code template"], ["Tạo test bằng AI", "AI test generation"], ["Nhập từ DSA Tracker cũ", "Import from legacy DSA Tracker"]
  ]);
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const key = node.nodeValue.trim();
    if (copy.has(key)) node.nodeValue = node.nodeValue.replace(key, copy.get(key));
  }
}

export function renderSettings(app) {
  const s = app.state.settings;
  const en = app.state.uiLanguage === "en";
  const label = (english, vietnamese) => en ? english : vietnamese;
  const appFont = getAppFont();
  const ai = app.state.aiSettings || { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", fallbackModels: "", hasKey: false };
  const tpl = app.state.codeTemplate || { template: "", custom: false };

  app.el.settingsForm.innerHTML = `
    <div class="settings-card">
      <div class="settings-section-title">${label("Language & region", "Ngôn ngữ & khu vực")}</div>
      <div class="settings-group">
        <label for="set-ui-language">${label("Display language", "Ngôn ngữ hiển thị")}</label>
        <select id="set-ui-language" class="select">
          ${opt("vi", "Tiếng Việt", app.state.uiLanguage !== "en")}
          ${opt("en", "English", app.state.uiLanguage === "en")}
        </select>
        <span class="hint">${label("Changes the interface immediately. Problem statements follow this setting unless you select", "Thay đổi giao diện ngay lập tức. Đề bài sẽ theo ngôn ngữ này trừ khi chọn")} <b>${label("Keep original statement", "Giữ nguyên đề gốc")}</b> ${label("in the statement toolbar.", "trên thanh công cụ đề bài.")}</span>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Trình biên dịch</div>
      <div class="settings-group">
        <label>Đường dẫn / lệnh g++</label>
        <input id="set-compiler" class="input" value="${s.compilerPath || "g++"}" />
        <span class="hint">Giữ <code>g++</code> nếu lệnh đã có trong PATH. Trên Windows, cài MinGW-w64.</span>
      </div>
      <div class="form-row">
        <div class="settings-group">
          <label>Chuẩn C++</label>
          <select id="set-std" class="select">
            ${["c++11", "c++14", "c++17", "c++20", "c++23"].map((v) => opt(v, v, s.cppStandard === v)).join("")}
          </select>
        </div>
        <div class="settings-group">
          <label>Tối ưu hóa</label>
          <select id="set-opt" class="select">
            ${["-O0", "-O1", "-O2", "-O3"].map((v) => opt(v, v, s.optimization === v)).join("")}
          </select>
        </div>
      </div>
      <div class="settings-group">
        <div>
          <button id="btn-check-compiler" class="btn btn-ghost btn-sm">Kiểm tra trình biên dịch</button>
          <span id="compiler-status" class="hint" style="margin-left:8px"></span>
        </div>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Chấm bài</div>
      <div class="form-row">
        <div class="settings-group">
          <label>Giới hạn thời gian (ms)</label>
          <input id="set-time" class="input" type="number" min="100" max="10000" step="100" value="${s.timeMs}" />
        </div>
        <div class="settings-group">
          <label>Chế độ so sánh</label>
          <select id="set-compare" class="select">
            ${opt("loose", "Thoáng (bỏ khoảng trắng cuối / dòng cuối)", s.compareMode === "loose" || !["strict", "token", "float"].includes(s.compareMode))}
            ${opt("strict", "Chính xác tuyệt đối", s.compareMode === "strict")}
            ${opt("token", "Theo token (bỏ mọi khoảng trắng)", s.compareMode === "token")}
            ${opt("float", "Số thực (sai số ε)", s.compareMode === "float")}
          </select>
        </div>
      </div>
      <div class="settings-group" id="epsilon-group" ${s.compareMode === "float" ? "" : "hidden"}>
        <label>Float epsilon (ε)</label>
        <input id="set-epsilon" class="input" type="text" value="${s.epsilon != null ? s.epsilon : 1e-6}" style="max-width:140px" />
        <span class="hint">Sai số tuyệt đối hoặc tương đối cho token số, ví dụ <code>1e-6</code>.</span>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Trình soạn thảo</div>
      <div class="check-row"><input id="set-autosave" type="checkbox" ${s.autosave ? "checked" : ""} /><label for="set-autosave">Tự động lưu code khi gõ</label></div>
      <div class="check-row" style="margin-top:6px"><input id="set-particles" type="checkbox" ${s.enableParticles ? "checked" : ""} /><label for="set-particles">Bật hiệu ứng hạt nền</label></div>
      <div class="check-row" style="margin-top:6px"><input id="set-visualizer" type="checkbox" ${s.enableVisualizer !== false ? "checked" : ""} /><label for="set-visualizer">Bật minh họa trực quan đề bài</label></div>
      <div class="check-row" style="margin-top:6px"><input id="set-moment-auto" type="checkbox" ${s.momentAuto !== false ? "checked" : ""} /><label for="set-moment-auto">Khoảnh Khắc: Coach tự chẩn đoán khi WA/RE/TLE (không cần bấm)</label></div>
      <div class="form-row">
        <div class="settings-group">
          <label>Kích thước Tab</label>
          <input id="set-tab" class="input" type="number" min="2" max="8" value="${s.tabSize}" style="max-width:90px" />
        </div>
          <label>Giao diện</label>
          <select id="set-theme" class="select" disabled>
            <option value="dark" selected>USACO Cockpit Dark</option>
          </select>
      </div>
      <div class="settings-group">
        <label>Màu nhấn</label>
        <select id="set-accent-color" class="select">
          ${opt("amber", "Vàng hổ phách · mặc định", s.accentColor === "amber" || !s.accentColor)}
          ${opt("blue", "Xanh lam", s.accentColor === "blue")}
          ${opt("green", "Xanh lục", s.accentColor === "green")}
          ${opt("orange", "Cam", s.accentColor === "orange")}
          ${opt("purple", "Tím", s.accentColor === "purple")}
          ${opt("red", "Đỏ", s.accentColor === "red")}
        </select>
      </div>
      <div class="settings-group app-font-setting">
        <label for="set-app-font">Phông chữ giao diện</label>
        <select id="set-app-font" class="select">
          ${Object.entries(APP_FONTS).map(([key, font]) => opt(key, `${font.label} — ${font.note}`, appFont === key)).join("")}
        </select>
        <div class="app-font-preview" aria-hidden="true">
          <strong>Đề bài nổi bật</strong>
          <span>Đọc rõ hơn · tập trung lâu hơn · giải bài tốt hơn</span>
        </div>
      </div>
      <div class="settings-group" style="margin-top:6px">
        <button id="btn-save-settings" class="btn btn-primary">Lưu cài đặt</button>
      </div>
    </div>

    <!-- Editor Appearance (fonts / syntax themes / custom colors / power options).
         Owned by features/editor-appearance.js; rendered into this host each time. -->
    <div id="editor-appearance-host"></div>

    <div class="settings-card">
      <div class="settings-section-title">Mẫu code</div>
      <div class="settings-group">
        <label>Code khởi đầu cho bài mới ${tpl.custom ? '<span style="color:var(--ac)">• tùy chỉnh</span>' : '<span style="color:var(--text-dim)">• mặc định</span>'}</label>
        <textarea id="set-template" class="input template-editor" spellcheck="false">${escapeHtml(tpl.template || "")}</textarea>
        <span class="hint">Mỗi bài mới bắt đầu từ mẫu này, lưu ở <code>data/template.cpp</code>. Xóa trống rồi lưu để dùng lại mẫu mặc định.</span>
        <div class="key-row" style="gap:8px; margin-top:6px">
          <button id="btn-save-template" class="btn btn-primary btn-sm" type="button">Lưu mẫu</button>
          <button id="btn-reset-template" class="btn btn-ghost btn-sm" type="button">Khôi phục mặc định</button>
          <span id="template-status" class="hint"></span>
        </div>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Tạo test bằng AI</div>
      <div class="settings-group">
        <span class="hint">OpenAI-compatible API. Dán API key rồi bấm <b>Detect</b> — app tự nhận provider, base URL và đề xuất model. Key lưu cục bộ ở <code>data/ai-settings.json</code>, không bao giờ ghi log.</span>
      </div>
      <div class="settings-group">
        <label>API key ${ai.hasKey ? '<span style="color:var(--ac)">• đã lưu</span>' : '<span style="color:var(--wa)">• chưa đặt</span>'}</label>
        <div class="key-row">
          <input id="set-ai-key" class="input" type="password" autocomplete="off"
            placeholder="${ai.hasKey ? "•••••• (đã lưu — để trống để giữ nguyên)" : "AIza… / sk-…"}" />
          <button id="btn-ai-key-toggle" class="btn btn-ghost btn-sm" type="button" aria-label="Hiện API key">Hiện</button>
          <button id="btn-ai-detect" class="btn btn-primary btn-sm" type="button">Nhận diện</button>
        </div>
        <span id="ai-detect-status" class="hint"></span>
      </div>
      <div class="form-row">
        <div class="settings-group">
          <label>Base URL</label>
          <input id="set-ai-base" class="input" value="${ai.baseUrl || ""}" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="settings-group">
          <label>Model</label>
          <input id="set-ai-model" class="input" value="${ai.model || ""}" placeholder="gpt-4.1-mini" list="ai-model-suggest" />
          <datalist id="ai-model-suggest"></datalist>
        </div>
      </div>
      <div class="settings-group">
        <label>Model dự phòng <span class="muted">(thử lần lượt khi gặp 429 / quá tải)</span></label>
        <input id="set-ai-fallback" class="input" value="${ai.fallbackModels || ""}" placeholder="gemini-2.5-flash-lite, gemini-2.0-flash" />
      </div>
      <div class="settings-group">
        <div class="key-row" style="gap:8px; margin-top:6px">
          <button id="btn-save-ai" class="btn btn-primary" type="button">Lưu cài đặt AI</button>
          <button id="btn-test-ai" class="btn btn-ghost" type="button">Kiểm tra kết nối</button>
        </div>
        <span id="ai-status" class="hint"></span>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Nhập từ DSA Tracker cũ</div>
      <div class="settings-group">
        <span class="hint">Chọn bản xuất JSON từ ứng dụng cũ. App đọc <code>judgeData.problems / attempts / testCases</code> và tạo bài tại đây.</span>
        <input id="import-file" type="file" accept="application/json,.json" class="input" style="padding:6px; margin-bottom:6px" />
        <div>
          <button id="btn-import" class="btn btn-ghost btn-sm">Nhập tệp</button>
          <span id="import-status" class="hint" style="margin-left:8px"></span>
        </div>
      </div>
    </div>`;

  wire(app);
  // Editor Appearance owns its own host inside the form; re-render it after every
  // settings re-render (renderSettings rebuilds the whole innerHTML).
  if (app.renderEditorAppearance) app.renderEditorAppearance();
  if (en) localizeSettingsToEnglish(app.el.settingsForm);
}

function wire(app) {
  const $ = (id) => document.getElementById(id);

  $("set-ui-language").addEventListener("change", (event) => app.setUiLanguage(event.target.value));

  // Show the epsilon field only for the "float" compare mode.
  $("set-compare").addEventListener("change", () => {
    $("epsilon-group").hidden = $("set-compare").value !== "float";
  });

  // Apply immediately so the preview and the whole app respond while browsing.
  $("set-app-font").addEventListener("change", (event) => {
    applyAppFont(event.target.value);
  });

  $("btn-check-compiler").addEventListener("click", async () => {
    const status = $("compiler-status");
    status.textContent = "Đang kiểm tra…";
    try {
      const { compiler } = await api.checkCompiler();
      status.textContent = compiler.available ? `OK — ${compiler.version}` : `Không tìm thấy: ${compiler.compiler}`;
      status.style.color = compiler.available ? "var(--ac)" : "var(--re)";
      app.setCompilerPill(compiler);
    } catch (err) { status.textContent = err.message; status.style.color = "var(--re)"; }
  });

  $("btn-save-settings").addEventListener("click", async () => {
    const patch = {
      compilerPath: $("set-compiler").value.trim() || "g++",
      cppStandard: $("set-std").value,
      optimization: $("set-opt").value,
      timeMs: Number($("set-time").value),
      compareMode: $("set-compare").value,
      epsilon: Number($("set-epsilon").value),
      autosave: $("set-autosave").checked,
      enableParticles: $("set-particles").checked,
      enableVisualizer: $("set-visualizer").checked,
      momentAuto: $("set-moment-auto").checked,
      tabSize: Number($("set-tab").value),
      theme: $("set-theme").value,
      accentColor: $("set-accent-color").value
    };
    applyAppFont($("set-app-font").value);
    try {
      const { settings } = await api.saveSettings(patch);
      app.state.settings = settings;
      await app.syncMeta?.();
      if (app.applyTabSize) app.applyTabSize(settings.tabSize);
      else app.el.codeEditor.style.tabSize = String(settings.tabSize);
      if (app.applyTheme) app.applyTheme(settings.theme, settings.accentColor);
      
      // Toggle background particles dynamically on setting change
      if (typeof app.toggleGlobalParticles === "function") {
        app.toggleGlobalParticles(settings.enableParticles);
      }

      // Toggle problem visualizer dynamically on setting change
      if (typeof app.toggleProblemVisualizer === "function") {
        app.toggleProblemVisualizer(settings.enableVisualizer);
      }
      
      app.toast("Đã lưu cài đặt", "ok");
    } catch (err) { app.toast(err.message, "err"); }
  });

  // ---- Code template ----
  const saveTemplate = async (value, doneMsg) => {
    const status = $("template-status");
    try {
      const tpl = await api.saveTemplate(value);
      app.state.codeTemplate = tpl;
      renderSettings(app); // refresh custom/built-in indicator + textarea
      app.toast(doneMsg, "ok");
    } catch (err) {
      status.textContent = err.message;
      status.style.color = "var(--re)";
    }
  };
  $("btn-save-template").addEventListener("click", () => saveTemplate($("set-template").value, "Đã lưu template"));
  $("btn-reset-template").addEventListener("click", () => saveTemplate("", "Đã quay về template mặc định"));

  // ---- AI ----
  $("btn-ai-key-toggle").addEventListener("click", () => {
    const field = $("set-ai-key");
    const btn = $("btn-ai-key-toggle");
    if (field.type === "password") {
      field.type = "text";
      btn.textContent = "Ẩn";
      btn.setAttribute("aria-label", "Ẩn API key");
    } else {
      field.type = "password";
      btn.textContent = "Hiện";
      btn.setAttribute("aria-label", "Hiện API key");
    }
  });

  // Detect provider + models from the pasted key, then auto-fill the fields.
  $("btn-ai-detect").addEventListener("click", async () => {
    const status = $("ai-detect-status");
    const key = $("set-ai-key").value.trim();
    if (!key) { status.textContent = "Dán API key vào ô trên trước."; status.style.color = "var(--wa)"; return; }
    status.textContent = "Đang nhận diện provider & model…";
    status.style.color = "var(--text-dim)";
    try {
      const info = await api.aiDetectKey(key);
      if (!info.provider) {
        status.textContent = "Không nhận diện được provider từ key này — hãy nhập Base URL & Model thủ công.";
        status.style.color = "var(--wa)";
        return;
      }
      if (info.baseUrl) $("set-ai-base").value = info.baseUrl;
      if (info.suggestedModel) $("set-ai-model").value = info.suggestedModel;
      if (info.suggestedFallbacks && !$("set-ai-fallback").value.trim()) $("set-ai-fallback").value = info.suggestedFallbacks;
      const dl = $("ai-model-suggest");
      if (dl) dl.innerHTML = (info.models || []).map((m) => `<option value="${m}"></option>`).join("");
      const count = (info.models || []).length;
      status.innerHTML = `Provider: <b>${info.label || info.provider}</b>` +
        (info.suggestedModel ? ` · đề xuất <b>${info.suggestedModel}</b>` : "") +
        (count ? ` · ${count} model khả dụng` : " · (không lấy được danh sách model — vẫn dùng đề xuất)") +
        ` · bấm <b>Lưu cài đặt AI</b> để lưu.`;
      status.style.color = "var(--ac)";
    } catch (err) {
      status.textContent = err.message;
      status.style.color = "var(--re)";
    }
  });

  $("btn-save-ai").addEventListener("click", async () => {
    const patch = {
      baseUrl: $("set-ai-base").value.trim(),
      model: $("set-ai-model").value.trim(),
      fallbackModels: $("set-ai-fallback").value.trim()
    };
    const key = $("set-ai-key").value;
    if (key.trim() !== "") patch.apiKey = key; // blank keeps the existing key
    try {
      const { ai } = await api.saveAiSettings(patch);
      app.state.aiSettings = ai;
      $("set-ai-key").value = "";
      renderSettings(app); // refresh "saved/not set" indicator
      app.toast("Đã lưu cài đặt AI", "ok");
    } catch (err) { app.toast(err.message, "err"); }
  });

  $("btn-test-ai").addEventListener("click", async () => {
    const status = $("ai-status");
    status.textContent = "Đang kiểm tra…";
    status.style.color = "var(--text-dim)";
    try {
      const res = await api.aiTestConnection();
      status.textContent = `OK — model ${res.model} đã phản hồi.`;
      status.style.color = "var(--ac)";
    } catch (err) {
      status.textContent = err.message;
      status.style.color = "var(--re)";
    }
  });

  // ---- Import ----
  $("btn-import").addEventListener("click", async () => {
    const file = $("import-file").files[0];
    const status = $("import-status");
    if (!file) { status.textContent = "Hãy chọn tệp JSON trước."; status.style.color = "var(--wa)"; return; }
    status.textContent = "Đang nhập…";
    status.style.color = "var(--text-dim)";
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await api.import(payload);
      status.textContent = res.message + (res.errors && res.errors.length ? ` (${res.errors.length} mục bị bỏ qua)` : "");
      status.style.color = "var(--ac)";
      app.toast(res.message, "ok");
      await app.refreshProblems();
      if (!app.state.currentId && app.state.problems[0]) app.selectProblem(app.state.problems[0].id);
    } catch (err) {
      status.textContent = err.message;
      status.style.color = "var(--re)";
      app.toast(err.message, "err");
    }
  });
}

export async function initSettings(app) {
  try {
    const { ai } = await api.getAiSettings();
    app.state.aiSettings = ai;
  } catch { /* defaults used */ }
  try {
    app.state.codeTemplate = await api.getTemplate();
  } catch { /* section shows empty; saving still works */ }
  renderSettings(app);
  document.addEventListener("localechange", () => renderSettings(app));
  // Settings loading tells us whether translation is configured. Resume the
  // shared dynamic-copy pass for either persisted locale after this point.
  app.refreshUiTranslations?.();
}
