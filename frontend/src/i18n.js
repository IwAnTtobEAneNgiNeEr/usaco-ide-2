// UI locale is local and instant; problem statements are retained in both
// languages so switching never destroys the imported source.
import { api } from "./api.js?v=2.2";

const STORAGE_KEY = "usaco-ui-language";
const COPY = {
  en: { run: "Run", judge: "Judge", zen: "Focus", problems: "Problems", newProblem: "+ New problem", search: "Search by title / topic…", allSources: "All sources", allStatuses: "All statuses", allDifficulties: "All difficulties", coding: "Code", split: "⊟ Statement + Code", reading: "Statement", editInfo: "Edit info", save: "Save", statement: "Statement", read: "Read", edit: "Edit", sourceStatement: "Keep original statement", followInterface: "Match interface language", imagePdf: "Import image / PDF", pasteImage: "Paste image", clear: "Clear", tests: "Tests", notes: "Notes", coach: "Coach", history: "History", settings: "Settings", translating: "Translating statement…", translateFailed: "Could not translate the statement. The original has been kept.", inputStatement: "Paste a problem statement here (Markdown is supported), or paste a screenshot (Ctrl+V)…" },
  vi: { run: "Chạy", judge: "Chấm", zen: "Tập trung", problems: "Bài tập", newProblem: "+ Bài mới", search: "Tìm theo tên / chủ đề…", allSources: "Tất cả nguồn", allStatuses: "Mọi trạng thái", allDifficulties: "Mọi độ khó", coding: "Code", split: "⊟ Đề + Code", reading: "Đề bài", editInfo: "Sửa thông tin", save: "Lưu", statement: "Đề bài", read: "Đọc", edit: "Sửa", sourceStatement: "Giữ nguyên đề gốc", followInterface: "Theo ngôn ngữ giao diện", imagePdf: "Nhập ảnh / PDF", pasteImage: "Dán ảnh", clear: "Xóa", tests: "Test", notes: "Ghi chú", coach: "Trợ giảng", history: "Lịch sử", settings: "Cài đặt", translating: "Đang dịch đề…", translateFailed: "Không thể dịch đề. Đã giữ nguyên bản gốc.", inputStatement: "Dán đề bài ở đây (hỗ trợ Markdown), hoặc dán ảnh chụp màn hình (Ctrl+V)…" }
};

export const uiText = (key, language = document.documentElement.lang) => COPY[language]?.[key] || COPY.vi[key] || key;
const t = uiText;
const inferLanguage = (text) => /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text) ? "vi" : "en";

const CURATED = {
  en: {
    "Ảnh / PDF": "Import image / PDF", "Nhập ảnh / PDF": "Import image / PDF", "Dán ảnh": "Paste image", "Lưu": "Save", "Xóa": "Clear", "Đọc": "Read", "Sửa": "Edit",
    "Khớp ngôn ngữ giao diện": "Match interface language", "Theo ngôn ngữ giao diện": "Match interface language",
    "Giữ nguyên đề gốc": "Keep original statement", "Soi code": "Review code", "Thêm": "More",
    "Lưu mẫu": "Save template", "Khôi phục mặc định": "Restore defaults", "Lưu cài đặt AI": "Save AI settings",
    "Kiểm tra kết nối": "Test connection", "Nhập tệp": "Import file", "Chọn tệp": "Choose file", "Đóng": "Close"
  },
  vi: {
    "Image / PDF": "Nhập ảnh / PDF", "Import image / PDF": "Nhập ảnh / PDF", "Import file": "Nhập tệp", "Paste image": "Dán ảnh", "Save": "Lưu", "Clear": "Xóa",
    "Read": "Đọc", "Edit": "Sửa", "Match interface language": "Theo ngôn ngữ giao diện", "Keep original statement": "Giữ nguyên đề gốc",
    "Review code": "Soi code", "More": "Thêm", "Save template": "Lưu mẫu", "Restore defaults": "Khôi phục mặc định",
    "Save AI settings": "Lưu cài đặt AI", "Test connection": "Kiểm tra kết nối", "Close": "Đóng"
  }
};

const AUTO_I18N_SKIP = "code, pre, textarea, input, script, style, kbd, .cm-editor, .code-stack, .lined, .stmt-sample-pre, [data-i18n-preserve]";

function isDisplayFragment(text) {
  const value = String(text || "").trim();
  if (value.length < 2 || value.length > 260 || !/[A-Za-zÀ-ỹ]/.test(value)) return false;
  // Raw program identifiers and values are not UI copy.
  if (/^[\w+./:@#=-]+$/u.test(value)) return false;
  return true;
}

function applyStatic(language) {
  document.documentElement.lang = language;
  document.documentElement.dataset.uiLanguage = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n, language); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder, language); });
}

export function initLanguage(app) {
  let language = "vi";
  try { language = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "vi"; } catch { /* private mode */ }
  app.state.uiLanguage = language;
  app.state.statementLanguageMode = "follow";
  app.state.statementVariants = { en: "", vi: "", sourceLanguage: "en" };
  app.t = (key) => t(key, app.state.uiLanguage);

  // Store each node's renderer-owned source string separately. Never replace
  // a source in-place: this makes English → Vietnamese exact even after many
  // DOM re-renders, and keeps the translation layer reversible.
  const sources = new WeakMap();
  const uiCache = new Map();
  let scanTimer = null;
  let translating = false;
  let translationUnavailable = false;
  let autoTranslationEnabled = language === "en";

  const collectFragments = () => {
    const target = app.state.uiLanguage;
    const nodesByText = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(AUTO_I18N_SKIP)) continue;
      const source = sources.get(node) ?? node.nodeValue;
      if (!sources.has(node)) sources.set(node, source);
      const text = String(source || "").trim();
      if (!isDisplayFragment(text)) continue;
      const curated = CURATED[target][text];
      if (curated) {
        if (node.nodeValue !== node.nodeValue.replace(text, curated)) node.nodeValue = node.nodeValue.replace(text, curated);
        continue;
      }
      // Already-local text is left intact. This keeps the Vietnamese default
      // fast while still catching any English fragment a renderer introduces.
      if (inferLanguage(text) === target) continue;
      const cacheKey = `${target}\u0000${text}`;
      if (uiCache.has(cacheKey)) {
        const translated = uiCache.get(cacheKey);
        if (translated && node.nodeValue !== node.nodeValue.replace(text, translated)) node.nodeValue = node.nodeValue.replace(text, translated);
        continue;
      }
      const list = nodesByText.get(text) || [];
      list.push(node);
      nodesByText.set(text, list);
    }
    return nodesByText;
  };

  const translateVisibleUi = async () => {
    if (translating || translationUnavailable) return;
    const targetLanguage = app.state.uiLanguage;
    const nodesByText = collectFragments();
    const fragments = [...nodesByText.keys()].slice(0, 60);
    if (!fragments.length) return;
    translating = true;
    try {
      const { translations } = await api.aiTranslateUi({ fragments, targetLanguage });
      // A response for the previous locale must never overwrite a newer choice.
      if (targetLanguage !== app.state.uiLanguage) return;
      fragments.forEach((source, index) => {
        const translated = String(translations[index] || "").trim();
        if (!translated) return;
        uiCache.set(`${targetLanguage}\u0000${source}`, translated);
        for (const node of nodesByText.get(source) || []) {
          if (node.isConnected) node.nodeValue = node.nodeValue.replace(source, translated);
        }
      });
    } catch (error) {
      // No AI key should not make the UI unstable. Curated core controls still
      // switch locally; the next render retries only after settings change.
      if (error?.data?.code === "NO_KEY") translationUnavailable = true;
    } finally {
      translating = false;
      // Work through the next short batch without flooding the provider.
      queueVisibleUiTranslation();
    }
  };

  const queueVisibleUiTranslation = () => {
    if (!autoTranslationEnabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { translateVisibleUi(); }, 180);
  };
  const observer = new MutationObserver(queueVisibleUiTranslation);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  app.refreshUiTranslations = () => {
    translationUnavailable = false;
    autoTranslationEnabled = true;
    queueVisibleUiTranslation();
  };

  applyStatic(language);

  app.setUiLanguage = async (next) => {
    app.state.uiLanguage = next === "en" ? "en" : "vi";
    document.querySelectorAll("#set-ui-language").forEach((selector) => { selector.value = app.state.uiLanguage; });
    try { localStorage.setItem(STORAGE_KEY, app.state.uiLanguage); } catch { /* private mode */ }
    applyStatic(app.state.uiLanguage);
    document.dispatchEvent(new CustomEvent("localechange", { detail: { language: app.state.uiLanguage } }));
    autoTranslationEnabled = true;
    translationUnavailable = false;
    queueVisibleUiTranslation();
    if (app.state.currentId) await app.applyStatementLanguage?.();
  };

  app.setStatementVariants = ({ statement, statementEn, statementVi, sourceLanguage }) => {
    const source = sourceLanguage === "vi" || sourceLanguage === "en"
      ? sourceLanguage
      : inferLanguage(statement || statementEn || statementVi || "");
    app.state.statementVariants = {
      sourceLanguage: source,
      en: statementEn || (source === "en" ? statement || "" : ""),
      vi: statementVi || (source === "vi" ? statement || "" : "")
    };
  };

  // statement.md remains the canonical source used by sample trust and AI.
  // Translations are presentation variants, never replacements for that file.
  app.getSourceStatement = () => app.state.statementVariants[app.state.statementVariants.sourceLanguage] || "";
  app.persistActiveStatementVariant = async (value = app.el.ioStatement.value) => {
    const id = app.state.currentId;
    const variants = app.state.statementVariants;
    let active = app.state.activeStatementLanguage || variants.sourceLanguage;
    if (!id) return;
    if (!variants.en && !variants.vi && value.trim()) {
      active = variants.sourceLanguage = inferLanguage(value);
      app.state.activeStatementLanguage = active;
    }
    // Serialize canonical/variant writes per user action; only source edits
    // may change canonical bytes (and consequently statement-sample receipts).
    if (active === variants.sourceLanguage) {
      await api.saveStatement(id, value);
      if (variants[active] !== value) {
        const other = active === "en" ? "vi" : "en";
        await (other === "vi" ? api.saveStatementVi(id, "") : api.saveStatementEn(id, ""));
        variants[other] = "";
      }
    }
    await (active === "vi" ? api.saveStatementVi(id, value) : api.saveStatementEn(id, value));
    await api.updateProblem(id, { statementSourceLanguage: variants.sourceLanguage });
    variants[active] = value;
  };

  let statementRequest = 0;
  app.applyStatementLanguage = async () => {
    const request = ++statementRequest;
    const id = app.state.currentId;
    if (!id) return;
    const variants = app.state.statementVariants;
    const active = app.state.activeStatementLanguage;
    // Preserve unsaved edits before switching away from the visible variant.
    if (active && app.el.ioStatement.value !== app.state.savedStatement) {
      await app.persistActiveStatementVariant(app.el.ioStatement.value);
    }
    if (request !== statementRequest || id !== app.state.currentId || variants !== app.state.statementVariants) return;
    const target = app.state.statementLanguageMode === "source" ? variants.sourceLanguage : app.state.uiLanguage;
    const original = variants[variants.sourceLanguage];
    const fieldValue = app.el.ioStatement.value;
    const isCurrent = () => request === statementRequest && id === app.state.currentId
      && variants === app.state.statementVariants && app.el.ioStatement.value === fieldValue;
    let translated = variants[target];
    if (!translated) {
      if (!original) return;
      app.el.statementStatus.textContent = t("translating", app.state.uiLanguage);
      try {
        const result = await api.aiTranslateStatement({ statement: original, targetLanguage: target });
        if (!isCurrent()) return;
        translated = result?.statement;
        const blocks = (text) => text.match(/```[^\n]*\n[\s\S]*?```/g) || [];
        if (typeof translated !== "string" || !translated.trim()
          || JSON.stringify(blocks(original)) !== JSON.stringify(blocks(translated))) {
          throw new Error(t("translateFailed", app.state.uiLanguage));
        }
        await (target === "vi" ? api.saveStatementVi(id, translated) : api.saveStatementEn(id, translated));
        variants[target] = translated;
      } catch (error) {
        if (!isCurrent()) return;
        // Keep the source readable even when the initial display was a legacy
        // working copy. Do not fabricate a missing historical original.
        app.state.activeStatementLanguage = variants.sourceLanguage;
        app.el.ioStatement.value = original;
        app.state.savedStatement = original;
        app.renderStatement?.();
        app.toast?.(t("translateFailed", app.state.uiLanguage), "err");
        app.el.statementStatus.textContent = t("translateFailed", app.state.uiLanguage);
        return;
      }
    }
    if (!isCurrent()) return;
    app.state.activeStatementLanguage = target;
    app.el.ioStatement.value = translated;
    app.state.savedStatement = translated;
    app.renderStatement?.();
  };

  app.handleStatementTextPaste = async (text) => {
    const field = app.el.ioStatement;
    const replacesWholeStatement = !field.value.trim() || (field.selectionStart === 0 && field.selectionEnd === field.value.length);
    if (!replacesWholeStatement) return false;
    const sourceLanguage = inferLanguage(text);
    const target = app.state.statementLanguageMode === "source" ? sourceLanguage : app.state.uiLanguage;
    app.state.statementVariants = { sourceLanguage, en: "", vi: "" };
    app.state.statementVariants[sourceLanguage] = text;
    app.state.activeStatementLanguage = sourceLanguage;
    field.value = text;
    // Persist the imported source before requesting a translation. A failed or
    // cancelled request must never leave the learner with only a partial copy.
    if (app.state.currentId) {
      const id = app.state.currentId;
      await app.persistActiveStatementVariant(text);
      // A replacement source also invalidates a translation from the old text.
      await (sourceLanguage === "en" ? api.saveStatementVi(id, "") : api.saveStatementEn(id, ""));
      app.state.savedStatement = text;
    }
    if (sourceLanguage !== target) await app.applyStatementLanguage();
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };

  const statementMode = document.getElementById("statement-language-mode");
  if (statementMode) statementMode.addEventListener("change", async () => {
    app.state.statementLanguageMode = statementMode.value === "source" ? "source" : "follow";
    await app.applyStatementLanguage();
  });
}
