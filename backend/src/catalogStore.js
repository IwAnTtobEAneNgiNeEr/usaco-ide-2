"use strict";

const problemStore = require("./problemStore");
const { normalizeCatalogItem, ACTIVITY_KINDS } = require("./trackContract");

function problemItem(problem) {
  return normalizeCatalogItem({
    ...problem,
    itemType: "problem",
    derivedStatus: null,
    derivedFrom: null,
    requirement: null,
    track: problem.track,
    activityKind: problem.activityKind || ACTIVITY_KINDS.COMPETITIVE_PROBLEM,
    open: { type: "problem", problemId: problem.id },
  });
}

async function listCatalog() {
  return (await problemStore.listProblems())
    .map(problemItem)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || String(a.id).localeCompare(String(b.id)));
}

module.exports = { listCatalog, problemItem };
