"use strict";

// Observable sampler.
//
// Every catalogued preview combination has to be backed by an ObservableModel a
// trusted runner really produces.  This module materialises those models
// straight from the scenario registry — the same `arc.model()` the runtime
// calls — for both outcomes of every arc/stage:
//
//   red   : the baseline source, before the student's change (anchors present)
//   green : the source after the change (anchors gone, values corrected)
//
// It never fabricates entities.  If an arc's model is thin, its sample is thin
// and the catalog gets fewer combinations from it.

const registry = require("./xuongScenarioRegistry");

const MAPPING_ID = "main-editable-symbol";

// The value a still-broken baseline reports.  Arcs declare it so the sampled
// red model matches what the C++ red run actually prints; the fallback only
// exists for arcs written before this field.
function redActualOf(arc) {
  if (Object.hasOwn(arc, "redActual")) return arc.redActual;
  const expected = arc.expected;
  if (typeof expected === "number") return expected === 0 ? 1 : expected * 2;
  if (typeof expected === "boolean") return !expected;
  if (typeof expected === "string") return `${expected}-cũ`;
  return null;
}

function modelFor(arc, { passed, seedId, stageIndex }) {
  const scenario = { id: arc.id, display: arc.display, inputSummary: arc.inputSummary };
  const runId = `sample-${seedId}-${stageIndex}-${passed ? "green" : "red"}`;
  const partial = arc.model({
    actual: passed ? arc.expected : redActualOf(arc),
    passed,
    mappingId: MAPPING_ID,
    runId,
    scenario,
  });
  return {
    schemaVersion: "xuong.observable.v2",
    runId,
    scenario,
    cursor: partial.events.length,
    ...partial,
  };
}

/** Structural check that does not need a project (the runtime keeps its own). */
function assertSane(observable, id) {
  const entityIds = new Set(observable.entities.map((entity) => entity.id));
  observable.events.forEach((event, index) => {
    if (event.index !== index) throw new Error(`${id}: TraceEvent.index không liên tục.`);
    for (const entityId of event.entityIds) {
      if (!entityIds.has(entityId)) throw new Error(`${id}: TraceEvent trỏ entity không tồn tại (${entityId}).`);
    }
  });
  for (const anchor of observable.anchors || []) {
    if (anchor.sourceMappingId !== MAPPING_ID) throw new Error(`${id}: EventAnchor không trỏ SourceMapping.`);
    if (anchor.eventIndex < 0 || anchor.eventIndex >= observable.events.length) {
      throw new Error(`${id}: EventAnchor trỏ event ngoài trace.`);
    }
    if (anchor.entityId && !entityIds.has(anchor.entityId)) {
      throw new Error(`${id}: EventAnchor trỏ entity không tồn tại.`);
    }
  }
  return observable;
}

/**
 * @param {{ authoredOnly?: boolean }} options
 * @returns {Array<{id:string, arcId:string, stageIndex:number, variant:string, productTitle:string, observable:object}>}
 */
function sampleObservables({ authoredOnly = false } = {}) {
  const out = [];
  for (const seedId of registry.listArcIds()) {
    for (let stageIndex = 0; stageIndex < registry.stageCount(seedId); stageIndex += 1) {
      const arc = registry.getArc(seedId, stageIndex);
      if (!arc || typeof arc.model !== "function") continue;
      if (authoredOnly && !arc.authored) continue;
      for (const passed of [false, true]) {
        const variant = passed ? "green" : "red";
        const id = `${seedId}#${stageIndex}#${variant}`;
        let observable;
        try {
          observable = assertSane(modelFor(arc, { passed, seedId, stageIndex }), id);
        } catch (error) {
          throw Object.assign(new Error(`Sample ${id} không hợp lệ: ${error.message}`), { cause: error });
        }
        out.push({
          id,
          arcId: seedId,
          stageIndex,
          variant,
          productTitle: arc.productTitle || seedId,
          authored: Boolean(arc.authored),
          observable,
        });
      }
    }
  }
  return out;
}

module.exports = { MAPPING_ID, sampleObservables, modelFor, redActualOf };
