// core/session-store.js — the single persistence envelope for the active
// workspace + continuity. Storage is injected so it is Node-testable; the
// browser passes localStorage. Layout primitives keep their own legacy keys;
// this envelope adds only workspaceId + overrides + lastProblem (additive).
const KEY = "usaco2.session.v1";
const LEGACY_LAST_PROBLEM = "usaco2.lastProblem";

export function seedFromLegacy(storage) {
  let lastProblem = null;
  try { lastProblem = storage.getItem(LEGACY_LAST_PROBLEM) || null; } catch { /* private mode */ }
  return { workspaceId: "free", overrides: {}, lastProblem, startedAt: new Date().toISOString() };
}

export function loadSession(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === "object") {
        return {
          workspaceId: s.workspaceId || "free",
          overrides: s.overrides && typeof s.overrides === "object" ? s.overrides : {},
          lastProblem: s.lastProblem || null,
          startedAt: s.startedAt || new Date().toISOString()
        };
      }
    }
  } catch { /* corrupt or private mode → seed */ }
  return seedFromLegacy(storage);
}

export function saveSession(storage, session) {
  try { storage.setItem(KEY, JSON.stringify(session)); } catch { /* private mode */ }
}
