import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statement = fs.readFileSync(path.join(root, "src", "statement.js"), "utf8");
const canvas = fs.readFileSync(path.join(root, "src", "statement-neon-canvas.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles", "statement-neon.css"), "utf8");
const polishCss = fs.readFileSync(path.join(root, "styles", "statement-neon-polish.css"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("Statement Neon assets stay wired with a toggleable animation", () => {
  assert.match(index, /styles\/statement-neon\.css/);
  assert.match(index, /styles\/statement-neon-polish\.css/);
  assert.match(statement, /import \{ initNeonCanvas \} from "\.\/statement-neon-canvas\.js(?:\?v=[^"]+)?"/);
  assert.match(statement, /<canvas id="stmt-neon-canvas"><\/canvas>/);
  assert.match(statement, /initNeonCanvas\(canvas, app\.state\.meta\?\.topic, app\.state\.meta, \{ animate: !!app\.state\.showIllustration \}\)/);
  assert.match(statement, /app\.state\.showIllustration = false/);
  assert.match(canvas, /const shouldAnimate = opts\.animate !== false/);
  assert.match(canvas, /requestAnimationFrame\(loop\)/);
  assert.match(canvas, /cancelAnimationFrame\(animationFrame\)/);
  assert.match(css, /\.stmt-neon-hero/);
  assert.match(css, /\.stmt-neon-io-grid/);
  assert.match(polishCss, /\.stmt-neon-secondary > \.stmt-section/);
  assert.match(statement, /class="stmt-section-icon" aria-hidden="true"/);
  assert.match(css, /\.stmt-neon-shell \.stmt-section-label::after \{\s*display: none;/);
});

test("permutation statements use a dedicated visual instead of the generic backtracking tree", () => {
  assert.match(canvas, /function renderPermutation\(\)/);
  assert.match(canvas, /hoán vị\|permutation/);
  assert.match(canvas, /renderPermutation\(\)/);
});

test("pasted statements still auto-run and persist generated tests with provenance", () => {
  assert.match(statement, /ioStatement\.addEventListener\("input", \(\) => \{\s*scheduleSamplePreview\(\);\s*scheduleAuto\(\);\s*\}\)/s);
  assert.match(statement, /runPipeline\(app, \{ force: false \}\)/);
  assert.match(statement, /const autoAddable = tests\.filter/);
  assert.match(statement, /await api\.addTest\(app\.state\.currentId/);
  assert.match(statement, /provenance: t\.provenance/);
  assert.match(statement, /statementHash: t\.statementHash/);
  assert.doesNotMatch(statement, /confidence:|verifiedBy:/);
});

test("sample preview renders locally without waiting for the AI pipeline", () => {
  assert.match(statement, /copy\|copied/);
  assert.match(statement, /requestAnimationFrame\(\(\) => \{\s*samplePreviewFrame = null;\s*refreshExamples\(app, el\.ioStatement\.value\);/s);
  assert.match(statement, /renderStatement\(app\);\s*refreshExamples\(app, statement\);\s*\n\s*const res = await api\.aiProcess/s);
});

test("statement hero prioritizes validated AI Canvas scenes", () => {
  assert.match(statement, /function heroIllustration\(app\)/);
  assert.match(statement, /stmt-neon-hero-image/);
  assert.match(statement, /const hasScene = app\.state\.canvasScene/);
  assert.match(statement, /stmt-ai-canvas/);
  assert.match(css, /\.stmt-neon-hero-figure/);
  assert.match(css, /\.stmt-neon-hero-image/);
  assert.match(statement, /stmt-neon-hero\$\{heroVisualHtml \? " has-visual" : ""\}/);
  assert.match(statement, /sections\.filter\(\(section\) => section\.type !== "description"\)/);
  assert.doesNotMatch(statement, /heroIllustration\(app\) \|\| `<canvas id="stmt-neon-canvas"><\/canvas>`/);
});

test("statement view exposes a manual illustration button while auto generation stays toggle-driven", () => {
  assert.match(index, /id="btn-ai-illustration"/);
  assert.match(statement, /app\.generateIllustration = \(\) => \{/);
  assert.match(statement, /btnAiIllustration/);
  assert.match(statement, /requestCanvasIllustration\(app, \{ manual: true \}\)/);
  assert.match(statement, /if \(!manual && !\(app\.state\.aiSettings && app\.state\.aiSettings\.illustrationEnabled\)\) return null;/);
  assert.match(statement, /hasScene \? \(showing \? "⏸ Tắt animation" : "▶ Hiển thị animation"\) : "🎨 Tạo minh họa"/);
});

test("manual Canvas illustration prevents duplicate requests and applies validated scenes", () => {
  assert.match(statement, /api\.aiCanvasIllustration/);
  assert.match(statement, /app\.state\.canvasScene = res\.scene/);
  assert.match(statement, /app\.state\.showIllustration = true/);
  assert.match(statement, /if \(app\.state\._illustrationBusy\) return/);
  assert.match(statement, /btn\.disabled = true/);
  assert.match(statement, /Đang tạo minh hoạ/);
});

test("persisted AI analysis restores the original neon four-panel layout", () => {
  assert.match(statement, /class="neon-ai-header"/);
  assert.match(statement, /class="neon-ai-grid"/);
  assert.match(statement, /TÓM TẮT/);
  assert.match(statement, /KỸ THUẬT &amp; CHỦ ĐỀ/);
  assert.match(statement, /ĐỘ PHỨC TẠP &amp; RÀNG BUỘC/);
  assert.match(statement, /LƯU Ý \/ GÓC KHUẤT/);
  assert.match(statement, /api\.getProblem\(app\.state\.currentId\)[\s\S]*renderAnalysis\(app/);
  assert.match(css, /\.neon-ai-analysis-container/);
  assert.match(css, /\.neon-ai-grid/);
});
