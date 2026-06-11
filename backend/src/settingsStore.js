"use strict";

const { SETTINGS_FILE, AI_SETTINGS_FILE, DEFAULT_SETTINGS, DEFAULT_AI_SETTINGS } = require("./config");
const store = require("./fileStore");

async function getSettings() {
  const saved = await store.readJson(SETTINGS_FILE, {});
  return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
}

const ALLOWED = Object.keys(DEFAULT_SETTINGS);

async function saveSettings(patch = {}) {
  const current = await getSettings();
  const next = { ...current };
  for (const key of ALLOWED) {
    if (key in patch && patch[key] != null) next[key] = patch[key];
  }
  // Light validation / clamping.
  next.timeMs = Math.min(Math.max(Number(next.timeMs) || 2000, 100), 10000);
  next.compareMode = ["loose", "strict", "token", "float"].includes(next.compareMode) ? next.compareMode : "loose";
  next.epsilon = Number(next.epsilon) > 0 ? Number(next.epsilon) : 1e-6;
  // memoryLimitMB: 0 disables MLE measurement; otherwise clamp to a sane window.
  next.memoryLimitMB = Number(next.memoryLimitMB) > 0 ? Math.min(Math.max(Math.round(Number(next.memoryLimitMB)), 16), 4096) : 0;
  next.autosave = Boolean(next.autosave);
  next.tabSize = Math.min(Math.max(Number(next.tabSize) || 4, 2), 8);
  next.theme = ["dark", "light"].includes(next.theme) ? next.theme : "dark";
  next.accentColor = ["blue", "green", "orange", "purple", "red"].includes(next.accentColor) ? next.accentColor : "blue";
  await store.writeJson(SETTINGS_FILE, next);
  return next;
}

// ---- AI settings (stored separately so the key never mixes into UI config) ----

async function getAiSettings() {
  const saved = await store.readJson(AI_SETTINGS_FILE, {});
  return { ...DEFAULT_AI_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
}

const AI_ALLOWED = Object.keys(DEFAULT_AI_SETTINGS);

async function saveAiSettings(patch = {}) {
  const current = await getAiSettings();
  const next = { ...current };
  for (const key of AI_ALLOWED) {
    if (key === "apiKey") continue; // handled below so a blank field never wipes it
    if (key in patch && patch[key] != null) next[key] = String(patch[key]);
  }
  // apiKey: update only when a non-empty value is sent; clear only on explicit flag.
  if (patch.clearKey === true) next.apiKey = "";
  else if (typeof patch.apiKey === "string" && patch.apiKey.trim() !== "") next.apiKey = patch.apiKey;
  next.baseUrl = next.baseUrl.trim().replace(/\/+$/, "");
  next.apiKey = next.apiKey.trim();
  next.model = next.model.trim() || DEFAULT_AI_SETTINGS.model;
  await store.writeJson(AI_SETTINGS_FILE, next);
  return next;
}

// Strip the secret before sending settings to the browser. `hasKey` lets the UI
// show whether a key is configured without ever revealing it.
function redactAi(settings) {
  return {
    aiProvider: settings.aiProvider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    fallbackModels: settings.fallbackModels || "",
    hasKey: Boolean(settings.apiKey)
  };
}

module.exports = { getSettings, saveSettings, getAiSettings, saveAiSettings, redactAi };
