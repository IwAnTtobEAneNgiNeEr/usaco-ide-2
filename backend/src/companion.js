"use strict";

// companion.js — listens for the Competitive Companion browser extension, which
// POSTs a JSON problem payload (title, url, group, time/memory limits, and the
// EXACT sample tests) to a local port. We turn that into a workspace problem
// with the samples pre-loaded as test cases — lossless, no OCR needed.
//
// Payload shape (Competitive Companion "single problem"):
//   { name, group, url, interactive, memoryLimit, timeLimit, tests: [{input, output}], ... }

const http = require("http");
const { HOST } = require("./config");

// Map a problem URL to a friendly source label; fall back to the group prefix.
function deriveSource(url, group) {
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const map = [
    [/codeforces\.com|codeforces\./, "Codeforces"],
    [/atcoder\.jp/, "AtCoder"],
    [/cses\.fi/, "CSES"],
    [/usaco\.org/, "USACO"],
    [/oj\.uz/, "oj.uz"],
    [/spoj\.com/, "SPOJ"],
    [/leetcode\.com/, "LeetCode"],
    [/vnoi|oj\.vnoi/, "VNOI"]
  ];
  for (const [re, label] of map) if (re.test(host)) return label;
  if (group && typeof group === "string") return group.split(" - ")[0].trim();
  return host || "";
}

function buildStatement(payload) {
  const lines = [`# ${payload.name || "Imported problem"}`, ""];
  if (payload.url) lines.push(payload.url, "");
  const limits = [];
  if (payload.timeLimit) limits.push(`Time limit: ${payload.timeLimit} ms`);
  if (payload.memoryLimit) limits.push(`Memory limit: ${payload.memoryLimit} MB`);
  if (limits.length) lines.push(limits.join(" · "), "");
  lines.push("> Đề bài: dán/OCR nội dung đầy đủ vào đây. Các sample đã được nhập sẵn ở tab Test Cases.");
  return lines.join("\n");
}

// Convert a CC payload to createProblem input. Returns null if there's nothing usable.
function toProblemInput(payload) {
  if (!payload || typeof payload !== "object") return null;
  const name = String(payload.name || "").trim() || "Imported problem";
  const tests = (Array.isArray(payload.tests) ? payload.tests : [])
    .map((t) => ({ input: String(t.input != null ? t.input : ""), expected: String(t.output != null ? t.output : "") }))
    .filter((t) => t.input !== "" || t.expected !== "");
  return {
    title: name,
    source: deriveSource(payload.url, payload.group),
    statement: buildStatement(payload),
    tests,
    // Pre-load the first sample into the scratch Input/Expected for an instant Run.
    input: tests[0] ? tests[0].input : "",
    expected: tests[0] ? tests[0].expected : ""
  };
}

// Start the listener. `createProblem` is injected (problemStore.createProblem) so
// this module stays decoupled and testable. Returns the http.Server (or null).
function startCompanionListener({ port, createProblem, log = () => {} }) {
  if (!port || port <= 0) { log("Companion listener disabled"); return null; }

  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "text/plain" });
      res.end("Competitive Companion endpoint — POST only.");
      return;
    }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 8 * 1024 * 1024) req.destroy(); });
    req.on("end", async () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end("bad json"); return; }
      const input = toProblemInput(payload);
      if (!input) { res.writeHead(400); res.end("no problem"); return; }
      try {
        const meta = await createProblem(input);
        log("Companion import", `${meta.title} (${input.tests.length} samples) → ${meta.id}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, id: meta.id, title: meta.title, tests: input.tests.length }));
      } catch (error) {
        log("Companion import failed", error.message);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
  });

  server.on("error", (err) => {
    // Most commonly EADDRINUSE when another CP tool already owns the port — warn, don't crash.
    log("Companion listener error", err.code === "EADDRINUSE"
      ? `port ${port} in use (another CP tool?) — Competitive Companion import disabled`
      : err.message);
  });

  server.listen(port, HOST, () => log("Companion listener ready", `${HOST}:${port}`));
  return server;
}

module.exports = { startCompanionListener, toProblemInput, deriveSource };
