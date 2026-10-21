"use strict";
function redact(value, settings = {}) {
  let text = String(value == null ? "" : value); const secrets = new Set();
  for (const [key, value] of Object.entries(settings)) if (/key|token|secret|password/i.test(key) && typeof value === "string" && value) secrets.add(value);
  try { const url = new URL(settings.baseUrl); if (url.username) secrets.add(decodeURIComponent(url.username)); if (url.password) secrets.add(decodeURIComponent(url.password)); for (const [key, value] of url.searchParams) if (/key|token|secret|password/i.test(key) && value) secrets.add(value); } catch { /* not a URL */ }
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) for (const variant of new Set([secret, encodeURIComponent(secret)])) text = text.split(variant).join("[REDACTED]");
  return text.replace(/\bBearer\s+[^\s,;)"']+/gi, "Bearer [REDACTED]");
}
module.exports = { redact };
