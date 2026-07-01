"use strict";

// registries.js — Central extensibility bootstrap.
// Loads all three backend registries and registers the built-in modules.
// Import this once at server startup; after that, require any registry directly.
//
// To add a new provider/parser/analysis module:
//   1. Create a file in the appropriate directory (adapters/, parsers/, analysis/)
//   2. Export the required contract (see each registry.js for the shape)
//   3. Add one register() call below
//
// That's it. No other files need to change.

const adapterRegistry = require("./adapters/registry");
const parserRegistry = require("./parsers/registry");
const analysisRegistry = require("./analysis/registry");

// ---- Built-in adapters ----
adapterRegistry.register(require("./adapters/openai-compatible"));

// ---- Built-in parsers ----
parserRegistry.register(require("./parsers/markdown-fenced"));

// ---- Built-in analysis modules ----
analysisRegistry.register(require("./analysis/statement-analysis"));

module.exports = { adapterRegistry, parserRegistry, analysisRegistry };
