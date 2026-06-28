# Workspace Environment Architecture

**Status:** Design — awaiting approval. No code until approved.
**Date:** 2026-06-27
**Sprint:** 2 — Workspace Experience
**Author:** design pass (Claude) responding to the "Workspace = Environment" brief.

---

## 0. Executive summary & the central argument

The brief is right about the thing that matters: **a workspace that only moves
panels is shallow.** A task mode should change *behaviour and automation*, not
just *where components sit*. This document adopts that vision in full.

It diverges from the brief on **one mechanism**, deliberately, because the
mechanism is what determines whether the system is maintainable five sprints
from now.

> The brief frames a workspace as "modifies every one of nine layers." Taken
> literally — nine independent fields, hand-set on each of five presets — that is
> a 45-cell matrix in which the *same behaviour* ("open Coach after WA",
> "suppress info toasts") is re-expressed, and re-implemented, once per
> workspace. That is precisely the structure that causes future refactoring
> pain, which is the opposite of the stated goal.

The cleaner architecture that preserves the entire nine-layer vision is
**Policy + Bus + Orchestrator**:

- **Policy** — one flat object of typed fields with global *defaults*. A
  workspace is a **sparse patch** (states only what differs). The nine "layers"
  become field *groups* on this one object. Nothing is lost expressively.
- **Bus** — a tiny pub/sub spine. Producers emit domain events
  (`judge:done`, `verdict:wa`, `tests:generated`, `ocr:done`, `coach:reply`…).
  Each behaviour is written **once** as a subscriber that consults the current
  policy to decide whether to act.
- **Orchestrator** (`WorkspaceManager`) — resolves
  `defaults ⊕ preset ⊕ userOverrides`, applies layout via the *existing*
  primitives, owns persistence + the switcher + `Ctrl+1…N`.

Why this is the same vision, done better: behaviour lives in one place per
concern and is *parameterised* by policy; workspaces stay tiny and declarative;
adding an automation is one defaulted field + one subscriber, touching no
existing workspace. See §9.

This document is the deliverable requested before any implementation. It answers
the nine questions in order (§1–§9), then pins the concrete Sprint-2 build scope
(§10) and the open questions for sign-off (§11).

---

## 1. What is a Workspace?

**A Workspace is a named, reversible *environment policy*: a declarative,
partial override of the application's default behaviour for the duration of a
task.**

It is not a layout, and it is not a mode flag. It is a *patch* over a single
resolved object — the **active policy** — that the rest of the app reads to
decide how to lay out, what to automate, how loudly to talk, and what to record.

Three properties define it:

1. **Declarative.** A workspace is data (`{ id, name, icon, patch }`), not code.
   The patch lists only the fields that differ from defaults.
2. **Resolved, not applied-and-forgotten.** At any moment there is exactly one
   *active policy* = `defaults ⊕ activePreset.patch ⊕ sessionUserOverrides`.
   Modules query it live (`app.workspace.policy.<field>`); they do not snapshot
   it.
3. **Reversible & non-coercive.** Switching applies the patch on *entry*. A
   deliberate manual change afterwards (drag a divider, switch a tab) updates the
   user-override layer and the switcher label becomes **"Tùy chỉnh" (Custom)**.
   The workspace never silently reverts an intentional action mid-task.

A workspace therefore answers: *"Given that I'm doing **X** right now, how should
the whole IDE behave?"* — where X ∈ {learning, competing, debugging, teaching,
focusing}.

---

## 2. What layers belong to a Workspace?

The nine conceptual layers in the brief map onto **one flat `WorkspacePolicy`
object**, grouped for readability. Every field has a global default; a preset
overrides only what it must.

### 2.1 Policy field catalogue

| Group (brief's "layer") | Field | Type | Default | Meaning |
|---|---|---|---|---|
| **Layout** | `layout` | `coding\|split\|reading` | `coding` | Centre-column mode (reuses `setLayoutMode`). |
| | `rightTab` | tab id `\| null` | `run` | Right-panel tab to land on (`null` = panel hidden). |
| | `explorer` | `expanded\|collapsed` | `expanded` | Left explorer state (reuses `sb-collapsed`). |
| | `coachFocus` | bool | `false` | Wide Coach reading column (reuses `setCoachFocus`). |
| | `zen` | bool | `false` | Zen distraction-free (reuses `toggleZenMode`). |
| **Panel priority** | `panels` | map tab→`show\|hide` | all `show` | Which right-panel tabs are visible. |
| | `panelOrder` | tab id[] | natural | Tab ordering by task priority (e.g. Contest: run first). |
| | `widgets` | `{timer,sessionStats,dashboardBtn}` bools | all `true` | Topbar widget visibility. |
| **Behaviour** | `coachAutoVisible` | bool | `false` | Keep Coach in view (Learning/Teaching). |
| **Automation** | `autoOpenTestsOnGen` | bool | `true` | After AI test-gen, open the Tests tab. |
| | `autoFocusStatementOnOcr` | bool | `true` | After OCR/analysis, surface the statement. |
| | `autoCoachOnWA` | bool | `false` | After WA, flag/open Coach for help. |
| | `snapshotOnJudge` | bool | `true` | Persist a code snapshot per judge (already happens; this tags intent). |
| | `collapseExplorerOnEnter` | bool | `false` | One-shot explorer collapse when entering the workspace. |
| **AI strategy** | `coachReveal` | `hints\|explain\|locked-hints` | `hints` | Default for the existing Coach **Lời giải** toggle. `locked-hints` disables the toggle (Contest). |
| **Notifications** | `notifications` | `normal\|minimal\|off` | `normal` | Gate for non-critical `app.toast`. **Errors always show.** |
| | `sounds` | bool | `true` | Gate for `app.playSound`. |
| **Focus** | `reducedMotion` | bool | `false` | Adds a body class the CSS keys off (reuses the `tab-hidden` throttle pattern). |
| **Learning context** | `trackWeakTopics` | bool | `true` | Gate weak-topic attribution *while solving*. |
| | `recordTimeline` | bool | `true` | Gate timeline/attempt recording surfacing. |
| | `reflectionAfterAc` | bool | `false` | Offer Defense/viva reflection after AC. |

> **Persistence** is the ninth "layer" in the brief. It is **not** a per-field
> policy — it is a *behaviour of the Manager* (§3, §7): the active workspace id
> and the user-override layer live in the Session envelope and are restored on
> launch.

### 2.2 The presets as sparse patches

Defaults reproduce **today's behaviour exactly** — so the neutral baseline is a
real workspace (`free`), and nothing regresses for existing users.

```text
free      🎯 Tự do      {}                      ← == current app behaviour; Reset target
learning  📚 Học        { layout:split, rightTab:coach, coachAutoVisible:true,
                          autoCoachOnWA:true, reflectionAfterAc:true }
contest   🏁 Thi đấu    { explorer:collapsed, collapseExplorerOnEnter:true,
                          panels:{notes:hide}, widgets:{dashboardBtn:false},
                          panelOrder:[run,tests,…], coachReveal:locked-hints,
                          notifications:minimal, sounds:false, reducedMotion:true,
                          trackWeakTopics:false }
debug     🔍 Gỡ lỗi     { explorer:collapsed, rightTab:run, autoCoachOnWA:true,
                          coachReveal:explain }      ← Run console already = Output+Stderr+Diff
teaching  🎓 Dạy        { layout:reading, rightTab:coach, coachAutoVisible:true,
                          coachReveal:explain }
minimal   🧘 Tối giản   { rightTab:null, explorer:collapsed, zen:true,
                          panels:{notes:hide,coach:hide,history:hide,settings:hide},
                          widgets:{sessionStats:false,dashboardBtn:false},
                          notifications:off, sounds:false, reducedMotion:true,
                          autoCoachOnWA:false, autoOpenTestsOnGen:false,
                          trackWeakTopics:false, recordTimeline:false }
```

Each patch is a handful of fields. Behaviour is *never* duplicated here — these
only set policy; the behaviour reading that policy lives once, elsewhere.

> **Design note (reuse, per the brief's hard rule):** `minimal` ≈ existing Zen,
> `debug`'s "Diff panel prioritised" is already satisfied because the Run console
> stacks verdict + stderr + side-by-side diff in one panel, and `learning`'s
> "Statement + Code" is the existing `split` layout. **Zero new panel
> components.**

---

## 3. What belongs to Session instead?

A **Session** is the container that *owns* the workspace and outlives any single
problem. Workspace = "how the IDE behaves"; Session = "this stretch of work and
everything learned during it."

Belongs to Session (not Workspace):

- **Active workspace id** + the **user-override layer** (the live patch the user
  built by hand → "Tùy chỉnh").
- **Continuity state**: last problem, last panel widths (`panelW`, `splitPw`),
  explorer state — i.e. *resume exactly where you stopped*.
- **Session log** (in-memory now): the stream of bus events for this run.
- **Aggregates**: problems touched, runs this session (the existing
  `sessionRuns`/`sessionKeys` counters move under here conceptually).
- **Future**: lifecycle (Start → Choose Workspace → Solve → Reflect → End),
  session-scoped AI memory, the knowledge-graph delta, the reflection screen.

Persistence envelope: **one key `usaco2.session.v1`** holding
`{ workspaceId, userOverrides, lastProblem, startedAt, … }`. (Layout primitives
keep their existing keys for back-compat; see §7 — additive, not a migration.)

**Sprint 2 builds of Session:** only the envelope + `workspaceId` + `lastProblem`
restore + the bus. **Everything else (lifecycle, reflection, analytics, AI
memory, knowledge graph) is seam-only — defined, not implemented.** The bus is
the spine those features later attach to without touching today's code.

---

## 4. Which current systems become Workspace-aware?

"Aware" = either *emits* domain events, or *reads* the active policy. Most are
read-only consumers; a few become emitters.

| System (file) | How it becomes aware | Emits / Reads |
|---|---|---|
| `layout.js` | Applied **by** the orchestrator (already the layout SoT). | reads (via manager) |
| `features/sidebar-toggle.js` | Expose `app.setSidebarCollapsed(v)` so the orchestrator can drive it (Ctrl+B still works). | reads |
| `runner.js` | Emit `run:done` / `judge:done` / `verdict:{ac,wa,tle,re,ce}`; snapshot already happens. | **emits** |
| `features/wa-review.js` | Banner surfacing respects `autoCoachOnWA` / contest-suppression; consumes `verdict:wa`. | emits + reads |
| `statement.js` / `testcases.js` | Emit `ocr:done`, `tests:generated`; honour `autoFocusStatementOnOcr`, `autoOpenTestsOnGen`. | **emits** |
| `features/mini-chat.js` (Coach) | Set the **Lời giải** toggle from `coachReveal` on entry; emit `coach:reply`. | emits + reads |
| `command-palette.js` | Add workspace switch / focus / reset / recents; ignores `panels.hide` so hidden tabs stay reachable. | reads |
| `main.js` | `playSound` gated by `policy.sounds`; non-critical `toast` gated by `policy.notifications`; `reducedMotion` body class; registers `Ctrl+1…N`. | reads |
| topbar widgets (`timer.js`, session-stats, dashboard btn) | Visibility from `policy.widgets`. | reads |
| learning context (weak-topic / journey / dashboard surfacing) | Gated by `trackWeakTopics` / `recordTimeline` **for live surfacing only** (see §8 risk 4). | reads |

New modules introduced: `core/bus.js` (tiny emitter), `features/workspaces.js`
(policy + manager + switcher), `features/panel-signals.js` (the automation
subscribers).

---

## 5. Which systems remain independent?

These never read policy and never change. Keeping them workspace-agnostic is a
correctness boundary, not an omission.

- **The judge core** — `backend/runCpp.js`, `judgeService.js`, compile cache /
  PCH. A run produces the same verdict regardless of workspace. (Time limits are
  per-problem metadata, not per-workspace.)
- **Data layer** — `problemStore.js`, `fileStore.js`, `contestStore.js`. Storage
  is task-agnostic.
- **The editing surface** — `editor-cm.js` / `editor.js`. CodeMirror config
  (font/theme) is owned by Editor Appearance + global Settings, not workspaces.
- **Global Settings** — g++ path, API key, provider/router. Machine-level, not
  task-level. A workspace must never mutate these.
- **AI provider/router** — `backend/ai.js`. Only the *prompt mode* (hint vs
  explain) is policy-influenced, and that already exists as the reveal toggle;
  the transport/model selection stays independent.
- **Rendering** — Markdown / KaTeX.

Rule of thumb: **workspace policy may change *presentation, automation, and
emphasis*; it must never change *computation or stored truth*.**

---

## 6. Future extension points (seams, not builds)

All four future directions attach to the **same bus + policy**, which is why the
architecture "supports them without implementing them":

1. **Adaptive workspace suggestions.** A `workspace-advisor` subscriber counts
   bus events (`verdict:wa` ×5 → suggest `debug`; `problem:opened`+`isNew` →
   suggest `learning`; `timer:started` → suggest `contest`) and calls
   `app.workspace.suggest(id)` → a dismissable pill. No new infrastructure;
   pure subscriber. *Not built in S2.*
2. **Session lifecycle + reflection.** Start/End hooks + a post-session
   reflection screen attach to the Session envelope and the event log already
   defined in §3.
3. **Knowledge graph / AI memory.** Subscribes to `judge:done`, `verdict:*`,
   `coach:reply` — the bus already carries the full signal; no producer changes
   needed.
4. **User-defined workspaces.** A workspace is just a patch object; saving the
   current "Tùy chỉnh" override as a named preset is a thin write to
   session/settings. Trivial once the patch model exists.

The test of a good seam: each future feature is **additive subscribers + data**,
never a change to runner/judge/editor. All four pass.

---

## 7. Migration strategy (strangler, additive, zero big-bang)

Today's state lives in scattered keys: `usaco2.activeTab`, `usaco2.layoutMode`,
`usaco2.panelW`, `usaco2.splitPw`, `usaco2.lastProblem`, `usaco.sidebar.collapsed`.

Migration is **strictly additive** — at every step, defaults reproduce current
behaviour, so each increment is independently shippable and reviewable.

1. **Add `app.bus`.** Pure addition; nothing consumes it yet. No behaviour change.
2. **Add `WorkspaceManager` with `free` defaults == today.** The neutral
   workspace renders the *exact* current UX. Switcher appears; nothing else moves.
3. **Expose `app.setSidebarCollapsed`** from `sidebar-toggle.js` (small refactor;
   Ctrl+B keeps working). Orchestrator can now drive the explorer.
4. **Keep legacy layout keys authoritative.** The Manager *reads/writes the same*
   `layoutMode` / `activeTab` / `panelW` / `splitPw` / `sb-collapsed` keys for
   those primitives — no data migration. The Session envelope (`usaco2.session.v1`)
   adds only `workspaceId` + `userOverrides` + `lastProblem`. On first boot with
   no envelope, seed it from the legacy keys.
5. **Wire behaviours one at a time**, each behind a field defaulted to today's
   value (`autoCoachOnWA:false`, `sounds:true`, …). Each wire is a no-op until a
   preset opts in → safe diffs, easy bisection.
6. **Boot order:** Manager initialises *after* the primitives it drives and
   applies the workspace **after** `loadProblem` (which today calls
   `setLayoutMode(getSavedLayoutMode())`), suppressing the `.workbench` grid
   transition during the batch apply (the documented Chromium grid-measure bug).
7. **Cache discipline:** bump `index.html ?v=` for every touched css/js (the
   documented "edits don't show" gotcha).

Rollback at any step = stop opting presets into differences; `free` == today.

---

## 8. Risks & mitigations

1. **Policy fighting user intent (silent overrides feel hostile).** → Apply
   patch on *entry only*; a deliberate manual change → "Tùy chỉnh"; never
   auto-revert. `locked-hints` is reversible by leaving Contest.
2. **Init / load-order fragility** (many documented gotchas: body-class
   clobbering, settings fan-out, mentor teleport). → Orchestrator runs after its
   primitives, applies with transition suppression, and **unloads no modules**
   (hide ≠ destroy).
3. **Hidden-state confusion ("where did Notes go?").** → Switcher pill always
   shows the active workspace; Reset/`free` restores everything; the command
   palette **ignores `panels.hide`** so every panel stays keyboard-reachable.
4. **Over-suppressing learning data** (Contest disables weak-topic tracking). →
   Runs/history are still captured server-side regardless; only *live
   attribution/surfacing* is gated. No permanent data loss; post-contest
   reflection can backfill.
5. **Notification gating swallowing real errors.** → `notifications:off` still
   shows `type:"err"` toasts and compile errors; only celebratory/info toasts are
   suppressed.
6. **Scope creep** into Session/adaptive/knowledge-graph. → Hard boundary in §10;
   those are seam-only this sprint.
7. **Two sources of truth for layout** (legacy keys vs policy). → Legacy keys
   remain the SoT for the *primitives*; policy expresses *intent* and drives them
   through the existing setters. One writer per key.

---

## 9. Why this architecture minimises future refactoring

- **Behaviour is written once, parameterised by policy.** Adding or removing a
  workspace never edits behaviour code — only a small patch object. The 45-cell
  duplication the brief's literal reading would create simply does not exist.
- **New automation = 1 defaulted field + 1 subscriber.** It is off everywhere
  until a preset opts in, so it cannot regress other workspaces.
- **The bus decouples producers from consumers.** Knowledge-graph, AI memory and
  adaptive suggestions attach as subscribers without touching runner/judge/editor
  — the exact files you least want to keep reopening.
- **Defaults == status quo** makes every migration step a verifiable no-op until
  intentionally opted-in → small, bisectable diffs.
- **Additive persistence** (envelope over legacy keys) means no data migration
  risk now or later.
- **One resolved "active policy"** is the single place to inspect/debug "why is
  the IDE behaving this way?" — no scattered `if (mode === …)` conditionals
  spreading through the codebase.

The cost of this architecture is one indirection (read policy instead of a
literal). The return is that the four hardest future features become *additive*.

---

## 10. Sprint 2 build scope (the boundary)

**Build now:**

- `core/bus.js` — minimal `on/emit`.
- `features/workspaces.js` — `WorkspacePolicy` defaults + 6 presets
  (free, learning, contest, debug, teaching, minimal); `WorkspaceManager`
  (resolve, apply, persist, switcher pill + popover, `Ctrl+1…6`, Custom
  detection, `suggest()` stub).
- `features/panel-signals.js` — subscribers for `autoOpenTestsOnGen`,
  `autoFocusStatementOnOcr`, `autoCoachOnWA` (+ Coach tab attention dot).
- Expose `app.setSidebarCollapsed`.
- Policy wiring: layout/tab/explorer/zen/coachFocus apply; `sounds`,
  `notifications`, `reducedMotion`, `coachReveal` default, `panels`/`widgets`
  show-hide.
- Emitters in `runner.js`, `statement.js`/`testcases.js`, `mini-chat.js`.
- Command center: workspace switch ×6, Focus/Minimal, Reset Layout, Recents.
- Persistence: `usaco2.session.v1` (workspaceId + userOverrides + lastProblem),
  seeded from legacy keys.
- Shortcuts modal rows + `?v=` bumps.
- Verify: `npm test` (98), `node --check` on new/changed JS, live smoke on `:5099`.

**Seam-only (NOT built this sprint):** adaptive advisor, session
lifecycle/reflection UI, knowledge graph, AI memory, debug-timeline view,
user-defined preset saving.

---

## 11. Open questions for sign-off

1. **Add the 6th `free` / "Tự do" workspace?** (My recommendation: **yes** — it
   makes "defaults == today" a real, selectable workspace and the Reset target,
   so existing users are never surprised.)
2. **Contest `locked-hints`:** OK to *disable* the Coach reveal toggle while in
   Contest (reversible by leaving), or keep it user-toggleable but defaulted off?
   (Recommendation: **disable** — it's the pedagogically honest contest
   constraint, and fully reversible.)
3. **Hidden panels stay reachable via `Ctrl+K`** even when `panels.hide`?
   (Recommendation: **yes**.)
4. **Doc location** — placed at `docs/WORKSPACE-ARCHITECTURE.md` (sibling of
   `DESIGN-SYSTEM.md`) to match the project's flat-docs convention. Say if you'd
   prefer the `docs/superpowers/specs/` path instead.
