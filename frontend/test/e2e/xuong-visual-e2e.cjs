"use strict";
// F4 · real browser E2E + PNG capture for Xưởng.
//
// This drives a real Chrome against a running server and writes real PNGs.
// It is NOT part of the unit suite (`node --test test/**/*.test.mjs`) because it
// needs a live backend; run it explicitly:
//
//   node test/e2e/xuong-visual-e2e.js                  # dev preview :5099
//   BASE=http://127.0.0.1:5050 node test/e2e/xuong-visual-e2e.js   # canonical
//
// puppeteer-core is not a repo dependency; it is resolved from the existing
// local audit harness. If it is missing the script says so and exits 2 rather
// than pretending the acceptance ran.

const fs = require("fs");
const path = require("path");
const Module = require("module");

const AUDIT_MODULES = "C:/Users/Admin/usaco-audit/node_modules";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE || "http://127.0.0.1:5099";
const OUT = path.join(__dirname, "shots");

if (!Module.globalPaths.includes(AUDIT_MODULES)) Module.globalPaths.push(AUDIT_MODULES);
let puppeteer;
try {
  puppeteer = require(path.join(AUDIT_MODULES, "puppeteer-core"));
} catch {
  console.error(`puppeteer-core not found at ${AUDIT_MODULES} — cannot run the browser acceptance.`);
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` — ${detail}` : ""}`);
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
    defaultViewport: { width: 1600, height: 940, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();

  const noise = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`[pageerror] ${e.message}`));

  const shot = async (name) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, type: "png" });
    console.log("  shot:", file);
    return file;
  };

  // Infinite animation wedges the capture pipeline; freeze before shooting.
  const freeze = () => page.addStyleTag({ content: "*,*::before,*::after{animation:none !important;transition:none !important}" });

  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate(() => localStorage.setItem("usaco2.welcomed", "1"));
  await page.reload({ waitUntil: "networkidle2" });
  await freeze();

  // --- open Xưởng ------------------------------------------------------------
  const openXuong = async () => {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button,a,[role="tab"]')].find((b) => (b.textContent || "").trim() === "Xưởng");
      if (el) el.click();
    });
    await sleep(1200);
  };
  await openXuong();
  const cards = await page.$$eval("[data-xg-project]", (n) => n.map((b) => (b.querySelector("strong") || {}).textContent || ""));
  record("Xưởng list loads projects from the API", cards.length > 0, `${cards.length} project(s)`);

  const openProject = async (match) => {
    await openXuong();
    const found = await page.evaluate((m) => {
      const card = [...document.querySelectorAll("[data-xg-project]")].find((b) => new RegExp(m, "i").test(b.textContent || ""));
      if (card) { card.click(); return true; }
      return false;
    }, match);
    if (found) await sleep(2600);
    await freeze();
    return found;
  };

  const railState = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => (q(s) ? Math.round(q(s).getBoundingClientRect().width) : null);
    return {
      scenarios: [...document.querySelectorAll("[data-xg-scenario]")].map((b) => (b.querySelector("b") || {}).textContent || ""),
      spine: [...document.querySelectorAll(".xg-spine-step")].map((s) => s.dataset.state),
      growthChips: document.querySelectorAll(".xg-growth-item").length,
      anchors: document.querySelectorAll("[data-xp-anchor]").length,
      scrub: !!q("[data-xp-scrub]"),
      cursor: q("[data-xp-cursor]") ? q("[data-xp-cursor]").textContent.trim() : null,
      provenance: q(".xg-prov-badge") ? q(".xg-prov-badge").textContent.trim() : null,
      base: q(".xp-surface") ? q(".xp-surface").dataset.xpBase : null,
      narrativeW: box(".xg-focus"),
      railW: box("#aw-controls"),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      // F5 · the composition bands, read off the live DOM
      metrics: [...document.querySelectorAll("[data-xp-metric]")].map((m) =>
        (m.querySelector(".xp-metric-value") || {}).textContent || ""),
      outputs: document.querySelectorAll("[data-xp-output]").length,
      replayAt: q(".xp-replay-at") ? q(".xp-replay-at").textContent.trim() : null,
      tabs: [...document.querySelectorAll("[data-xg-tab]")].map((b) => b.dataset.xgTab),
      // The shell console must not report the same run a second time.
      shellConsoleShown: (() => {
        const el = q("#activity-workspace .aw-result");
        return Boolean(el && el.getBoundingClientRect().height > 0);
      })(),
      // Nothing internal may reach visible text.
      leaks: (() => {
        const text = (q("#aw-controls") || { innerText: "" }).innerText || "";
        return ["universal-inspector", "error-anchor", "state-machine", "runtime-resource",
          "maze-navigator", "merge-forge", "log-matcher", "shard-balancer", "route-watch",
          "seedId", "5050", "5099", "data-xp"].filter((token) => text.includes(token));
      })(),
    };
  });

  const clickRun = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /Chạy build/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await sleep(9000);
    await freeze();
  };

  // === 1 · MazeNavigator stage 2 =============================================
  if (await openProject("Chuỗi giai đoạn|Điều hướng kho")) {
    let s = await railState();
    record("Maze: stage-2 scenario picker shows corner-guard", s.scenarios.length >= 2, s.scenarios.join(" | "));
    record("Maze: growth spine rendered", (s.spine || []).length > 0, (s.spine || []).join(">"));

    // run the unlocked stage-2 scenario
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("[data-xg-scenario]")].pop();
      if (b) b.click();
    });
    await sleep(9000);
    await freeze();
    s = await railState();
    record("Maze stage 2: run produced a preview", !!s.base, `base=${s.base}`);
    record("Maze stage 2: failure anchored to source", s.anchors > 0, `${s.anchors} anchor(s)`);
    record("Maze stage 2: provenance says user run", /Bản của em/i.test(s.provenance || ""), s.provenance || "");
    record("Maze stage 2: replay scrub present", s.scrub, `cursor ${s.cursor}`);

    // anchor → jump to source mapping
    const jumped = await page.evaluate(() => {
      const a = document.querySelector("[data-xp-anchor]");
      if (!a) return null;
      a.click();
      return true;
    });
    await sleep(1400);
    const sel = await page.evaluate(() => !!document.querySelector(".cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground"));
    record("Maze stage 2: anchor jumps into the source mapping", Boolean(jumped) && sel, sel ? "CodeMirror selection set" : "no selection");

    // replay scrub moves the cursor
    const before = (await railState()).cursor;
    await page.evaluate(() => {
      const r = document.querySelector("[data-xp-scrub]");
      if (r) { r.value = "1"; r.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    await sleep(1800);
    const after = (await railState()).cursor;
    record("Maze stage 2: scrub moves the replay cursor", before !== after, `${before} → ${after}`);

    // --- F5 · the panel composes into bands, all fed by the same run --------
    const c = await railState();
    record("F5 Maze: metrics ride the surface, not a collapsed detail",
      c.metrics.length > 0, c.metrics.join(" | "));
    record("F5 Maze: the run's outputs stay on the surface",
      c.outputs > 0, `${c.outputs} output(s)`);
    record("F5 Maze: the replay strip names where the cursor stands",
      Boolean(c.replayAt), c.replayAt || "");
    record("F5 Maze: Preview / Checks / Logs are the three tabs",
      c.tabs.join(",") === "preview,checks,logs", c.tabs.join(","));
    record("F5 Maze: the shell console does not repeat the run",
      c.shellConsoleShown === false);
    record("F5 Maze: no internal token reaches the panel's visible text",
      c.leaks.length === 0, c.leaks.join(", ") || "clean");

    // Logs must carry the compile/runtime story and no requirement verdict.
    const logs = await page.evaluate(async () => {
      const tab = [...document.querySelectorAll("[data-xg-tab]")].find((b) => b.dataset.xgTab === "logs");
      if (!tab) return null;
      tab.click();
      await new Promise((r) => setTimeout(r, 500));
      const panel = document.querySelector(".xg-logs");
      return panel ? { state: panel.dataset.state, text: panel.innerText.trim() } : null;
    });
    record("F5 Maze: Logs reports the build and never a requirement verdict",
      Boolean(logs && logs.state && !/yêu cầu|đạt\b/i.test(logs.text)),
      logs ? `${logs.state} · ${logs.text.slice(0, 60)}` : "no logs panel");
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll("[data-xg-tab]")].find((b) => b.dataset.xgTab === "preview");
      if (tab) tab.click();
    });
    await sleep(500);
    await freeze();
    await shot("f5-maze-stage2-1600");
  } else {
    record("Maze stage 2 project opens", false, "no matching project card");
  }

  // === 2..3 · the other trusted projects =====================================
  const SUITE = [
    ["RouteWatch", "RouteWatch", "f5-routewatch-1600", "graph"],
    ["MergeForge", "MergeForge", "f5-mergeforge-1600", "sequence"],
    ["ShardBalancer", "ShardBalancer", "f5-shardbalancer-1600", "chart"],
    ["LogMatcher", "LogMatcher", "f5-logmatcher-1600", "text"],
  ];
  for (const [name, match, shotName, expectBase] of SUITE) {
    if (!(await openProject(match))) { record(`${name}: project opens`, false, "no card"); continue; }
    await clickRun();
    const s = await railState();
    record(`${name}: preview rendered from a real run`, s.base === expectBase, `base=${s.base}`);
    record(`${name}: provenance is the user run`, /Bản của em/i.test(s.provenance || ""), s.provenance || "");
    record(`${name}: Preview / Checks / Logs reachable`, s.tabs.join(",") === "preview,checks,logs", s.tabs.join(","));
    record(`${name}: no internal token in the panel text`, s.leaks.length === 0, s.leaks.join(", ") || "clean");
    record(`${name}: the replay strip names where the cursor stands`, Boolean(s.replayAt), s.replayAt || "");

    // Each base must actually compose, not just mount an empty frame. chart
    // draws its numbers as bars, so it legitimately has no metrics strip.
    const composed = await page.evaluate(() => ({
      drawing: document.querySelectorAll("#aw-controls .xp-canvas").length,
      stream: document.querySelectorAll("[data-xp-stream-row]").length,
      bars: document.querySelectorAll("[data-xp-entity-bar], [data-xp-bar]").length,
      span: document.querySelectorAll("[data-xp-span]").length,
      anchoredEdge: document.querySelectorAll(".xp-edge.is-anchored").length,
    }));
    if (expectBase === "graph") {
      record("RouteWatch: the relation graph is drawn", composed.drawing > 0, JSON.stringify(composed));
      // A passing run has no anchor, so there is nothing to mark and marking
      // anything would be a lie. Only a run that FAILED owes us a marked link.
      const anchorCount = await page.evaluate(() => document.querySelectorAll("[data-xp-anchor]").length);
      if (anchorCount > 0) {
        record("RouteWatch: the failing link is marked on the link itself",
          composed.anchoredEdge > 0, `${anchorCount} anchor(s), ${composed.anchoredEdge} marked edge(s)`);
      } else {
        record("RouteWatch: a passing run marks no link as broken",
          composed.anchoredEdge === 0, "run passed — nothing to anchor");
      }
    }
    if (expectBase === "sequence") {
      record("MergeForge: the window overlay brackets real touched slots",
        composed.drawing > 0 && composed.span > 0, JSON.stringify(composed));
    }
    if (expectBase === "chart") {
      record("ShardBalancer: the zones are drawn as bars",
        composed.bars > 0, JSON.stringify(composed));
      record("ShardBalancer: bars are the numbers, so no duplicate metric strip",
        s.metrics.length === 0, `${s.metrics.length} strip card(s)`);
    }
    if (expectBase === "text") {
      record("LogMatcher: the rewritten stream is drawn line by line",
        composed.stream > 0, JSON.stringify(composed));
    }
    if (shotName) await shot(shotName);
  }

  // === 3b · the six C6 bases render in a real browser ========================
  //
  // No C6 project exists in the store, and creating one goes through the AI
  // analyze step, so these cannot be driven end-to-end here. What CAN be proven
  // in the real browser is the half that is this agent's scope: the real
  // Preview Surface module, loaded by the real page, fed the real payload the
  // registry produces for each C6 arc. It is a RENDERER proof, not a run proof
  // — a run proof needs a C6 project, which is a backend gap reported upstream.
  {
    const registry = require("../../../backend/src/xuongScenarioRegistry.js");
    const BASE_LABEL = {
      tree: "Cấu trúc cây", timeline: "Dòng thời gian", geometry: "Không gian hình học",
      "request-response": "Yêu cầu và phản hồi", "runtime-resource": "Tài nguyên chạy",
      "state-machine": "Trạng thái chuyển tiếp",
    };
    const OVERLAY_LABEL = {
      path: "Tuyến đang chọn", dependency: "Quan hệ đang dùng", compare: "So sánh thay đổi",
      interval: "Khoảng thời gian", constraint: "Ràng buộc", diff: "Trường vừa thay đổi",
      threshold: "Ngưỡng", "resource-usage": "Tài nguyên đang dùng", "error-anchor": "Điểm cần sửa",
    };
    // One arc per C6 base, failing, so every base has to draw an anchor too.
    const seen = new Set();
    const cases = [];
    for (const id of registry.listArcIds()) {
      const arc = registry.getArc(id);
      if (!BASE_LABEL[arc.recipe.base] || seen.has(arc.recipe.base)) continue;
      seen.add(arc.recipe.base);
      const model = arc.model({ actual: 3, passed: false, mappingId: "main-editable-symbol" });
      const overlays = ["error-anchor", ...arc.recipe.overlays].slice(0, 2);
      cases.push({
        base: arc.recipe.base,
        observable: {
          schemaVersion: "xuong.observable.v2",
          scenario: { id: arc.id, display: arc.display, inputSummary: arc.inputSummary },
          cursor: model.events.length,
          entities: model.entities, relations: model.relations, events: model.events,
          anchors: model.anchors, metrics: model.metrics, outputs: model.outputs,
          controls: model.controls, truncation: null,
        },
        recipe: {
          schemaVersion: "xuong.preview-recipe.v2",
          base: { kind: arc.recipe.base, display: { label: BASE_LABEL[arc.recipe.base] } },
          overlays: overlays.map((kind) => ({ kind, display: { label: OVERLAY_LABEL[kind] || "Thông tin bổ sung" } })),
          controlPack: { kind: arc.recipe.control, display: { label: "Xem từng bước" } },
          layout: { kind: arc.recipe.layout, display: { label: "Tập trung vào kết quả" } },
          inspector: { alwaysAvailable: true, display: { label: "Chi tiết lần chạy" } },
        },
      });
    }
    record("C6: the registry offers all six extra bases", cases.length === 6,
      cases.map((c) => c.base).join(", "));

    const rendered = await page.evaluate(async (payloads) => {
      const [surface, models] = await Promise.all([
        import("/src/features/xuong-preview.js?v=2.1.7"),
        import("/src/core/xuong-v2-model.js"),
      ]);
      return payloads.map((entry) => {
        const model = models.previewModel({
          run: models.normalizeRun({ id: "run-c6", status: "completed", eventCount: entry.observable.events.length }),
          observable: models.normalizeObservable(entry.observable),
          recipe: models.normalizeRecipe(entry.recipe),
        });
        const html = surface.renderPreview(model);
        const host = document.createElement("div");
        host.innerHTML = html;
        return {
          base: entry.base,
          available: model.available,
          reason: model.reason,
          drew: host.querySelectorAll("svg, .xp-table, .xp-timeline, .xp-meters, .xp-exchanges, .xp-stream, .xp-chart, .xp-inspector").length,
          metrics: host.querySelectorAll("[data-xp-metric]").length,
          anchors: host.querySelectorAll("[data-xp-anchor]").length,
          text: (host.innerText || "").replace(/\s+/g, " ").trim(),
        };
      });
    }, cases);

    for (const r of rendered) {
      record(`C6 ${r.base}: draws a real projection from the registry payload`,
        r.available && r.drew > 0, r.available ? `${r.drew} projection node(s)` : `unavailable: ${r.reason}`);
      record(`C6 ${r.base}: anchors the failure to source`, r.anchors > 0, `${r.anchors} anchor(s)`);
      // The whole point of the Universal Inspector doctrine.
      const apology = /chưa hỗ trợ|không hỗ trợ|fallback|tier|chưa dựng được/i.test(r.text);
      record(`C6 ${r.base}: never apologises for the base`, !apology, apology ? r.text.slice(0, 90) : "no apology");
    }
  }

  // === 4 · reference storyboard is inert =====================================
  if (await openProject("RouteWatch")) {
    const inert = await page.evaluate(async () => {
      const b = document.querySelector('[data-xg-prov="reference"]');
      if (!b) return { ok: false, why: "no reference switch" };
      b.click();
      await new Promise((r) => setTimeout(r, 700));
      const panel = document.querySelector(".xg-panel");
      // The provenance SWITCH legitimately carries the words "Bản của em" as a
      // button label; what must not appear is a user-run BADGE over inert
      // content. Judge the badge, not the raw panel text.
      return {
        ok: true,
        scrub: !!(panel && panel.querySelector("[data-xp-scrub]")),
        step: !!(panel && panel.querySelector("[data-xp-step]")),
        claimsUserRun: !!(panel && panel.querySelector('.xg-prov-badge[data-provenance="user"]')),
        label: (document.querySelector('.xg-prov-badge[data-provenance="reference"]') || {}).textContent || "",
      };
    });
    record("Reference storyboard has no replay controls",
      inert.ok && !inert.scrub && !inert.step, JSON.stringify(inert));
    record("Reference storyboard does not claim to be the user run",
      inert.ok && !inert.claimsUserRun, (inert.label || "").trim());
  }

  // === 5 · responsive ========================================================
  for (const [w, h, tag] of [[1440, 900, "desktop-1440"], [1180, 860, "narrow-1180"]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await sleep(1200);
    await freeze();
    const s = await railState();
    record(`Responsive ${w}px: no horizontal overflow`, !s.overflowX, `narrative=${s.narrativeW} rail=${s.railW}`);
    // The visual contract asks for a Preview wide enough to become the focus at
    // desktop width. Below 1280 the narrative collapses first and the rail is
    // allowed to take the full row instead.
    if (w >= 1440) {
      record(`Responsive ${w}px: Preview holds its 560–640 band`,
        s.railW >= 550 && s.railW <= 660, `rail=${s.railW}`);
      record(`Responsive ${w}px: narrative holds its 300–340 band`,
        s.narrativeW >= 290 && s.narrativeW <= 350, `narrative=${s.narrativeW}`);
    }
    if (tag === "narrow-1180") await shot("f5-narrow-1180");
  }

  // === 6 · console ===========================================================
  record("Browser console clean", noise.length === 0, noise.slice(0, 6).join(" ; ") || "0 warnings/errors");

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed · shots in ${OUT}`);
  if (noise.length) console.log("console noise:\n" + noise.join("\n"));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
