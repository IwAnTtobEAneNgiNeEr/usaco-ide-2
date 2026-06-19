// settings.js — Settings tab: compiler/judge config, code template, AI config
// (key/baseUrl/model), compiler probe, AI connection test, and the old-tracker importer.

import { api } from "./api.js?v=2.2";
import { escapeHtml } from "./md.js?v=2.2";

function opt(value, label, selected) {
  return `<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;
}

export function renderSettings(app) {
  const s = app.state.settings;
  const ai = app.state.aiSettings || { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", fallbackModels: "", hasKey: false };
  const tpl = app.state.codeTemplate || { template: "", custom: false };

  app.el.settingsForm.innerHTML = `
    <div class="settings-card">
      <div class="settings-section-title">Compiler</div>
      <div class="settings-group">
        <label>g++ path / command</label>
        <input id="set-compiler" class="input" value="${s.compilerPath || "g++"}" />
        <span class="hint">Leave as <code>g++</code> if it is on PATH. On Windows, install MinGW-w64.</span>
      </div>
      <div class="form-row">
        <div class="settings-group">
          <label>C++ standard</label>
          <select id="set-std" class="select">
            ${["c++11", "c++14", "c++17", "c++20", "c++23"].map((v) => opt(v, v, s.cppStandard === v)).join("")}
          </select>
        </div>
        <div class="settings-group">
          <label>Optimization</label>
          <select id="set-opt" class="select">
            ${["-O0", "-O1", "-O2", "-O3"].map((v) => opt(v, v, s.optimization === v)).join("")}
          </select>
        </div>
      </div>
      <div class="settings-group">
        <div>
          <button id="btn-check-compiler" class="btn btn-ghost btn-sm">Check compiler</button>
          <span id="compiler-status" class="hint" style="margin-left:8px"></span>
        </div>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Judge</div>
      <div class="form-row">
        <div class="settings-group">
          <label>Time limit (ms)</label>
          <input id="set-time" class="input" type="number" min="100" max="10000" step="100" value="${s.timeMs}" />
        </div>
        <div class="settings-group">
          <label>Compare mode</label>
          <select id="set-compare" class="select">
            ${opt("loose", "Loose (ignore trailing ws / newline)", s.compareMode === "loose" || !["strict", "token", "float"].includes(s.compareMode))}
            ${opt("strict", "Strict (exact)", s.compareMode === "strict")}
            ${opt("token", "Token (ignore all whitespace)", s.compareMode === "token")}
            ${opt("float", "Float (numeric ε tolerance)", s.compareMode === "float")}
          </select>
        </div>
      </div>
      <div class="settings-group" id="epsilon-group" ${s.compareMode === "float" ? "" : "hidden"}>
        <label>Float epsilon (ε)</label>
        <input id="set-epsilon" class="input" type="text" value="${s.epsilon != null ? s.epsilon : 1e-6}" style="max-width:140px" />
        <span class="hint">Absolute <i>or</i> relative tolerance for numeric tokens (e.g. <code>1e-6</code>).</span>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Editor</div>
      <div class="check-row"><input id="set-autosave" type="checkbox" ${s.autosave ? "checked" : ""} /><label for="set-autosave">Autosave code while typing</label></div>
      <div class="form-row">
        <div class="settings-group">
          <label>Tab size</label>
          <input id="set-tab" class="input" type="number" min="2" max="8" value="${s.tabSize}" style="max-width:90px" />
        </div>
        <div class="settings-group">
          <label>Theme</label>
          <select id="set-theme" class="select">
            ${opt("dark", "Dark Mode", s.theme === "dark" || !s.theme)}
            ${opt("light", "Light Mode", s.theme === "light")}
          </select>
        </div>
      </div>
      <div class="settings-group">
        <label>Accent Color</label>
        <select id="set-accent-color" class="select">
          ${opt("amber", "Gold (Amber) · default", s.accentColor === "amber" || !s.accentColor)}
          ${opt("blue", "Azure (Blue)", s.accentColor === "blue")}
          ${opt("green", "Emerald (Green)", s.accentColor === "green")}
          ${opt("orange", "Tangerine (Orange)", s.accentColor === "orange")}
          ${opt("purple", "Amethyst (Purple)", s.accentColor === "purple")}
          ${opt("red", "Crimson (Red)", s.accentColor === "red")}
        </select>
      </div>
      <div class="settings-group" style="margin-top:6px">
        <button id="btn-save-settings" class="btn btn-primary">Save settings</button>
      </div>
    </div>

    <!-- Editor Appearance (fonts / syntax themes / custom colors / power options).
         Owned by features/editor-appearance.js; rendered into this host each time. -->
    <div id="editor-appearance-host"></div>

    <div class="settings-card">
      <div class="settings-section-title">Code template</div>
      <div class="settings-group">
        <label>Starter cho bài mới ${tpl.custom ? '<span style="color:var(--ac)">• custom</span>' : '<span style="color:var(--text-dim)">• built-in</span>'}</label>
        <textarea id="set-template" class="input template-editor" spellcheck="false">${escapeHtml(tpl.template || "")}</textarea>
        <span class="hint">Mỗi bài tạo mới bắt đầu từ template này (lưu ở <code>data/template.cpp</code>). Xóa trống rồi Save để quay về mẫu mặc định.</span>
        <div class="key-row" style="gap:8px; margin-top:6px">
          <button id="btn-save-template" class="btn btn-primary btn-sm" type="button">Save template</button>
          <button id="btn-reset-template" class="btn btn-ghost btn-sm" type="button">Reset to built-in</button>
          <span id="template-status" class="hint"></span>
        </div>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">AI test generation</div>
      <div class="settings-group">
        <span class="hint">OpenAI-compatible API. Dán API key rồi bấm <b>Detect</b> — app tự nhận provider, base URL và đề xuất model. Key lưu cục bộ ở <code>data/ai-settings.json</code>, không bao giờ ghi log.</span>
      </div>
      <div class="settings-group">
        <label>API key ${ai.hasKey ? '<span style="color:var(--ac)">• saved</span>' : '<span style="color:var(--wa)">• not set</span>'}</label>
        <div class="key-row">
          <input id="set-ai-key" class="input" type="password" autocomplete="off"
            placeholder="${ai.hasKey ? "•••••• (saved — leave blank to keep)" : "AIza… / sk-…"}" />
          <button id="btn-ai-key-toggle" class="btn btn-ghost btn-sm" type="button">Show</button>
          <button id="btn-ai-detect" class="btn btn-primary btn-sm" type="button">🔍 Detect</button>
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
        <label>Fallback models <span class="muted">(thử lần lượt khi gặp 429 / quá tải)</span></label>
        <input id="set-ai-fallback" class="input" value="${ai.fallbackModels || ""}" placeholder="gemini-2.5-flash-lite, gemini-2.0-flash" />
      </div>
      <div class="settings-group">
        <div class="key-row" style="gap:8px; margin-top:6px">
          <button id="btn-save-ai" class="btn btn-primary" type="button">Save AI settings</button>
          <button id="btn-test-ai" class="btn btn-ghost" type="button">Test connection</button>
        </div>
        <span id="ai-status" class="hint"></span>
      </div>
    </div>

    <div class="settings-card">
      <div class="settings-section-title">Import from old DSA Tracker</div>
      <div class="settings-group">
        <span class="hint">Import a JSON export from the old app. Reads <code>judgeData.problems / attempts / testCases</code> and creates problems here.</span>
        <input id="import-file" type="file" accept="application/json,.json" class="input" style="padding:6px; margin-bottom:6px" />
        <div>
          <button id="btn-import" class="btn btn-ghost btn-sm">Import file</button>
          <span id="import-status" class="hint" style="margin-left:8px"></span>
        </div>
      </div>
    </div>`;

  wire(app);
  // Editor Appearance owns its own host inside the form; re-render it after every
  // settings re-render (renderSettings rebuilds the whole innerHTML).
  if (app.renderEditorAppearance) app.renderEditorAppearance();
}

function wire(app) {
  const $ = (id) => document.getElementById(id);

  // Show the epsilon field only for the "float" compare mode.
  $("set-compare").addEventListener("change", () => {
    $("epsilon-group").hidden = $("set-compare").value !== "float";
  });

  $("btn-check-compiler").addEventListener("click", async () => {
    const status = $("compiler-status");
    status.textContent = "Checking…";
    try {
      const { compiler } = await api.checkCompiler();
      status.textContent = compiler.available ? `OK — ${compiler.version}` : `Not found: ${compiler.compiler}`;
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
      tabSize: Number($("set-tab").value),
      theme: $("set-theme").value,
      accentColor: $("set-accent-color").value
    };
    try {
      const { settings } = await api.saveSettings(patch);
      app.state.settings = settings;
      if (app.applyTabSize) app.applyTabSize(settings.tabSize);
      else app.el.codeEditor.style.tabSize = String(settings.tabSize);
      if (app.applyTheme) app.applyTheme(settings.theme, settings.accentColor);
      app.toast("Settings saved", "ok");
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
    if (field.type === "password") { field.type = "text"; btn.textContent = "Hide"; }
    else { field.type = "password"; btn.textContent = "Show"; }
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
        ` · bấm <b>Save AI settings</b> để lưu.`;
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
      app.toast("AI settings saved", "ok");
    } catch (err) { app.toast(err.message, "err"); }
  });

  $("btn-test-ai").addEventListener("click", async () => {
    const status = $("ai-status");
    status.textContent = "Testing…";
    status.style.color = "var(--text-dim)";
    try {
      const res = await api.aiTestConnection();
      status.textContent = `OK — model ${res.model} responded.`;
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
    if (!file) { status.textContent = "Choose a JSON file first."; status.style.color = "var(--wa)"; return; }
    status.textContent = "Importing…";
    status.style.color = "var(--text-dim)";
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await api.import(payload);
      status.textContent = res.message + (res.errors && res.errors.length ? ` (${res.errors.length} skipped)` : "");
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
}
