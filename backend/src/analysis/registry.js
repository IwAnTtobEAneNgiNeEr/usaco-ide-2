"use strict";

// analysis/registry.js — Analysis module registry.
// Adding a new analysis type = one file that exports { id, name, analyze(ctx) }.
// ctx = { settings, statement, code, tests, meta }. Returns analysis-specific data.

const modules = new Map();

function register(mod) {
  if (!mod || !mod.id) throw new Error("Analysis module must have an id");
  if (!mod.analyze) throw new Error(`Module "${mod.id}" must export an analyze function`);
  modules.set(mod.id, mod);
}

function get(id) { return modules.get(id) || null; }
function list() { return [...modules.values()].map(m => ({ id: m.id, name: m.name || m.id, description: m.description || "" })); }
function has(id) { return modules.has(id); }

async function run(id, ctx) {
  const mod = modules.get(id);
  if (!mod) throw new Error(`Unknown analysis module: ${id}`);
  return mod.analyze(ctx);
}

async function runAll(ctx, { filter } = {}) {
  const results = {};
  for (const [id, mod] of modules) {
    if (filter && !filter(id, mod)) continue;
    try { results[id] = await mod.analyze(ctx); }
    catch (err) { results[id] = { error: err.message }; }
  }
  return results;
}

module.exports = { register, get, list, has, run, runAll };
