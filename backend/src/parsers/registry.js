"use strict";

// parsers/registry.js — Statement parser registry.
// Adding a new parser = one file that exports { id, name, detect, extractSamples }.
// detect(text) returns a confidence 0–1. The highest-confidence parser wins.

const parsers = [];

function register(parser) {
  if (!parser || !parser.id) throw new Error("Parser must have an id");
  if (!parser.detect) throw new Error(`Parser "${parser.id}" must export a detect function`);
  if (!parser.extractSamples) throw new Error(`Parser "${parser.id}" must export an extractSamples function`);
  parsers.push(parser);
}

function bestFor(text) {
  let best = null;
  let bestScore = -1;
  for (const p of parsers) {
    const score = p.detect(text);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

function extractSamples(text) {
  const parser = bestFor(text);
  return parser ? parser.extractSamples(text) : [];
}

function list() { return parsers.map(p => ({ id: p.id, name: p.name || p.id })); }

module.exports = { register, bestFor, extractSamples, list };
