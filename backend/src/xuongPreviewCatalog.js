"use strict";

// Preview combination catalog.
//
// The grammar in xuongContract.js says which PreviewRecipes are *legal*.
// Legality alone is worthless: `chart + heatmap` is legal against a model that
// carries no numbers, and it would render an empty legend chip over an empty
// stage.  This module adds the second gate the product actually needs —
// EVIDENCE — and enumerates only the recipes an ObservableModel can honestly
// support.
//
//   legal recipe            = contract says base/overlay/control are compatible
//   supported recipe        = every overlay reads data this model really has
//   catalogued combination  = supported recipe, canonicalised, deduplicated,
//                             and bound to the exact observable that proves it
//
// Nothing here invents data.  If a model has no changed fields there is no
// `diff` combination for it, and the catalog simply gets smaller.

const {
  COMPATIBILITY, OVERLAY_ORDER, validateAndCanonicalizeRecipe, stableRecipeKey,
} = require("./xuongContract");

const BASES = Object.keys(COMPATIBILITY);
const LAYOUTS = ["focus", "balanced", "wide"];

const RESOURCE_RE = /memory|cpu|resource|bộ nhớ|tài nguyên|băng thông|bandwidth|quota/i;

// --- small readers ----------------------------------------------------------

const list = (value) => (Array.isArray(value) ? value : []);
const stateOf = (entity) => (entity && entity.state && typeof entity.state === "object" ? entity.state : {});
const labelOf = (item) => String((item && item.display && item.display.label) || "");
const numeric = (value) => typeof value === "number" && Number.isFinite(value);

function anyState(observable, predicate) {
  return list(observable.entities).some((entity) => predicate(stateOf(entity), entity));
}

function changedFields(observable) {
  return list(observable.events).flatMap((event) => list(event.changedFields));
}

function participants(observable) {
  const ids = new Set();
  for (const event of list(observable.events)) for (const id of list(event.entityIds)) ids.add(id);
  return ids;
}

// --- overlay evidence -------------------------------------------------------
//
// Each predicate mirrors what the renderer's `emphasis()` and the base
// projections actually read.  An overlay is admitted only when the model gives
// that code something to mark.

const EVIDENCE = {
  // A failure the run really produced, anchored to a source symbol.
  "error-anchor": (m) => list(m.anchors).length > 0,

  // Something the trace lands on: an explicit target role, or a final event
  // that names the entities it reached.
  target: (m) => anyState(m, (state, entity) => state.target === true
      || /target|destination|đích|nhận/i.test(`${state.role || ""} ${entity.kind || ""} ${labelOf(entity)}`))
    || list(m.events).slice(-1).some((event) => list(event.entityIds).length > 0),

  // A route only reads as a route when consecutive events walk connected
  // entities, so `path` needs both relations and a trace that touches them.
  path: (m) => list(m.relations).length > 0 && list(m.events).some((event) => list(event.entityIds).length >= 1),

  // A frontier is a wave: at least one event that touches several entities at
  // once, plus more entities than that event names.
  frontier: (m) => list(m.events).some((event) => list(event.entityIds).length >= 2)
    && list(m.entities).length > 2,

  // Something is in or out of scope right now.
  window: (m) => anyState(m, (state) => Object.hasOwn(state, "active") || Object.hasOwn(state, "inWindow"))
    || list(m.controls).some((control) => /window|cửa sổ/i.test(`${control.id || ""} ${labelOf(control)}`)),

  // Entities carry a group/bucket/shard identity to split the stage by.
  partition: (m) => anyState(m, (state) => Object.hasOwn(state, "group")
    || Object.hasOwn(state, "partition") || Object.hasOwn(state, "bucket") || Object.hasOwn(state, "shard")),

  // An ordering that is not the render order: priority, rank, order key.
  heap: (m) => anyState(m, (state) => numeric(state.priority) || numeric(state.rank) || numeric(state.order)),

  // A line to compare values against — a stated limit, budget or expectation.
  threshold: (m) => list(m.metrics).some((metric) => /giới hạn|ngưỡng|cần|mục tiêu|limit|budget|expected|target/i.test(`${metric.id || ""} ${labelOf(metric)}`))
    || anyState(m, (state) => numeric(state.limit) || numeric(state.threshold) || numeric(state.expected)),

  // Enough numbers spread over enough entities to shade a field.
  heatmap: (m) => list(m.entities).filter((entity) => Object.values(stateOf(entity)).some(numeric)).length >= 4,

  // A field that carried a before → after pair.
  diff: (m) => changedFields(m).length > 0,

  // A span inside a line/row that the trace points at.
  "selection-range": (m) => anyState(m, (state) => numeric(state.line) || numeric(state.start) || numeric(state.end)
    || typeof state.text === "string"),

  // Real connectors between entities.
  dependency: (m) => list(m.relations).length > 0,

  // Events placed on a time axis.
  interval: (m) => list(m.events).some((event) => numeric(event.at) || numeric(event.start) || numeric(event.end)
      || numeric(event.timestamp))
    || anyState(m, (state) => numeric(state.startMs) || numeric(state.endMs) || numeric(state.at)),

  // Two readings of the same thing, side by side.
  compare: (m) => changedFields(m).some((field) => field.before !== null && field.before !== undefined)
    || anyState(m, (state) => Object.hasOwn(state, "previousValue") || Object.hasOwn(state, "expected")),

  // A count per entity, not just a value.
  frequency: (m) => anyState(m, (state) => numeric(state.count) || numeric(state.frequency) || numeric(state.hits)),

  // Something present in the world that no event ever touches: a wall, a shelf,
  // a fixed bound.  Derived from absence, exactly like the renderer does it.
  constraint: (m) => {
    const touched = participants(m);
    return list(m.entities).some((entity) => !touched.has(entity.id));
  },

  // Prose the surface can attach without inventing it.
  annotation: (m) => list(m.entities).some((entity) => Boolean(entity.display && entity.display.description))
    || list(m.anchors).some((anchor) => Boolean(anchor.display && anchor.display.description))
    || list(m.outputs).length > 0,

  // A measured resource, by the same test the contract validator uses.
  "resource-usage": (m) => list(m.metrics).some((metric) => RESOURCE_RE.test(`${metric.id || ""} ${labelOf(metric)}`)),
};

function supportedOverlays(observable) {
  return OVERLAY_ORDER.filter((kind) => {
    try {
      return EVIDENCE[kind](observable) === true;
    } catch {
      return false;
    }
  });
}

// --- base eligibility -------------------------------------------------------
//
// A base is catalogued for a model only when the model has the shape that base
// draws.  This is the same question the ViewPlanner answers, asked as a yes/no
// instead of a ranking: the planner picks ONE base for a run, the catalog needs
// to know every base that would render honestly.

// Readable-scale ceilings.  A projection that needs the eye to compare items
// stops being a design long before it stops being legal: 81 maze cells are a
// map, not a bar chart, and no amount of CSS fixes that.
const READABLE = { chart: 24, table: 30, sequence: 40, text: 40, timeline: 40, "request-response": 30, "state-machine": 24 };

function positioned(m) {
  return list(m.entities).filter((e) => e.geometry && numeric(e.geometry.x) && numeric(e.geometry.y));
}

// A dense integer lattice is a grid; scattered points are geometry.  Deciding
// by density rather than by an algorithm name is what keeps one surface honest.
function latticeDensity(m) {
  const points = positioned(m);
  if (points.length < 4 || points.some((e) => !Number.isInteger(e.geometry.x) || !Number.isInteger(e.geometry.y))) return 0;
  const xs = points.map((e) => e.geometry.x);
  const ys = points.map((e) => e.geometry.y);
  const cells = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
  return cells > 0 ? points.length / cells : 0;
}

function degreeMap(m) {
  const degree = new Map();
  const parents = new Map();
  for (const relation of list(m.relations)) {
    degree.set(relation.fromEntityId, (degree.get(relation.fromEntityId) || 0) + 1);
    degree.set(relation.toEntityId, (degree.get(relation.toEntityId) || 0) + 1);
    parents.set(relation.toEntityId, (parents.get(relation.toEntityId) || 0) + 1);
  }
  return { degree, parents };
}

// The dominant shared numeric field: three bars only compare when they measure
// the same thing.
function sharedNumericField(m) {
  const counts = new Map();
  for (const entity of list(m.entities)) {
    for (const [key, value] of Object.entries(stateOf(entity))) {
      if (numeric(value)) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return Math.max(0, ...counts.values());
}

// A state field is only *visible* when some TraceEvent declared a label for it
// (see previewEntities/fieldLabelMap on the surface).  Eligibility has to use
// the same rule, otherwise the catalog would count a table whose every column
// the renderer refuses to print.
function labelledFieldIds(m) {
  const ids = new Set();
  for (const field of changedFields(m)) {
    if (field.fieldId && field.display && field.display.label) ids.add(field.fieldId);
  }
  return ids;
}

function labelledState(entity, ids) {
  return Object.entries(stateOf(entity)).filter(([key]) => ids.has(key));
}

function relationsDrawable(m) {
  const positionedIds = new Set(positioned(m).map((entity) => entity.id));
  return list(m.relations).filter((relation) => positionedIds.has(relation.fromEntityId) && positionedIds.has(relation.toEntityId));
}

function ordinalEntities(m) {
  return list(m.entities).filter((entity) => {
    const state = stateOf(entity);
    return numeric(state.index) || numeric(state.order) || numeric(state.seq) || numeric(state.position)
      || numeric(state.at) || numeric(state.startMs) || numeric(state.arrivalMs) || numeric(state.step);
  });
}

const BASE_ELIGIBLE = {
  // A grid needs a dense integer lattice, not merely "things with x and y".
  grid: (m) => positioned(m).length >= 4 && latticeDensity(m) >= 0.6,

  // A graph needs drawable edges plus branching or a cycle; a straight chain is
  // a path, and the grid/sequence projections tell that story better.
  graph: (m) => {
    const relations = relationsDrawable(m);
    if (relations.length < 2 || positioned(m).length < 3) return false;
    const { degree } = degreeMap({ relations });
    return [...degree.values()].some((value) => value >= 3) || relations.length >= degree.size;
  },

  // A tree needs single parents AND at least one real fork.
  tree: (m) => {
    const relations = relationsDrawable(m);
    if (relations.length < 2 || positioned(m).length < 3) return false;
    const { parents } = degreeMap({ relations });
    if ([...parents.values()].some((value) => value > 1)) return false;
    const children = new Map();
    for (const relation of relations) children.set(relation.fromEntityId, (children.get(relation.fromEntityId) || 0) + 1);
    return [...children.values()].some((value) => value >= 2);
  },

  // The sequence projection lays out EVERY entity in a lane, so the whole model
  // has to stay short enough to read, and its order has to be carried by the
  // data (an ordinal field, or x positions the renderer can sort by).
  sequence: (m) => {
    const entities = list(m.entities);
    if (entities.length < 3 || entities.length > READABLE.sequence || list(m.events).length < 2) return false;
    return ordinalEntities(m).length >= 3 || positioned(m).length >= 3;
  },

  // The table projection prints every entity as a row and every LABELLED state
  // field as a column. Unlabelled fields are dropped by the surface, so a model
  // with no labelled fields has no table.
  table: (m) => {
    const entities = list(m.entities);
    if (entities.length < 3 || entities.length > READABLE.table) return false;
    const ids = labelledFieldIds(m);
    const rows = entities.filter((entity) => labelledState(entity, ids).length >= 1);
    if (rows.length < 3) return false;
    const columns = new Set();
    for (const row of rows) for (const [key] of labelledState(row, ids)) columns.add(key);
    return columns.size >= 2;
  },

  // The timeline projection draws the TRACE, not the entities: ticks with the
  // before → after pairs each event carried.
  timeline: (m) => list(m.events).length >= 3
    && list(m.events).filter((event) => list(event.changedFields).length > 0).length >= 1,

  // A chart compares one labelled measure across a readable number of items.
  chart: (m) => {
    const ids = labelledFieldIds(m);
    const series = list(m.entities).filter((entity) => labelledState(entity, ids).some(([, value]) => numeric(value)));
    return series.length >= 3 && series.length <= READABLE.chart;
  },

  text: (m) => {
    const lines = list(m.entities).filter((entity) => typeof stateOf(entity).text === "string");
    return lines.length >= 3 && list(m.entities).length <= READABLE.text;
  },

  // Scattered points: positioned, but not a lattice a grid would draw better.
  geometry: (m) => positioned(m).length >= 3 && latticeDensity(m) < 0.6,

  // Named states, drawn as bubbles, plus the transitions between them.
  "state-machine": (m) => {
    // The model has to SAY these are states. A `phase` field on a warehouse
    // shelf is not a state machine, and drawing one would be a lie about the
    // domain rather than a second reading of it.
    const states = positioned(m).filter((entity) => entity.kind === "state");
    return relationsDrawable(m).length >= 2 && states.length >= 3 && states.length <= READABLE["state-machine"];
  },

  // Explicit exchanges: something asked, something answered, drawn as relations
  // between two named sides.
  "request-response": (m) => {
    const pairs = list(m.entities).filter((entity) => {
      const state = stateOf(entity);
      return Object.hasOwn(state, "request") || Object.hasOwn(state, "response");
    });
    const byId = new Set(list(m.entities).map((entity) => entity.id));
    const exchanges = list(m.relations).filter((relation) => byId.has(relation.fromEntityId) && byId.has(relation.toEntityId));
    return pairs.length >= 2 && pairs.length <= READABLE["request-response"] && exchanges.length >= 2;
  },

  // Meters need more than one measured quantity to read as a budget.
  "runtime-resource": (m) => EVIDENCE["resource-usage"](m)
    && list(m.metrics).filter((metric) => numeric(metric.value)).length >= 2,

  // The inspector is the one projection that never needs a shape: it reads the
  // model's own tables. It is always eligible, which is exactly why it is the
  // honest fallback instead of an empty box.
  "universal-inspector": () => true,
};

function eligibleBases(observable) {
  return BASES.filter((base) => {
    try {
      return BASE_ELIGIBLE[base](observable) === true;
    } catch {
      return false;
    }
  });
}

// --- axes -------------------------------------------------------------------

function controlPacksFor(observable) {
  // "none" is always available: it is the inert reference framing.
  const packs = ["none"];
  if (list(observable.controls).some((control) => control.type === "stepper")) packs.push("stepper");
  return packs;
}

function layoutsFor(observable) {
  const entities = list(observable.entities).length;
  const events = list(observable.events).length;
  const layouts = ["balanced"];
  // focus centres a single small subject; wide needs enough content to fill it.
  if (entities <= 12) layouts.unshift("focus");
  if (entities >= 6 || events >= 4) layouts.push("wide");
  return layouts.filter((layout) => LAYOUTS.includes(layout));
}

function subsetsUpToTwo(kinds) {
  const out = [[]];
  for (let i = 0; i < kinds.length; i += 1) {
    out.push([kinds[i]]);
    for (let j = i + 1; j < kinds.length; j += 1) out.push([kinds[i], kinds[j]]);
  }
  return out;
}

// --- display copy -----------------------------------------------------------
//
// Recipe kinds are internal enums; the surface may only ever print these
// labels.  Keeping the table here means a catalogued combination carries the
// same Vietnamese copy a live run would.

const BASE_LABEL = {
  grid: "Bản đồ di chuyển", graph: "Mạng đang vận hành", tree: "Cấu trúc cây",
  table: "Bảng số liệu", chart: "Biểu đồ số liệu", sequence: "Chuỗi sự kiện",
  timeline: "Dòng thời gian", text: "Nhật ký thay đổi", geometry: "Không gian hình học",
  "state-machine": "Trạng thái chuyển tiếp", "request-response": "Yêu cầu và phản hồi",
  "runtime-resource": "Tài nguyên chạy", "universal-inspector": "Preview",
};

const OVERLAY_LABEL = {
  "error-anchor": "Điểm cần sửa", target: "Đích cần tới", path: "Tuyến đang chọn",
  frontier: "Vùng vừa lan tới", window: "Cửa sổ hiệu lực", partition: "Nhóm dữ liệu",
  heap: "Thứ tự ưu tiên", threshold: "Ngưỡng cần đạt", heatmap: "Mật độ giá trị",
  diff: "Trường vừa thay đổi", "selection-range": "Đoạn đang xét",
  dependency: "Quan hệ đang dùng", interval: "Khoảng thời gian",
  compare: "So sánh thay đổi", frequency: "Số lần xuất hiện",
  constraint: "Ràng buộc cố định", annotation: "Ghi chú đọc thêm",
  "resource-usage": "Mức dùng tài nguyên",
};

const LAYOUT_LABEL = {
  focus: "Tập trung một chủ thể", balanced: "Cân đối", wide: "Trải rộng",
};

const CONTROL_LABEL = { none: "Mẫu từng bước", stepper: "Xem từng bước" };

function composeRecipe({ base, overlays, control, layout }) {
  return {
    schemaVersion: "xuong.preview-recipe.v2",
    base: { kind: base, display: { label: BASE_LABEL[base] || "Preview" } },
    overlays: overlays.map((kind) => ({ kind, display: { label: OVERLAY_LABEL[kind] || "Thông tin bổ sung" } })),
    controlPack: { kind: control, display: { label: CONTROL_LABEL[control] || "Xem từng bước" } },
    layout: { kind: layout, display: { label: LAYOUT_LABEL[layout] || "Cân đối" } },
    inspector: { alwaysAvailable: true, display: { label: "Chi tiết lần chạy" } },
  };
}

// --- enumeration ------------------------------------------------------------

/**
 * Every combination this one ObservableModel can honestly support.
 * Each entry is already contract-validated against that model.
 */
function enumerateRecipes(observable) {
  const supported = new Set(supportedOverlays(observable));
  const controls = controlPacksFor(observable);
  const layouts = layoutsFor(observable);
  const out = [];
  for (const base of eligibleBases(observable)) {
    const allowed = COMPATIBILITY[base].filter((kind) => supported.has(kind));
    for (const overlays of subsetsUpToTwo(allowed)) {
      for (const control of controls) {
        for (const layout of layouts) {
          let recipe;
          try {
            recipe = validateAndCanonicalizeRecipe(composeRecipe({ base, overlays, control, layout }), observable);
          } catch {
            continue; // the contract, not the catalog, has the last word
          }
          out.push({ key: stableRecipeKey(recipe), recipe });
        }
      }
    }
  }
  return out;
}

/** The whole legal space of the grammar, ignoring evidence — for reporting. */
function grammarCapacity() {
  const perBase = BASES.map((base) => {
    const n = COMPATIBILITY[base].length;
    return { base, overlaySets: 1 + n + (n * (n - 1)) / 2 };
  });
  const overlaySets = perBase.reduce((sum, item) => sum + item.overlaySets, 0);
  return {
    bases: BASES.length,
    overlaySets,
    controls: 2,
    layouts: LAYOUTS.length,
    total: overlaySets * 2 * LAYOUTS.length,
    perBase,
  };
}

/**
 * Merge many observables into one deduplicated catalog.
 *
 * @param {Array<{id:string, observable:object, arcId?:string, variant?:string, productTitle?:string}>} sources
 */
function buildCatalog(sources) {
  const byKey = new Map();
  const bySource = [];
  for (const source of sources) {
    const found = enumerateRecipes(source.observable);
    for (const { key, recipe } of found) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          recipe,
          base: recipe.base.kind,
          overlays: recipe.overlays.map((overlay) => overlay.kind),
          control: recipe.controlPack.kind,
          layout: recipe.layout.kind,
          observableId: source.id,
          arcId: source.arcId || null,
          productTitle: source.productTitle || null,
          variant: source.variant || null,
        });
      }
    }
    bySource.push({ id: source.id, arcId: source.arcId || null, produced: found.length });
  }
  const recipes = [...byKey.values()];
  return { recipes, sources: bySource, stats: statsFor(recipes) };
}

function statsFor(recipes) {
  const byBase = {};
  const overlayUse = {};
  for (const entry of recipes) {
    byBase[entry.base] = (byBase[entry.base] || 0) + 1;
    for (const overlay of entry.overlays) overlayUse[overlay] = (overlayUse[overlay] || 0) + 1;
  }
  const capacity = grammarCapacity();
  return {
    total: recipes.length,
    capacity: capacity.total,
    coverage: capacity.total ? Number((recipes.length / capacity.total).toFixed(4)) : 0,
    basesCovered: Object.keys(byBase).length,
    byBase,
    overlayUse,
    distinctCompositions: new Set(recipes.map((entry) => `${entry.base}|${entry.overlays.join("+")}`)).size,
  };
}

module.exports = {
  BASES, LAYOUTS, EVIDENCE, BASE_ELIGIBLE, BASE_LABEL, OVERLAY_LABEL, LAYOUT_LABEL, CONTROL_LABEL,
  supportedOverlays, eligibleBases, controlPacksFor, layoutsFor,
  composeRecipe, enumerateRecipes, grammarCapacity, buildCatalog, statsFor,
};
