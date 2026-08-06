// xuong-preview.js — THE Preview Surface. One surface, one recipe interpreter.
//
// There is deliberately no BFS renderer, no Dijkstra renderer, no sorting
// renderer. A run produces an ObservableModel; the backend's ViewPlanner picks
// a PreviewRecipe; this file interprets that recipe with a small set of base
// projections + generic overlays. Everything it draws comes from entities,
// relations, events, metrics and outputs — never from an algorithm name.
//
// It renders to an HTML string (no DOM APIs) so the whole surface is unit
// tested against the shared golden fixture. The Xưởng feature module owns
// mounting and event wiring.

import { escapeHtml } from "../md.js";

const CELL = 34;
const GAP = 3;
// Rendering every record in a long trace makes the workbench unusable even
// though the payload itself is bounded.  These are paint caps, not data caps:
// replay still addresses the complete trace on the backend.
const PAINT_CAP = Object.freeze({ sequence: 80, table: 100, events: 120, entities: 100 });

function windowed(items, cap, cursor = 0) {
  if (items.length <= cap) return { items, omitted: 0 };
  const start = Math.max(0, Math.min(items.length - cap, Math.floor(cursor) - Math.floor(cap / 2)));
  return { items: items.slice(start, start + cap), omitted: items.length - cap };
}

function windowNote(omitted, noun) {
  return omitted > 0 ? `<p class="xp-window-note">Chỉ vẽ phần đang xem; còn ${omitted} ${escapeHtml(noun)} trong lần chạy này.</p>` : "";
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function legendHtml(model) {
  if (!model.overlays.length) return "";
  return `<div class="xp-legend">${model.overlays.map((overlay) => `
    <span class="xp-legend-item" data-xp-overlay="${escapeHtml(overlay.kind)}">
      <i></i>${escapeHtml(overlay.label)}
    </span>`).join("")}</div>`;
}

// The head strip: which observation frame this is, and on which input. The
// base carries only its contract label — the recipe's `kind` is an internal
// enum and must never surface as text.
function baseBarHtml(model) {
  return `<div class="xp-basebar">
      <span class="xp-basebar-lead">Khung quan sát</span>
      <b class="xp-title">${escapeHtml(model.base.label)}</b>
      ${model.scenario.inputSummary ? `<span class="xp-basebar-input" title="${escapeHtml(model.scenario.inputSummary)}">${escapeHtml(model.scenario.inputSummary)}</span>` : ""}
    </div>`;
}

// The run's own outputs, kept on the surface instead of buried in the
// inspector: "what came out" is the first thing a student looks for. The text
// projection already IS its outputs, so it opts out rather than printing twice.
function outputLaneHtml(model) {
  if (!model.outputs.length) return "";
  return `<div class="xp-outputs" aria-label="Kết quả lần chạy">${model.outputs.map((output) => `
      <div class="xp-output" data-xp-output="${escapeHtml(output.id)}">
        <span class="xp-output-label">${escapeHtml(output.label)}</span>
        <b class="xp-output-value">${escapeHtml(String(output.value))}</b>
      </div>`).join("")}</div>`;
}

// Metrics as a persistent strip, not a collapsed detail. Every value here was
// measured by the run; nothing is derived, scaled or given a verdict colour —
// the contract carries no pass/fail flag per metric, so neither does this.
function metricsStripHtml(model) {
  if (!model.metrics.length) return "";
  return `<div class="xp-metrics" aria-label="Số đo lần chạy">${model.metrics.map((metric) => `
      <div class="xp-metric" data-xp-metric="${escapeHtml(metric.id)}">
        <span class="xp-metric-label">${escapeHtml(metric.label)}</span>
        <b class="xp-metric-value">${escapeHtml(String(metric.value))}${metric.unit ? `<i>${escapeHtml(metric.unit)}</i>` : ""}</b>
      </div>`).join("")}</div>`;
}

// A real cursor over real events. No auto-play, no percentage: the contract
// forbids inventing motion the run did not have.
function inputControlHtml(control) {
  const id = escapeHtml(control.id);
  const label = escapeHtml(control.label);
  if (control.type === "toggle") {
    return `<label class="xp-input"><input type="checkbox" data-xp-input="${id}"${control.value ? " checked" : ""}><span>${label}</span></label>`;
  }
  if (control.type === "number") {
    return `<label class="xp-input"><span>${label}</span><input type="number" data-xp-input="${id}" value="${escapeHtml(String(control.value))}"></label>`;
  }
  if (control.type === "select") {
    return `<label class="xp-input"><span>${label}</span><input type="text" data-xp-input="${id}" value="${escapeHtml(String(control.value))}"></label>`;
  }
  return "";
}

// Where the cursor currently stands, said in the trace's own words. The label
// belongs to the last event the cursor has reached — at position 0 no event has
// happened yet, and the strip says exactly that instead of naming one.
function cursorLabel(model) {
  const reached = model.events.filter((event) => event.index < model.cursor);
  if (!reached.length) return "Trước mốc đầu tiên";
  return reached[reached.length - 1].label;
}

function controlHtml(model) {
  if (model.control.kind === "none") return "";
  // A stepper walks the trace that already happened; the other packs change the
  // scenario and therefore need a fresh run. Different jobs, different widgets.
  if (model.control.kind === "stepper" || model.control.kind === "playback") {
    if (!model.totalEvents) return "";
    // The scrub addresses the same cursor as the stepper — one source of truth
    // for "where am I in the trace". It is a position control, not playback:
    // there is no play button, because the run has no timebase to play back at.
    return `<div class="xp-replay" data-xp-control="${escapeHtml(model.control.kind)}">
      <div class="xp-replay-head">
        <span class="xp-control-label">${escapeHtml(model.control.label)}</span>
        <b class="xp-cursor" data-xp-cursor>${model.cursor}/${model.totalEvents}</b>
      </div>
      <div class="xp-replay-row">
        <button type="button" class="xp-step" data-xp-step="prev" aria-label="Lùi một bước">◀</button>
        <input class="xp-scrub" type="range" data-xp-scrub min="0" max="${model.totalEvents}" step="1"
               value="${model.cursor}" aria-label="Vị trí trong diễn biến lần chạy">
        <button type="button" class="xp-step" data-xp-step="next" aria-label="Tiến một bước">▶</button>
      </div>
      <span class="xp-replay-at">${escapeHtml(cursorLabel(model))}</span>
    </div>`;
  }
  const inputs = model.control.controls.map(inputControlHtml).filter(Boolean).join("");
  if (!inputs) return "";
  return `<div class="xp-control" data-xp-control="${escapeHtml(model.control.kind)}">
      <span class="xp-control-label">${escapeHtml(model.control.label)}</span>
      ${inputs}
      <button type="button" class="btn btn-ghost btn-sm" data-xp-rerun>Chạy lại</button>
    </div>`;
}

// Behaviour errors live here and only here: each anchor is the click target
// that opens the exact symbol it came from.
function anchorListHtml(model) {
  if (!model.anchors.length) return "";
  // Two distinct jobs, so two distinct actions: open the code that produced the
  // failure, or rewind the trace to the moment it happened.
  return `<div class="xp-anchors">${model.anchors.map((anchor) => `
    <div class="xp-anchor-card" data-severity="${escapeHtml(anchor.severity)}">
      <p class="xp-anchor-title"><span class="xp-anchor-mark" aria-hidden="true">!</span>${escapeHtml(anchor.label)}</p>
      ${anchor.description ? `<p class="xp-anchor-detail">${escapeHtml(anchor.description)}</p>` : ""}
      <div class="xp-anchor-actions">
        <button type="button" class="xp-anchor" data-xp-anchor="${escapeHtml(anchor.id)}">
          <span class="xp-anchor-glyph" aria-hidden="true">&lt;/&gt;</span>Đi tới hàm
        </button>
        <button type="button" class="xp-anchor-replay" data-xp-anchor-replay="${escapeHtml(anchor.id)}" data-xp-event-index="${anchor.eventIndex}">
          <span class="xp-anchor-glyph" aria-hidden="true">▷</span>Phát lại từ đây
        </button>
      </div>
    </div>`).join("")}</div>`;
}

function truncationHtml(model) {
  if (!model.truncation) return "";
  return `<p class="xp-truncation">${escapeHtml(model.truncation.label)}</p>`;
}

// ---------------------------------------------------------------------------
// Overlay emphasis — data-driven, never algorithm-driven
// ---------------------------------------------------------------------------

// Overlay groups. Each is answered from the model's own structure — which
// entities events touched, which fields changed, which entities no event ever
// mentions, which relations exist — so the same code serves any domain.
const TOUCH_OVERLAYS = ["path", "frontier", "selection-range", "window", "interval", "partition", "heap"];
const CHANGE_OVERLAYS = ["diff", "compare", "frequency", "threshold", "heatmap", "resource-usage"];

function emphasis(model) {
  const kinds = new Set(model.overlays.map((o) => o.kind));
  const visible = model.events.filter((event) => event.index <= model.cursor);

  const anchored = new Set();
  if (kinds.has("error-anchor")) {
    for (const anchor of model.anchors) if (anchor.entityId) anchored.add(anchor.entityId);
  }

  const touched = new Set();
  if (TOUCH_OVERLAYS.some((kind) => kinds.has(kind))) {
    for (const event of visible) for (const id of event.entityIds) touched.add(id);
  }

  // "Changed" is a fact of the trace: a field carried a before→after pair.
  const changed = new Set();
  if (CHANGE_OVERLAYS.some((kind) => kinds.has(kind))) {
    for (const event of visible) {
      for (const field of event.changedFields) if (field.entityId) changed.add(field.entityId);
    }
  }

  // The target is whatever the latest visible event landed on.
  const target = new Set();
  if (kinds.has("target") && visible.length) {
    for (const id of visible[visible.length - 1].entityIds) target.add(id);
  }

  // A constraint is present in the world but outside every event: a wall, a
  // shelf, a fixed bound. Derived from absence, never from a state key name.
  const constraint = new Set();
  if (kinds.has("constraint")) {
    const participants = new Set();
    for (const event of model.events) for (const id of event.entityIds) participants.add(id);
    for (const entity of model.entities) if (!participants.has(entity.id)) constraint.add(entity.id);
  }

  // An anchor names the thing that failed. When that thing is a relation rather
  // than a node — a link, an edge, a dependency — the failure belongs on the
  // connector, not on the endpoints it happens to join.
  const anchoredRelations = new Set();
  for (const relation of model.relations) if (anchored.has(relation.id)) anchoredRelations.add(relation.id);

  // Relations the visible trace actually ran through, so a path reads as a path
  // instead of every edge lighting up at once.
  const travelled = new Set();
  if (TOUCH_OVERLAYS.some((kind) => kinds.has(kind))) {
    for (const relation of model.relations) {
      if (touched.has(relation.fromEntityId) && touched.has(relation.toEntityId)) travelled.add(relation.id);
    }
  }

  const relations = kinds.has("dependency") || kinds.has("compare");
  return { anchored, touched, changed, target, constraint, relations, anchoredRelations, travelled };
}

function entityClass(entity, marks) {
  const classes = ["xp-node"];
  if (marks.touched.has(entity.id)) classes.push("is-touched");
  if (marks.changed.has(entity.id)) classes.push("is-changed");
  if (marks.target.has(entity.id)) classes.push("is-target");
  if (marks.constraint.has(entity.id)) classes.push("is-constraint");
  if (marks.anchored.has(entity.id)) classes.push("is-anchored");
  const role = String(entity.state && entity.state.role || "");
  if (entity.state && (entity.state.start === true || role === "start" || role === "source")) classes.push("is-start");
  if (entity.state && (entity.state.target === true || role === "target")) classes.push("is-destination");
  if (entity.state && entity.state.blocked === true) classes.push("is-blocked");
  if (entity.state && entity.state.routeUsed === true) classes.push("is-route");
  return classes.join(" ");
}

function relationClass(marks, relation) {
  const classes = ["xp-edge"];
  if (marks.relations) classes.push("is-emphasized");
  if (relation && marks.travelled.has(relation.id)) classes.push("is-travelled");
  if (relation && marks.anchoredRelations.has(relation.id)) classes.push("is-anchored");
  return classes.join(" ");
}

// Edge/link/transition markup shares one modifier vocabulary so the same
// failure reads the same way on a graph, a tree and a state machine.
function linkModifiers(marks, relation) {
  let out = marks.relations ? " is-emphasized" : "";
  if (marks.travelled.has(relation.id)) out += " is-travelled";
  if (marks.anchoredRelations.has(relation.id)) out += " is-anchored";
  return out;
}

// Node captions. SVG cannot wrap text, so a long contract label is clipped to
// a readable stub — the full label stays reachable through the <title>.
function caption(label, max = 16) {
  const text = String(label || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ---------------------------------------------------------------------------
// Base projections
// ---------------------------------------------------------------------------

function positioned(model) {
  return model.entities.filter((e) => e.geometry);
}

function bounds(entities) {
  const xs = entities.map((e) => e.geometry.x);
  const ys = entities.map((e) => e.geometry.y);
  return {
    minX: Math.min(0, ...xs), maxX: Math.max(0, ...xs),
    minY: Math.min(0, ...ys), maxY: Math.max(0, ...ys),
  };
}

function renderGrid(model) {
  const cells = positioned(model);
  if (!cells.length) return null;
  const axis = 18;
  const marks = emphasis(model);
  const b = bounds(cells);
  const cols = b.maxX - b.minX + 1;
  const rows = b.maxY - b.minY + 1;
  const width = axis + cols * (CELL + GAP) + GAP;
  const height = axis + rows * (CELL + GAP) + GAP;
  const byPos = new Map(cells.map((e) => [`${e.geometry.x},${e.geometry.y}`, e]));

  const center = (entity) => ({
    x: axis + GAP + (entity.geometry.x - b.minX) * (CELL + GAP) + CELL / 2,
    y: axis + GAP + (entity.geometry.y - b.minY) * (CELL + GAP) + CELL / 2,
  });
  const byId = new Map(cells.map((entity) => [entity.id, entity]));
  const links = model.relations.map((relation) => {
    const from = byId.get(relation.fromEntityId);
    const to = byId.get(relation.toEntityId);
    if (!from || !to) return "";
    const a = center(from);
    const z = center(to);
    return `<g class="${relationClass(marks, relation)} xp-grid-route" data-xp-relation="${escapeHtml(relation.id)}">
      <line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}"></line>
      <title>${escapeHtml(relation.label || "")}</title>
    </g>`;
  }).join("");
  const rects = [];
  for (let y = b.minY; y <= b.maxY; y += 1) {
    for (let x = b.minX; x <= b.maxX; x += 1) {
      const entity = byPos.get(`${x},${y}`);
      const px = axis + GAP + (x - b.minX) * (CELL + GAP);
      const py = axis + GAP + (y - b.minY) * (CELL + GAP);
      if (!entity) {
        rects.push(`<rect class="xp-cell is-empty" x="${px}" y="${py}" width="${CELL}" height="${CELL}" rx="4"></rect>`);
        continue;
      }
      const role = String(entity.state && entity.state.role || "");
      const explicitBadge = entity.state && typeof entity.state.badge === "string"
        ? String(entity.state.badge).slice(0, 2)
        : "";
      const badge = entity.state && entity.state.blocked === true
        ? "×"
        : explicitBadge
          ? explicitBadge
        : entity.state && (entity.state.start === true || role === "start" || role === "source")
          ? "S"
          : entity.state && (entity.state.target === true || role === "target")
            ? "Đ"
            : "";
      const numericState = entity.stateLabels.find((field) =>
        typeof field.value === "number" && Number.isFinite(field.value));
      rects.push(`<g class="${entityClass(entity, marks)}" data-xp-entity="${escapeHtml(entity.id)}">
        <rect class="xp-cell" x="${px}" y="${py}" width="${CELL}" height="${CELL}" rx="4"></rect>
        ${badge ? `<text class="xp-cell-badge" x="${px + CELL / 2}" y="${py + CELL / 2 + 4}" text-anchor="middle">${badge}</text>` : ""}
        ${!badge && numericState ? `<text class="xp-cell-value" x="${px + CELL / 2}" y="${py + CELL / 2 + 3}" text-anchor="middle">${escapeHtml(String(numericState.value))}</text>` : ""}
        <title>${escapeHtml(entity.display.label)}</title>
      </g>`);
    }
  }
  const axes = [];
  for (let x = b.minX; x <= b.maxX; x += 1) {
    const px = axis + GAP + (x - b.minX) * (CELL + GAP) + CELL / 2;
    axes.push(`<text class="xp-grid-axis" x="${px}" y="${axis - 4}" text-anchor="middle">${x}</text>`);
  }
  for (let y = b.minY; y <= b.maxY; y += 1) {
    const py = axis + GAP + (y - b.minY) * (CELL + GAP) + CELL / 2 + 3;
    axes.push(`<text class="xp-grid-axis" x="${axis - 5}" y="${py}" text-anchor="end">${y}</text>`);
  }
  return `<svg class="xp-canvas" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(model.base.label)}">${links}${rects.join("")}${axes.join("")}</svg>`;
}

function renderGraph(model) {
  const nodes = positioned(model);
  if (!nodes.length) return null;
  const marks = emphasis(model);
  const b = bounds(nodes);
  const step = CELL * 2.6;
  const pad = CELL;
  const width = (b.maxX - b.minX) * step + pad * 2;
  const height = (b.maxY - b.minY) * step + pad * 2;
  const at = (entity) => ({
    cx: pad + (entity.geometry.x - b.minX) * step,
    cy: pad + (entity.geometry.y - b.minY) * step,
  });
  const byId = new Map(nodes.map((e) => [e.id, e]));

  const edges = model.relations.map((relation) => {
    const from = byId.get(relation.fromEntityId);
    const to = byId.get(relation.toEntityId);
    if (!from || !to) return "";
    const a = at(from);
    const c = at(to);
    // The edge caption sits on the midpoint of its own line, so a relation that
    // carries a cost or a state shows it instead of hiding it in a tooltip.
    return `<g class="${relationClass(marks, relation)}" data-xp-relation="${escapeHtml(relation.id)}">
      <line x1="${a.cx}" y1="${a.cy}" x2="${c.cx}" y2="${c.cy}"></line>
      ${relation.label ? `<text class="xp-edge-caption" x="${(a.cx + c.cx) / 2}" y="${(a.cy + c.cy) / 2 - 7}" text-anchor="middle">${escapeHtml(caption(relation.label, 18))}</text>` : ""}
      <title>${escapeHtml(relation.label || "")}</title>
    </g>`;
  }).join("");

  const circles = nodes.map((entity) => {
    const p = at(entity);
    const nodeName = String(entity.display.label || "").split(/[·–—]/)[0].trim();
    return `<g class="${entityClass(entity, marks)}" data-xp-entity="${escapeHtml(entity.id)}">
      <circle cx="${p.cx}" cy="${p.cy}" r="${CELL / 2}"></circle>
      <text class="xp-node-name" x="${p.cx}" y="${p.cy + 4}" text-anchor="middle">${escapeHtml(caption(nodeName, 3))}</text>
      <text class="xp-node-caption" x="${p.cx}" y="${p.cy + CELL / 2 + 14}" text-anchor="middle">${escapeHtml(caption(entity.display.label))}</text>
      <title>${escapeHtml(entity.display.label)}</title>
    </g>`;
  }).join("");

  return `<svg class="xp-canvas" width="${width}" height="${height + 18}" viewBox="0 0 ${width} ${height + 18}" role="img" aria-label="${escapeHtml(model.base.label)}">${edges}${circles}</svg>`;
}

// These three bases intentionally do not alias graph/grid.  They may share
// ObservableModel geometry, but each answers a different visual question:
// hierarchy, spatial position, and allowed state transitions.
function renderTree(model) {
  const nodes = positioned(model);
  if (!nodes.length) return null;
  const marks = emphasis(model);
  const b = bounds(nodes);
  const stepX = CELL * 2.4;
  const stepY = CELL * 2.2;
  const pad = CELL;
  const width = (b.maxX - b.minX) * stepX + pad * 2 + CELL;
  const height = (b.maxY - b.minY) * stepY + pad * 2 + CELL;
  const at = (entity) => ({ x: pad + (entity.geometry.x - b.minX) * stepX, y: pad + (entity.geometry.y - b.minY) * stepY });
  const byId = new Map(nodes.map((e) => [e.id, e]));
  const links = model.relations.map((relation) => {
    const from = byId.get(relation.fromEntityId); const to = byId.get(relation.toEntityId);
    if (!from || !to) return "";
    const a = at(from); const z = at(to);
    return `<line class="xp-tree-link${linkModifiers(marks, relation)}" x1="${a.x + CELL / 2}" y1="${a.y + CELL}" x2="${z.x + CELL / 2}" y2="${z.y}" data-xp-relation="${escapeHtml(relation.id)}"></line>`;
  }).join("");
  const boxes = nodes.map((entity) => {
    const p = at(entity);
    return `<g class="${entityClass(entity, marks)} xp-tree-node" data-xp-tree-node="${escapeHtml(entity.id)}" data-xp-entity="${escapeHtml(entity.id)}">
      <rect class="xp-cell" x="${p.x}" y="${p.y}" width="${CELL}" height="${CELL}" rx="5"></rect><title>${escapeHtml(entity.display.label)}</title>
    </g>`;
  }).join("");
  return `<svg class="xp-canvas xp-tree-canvas" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(model.base.label)}">${links}${boxes}</svg>`;
}

function renderGeometry(model) {
  const points = positioned(model);
  if (!points.length) return null;
  const marks = emphasis(model);
  const b = bounds(points);
  const step = CELL * 2.2;
  const pad = CELL;
  const width = (b.maxX - b.minX) * step + pad * 2 + CELL;
  const height = (b.maxY - b.minY) * step + pad * 2 + CELL;
  const at = (entity) => ({ x: pad + (entity.geometry.x - b.minX) * step, y: pad + (entity.geometry.y - b.minY) * step });
  const byId = new Map(points.map((e) => [e.id, e]));
  const segments = model.relations.map((relation) => {
    const from = byId.get(relation.fromEntityId); const to = byId.get(relation.toEntityId);
    if (!from || !to) return "";
    const a = at(from); const z = at(to);
    return `<line class="xp-geometry-segment${linkModifiers(marks, relation)}" x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" data-xp-relation="${escapeHtml(relation.id)}"></line>`;
  }).join("");
  const dots = points.map((entity) => {
    const p = at(entity);
    return `<g class="${entityClass(entity, marks)} xp-geometry-point" data-xp-geometry-point="${escapeHtml(entity.id)}" data-xp-entity="${escapeHtml(entity.id)}">
      <circle cx="${p.x}" cy="${p.y}" r="${CELL / 4}"></circle><title>${escapeHtml(entity.display.label)}</title>
    </g>`;
  }).join("");
  return `<svg class="xp-canvas xp-geometry-canvas" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(model.base.label)}">${segments}${dots}</svg>`;
}

function renderStateMachine(model) {
  const states = positioned(model);
  if (!states.length) return null;
  const marks = emphasis(model);
  const b = bounds(states);
  const step = CELL * 2.8;
  const pad = CELL;
  const width = (b.maxX - b.minX) * step + pad * 2 + CELL;
  const height = (b.maxY - b.minY) * step + pad * 2 + CELL;
  const at = (entity) => ({ x: pad + (entity.geometry.x - b.minX) * step, y: pad + (entity.geometry.y - b.minY) * step });
  const byId = new Map(states.map((e) => [e.id, e]));
  const arrows = model.relations.map((relation) => {
    const from = byId.get(relation.fromEntityId); const to = byId.get(relation.toEntityId);
    if (!from || !to) return "";
    const a = at(from); const z = at(to);
    return `<line class="xp-state-arrow${linkModifiers(marks, relation)}" x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" marker-end="url(#xp-state-arrowhead)" data-xp-relation="${escapeHtml(relation.id)}"></line>`;
  }).join("");
  const bubbles = states.map((entity) => {
    const p = at(entity);
    return `<g class="${entityClass(entity, marks)} xp-state-node" data-xp-state="${escapeHtml(entity.id)}" data-xp-entity="${escapeHtml(entity.id)}">
      <circle cx="${p.x}" cy="${p.y}" r="${CELL / 2}"></circle>
      <text class="xp-node-caption" x="${p.x}" y="${p.y + CELL / 2 + 14}" text-anchor="middle">${escapeHtml(caption(entity.display.label))}</text>
      <title>${escapeHtml(entity.display.label)}</title>
    </g>`;
  }).join("");
  return `<svg class="xp-canvas xp-state-canvas" width="${width}" height="${height + 18}" viewBox="0 0 ${width} ${height + 18}" role="img" aria-label="${escapeHtml(model.base.label)}">
    <defs><marker id="xp-state-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z"></path></marker></defs>${arrows}${bubbles}</svg>`;
}

// The remaining projections are deliberately data-shaped, not algorithm-shaped.
// A scenario that has no geometry can still show its observable state without
// inventing a domain-specific animation.  They all consume the same entity /
// event / metric model as grid and graph.
function labeledState(entity) {
  if (!entity.stateLabels.length) return "";
  return `<dl class="xp-kv">${entity.stateLabels.slice(0, 8).map((field) =>
    `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(String(field.value))}</dd></div>`).join("")}</dl>`;
}

// Ordered strip: a sequence is DRAWN, not listed. Proving the model on a
// vertical list would be exactly the shortcut README §4 (#20) forbids.
function renderSequence(model) {
  const ordered = model.entities.slice().sort((a, b) => {
    const ax = a.geometry ? a.geometry.x : Number.MAX_SAFE_INTEGER;
    const bx = b.geometry ? b.geometry.x : Number.MAX_SAFE_INTEGER;
    return ax - bx;
  });
  const clipped = windowed(ordered, PAINT_CAP.sequence, model.cursor);
  const items = clipped.items;
  if (!items.length) return null;
  const marks = emphasis(model);
  const slot = 124;
  const laneY = 28;                       // room above for the span bracket
  const wrapped = items.length > 4 && items.length <= 9;
  const columns = wrapped ? Math.min(3, items.length) : items.length;
  const rows = Math.ceil(items.length / columns);
  const rowStride = CELL + 44;
  const width = columns * (slot + GAP) + GAP;
  const height = laneY + rows * rowStride;

  // A span overlay (window / interval / partition / selection-range) states that
  // a contiguous run of the sequence is "in scope right now". The extent is the
  // span of slots the visible events actually touched — the trace's own answer,
  // never a guessed constant. With nothing touched there is no bracket.
  const spanOverlay = model.overlays.find((overlay) =>
    ["window", "interval", "partition", "selection-range"].includes(overlay.kind));
  let bracket = "";
  if (spanOverlay) {
    let labelled = false;
    const bands = [];
    for (let row = 0; row < rows; row += 1) {
      const start = row * columns;
      const end = Math.min(items.length, start + columns);
      const hit = [];
      for (let index = start; index < end; index += 1) {
        if (marks.touched.has(items[index].id)) hit.push(index - start);
      }
      if (!hit.length) continue;
      const from = GAP + Math.min(...hit) * (slot + GAP);
      const to = GAP + Math.max(...hit) * (slot + GAP) + slot;
      const y = laneY + row * rowStride;
      bands.push(`<g class="xp-span" data-xp-span="${escapeHtml(spanOverlay.kind)}">
        <rect class="xp-span-band" x="${from}" y="${y - 6}" width="${to - from}" height="${CELL + 12}" rx="5"></rect>
        <line class="xp-span-rule" x1="${from}" y1="${y - 12}" x2="${to}" y2="${y - 12}"></line>
        ${labelled ? "" : `<text class="xp-span-label" x="${from + 3}" y="${y - 16}">${escapeHtml(spanOverlay.label)}</text>`}
      </g>`);
      labelled = true;
    }
    bracket = bands.join("");
  }

  const cells = items.map((entity, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = GAP + column * (slot + GAP);
    const y = laneY + row * rowStride;
    return `<g class="${entityClass(entity, marks)}" data-xp-seq-slot="${escapeHtml(entity.id)}" data-xp-entity="${escapeHtml(entity.id)}">
      <rect class="xp-cell" x="${x}" y="${y}" width="${slot}" height="${CELL}" rx="4"></rect>
      <text class="xp-slot-caption" x="${x + slot / 2}" y="${y + CELL / 2 + 4}" text-anchor="middle">${escapeHtml(caption(entity.display.label, 17))}</text>
      <text class="xp-slot-index" x="${x + slot / 2}" y="${y + CELL + 15}" text-anchor="middle">${index + 1}</text>
      <title>${escapeHtml(entity.display.label)}</title>
    </g>`;
  }).join("");
  return `<div class="xp-windowed${wrapped ? " is-wrapped" : ""}"><svg class="xp-canvas" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(model.base.label)}">${bracket}${cells}</svg>${windowNote(clipped.omitted, "phần tử")}</div>`;
}

// Columns come from the trace's own field labels. A state field with no
// contract label gets no column — its raw key must never become a header.
function renderTable(model) {
  if (!model.entities.length) return null;
  const clipped = windowed(model.entities, PAINT_CAP.table, model.cursor);
  const entities = clipped.items;
  const marks = emphasis(model);
  const columns = [];
  const seen = new Set();
  for (const entity of entities) {
    for (const field of entity.stateLabels) {
      if (!seen.has(field.label)) { seen.add(field.label); columns.push(field.label); }
    }
  }
  const head = `<tr><th scope="col">Đối tượng</th>${columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join("")}</tr>`;
  const rows = entities.map((entity) => {
    const byLabel = new Map(entity.stateLabels.map((f) => [f.label, f.value]));
    const cls = entityClass(entity, marks).replace("xp-node", "").trim();
    return `<tr class="${cls}" data-xp-entity="${escapeHtml(entity.id)}">
      <th scope="row">${escapeHtml(entity.display.label)}</th>
      ${columns.map((c) => `<td>${byLabel.has(c) ? escapeHtml(String(byLabel.get(c))) : "—"}</td>`).join("")}
    </tr>`;
  }).join("");
  return `<div class="xp-windowed"><div class="xp-table-wrap"><table class="xp-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>${windowNote(clipped.omitted, "dòng")}</div>`;
}

function renderTimeline(model) {
  if (!model.events.length) return null;
  const clipped = windowed(model.events, PAINT_CAP.events, model.cursor);
  const events = clipped.items;
  const anchored = new Set(model.anchors.map((a) => a.eventIndex));
  return `<div class="xp-windowed"><ol class="xp-timeline" aria-label="${escapeHtml(model.base.label)}">${events.map((event) => `
    <li class="xp-tick${event.index <= model.cursor ? " is-done" : ""}${anchored.has(event.index) ? " is-anchored" : ""}"
        data-xp-tick="${event.index}" data-xp-event="${event.index}">
      <span class="xp-tick-dot" aria-hidden="true"></span>
      <span class="xp-tick-body">
        <b>${escapeHtml(event.label)}</b>
        ${event.changedFields.length ? `<span class="xp-changes">${event.changedFields.map((f) =>
          `${escapeHtml(f.label)}: ${escapeHtml(String(f.before))} → ${escapeHtml(String(f.after))}`).join(" · ")}</span>` : ""}
      </span>
    </li>`).join("")}</ol>${windowNote(clipped.omitted, "mốc diễn biến")}</div>`;
}

function numericMetrics(model) {
  return model.metrics.filter((metric) => quantity(metric.value) !== null);
}

// Strictly a quantity. `Number()` happily turns true into 1, null into 0 and ""
// into 0 — charting any of those would draw a bar for a fact that carries no
// magnitude, and print a "from 0" that the run never measured.
function quantity(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

// The value a bar carries, and — when the trace changed it — the value it
// carried before. Both come from the model: the current one from a labelled
// state field, the previous one from the changedField that moved it. The ghost
// shows the value held at the START of the visible window, so scrubbing back
// shortens the comparison instead of rewriting it.
function barSeries(model) {
  const previous = new Map();
  for (const event of model.events) {
    if (event.index > model.cursor) continue;
    for (const field of event.changedFields) {
      if (!field.entityId || previous.has(field.entityId)) continue;
      const before = quantity(field.before);
      if (before !== null && quantity(field.after) !== null) previous.set(field.entityId, before);
    }
  }
  return model.entities.map((entity) => {
    const numeric = entity.stateLabels.find((field) => quantity(field.value) !== null);
    if (!numeric) return null;
    return {
      id: entity.id,
      label: entity.display.label,
      series: numeric.label,
      value: quantity(numeric.value),
      before: previous.has(entity.id) ? previous.get(entity.id) : null,
    };
  }).filter(Boolean);
}

function renderChart(model) {
  const series = barSeries(model);
  const bars = numericMetrics(model);
  if (!series.length && !bars.length) return null;
  const marks = emphasis(model);
  const scale = Math.max(1, ...series.map((bar) => Math.abs(bar.value)), ...series.map((bar) => Math.abs(bar.before || 0)));
  const pct = (value, max) => Math.max(2, Math.round(Math.abs(Number(value)) / max * 100));

  // Entity bars first: they are the thing being balanced. A bar whose value the
  // trace moved keeps a ghost at its old height, so "what changed" is visible
  // without reading a single number.
  const entityBars = series.length ? `<div class="xp-chart" aria-label="${escapeHtml(model.base.label)}">${series.map((bar) => `
    <div class="xp-bar-row ${entityClass({ id: bar.id }, marks).replace("xp-node", "").trim()}" data-xp-entity-bar="${escapeHtml(bar.id)}" data-xp-entity="${escapeHtml(bar.id)}">
      <span class="xp-bar-label" title="${escapeHtml(bar.series)}">${escapeHtml(bar.label)}</span>
      <span class="xp-bar-track">
        ${bar.before === null ? "" : `<u class="xp-bar-ghost" style="width:${pct(bar.before, scale)}%"></u>`}
        <i style="width:${pct(bar.value, scale)}%"></i>
      </span>
      <b class="xp-bar-value">${escapeHtml(String(bar.value))}${bar.before === null ? "" : `<em class="xp-bar-delta">từ ${escapeHtml(String(bar.before))}</em>`}</b>
    </div>`).join("")}</div>` : "";

  const max = Math.max(1, ...bars.map((metric) => Math.abs(Number(metric.value))));
  const metricBars = bars.length ? `<div class="xp-chart xp-chart-metrics" aria-label="${escapeHtml(model.base.label)}">${bars.map((metric) => `
    <div class="xp-bar-row" data-xp-bar="${escapeHtml(metric.id)}">
      <span class="xp-bar-label">${escapeHtml(metric.label)}</span>
      <span class="xp-bar-track"><i style="width:${pct(metric.value, max)}%"></i></span>
      <b class="xp-bar-value">${escapeHtml(String(metric.value))}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}</b>
    </div>`).join("")}</div>` : "";

  return `${entityBars}${metricBars}`;
}

// A resource meter reads "how much of what is being used", which is a different
// question from the chart's "compare these numbers" — so it is its own shape.
function renderResource(model) {
  const meters = numericMetrics(model);
  if (!meters.length) return null;
  const max = Math.max(1, ...meters.map((metric) => Math.abs(Number(metric.value))));
  return `<div class="xp-meters" aria-label="${escapeHtml(model.base.label)}">${meters.map((metric) => `
    <div class="xp-meter" data-xp-meter="${escapeHtml(metric.id)}">
      <span class="xp-meter-head"><span>${escapeHtml(metric.label)}</span><b>${escapeHtml(String(metric.value))}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}</b></span>
      <span class="xp-meter-track"><i style="width:${Math.max(2, Math.round(Math.abs(Number(metric.value)) / max * 100))}%"></i></span>
    </div>`).join("")}</div>`;
}

// A text base is a stream of lines that the run reads and rewrites. Each row is
// one entity: its contract label, whatever labelled state it carries, and the
// before→after pair if the visible trace rewrote it. The gutter is the row's
// position in the stream, not a file line number the model never promised.
function renderText(model) {
  const marks = emphasis(model);
  const rewrites = new Map();
  for (const event of model.events) {
    if (event.index > model.cursor) continue;
    for (const field of event.changedFields) {
      if (!field.entityId) continue;
      const list = rewrites.get(field.entityId) || [];
      list.push(field);
      rewrites.set(field.entityId, list);
    }
  }

  const clipped = windowed(model.entities, PAINT_CAP.table, model.cursor);
  const stream = clipped.items.length ? `<div class="xp-stream" aria-label="${escapeHtml(model.base.label)}">${clipped.items.map((entity, index) => {
    const changes = rewrites.get(entity.id) || [];
    const cls = entityClass(entity, marks).replace("xp-node", "").trim();
    return `<div class="xp-stream-row ${cls}" data-xp-stream-row="${escapeHtml(entity.id)}" data-xp-entity="${escapeHtml(entity.id)}">
      <span class="xp-stream-gutter" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <div class="xp-stream-body">
        <b class="xp-stream-label">${escapeHtml(entity.display.label)}</b>
        ${entity.stateLabels.length ? `<span class="xp-stream-state">${entity.stateLabels.slice(0, 4).map((field) =>
          `<span><i>${escapeHtml(field.label)}</i>${escapeHtml(String(field.value))}</span>`).join("")}</span>` : ""}
        ${changes.map((field) => `<span class="xp-stream-diff">
          <i>${escapeHtml(field.label)}</i>
          <del>${escapeHtml(String(field.before))}</del>
          <span class="xp-stream-arrow" aria-hidden="true">→</span>
          <ins>${escapeHtml(String(field.after))}</ins>
        </span>`).join("")}
      </div>
      ${marks.anchored.has(entity.id) ? `<span class="xp-stream-flag">lỗi</span>` : ""}
    </div>`;
  }).join("")}${windowNote(clipped.omitted, "dòng")}</div>` : "";

  const blocks = model.outputs.length ? `<div class="xp-texts">${model.outputs.map((output) => `
    <section class="xp-text-block" data-xp-text="${escapeHtml(output.id)}">
      <h4>${escapeHtml(output.label)}</h4>
      <pre>${escapeHtml(String(output.value))}</pre>
    </section>`).join("")}</div>` : "";

  if (!stream && !blocks) return null;
  return `${stream}${blocks}`;
}

// An "exchange" is whatever the model says talks to what — a relation between
// two entities. No HTTP vocabulary is invented on top of it.
function renderExchanges(model) {
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  const rows = model.relations.map((relation) => {
    const from = byId.get(relation.fromEntityId);
    const to = byId.get(relation.toEntityId);
    if (!from || !to) return "";
    return `<div class="xp-exchange" data-xp-exchange="${escapeHtml(relation.id)}">
      <span class="xp-exchange-side">${escapeHtml(from.display.label)}</span>
      <span class="xp-exchange-arrow" aria-hidden="true">→</span>
      <span class="xp-exchange-side">${escapeHtml(to.display.label)}</span>
      ${relation.label ? `<span class="xp-exchange-note">${escapeHtml(relation.label)}</span>` : ""}
    </div>`;
  }).filter(Boolean).join("");
  return rows ? `<div class="xp-exchanges">${rows}</div>` : null;
}

// The Universal Inspector is a first-class projection, not a consolation prize:
// real entities, real labelled state, real events, real outputs. It is also the
// body used by any base whose dedicated projection is not drawn yet — the data
// shown is identical and honest, so nothing is labelled a tier or a fallback.
function renderInspectorBody(model) {
  const sections = [];

  if (model.outputs.length) {
    sections.push(`<section class="xp-sec"><h4>Kết quả</h4><dl class="xp-kv">${model.outputs.map((output) => `
      <div><dt>${escapeHtml(output.label)}</dt><dd>${escapeHtml(String(output.value))}</dd></div>`).join("")}</dl></section>`);
  }

  if (model.metrics.length) {
    sections.push(`<section class="xp-sec"><h4>Số đo</h4><dl class="xp-kv">${model.metrics.map((metric) => `
      <div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(String(metric.value))}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}</dd></div>`).join("")}</dl></section>`);
  }

  if (model.entities.length) {
    const clipped = windowed(model.entities, PAINT_CAP.entities, model.cursor);
    sections.push(`<section class="xp-sec"><h4>Đối tượng</h4><div class="xp-entities">${clipped.items.map((entity) => `
      <div class="xp-entity" data-xp-entity-row="${escapeHtml(entity.id)}">
        <b>${escapeHtml(entity.display.label)}</b>
        ${entity.stateLabels.length ? `<dl class="xp-kv">${entity.stateLabels.map((field) => `
          <div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(String(field.value))}</dd></div>`).join("")}</dl>` : ""}
      </div>`).join("")}</div>${windowNote(clipped.omitted, "đối tượng")}</section>`);
  }

  if (model.events.length) {
    const clipped = windowed(model.events, PAINT_CAP.events, model.cursor);
    sections.push(`<section class="xp-sec"><h4>Diễn biến</h4><ol class="xp-events">${clipped.items.map((event) => `
      <li class="xp-event${event.index <= model.cursor ? " is-done" : ""}" data-xp-event="${event.index}">
        <b>${escapeHtml(event.label)}</b>
        ${event.changedFields.length ? `<span class="xp-changes">${event.changedFields.map((field) => `
          ${escapeHtml(field.label)}: ${escapeHtml(String(field.before))} → ${escapeHtml(String(field.after))}`).join(" · ")}</span>` : ""}
      </li>`).join("")}</ol>${windowNote(clipped.omitted, "mốc diễn biến")}</section>`);
  }

  return `<div class="xp-inspector">${sections.join("")}</div>`;
}

const BASE_RENDERERS = {
  grid: renderGrid,
  geometry: renderGeometry,
  graph: renderGraph,
  tree: renderTree,
  "state-machine": renderStateMachine,
  sequence: renderSequence,
  table: renderTable,
  timeline: renderTimeline,
  chart: renderChart,
  text: renderText,
  "request-response": renderExchanges,
  "runtime-resource": renderResource,
};

// ---------------------------------------------------------------------------
// Empty / failure states
// ---------------------------------------------------------------------------

// An empty panel still keeps the surface's rhythm: the same frame, the same
// three bands, the stage held open at the height a drawing will occupy. The
// bands are inert placeholders — they promise a shape, never a value — so the
// panel reads as "waiting" instead of collapsing to a weak line of text.
function emptyShell(state, inner) {
  return `<div class="xp-surface is-empty" data-xp-base="none" data-xp-state="${escapeHtml(state)}">
    <header class="xp-head">
      <div class="xp-basebar">
        <span class="xp-basebar-lead">Khung quan sát</span>
        <b class="xp-title">Chưa có gì để quan sát</b>
      </div>
    </header>
    <div class="xp-stage xp-stage-idle" aria-hidden="true">
      <div class="xp-skeleton"><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="xp-empty" data-xp-state="${escapeHtml(state)}">${inner}</div>
  </div>`;
}

function emptyHtml(model) {
  const build = model.build || { diagnostics: [] };
  if (model.reason === "build-failed") {
    return emptyShell("build-failed", `
      <b>${escapeHtml(build.label || "Chưa chạy được")}</b>
      <p>Sửa lỗi dưới đây rồi chạy lại — chưa có hành vi nào để quan sát.</p>
      ${build.diagnostics.length ? `<ul class="xp-diags">${build.diagnostics.map((d) => `
        <li data-severity="${escapeHtml(d.severity)}">${escapeHtml(d.message)}</li>`).join("")}</ul>` : ""}`);
  }
  if (model.reason === "invalid-recipe" || model.reason === "no-observable") {
    return emptyShell(model.reason, `
      <b>Chưa dựng được khung quan sát cho lần chạy này</b>
      ${model.problems.length ? `<ul class="xp-diags">${model.problems.map((p) => `<li>${escapeHtml(p.message)}</li>`).join("")}</ul>` : ""}`);
  }
  return emptyShell("no-run", `
    <b>Chưa chạy lần nào</b>
    <p>Bấm <b>Chạy build</b> để xem Bản của em với tình huống hiện tại.</p>`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderPreview(model) {
  if (!model || !model.available) return emptyHtml(model || { reason: "no-run", problems: [] });

  // A projection returns null when the run gave it nothing to draw (a grid with
  // no positioned cells, a chart with no numbers). The Universal Inspector then
  // IS the projection — shown once, in the body, never duplicated into a panel
  // underneath itself, and never labelled a fallback.
  const renderBase = BASE_RENDERERS[model.base.kind];
  const drawn = renderBase ? renderBase(model) : null;
  const canvas = drawn || renderInspectorBody(model);
  const needsInspectorPanel = Boolean(drawn);

  // Two projections already ARE their numbers — bars and meters read the same
  // metrics the strip would. They opt out so the panel never says a value twice.
  const stripOwnedByStage = ["chart", "runtime-resource"].includes(model.base.kind);
  // Likewise the text projection ends in its own output blocks.
  const laneOwnedByStage = model.base.kind === "text";

  return `<div class="xp-surface" data-xp-base="${escapeHtml(model.base.kind)}" data-xp-layout="${escapeHtml(model.layout.kind)}">
    <header class="xp-head">
      ${baseBarHtml(model)}
      <span class="xp-scenario">${escapeHtml(model.scenario.label)}</span>
    </header>
    ${legendHtml(model)}
    <div class="xp-stage">${canvas}</div>
    ${truncationHtml(model)}
    ${laneOwnedByStage ? "" : outputLaneHtml(model)}
    ${anchorListHtml(model)}
    ${controlHtml(model)}
    ${stripOwnedByStage ? "" : metricsStripHtml(model)}
    ${needsInspectorPanel ? `<details class="xp-inspector-panel"><summary>${escapeHtml(model.inspector.label)}</summary>${renderInspectorBody(model)}</details>` : ""}
  </div>`;
}
