// editor-appearance.js — Editor Appearance: fonts, syntax theme gallery, custom
// colors, import/export, and power-user toggles. Everything is driven through CSS
// custom properties on <html> (set inline so they beat the stylesheet :root), so
// every change is LIVE with no reload and no editor remount. CodeMirror's theme
// already reads these same vars (see editor-cm.js), and so does the textarea
// fallback (main.css). State persists in localStorage — front-end only, instant,
// offline, and zero risk to the judge / AI / test pipeline.

const LS_KEY = "usaco2.editorAppearance.v1";

// Font-family stacks. Only JetBrains Mono is vendored/offline; the rest fall back
// to the system copy when installed, else to ui-monospace, so picking one is safe.
const FONTS = {
  jetbrains: '"JetBrains Mono", ui-monospace, monospace',
  fira:      '"Fira Code", ui-monospace, monospace',
  cascadia:  '"Cascadia Code", "Cascadia Mono", ui-monospace, monospace',
  consolas:  'Consolas, "Liberation Mono", ui-monospace, monospace',
  source:    '"Source Code Pro", ui-monospace, monospace',
  ibm:       '"IBM Plex Mono", ui-monospace, monospace',
  victor:    '"Victor Mono", ui-monospace, monospace',
  inconsolata: '"Inconsolata", ui-monospace, monospace',
  anonymous:   '"Anonymous Pro", ui-monospace, monospace'
};
const FONT_LABELS = {
  jetbrains: "JetBrains Mono", fira: "Fira Code", cascadia: "Cascadia Code",
  consolas: "Consolas", source: "Source Code Pro", ibm: "IBM Plex Mono", victor: "Victor Mono",
  inconsolata: "Inconsolata", anonymous: "Anonymous Pro"
};

// Color keys → the CSS variable they drive. selection / lineHighlight are applied
// as tinted rgba (alpha below); everything else is applied as the raw hex.
const COLOR_VARS = {
  editorBg:      "--editor-bg",
  foreground:    "--code-fg",
  selection:     "--ed-selection",
  cursor:        "--ed-cursor",
  lineHighlight: "--ed-line-highlight",
  gutterBg:      "--ed-gutter-bg",
  gutterFg:      "--ed-gutter-fg",
  synKw:         "--syn-kw",
  synCtrl:       "--syn-ctrl",
  synType:       "--syn-type",
  synFn:         "--syn-fn",
  synNum:        "--syn-num",
  synStr:        "--syn-str",
  synCmt:        "--syn-cmt",
  synBracket0:   "--syn-bracket-0",
  synBracket1:   "--syn-bracket-1",
  synBracket2:   "--syn-bracket-2",
  synStdLib:     "--syn-std-lib"
};
const COLOR_LABELS = {
  editorBg: "Background", foreground: "Foreground", selection: "Selection",
  cursor: "Cursor", lineHighlight: "Line highlight", gutterBg: "Gutter bg",
  gutterFg: "Gutter text", synKw: "Keyword", synCtrl: "Control", synType: "Type",
  synFn: "Function", synNum: "Number", synStr: "String", synCmt: "Comment",
  synBracket0: "Bracket 1", synBracket1: "Bracket 2", synBracket2: "Bracket 3",
  synStdLib: "Std Library"
};

// 8 syntax themes — each a complete color set so switching is instant + total.
// Redesigned 7 themes (excluding USACO Dark) to have modern, harmonized backgrounds
// that blend beautifully with the application container, offering premium contrast and aesthetics.
const THEMES = {
  "usaco-dark": { name: "USACO Dark", colors: {
    editorBg: "#0b0f19", foreground: "#f3f4f6", selection: "#38bdf8", cursor: "#3b82f6",
    lineHighlight: "#ffffff", gutterBg: "#172033", gutterFg: "#4b5b72",
    synKw: "#c678dd", synCtrl: "#e06c75", synType: "#e5c07b", synFn: "#61afef",
    synNum: "#d19a66", synStr: "#98c379", synCmt: "#5c6370",
    synBracket0: "#ffd700", synBracket1: "#da70d6", synBracket2: "#179fff", synStdLib: "#56b6c2",
    appBg: "#0b0f19", panel: "#111827", panel2: "#151c2b", panel3: "#1a2336", border: "#2d3748",
    accent: "#3b82f6" } },
  "one-dark": { name: "One Dark", colors: {
    editorBg: "#1e222b", foreground: "#abb2bf", selection: "#3e4451", cursor: "#528bff",
    lineHighlight: "#99bbff", gutterBg: "#16181d", gutterFg: "#4b5263",
    synKw: "#c678dd", synCtrl: "#e06c75", synType: "#e5c07b", synFn: "#61afef",
    synNum: "#d19a66", synStr: "#98c379", synCmt: "#5c6370",
    synBracket0: "#ffd700", synBracket1: "#da70d6", synBracket2: "#179fff", synStdLib: "#56b6c2",
    appBg: "#1e222b", panel: "#21252b", panel2: "#282c34", panel3: "#2c313c", border: "#3e4452",
    accent: "#61afef" } },
  "dracula": { name: "Dracula", colors: {
    editorBg: "#18171f", foreground: "#f8f8f2", selection: "#bd93f9", cursor: "#ff79c6",
    lineHighlight: "#bd93f9", gutterBg: "#121118", gutterFg: "#6272a4",
    synKw: "#ff79c6", synCtrl: "#ff5555", synType: "#8be9fd", synFn: "#50fa7b",
    synNum: "#bd93f9", synStr: "#f1fa8c", synCmt: "#6272a4",
    synBracket0: "#ff79c6", synBracket1: "#bd93f9", synBracket2: "#8be9fd", synStdLib: "#8be9fd",
    appBg: "#18171f", panel: "#1e1f29", panel2: "#282a36", panel3: "#343746", border: "#44475a",
    accent: "#bd93f9" } },
  "monokai": { name: "Monokai", colors: {
    editorBg: "#191916", foreground: "#f8f8f2", selection: "#49483e", cursor: "#f8f8f0",
    lineHighlight: "#fdfff1", gutterBg: "#121210", gutterFg: "#75715e",
    synKw: "#f92672", synCtrl: "#f92672", synType: "#66d9ef", synFn: "#a6e22e",
    synNum: "#ae81ff", synStr: "#e6db74", synCmt: "#75715e",
    synBracket0: "#a6e22e", synBracket1: "#fd971f", synBracket2: "#66d9ef", synStdLib: "#66d9ef",
    appBg: "#191916", panel: "#22231e", panel2: "#272822", panel3: "#3e3d32", border: "#49483e",
    accent: "#a6e22e" } },
  "tokyo-night": { name: "Tokyo Night", colors: {
    editorBg: "#13141c", foreground: "#c0caf5", selection: "#7aa2f7", cursor: "#c0caf5",
    lineHighlight: "#7aa2f7", gutterBg: "#0d0e14", gutterFg: "#565f89",
    synKw: "#bb9af7", synCtrl: "#f7768e", synType: "#2ac3de", synFn: "#7aa2f7",
    synNum: "#ff9e64", synStr: "#9ece6a", synCmt: "#565f89",
    synBracket0: "#e0af68", synBracket1: "#bb9af7", synBracket2: "#2ac3de", synStdLib: "#2ac3de",
    appBg: "#13141c", panel: "#16161e", panel2: "#1a1b26", panel3: "#24283b", border: "#383e5a",
    accent: "#7aa2f7" } },
  "nord": { name: "Nord", colors: {
    editorBg: "#1b1e25", foreground: "#d8dee9", selection: "#88c0d0", cursor: "#d8dee9",
    lineHighlight: "#88c0d0", gutterBg: "#14171d", gutterFg: "#4c566a",
    synKw: "#81a1c1", synCtrl: "#bf616a", synType: "#8fbcbb", synFn: "#88c0d0",
    synNum: "#b48ead", synStr: "#a3be8c", synCmt: "#616e88",
    synBracket0: "#ebcb8b", synBracket1: "#b48ead", synBracket2: "#88c0d0", synStdLib: "#8fbcbb",
    appBg: "#1b1e25", panel: "#242933", panel2: "#2e3440", panel3: "#3b4252", border: "#434c5e",
    accent: "#88c0d0" } },
  "github-dark": { name: "GitHub Dark", colors: {
    editorBg: "#0b0d11", foreground: "#e6edf3", selection: "#388bfd", cursor: "#58a6ff",
    lineHighlight: "#58a6ff", gutterBg: "#06070a", gutterFg: "#484f58",
    synKw: "#ff7b72", synCtrl: "#ff7b72", synType: "#ffa657", synFn: "#d2a8ff",
    synNum: "#79c0ff", synStr: "#a5d6ff", synCmt: "#8b949e",
    synBracket0: "#ffa657", synBracket1: "#d2a8ff", synBracket2: "#58a6ff", synStdLib: "#79c0ff",
    appBg: "#0b0d11", panel: "#0d1117", panel2: "#161b22", panel3: "#21262d", border: "#30363d",
    accent: "#58a6ff" } },
  "solarized-dark": { name: "Solarized Dark", colors: {
    editorBg: "#051a21", foreground: "#93a1a1", selection: "#268bd2", cursor: "#93a1a1",
    lineHighlight: "#268bd2", gutterBg: "#031116", gutterFg: "#586e75",
    synKw: "#859900", synCtrl: "#cb4b16", synType: "#b58900", synFn: "#268bd2",
    synNum: "#d33682", synStr: "#2aa198", synCmt: "#586e75",
    synBracket0: "#b58900", synBracket1: "#d33682", synBracket2: "#268bd2", synStdLib: "#2aa198",
    appBg: "#051a21", panel: "#07252e", panel2: "#002b36", panel3: "#073642", border: "#586e75",
    accent: "#268bd2" } }
};

const DEFAULTS = {
  fontFamily: "jetbrains",
  fontSize: 13.5,
  lineHeight: 1.6,
  letterSpacing: 0,
  fontWeight: 400,
  theme: "usaco-dark",
  colors: { ...THEMES["usaco-dark"].colors },
  wordWrap: false,
  cursorStyle: "line",   // line | block | underline
  cursorBlink: true,
  smoothScroll: true
};

function hexToRgba(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || "").trim());
  if (!m) return hex; // already rgba / named — pass through
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function toHex(v) {
  if (/^#[\da-f]{6}$/i.test(String(v || ""))) return v;
  const m = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(v || ""));
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return { ...DEFAULTS, ...raw, colors: { ...DEFAULTS.colors, ...(raw.colors || {}) } };
  } catch { return { ...DEFAULTS, colors: { ...DEFAULTS.colors } }; }
}
function save(a) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch { /* private mode */ }
}

export function initEditorAppearance(app) {
  let a = load();

  function adjustColorBrightness(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    R = (R > 0) ? R : 0;
    G = (G > 0) ? G : 0;
    B = (B > 0) ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  }

  function hexToRgbString(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || "").trim());
    if (!m) return "59, 130, 246";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `${r}, ${g}, ${b}`;
  }

  function getContrastColor(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || "").trim());
    if (!m) return "#ffffff";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? "#111111" : "#ffffff";
  }

  // ---- Apply: write every setting to CSS vars + data-attrs + CM toggles. ----
  function apply() {
    const root = document.documentElement.style;
    const isLight = document.documentElement.classList.contains("light-theme");

    root.setProperty("--code-font", FONTS[a.fontFamily] || "var(--mono)");
    root.setProperty("--code-fs", `${a.fontSize}px`);
    root.setProperty("--code-lh", String(a.lineHeight));
    root.setProperty("--code-letter-spacing", `${a.letterSpacing}px`);
    root.setProperty("--code-weight", String(a.fontWeight));

    for (const [key, varName] of Object.entries(COLOR_VARS)) {
      const v = a.colors[key];
      if (!v) continue;

      if (isLight && (key === "editorBg" || key === "gutterBg" || key === "foreground" || key === "gutterFg")) {
        root.removeProperty(varName);
        continue;
      }

      if (key === "selection") root.setProperty(varName, hexToRgba(v, 0.32));
      else if (key === "lineHighlight") root.setProperty(varName, hexToRgba(v, 0.08));
      else root.setProperty(varName, v);
    }

    if (isLight) {
      root.removeProperty("--bg");
      root.removeProperty("--panel");
      root.removeProperty("--panel-2");
      root.removeProperty("--panel-3");
      root.removeProperty("--border");
      root.removeProperty("--accent");
      root.removeProperty("--accent-rgb");
      root.removeProperty("--on-accent");
      root.removeProperty("--btn-run");
      root.removeProperty("--btn-run-h");
    } else {
      const editorBg = toHex(a.colors.editorBg);
      const appBg = a.colors.appBg || adjustColorBrightness(editorBg, -25);
      const panel = a.colors.panel || adjustColorBrightness(editorBg, 8);
      const panel2 = a.colors.panel2 || adjustColorBrightness(editorBg, 18);
      const panel3 = a.colors.panel3 || adjustColorBrightness(editorBg, 28);
      const border = a.colors.border || adjustColorBrightness(editorBg, 38);

      root.setProperty("--bg", appBg);
      root.setProperty("--panel", panel);
      root.setProperty("--panel-2", panel2);
      root.setProperty("--panel-3", panel3);
      root.setProperty("--border", border);

      // Determine accent color
      const cursorColor = toHex(a.colors.cursor || "#3b82f6");
      const themeDef = THEMES[a.theme];
      const accentColor = a.colors.accent || (themeDef ? themeDef.colors.accent : null) || cursorColor;

      root.setProperty("--accent", accentColor);
      root.setProperty("--accent-rgb", hexToRgbString(accentColor));
      root.setProperty("--on-accent", getContrastColor(accentColor));

      // Hero action buttons (Run/Save) theme colors
      root.setProperty("--btn-run", accentColor);
      root.setProperty("--btn-run-h", adjustColorBrightness(accentColor, 15));
    }

    const html = document.documentElement;
    html.dataset.cursorStyle = a.cursorStyle;
    html.dataset.cursorBlink = a.cursorBlink ? "on" : "off";
    html.dataset.smoothScroll = a.smoothScroll ? "on" : "off";
    if (app.setWordWrap) app.setWordWrap(a.wordWrap);
    const ta = document.getElementById("code-editor");
    if (ta) ta.setAttribute("wrap", a.wordWrap ? "soft" : "off");
  }
  app.applyEditorAppearance = apply;
  apply(); // run on boot

  // ---- UI: rendered into the Settings panel via #editor-appearance-host ----
  function render() {
    const host = document.getElementById("editor-appearance-host");
    if (!host) return;
    const themeCards = Object.entries(THEMES).map(([id, t]) => {
      const c = t.colors;
      return `<button type="button" class="ea-theme ${a.theme === id ? "on" : ""}" data-theme="${id}"
        style="--p:${c.editorBg}">
        <span class="ea-theme-prev" style="background:${c.editorBg}">
          <i style="color:${c.synKw}">if</i><i style="color:${c.synFn}">solve</i><i style="color:${c.synStr}">"ac"</i><i style="color:${c.synNum}">42</i>
        </span>
        <span class="ea-theme-name">${t.name}</span>
      </button>`;
    }).join("");

    const colorPickers = Object.keys(COLOR_VARS).map((key) =>
      `<label class="ea-color"><input type="color" data-color="${key}" value="${toHex(a.colors[key])}" />
        <span>${COLOR_LABELS[key]}</span></label>`).join("");

    host.innerHTML = `
      <div class="settings-section-title" style="margin-top:16px;">Editor appearance</div>
      <div class="settings-card">
        <div class="ea-grid" style="display:grid; grid-template-columns:1.8fr 1fr; gap:10px;">
          <div class="settings-group">
            <label>Font family</label>
            <select id="ea-font" class="select">
              ${Object.keys(FONTS).map((k) => `<option value="${k}" ${a.fontFamily === k ? "selected" : ""}>${FONT_LABELS[k]}</option>`).join("")}
            </select>
          </div>
          <div class="settings-group">
            <label>Font weight</label>
            <select id="ea-weight" class="select">
              <option value="300" ${a.fontWeight == 300 ? "selected" : ""}>Light (300)</option>
              <option value="400" ${a.fontWeight == 400 ? "selected" : ""}>Normal (400)</option>
              <option value="500" ${a.fontWeight == 500 ? "selected" : ""}>Medium (500)</option>
              <option value="600" ${a.fontWeight == 600 ? "selected" : ""}>Semibold (600)</option>
              <option value="700" ${a.fontWeight == 700 ? "selected" : ""}>Bold (700)</option>
            </select>
          </div>
        </div>

        <div class="ea-slider"><label>Font size <b id="ea-size-v">${a.fontSize}px</b></label>
          <input id="ea-size" type="range" min="10" max="28" step="0.5" value="${a.fontSize}" /></div>
        <div class="ea-slider"><label>Line height <b id="ea-lh-v">${a.lineHeight}</b></label>
          <input id="ea-lh" type="range" min="1" max="2.5" step="0.05" value="${a.lineHeight}" /></div>
        <div class="ea-slider"><label>Letter spacing <b id="ea-ls-v">${a.letterSpacing}px</b></label>
          <input id="ea-ls" type="range" min="0" max="3" step="0.1" value="${a.letterSpacing}" /></div>
      </div>

      <div class="settings-section-title" style="margin-top:16px;">Syntax theme</div>
      <div class="settings-card">
        <div class="ea-themes">${themeCards}</div>
      </div>

      <div class="settings-section-title" style="margin-top:16px;">Custom colors</div>
      <div class="settings-card">
        <details class="ea-advanced" open style="border:none !important; background:transparent !important; margin:0; padding:0;">
          <summary style="display:none !important;"></summary>
          <div class="ea-colors" style="padding:0; margin-bottom:12px;">${colorPickers}</div>
        </details>

        <div class="settings-group" style="margin-top:0;">
          <label style="font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">Power-user options</label>
          <div class="ea-toggles" style="display:grid; grid-template-columns:1fr 1fr; gap:8px 14px; margin:4px 0 6px;">
            <label class="check-row"><input id="ea-wrap" type="checkbox" ${a.wordWrap ? "checked" : ""} /> Word wrap</label>
            <label class="check-row"><input id="ea-blink" type="checkbox" ${a.cursorBlink ? "checked" : ""} /> Cursor blink</label>
            <label class="check-row"><input id="ea-smooth" type="checkbox" ${a.smoothScroll ? "checked" : ""} /> Smooth scrolling</label>
            <div class="settings-group" style="gap:3px">
              <label style="font-size:11px">Cursor style</label>
              <select id="ea-cursor" class="select" style="max-width:140px">
                ${["line", "block", "underline"].map((v) => `<option value="${v}" ${a.cursorStyle === v ? "selected" : ""}>${v}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>

        <div class="ea-actions" style="margin-top:16px; display:flex; gap:10px;">
          <button id="ea-reset" class="btn btn-ghost btn-sm" type="button" style="text-transform:uppercase; font-weight:600; padding:8px 14px;">Reset to default</button>
          <button id="ea-save-appearance" class="btn btn-primary btn-sm" type="button" style="text-transform:uppercase; font-weight:600; padding:8px 20px; flex:1; justify-content:center;">Save appearance</button>
        </div>
      </div>
      
      <div class="ea-import-export" style="display:flex; gap:8px; margin-top:8px; justify-content:center;">
        <button id="ea-export" class="btn btn-ghost btn-xs" type="button" style="font-size:10.5px; opacity:0.75; padding:2px 6px;">⤓ Export theme</button>
        <button id="ea-import" class="btn btn-ghost btn-xs" type="button" style="font-size:10.5px; opacity:0.75; padding:2px 6px;">⤒ Import theme</button>
        <input id="ea-import-file" type="file" accept="application/json,.json" hidden />
      </div>`;

    wire(host);
  }
  app.renderEditorAppearance = render;

  function commit() { save(a); apply(); }

  function wire(host) {
    const $ = (id) => host.querySelector("#" + id);

    $("ea-font").addEventListener("change", (e) => { a.fontFamily = e.target.value; commit(); });
    $("ea-weight").addEventListener("change", (e) => { a.fontWeight = Number(e.target.value); commit(); });

    const slider = (id, prop, fmt) => {
      const el = $(id), out = $(id + "-v");
      el.addEventListener("input", () => {
        a[prop] = Number(el.value);
        if (out) out.textContent = fmt(el.value);
        commit();
      });
    };
    slider("ea-size", "fontSize", (v) => `${v}px`);
    slider("ea-lh", "lineHeight", (v) => v);
    slider("ea-ls", "letterSpacing", (v) => `${v}px`);

    host.querySelectorAll(".ea-theme").forEach((btn) => btn.addEventListener("click", () => {
      const id = btn.dataset.theme;
      a.theme = id;
      a.colors = { ...THEMES[id].colors };
      commit();
      render(); // refresh active card + color pickers
    }));

    host.querySelectorAll("[data-color]").forEach((inp) => inp.addEventListener("input", () => {
      a.colors[inp.dataset.color] = inp.value;
      a.theme = "custom";
      commit();
    }));

    $("ea-wrap").addEventListener("change", (e) => { a.wordWrap = e.target.checked; commit(); });
    $("ea-blink").addEventListener("change", (e) => { a.cursorBlink = e.target.checked; commit(); });
    $("ea-smooth").addEventListener("change", (e) => { a.smoothScroll = e.target.checked; commit(); });
    $("ea-cursor").addEventListener("change", (e) => { a.cursorStyle = e.target.value; commit(); });

    $("ea-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(a, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `usaco-theme-${a.theme}.json`;
      link.click();
      URL.revokeObjectURL(url);
      app.toast("Theme exported", "ok");
    });
    $("ea-import").addEventListener("click", () => $("ea-import-file").click());
    $("ea-import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const obj = JSON.parse(await file.text());
        a = { ...DEFAULTS, ...obj, colors: { ...DEFAULTS.colors, ...(obj.colors || {}) } };
        commit(); render();
        app.toast("Theme imported", "ok");
      } catch (err) { app.toast("Invalid theme file: " + err.message, "err"); }
    });
    $("ea-reset").addEventListener("click", () => {
      a = { ...DEFAULTS, colors: { ...DEFAULTS.colors } };
      commit(); render();
      app.toast("Editor appearance reset", "ok");
    });
    $("ea-save-appearance").addEventListener("click", () => {
      commit();
      app.toast("Đã lưu cài đặt giao diện!", "ok");
    });
  }
}
