"use strict";

// Dev/preview launcher (used by .claude/launch.json "usaco-ide-2-dev").
// Forces a non-default port and disables the Competitive Companion listener so
// it can run alongside the packaged desktop app, which already owns the default
// ports. Resolves server.js relative to this file so the working directory the
// launcher is started from doesn't matter.
process.env.USACO_IDE_PORT = process.env.USACO_IDE_PORT || process.env.PORT || "5099";
process.env.USACO_COMPANION_PORT = "0";

const path = require("path");
require(path.join(__dirname, "server.js")).start();
