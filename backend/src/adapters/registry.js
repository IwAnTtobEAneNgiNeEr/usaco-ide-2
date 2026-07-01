"use strict";

// adapters/registry.js — AI Provider Adapter registry.
// Adding a new provider = one file that exports { id, name, chat, testConnection }.
// The registry auto-discovers adapters in this directory and exposes them by id.

const adapters = new Map();

function register(adapter) {
  if (!adapter || !adapter.id) throw new Error("Adapter must have an id");
  if (!adapter.chat) throw new Error(`Adapter "${adapter.id}" must export a chat function`);
  adapters.set(adapter.id, adapter);
}

function get(id) { return adapters.get(id) || null; }
function list() { return [...adapters.values()].map(a => ({ id: a.id, name: a.name || a.id })); }
function has(id) { return adapters.has(id); }

module.exports = { register, get, list, has };
