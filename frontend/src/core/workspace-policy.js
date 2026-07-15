// core/workspace-policy.js — the resolved "environment" model. Pure & DOM-free.
// A workspace is a sparse PATCH over DEFAULT_POLICY; the manager resolves
// defaults ⊕ preset ⊕ user-overrides and the rest of the app reads the result.

export const DEFAULT_POLICY = Object.freeze({
  // Layout
  layout: "coding",            // coding | split | reading
  rightTab: "run",             // run|tests|notes|coach|history|settings | null (panel hidden)
  explorer: "expanded",        // expanded | collapsed
  coachFocus: false,
  zen: false,
  coachAutoVisible: false,
  // Panel priority / visibility
  panels: {},                  // tab -> "hide" (absent = shown)
  panelOrder: null,            // optional array of tab ids
  widgets: { timer: true, sessionStats: true, dashboardBtn: true },
  // Automation
  autoOpenTestsOnGen: true,
  autoFocusStatementOnOcr: true,
  autoCoachOnWA: false,
  snapshotOnJudge: true,
  collapseExplorerOnEnter: false,
  // AI strategy
  coachReveal: "hints",        // hints | explain | locked-hints
  // Notifications / focus
  notifications: "normal",     // normal | minimal | off
  sounds: true,
  reducedMotion: false,
  // Learning context
  trackWeakTopics: true,
  recordTimeline: true,
  reflectionAfterAc: false
});

export const PRESETS = [
  { id: "free", name: "Tự do", icon: "·", patch: {} },
  { id: "learning", name: "Học", icon: "§", patch: {
    layout: "split", rightTab: "coach", coachAutoVisible: true,
    autoCoachOnWA: true, reflectionAfterAc: true } },
  { id: "contest", name: "Thi đấu", icon: "!", patch: {
    explorer: "collapsed", collapseExplorerOnEnter: true,
    panels: { notes: "hide" }, widgets: { dashboardBtn: false },
    coachReveal: "locked-hints", notifications: "minimal", sounds: false,
    reducedMotion: true, trackWeakTopics: false } },
  { id: "debug", name: "Gỡ lỗi", icon: "?", patch: {
    explorer: "collapsed", rightTab: "run", autoCoachOnWA: true,
    coachReveal: "explain" } },
  { id: "teaching", name: "Dạy", icon: "¶", patch: {
    layout: "reading", rightTab: "coach", coachAutoVisible: true,
    coachReveal: "explain" } },
  { id: "minimal", name: "Tối giản", icon: "—", patch: {
    rightTab: null, explorer: "collapsed", zen: true,
    panels: { notes: "hide", coach: "hide", history: "hide", settings: "hide" },
    widgets: { sessionStats: false, dashboardBtn: false },
    notifications: "off", sounds: false, reducedMotion: true,
    autoCoachOnWA: false, autoOpenTestsOnGen: false,
    trackWeakTopics: false, recordTimeline: false } }
];

function mergeOneLevel(base, patch) {
  const out = { ...base, ...patch };
  out.panels = { ...(base.panels || {}), ...(patch.panels || {}) };
  out.widgets = { ...(base.widgets || {}), ...(patch.widgets || {}) };
  return out;
}

export function getPreset(id) { return PRESETS.find((p) => p.id === id) || null; }
export function listWorkspaces() { return PRESETS.map(({ id, name, icon }) => ({ id, name, icon })); }

export function resolvePolicy(presetId, overrides = {}) {
  const preset = getPreset(presetId) || getPreset("free");
  return mergeOneLevel(mergeOneLevel(DEFAULT_POLICY, preset.patch), overrides);
}

export function observable(policy) {
  return { layout: policy.layout, rightTab: policy.rightTab, explorer: policy.explorer, zen: policy.zen };
}

export function detectWorkspace(obs) {
  for (const p of PRESETS) {
    const r = observable(resolvePolicy(p.id));
    if (r.layout === obs.layout && r.rightTab === obs.rightTab &&
        r.explorer === obs.explorer && r.zen === obs.zen) return p.id;
  }
  return "custom";
}
