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
const plannerRouter = require("./src/routes/planner");
const bossRouter = require("./src/routes/boss");
const contestsRouter = require("./src/routes/contests");
const autopsyRouter = require("./src/routes/autopsy");
const gameReviewRouter = require("./src/routes/game-review");
const momentRouter = require("./src/routes/moment");
const verifiedArtifactsRouter = require("./src/routes/verified-artifacts");
const arenaReferenceRouter = require("./src/routes/arena-reference");
const arenaMatchRouter = require("./src/routes/arena-match");
const arenaRatingRouter = require("./src/routes/arena-rating");
const arenaCardsRouter = require("./src/routes/arena-cards");
const arenaRoadmapRouter = require("./src/routes/arena-roadmap");
const arenaGhostRouter = require("./src/routes/arena-ghost");
const arenaWeeklyRouter = require("./src/routes/arena-weekly");
const arenaMemoir = require("./src/routes/arena-memoir");
const arenaSeasonRouter = require("./src/routes/arena-season");
const arenaArbitrationRouter = require("./src/routes/arena-arbitration");
const arenaUpgrade = require("./src/routes/arena-upgrade");
const arenaBoss = require("./src/routes/arena-boss");
const arenaNextBetRouter = require("./src/routes/arena-next-bet");
const arenaSeal = require("./src/routes/arena-seal");
const arenaSpecimen = require("./src/routes/arena-specimen");
const arenaCoreFillRouter = require("./src/routes/arena-corefill");
const arenaRushRouter = require("./src/routes/arena-rush");
const recommendationsRouter = require("./src/routes/recommendations");

const VERSION = "2.0.0";

// The API compiles and runs arbitrary C++. A malicious webpage can use DNS
// rebinding (a domain that resolves to 127.0.0.1) to make this server a
// same-origin target and execute code on the machine. Loopback-bound servers
// therefore only accept requests whose Host header is a loopback name; binding
// a non-loopback USACO_IDE_HOST is an explicit opt-out (LAN use).
function isAllowedHost(hostHeader) {
  if (config.HOST !== "127.0.0.1" && config.HOST !== "localhost" && config.HOST !== "::1") return true;
  const host = String(hostHeader || "").trim().toLowerCase();
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url} - Agent: ${req.headers['user-agent']}`);
    next();
  });
  app.use((req, res, next) => {
    if (isAllowedHost(req.headers.host)) return next();
    res.status(403).json({ error: "Forbidden: bad Host header (DNS rebinding protection)." });
  });
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
  app.use("/api/problems", autopsyRouter);
  app.use("/api/problems", gameReviewRouter);
  app.use("/api/problems", momentRouter);
  app.use("/api/problems", verifiedArtifactsRouter);
  app.use("/api/recommendations", recommendationsRouter);
  app.use("/api/problems", arenaReferenceRouter);
  app.use("/api/problems", arenaMatchRouter);
  app.use("/api/problems", arenaGhostRouter);
  app.use("/api/problems", arenaMemoir.problemsRouter);
  app.use("/api/problems", arenaArbitrationRouter);
  app.use("/api/problems", arenaUpgrade.problemsRouter);
  app.use("/api/problems", arenaBoss.problemsRouter);
  app.use("/api/problems", arenaSeal.problemsRouter);
  app.use("/api/problems", arenaSpecimen.problemsRouter);
  app.use("/api/arena", arenaRatingRouter);
  app.use("/api/arena", arenaCardsRouter);
  app.use("/api/arena", arenaRoadmapRouter);
  app.use("/api/arena", arenaWeeklyRouter);
  app.use("/api/arena", arenaMemoir.arenaRouter);
  app.use("/api/arena", arenaSeasonRouter);
  app.use("/api/arena", arenaUpgrade.arenaRouter);
  app.use("/api/arena", arenaBoss.arenaRouter);
  app.use("/api/arena", arenaNextBetRouter);
  app.use("/api/arena", arenaSeal.arenaRouter);
  app.use("/api/arena", arenaSpecimen.arenaRouter);
  app.use("/api/arena", arenaCoreFillRouter);
  app.use("/api/arena", arenaRushRouter);

  app.use("/api/settings", settingsRouter);
  app.use("/api/import", importRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/progress", progressRouter);
  app.use("/api/planner", plannerRouter);
  app.use("/api/boss", bossRouter);
  app.use("/api/contests", contestsRouter);

  // Unknown API route -> JSON 404 (so the SPA fallback below never swallows it).
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found." });
  });

  // Disable caching for development/live updates
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
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

// Only auto-start when run directly (node server.js) — lets tests require()
// buildApp/isAllowedHost without binding a port.
if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start USACO IDE 2.0 backend:", error);
    process.exit(1);
  });
}

module.exports = { buildApp, isAllowedHost, start };
