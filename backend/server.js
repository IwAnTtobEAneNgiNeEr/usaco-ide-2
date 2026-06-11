"use strict";

const path = require("path");
const express = require("express");

const config = require("./src/config");
const fileStore = require("./src/fileStore");
const settingsStore = require("./src/settingsStore");
const problemStore = require("./src/problemStore");
const runCpp = require("./src/runCpp");
const { seedSampleIfEmpty } = require("./src/seed");
const { startCompanionListener } = require("./src/companion");

const problemsRouter = require("./src/routes/problems");
const filesRouter = require("./src/routes/files");
const judgeRouter = require("./src/routes/judge");
const settingsRouter = require("./src/routes/settings");
const importRouter = require("./src/routes/import");
const aiRouter = require("./src/routes/ai");
const labRouter = require("./src/routes/lab");
const statsRouter = require("./src/routes/stats");
const progressRouter = require("./src/routes/progress");
const bossRouter = require("./src/routes/boss");
const contestsRouter = require("./src/routes/contests");

const VERSION = "2.0.0";

function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32mb" })); // large enough for base64 image/PDF OCR uploads

  // Health probe — also reports whether g++ is reachable.
  app.get("/api/health", async (req, res, next) => {
    try {
      const settings = await settingsStore.getSettings();
      const compiler = await runCpp.checkCompiler(settings);
      res.json({ ok: true, app: "USACO IDE 2.0", version: VERSION, compiler });
    } catch (error) {
      next(error);
    }
  });

  // Problem + file + judge routes all live under /api/problems.
  app.use("/api/problems", problemsRouter);
  app.use("/api/problems", filesRouter);
  app.use("/api/problems", judgeRouter);
  app.use("/api/problems", labRouter);

  app.use("/api/settings", settingsRouter);
  app.use("/api/import", importRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/progress", progressRouter);
  app.use("/api/boss", bossRouter);
  app.use("/api/contests", contestsRouter);

  // Unknown API route -> JSON 404 (so the SPA fallback below never swallows it).
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  // Static frontend.
  app.use(express.static(config.FRONTEND_DIR, { extensions: ["html"] }));
  app.get("*", (req, res) => {
    res.sendFile(path.join(config.FRONTEND_DIR, "index.html"));
  });

  // Central error handler -> consistent JSON shape.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Internal server error." });
  });

  return app;
}

async function ensureWorkspace() {
  await fileStore.ensureDir(config.PROBLEMS_DIR);
  await fileStore.ensureDir(config.CONTESTS_DIR);
  await fileStore.ensureDir(config.DATA_DIR);
  // Persist defaults on first run so the file is visible/editable.
  if (!(await fileStore.pathExists(config.SETTINGS_FILE))) {
    await settingsStore.saveSettings({});
  }
  // Fresh clone (empty workspace) -> seed the bundled sample problem so the
  // user can verify Run/Judge immediately. No-op when any problem exists.
  await seedSampleIfEmpty(problemStore, (msg) => console.log("  [Seed] " + msg));
}

async function start() {
  await ensureWorkspace();
  const app = buildApp();
  app.listen(config.PORT, config.HOST, () => {
    const url = `http://${config.HOST}:${config.PORT}`;
    console.log("");
    console.log("  USACO IDE 2.0  v" + VERSION);
    console.log("  Backend ready:  " + url);
    console.log("  Workspace:      " + config.WORKSPACE_DIR);
    console.log("  UTF-8 Test:     " + (Buffer.from("✓ Tiếng Việt").toString("utf8") === "✓ Tiếng Việt" ? "Pass (✓ Tiếng Việt)" : "FAIL"));
    console.log("  Local-only — do not expose this server to the public internet.");
    console.log("");
  });

  // Competitive Companion import (best-effort; a port clash just disables it).
  startCompanionListener({
    port: config.COMPANION_PORT,
    createProblem: (input) => problemStore.createProblem(input),
    log: (stage, detail) => console.log(`  [Companion] ${stage}${detail ? " — " + detail : ""}`)
  });
}

start().catch((error) => {
  console.error("Failed to start USACO IDE 2.0 backend:", error);
  process.exit(1);
});

module.exports = { buildApp };
