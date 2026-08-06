"use strict";

const path = require("path");

// backend/src/config.js  ->  project root is two levels up.
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

// Test-safety guard (belt-and-suspenders with test/_isolate-workspace.js):
// the node test runner sets NODE_TEST_CONTEXT in every worker. If a test is
// running and nobody pinned USACO_IDE_USER_DATA_DIR, redirect the whole
// user-data root to a throwaway temp dir so no test — however it's launched
// (`npm test`, `node --test file`, an IDE runner) — can ever create garbage
// problems/projects in the real workspace. This class of leak has recurred
// three times; making it structurally impossible ends it.
if (process.env.NODE_TEST_CONTEXT && !process.env.USACO_IDE_USER_DATA_DIR) {
  const os = require("os");
  const dir = path.join(os.tmpdir(), "usaco-ide-2-test", `auto-${process.pid}`);
  require("fs").mkdirSync(dir, { recursive: true });
  process.env.USACO_IDE_USER_DATA_DIR = dir;
}

const USER_DATA_ROOT = process.env.USACO_IDE_USER_DATA_DIR
  ? path.resolve(process.env.USACO_IDE_USER_DATA_DIR)
  : PROJECT_ROOT;

const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");
const WORKSPACE_DIR = path.join(USER_DATA_ROOT, "workspace");
const PROBLEMS_DIR = path.join(WORKSPACE_DIR, "problems");
const CONTESTS_DIR = path.join(WORKSPACE_DIR, "contests");
const XUONG_DIR = path.join(WORKSPACE_DIR, "xuong");
const APPLICATION_PROJECTS_DIR = path.join(XUONG_DIR, "projects");
const APPLICATION_SESSIONS_DIR = path.join(XUONG_DIR, "sessions");
const DATA_DIR = path.join(USER_DATA_ROOT, "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const AI_SETTINGS_FILE = path.join(DATA_DIR, "ai-settings.json");
const ILLUSTRATION_CACHE_FILE = path.join(DATA_DIR, "illustration-cache.json");
const XUONG_ANALYSIS_CACHE_FILE = path.join(DATA_DIR, "xuong-analysis-cache.json");
// The user's personal C++ starter for new problems (Settings → Code template).
// A plain file (not JSON) so it can also be edited in any editor; when absent
// or blank, DEFAULT_TEMPLATE below applies.
const TEMPLATE_FILE = path.join(DATA_DIR, "template.cpp");

const HOST = process.env.USACO_IDE_HOST || "127.0.0.1";
const PORT = Number(process.env.USACO_IDE_PORT || process.env.PORT || 5050);

// Competitive Companion browser extension posts a problem (title/url/samples) to
// this local port. Set USACO_COMPANION_PORT=0 to disable the listener.
const COMPANION_PORT = process.env.USACO_COMPANION_PORT != null
  ? Number(process.env.USACO_COMPANION_PORT)
  : 10043;

// Default C++ starter used for new problems and for any problem missing main.cpp.
const DEFAULT_TEMPLATE = [
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "",
  "int main() {",
  "    ios::sync_with_stdio(false);",
  "    cin.tie(nullptr);",
  "",
  "    return 0;",
  "}",
  ""
].join("\n");

// Settings live in data/settings.json and are editable from the Settings tab.
const DEFAULT_SETTINGS = Object.freeze({
  compilerPath: "g++",      // path or command for the C++ compiler
  cppStandard: "c++17",     // -std=<value>
  optimization: "-O2",      // optimization flag passed to g++
  timeMs: 2000,             // per-test wall-clock limit (TLE threshold)
  compareMode: "loose",     // "loose" | "strict" | "token" (ws-insensitive) | "float" (numeric ε)
  epsilon: 1e-6,            // tolerance for "float" compare mode (absolute or relative)
  memoryLimitMB: 0,         // best-effort peak-memory limit (MLE threshold); 0 = off (sampler not wired into the run loop)
  autosave: true,           // editor autosaves code
  autosaveDelayMs: 800,     // debounce for autosave
  tabSize: 4,                // editor indentation width
  theme: "dark",            // "dark" | "light"
  accentColor: "amber",      // "amber" | "blue" | "green" | "orange" | "purple" | "red"
  enableParticles: true,     // background particle animation toggle
  enableVisualizer: true,    // problem interactive visualizer toggle
  momentAuto: true           // Khoảnh Khắc: auto-run AI diagnosis on WA/RE/TLE (README-AUTOPILOT.md M1)
});

// Starter for a per-problem special judge (SPJ). The checker is compiled once
// and invoked with argv = <input_file> <expected_file> <actual_file>; it must
// exit 0 for Accepted and non-zero for Wrong Answer. Anything it prints is shown
// to the user as a "checker message". This default is token/whitespace-tolerant
// (same spirit as the "token" compare mode) so it accepts any answer whose tokens
// match the expected file — a safe starting point users can specialize.
const DEFAULT_CHECKER_TEMPLATE = [
  "// Special judge (checker) for this problem.",
  "// argv[1] = input file, argv[2] = expected/answer file, argv[3] = the program's actual output.",
  "// exit(0) = Accepted, exit(non-zero) = Wrong Answer. Anything printed becomes the checker message.",
  "//",
  "// This default accepts any output whose whitespace-separated tokens match the",
  "// expected file exactly (ignores extra spaces / blank lines). Replace the",
  "// comparison below with problem-specific logic (e.g. accept ANY valid answer,",
  "// compare floats with a tolerance, re-check the actual answer against the input).",
  "#include <bits/stdc++.h>",
  "using namespace std;",
  "",
  "static vector<string> tokens(const string& path) {",
  "    ifstream f(path);",
  "    vector<string> v; string t;",
  "    while (f >> t) v.push_back(t);",
  "    return v;",
  "}",
  "",
  "int main(int argc, char** argv) {",
  "    if (argc < 4) { fprintf(stderr, \"checker: need input expected actual\\n\"); return 2; }",
  "    vector<string> exp = tokens(argv[2]);",
  "    vector<string> act = tokens(argv[3]);",
  "    if (exp.size() != act.size()) {",
  "        printf(\"token count differs: expected %zu, got %zu\\n\", exp.size(), act.size());",
  "        return 1;",
  "    }",
  "    for (size_t i = 0; i < exp.size(); i++) {",
  "        if (exp[i] != act[i]) {",
  "            printf(\"token %zu differs: expected '%s', got '%s'\\n\", i + 1, exp[i].c_str(), act[i].c_str());",
  "            return 1;",
  "        }",
  "    }",
  "    printf(\"ok: %zu tokens matched\\n\", exp.size());",
  "    return 0;",
  "}",
  ""
].join("\n");

const FILE_KINDS = Object.freeze({
  code: "main.cpp",
  input: "input.txt",
  expected: "expected.txt",
  notes: "notes.md",
  statement: "statement.md",
  // Language variants deliberately live beside the canonical statement.  The
  // canonical file stays the input to the existing judge/AI pipeline while the
  // variants let a learner switch language without losing the imported source.
  statementEn: "statement.en.md",
  statementVi: "statement.vi.md",
  mistakes: "mistakes.md",
  checker: "checker.cpp", // per-problem special judge (SPJ); used when meta.usesChecker is on
  chat: "chat.json",   // per-problem AI Coach conversation (post-timer mini-chat)
  synth: "synth.json", // cached Synthesizer (harder-variant) payload, keyed by statement hash
  aicache: "aicache.json", // cached /process result (analysis + verified tests), keyed by statement hash
  editorial: "editorial.json" // cached Post-AC editorial (lời giải chuẩn), keyed by statement hash; AC-gated
});

// AI test generation. OpenAI-compatible Chat Completions by default.
// The API key is stored in data/ai-settings.json (never committed, never logged).
// `fallbackModels` is a comma-separated list tried in order on 429 / overload so a
// single rate-limited model never stalls the whole app (see ai.js chat()).
const DEFAULT_AI_SETTINGS = Object.freeze({
  aiProvider: "openai-compatible",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  fallbackModels: ""
});

const LIMITS = Object.freeze({
  maxTests: 100,
  maxCodeBytes: 256 * 1024,
  maxInputBytes: 4 * 1024 * 1024,
  maxTimeMs: 10000,
  maxOutputBytes: 1024 * 1024,
  maxStderrBytes: 256 * 1024,
  compileTimeoutMs: 20000,
  historyLimit: 30
});

// AI Contest Generator. A contest is a separate domain that lives in
// workspace/contests/<id>/ — never mixed into the problems list. These bounds
// gate generation (readiness threshold) and keep the AI payload from hanging the
// app (statement / test caps).
const CONTEST = Object.freeze({
  minEligible: 15,          // solved problems of a topic required before a contest can be generated
  minProblems: 5,           // problemCount is clamped into [minProblems, maxProblems]
  maxProblems: 7,
  maxRatingCeil: 1999,      // every contest problem must stay strictly below 2000
  minTestsPerProblem: 5,    // each generated problem must ship at least this many verified tests
  maxStatementChars: 16000, // reject statements large enough to stall the reader UI
  maxSolvedContext: 24      // how many solved problems we feed the model for anti-clone context
});

// Điền Lõi (Core Fill) — one AI-authored problem whose reference solution has
// its core reasoning step (DP transition, binary-search predicate, merge
// step...) carved out between two markers. The student fills in ONLY that
// span; everything else (I/O, boilerplate) is already written. Bounds here
// gate generation the same way CONTEST's do.
const COREFILL = Object.freeze({
  minRatingFloor: 800,
  maxRatingCeil: 2200,
  minTests: 4,          // a drill needs at least this many self-verified tests to be servable
  maxStatementChars: 8000,
  maxGenerateAttempts: 3 // JSON-repair retries + structural-verify retries share this budget
});

// Sới Đập Lỗi (Bug Rush) — timed arcade mode: an AI-injected semantic bug
// (never a syntax bug — the generated code must compile 100% of the time),
// fixed under a shrinking clock, 3 lives, score is the only thing to chase.
// No Elo, no new currency — same doctrine as everywhere else in the Arena.
const RUSH = Object.freeze({
  startingLives: 3,
  maxLevel: 12,
  minTimeMs: 15000,        // the clock's floor — never shrinks past this
  maxTimeMs: 60000,        // level 1's starting clock
  timeStepMs: 5000,        // clock shrinks by this much per level, down to minTimeMs
  minVerifiedTests: 2,     // a drill needs at least this many inputs that ACTUALLY expose the bug
  maxGenerateAttempts: 3,
  deckLowWaterMark: 2,     // background top-up fires once the unused deck drops below this
  deckRefillBatch: 2
});

module.exports = {
  PROJECT_ROOT,
  USER_DATA_ROOT,
  FRONTEND_DIR,
  WORKSPACE_DIR,
  PROBLEMS_DIR,
  CONTESTS_DIR,
  XUONG_DIR,
  APPLICATION_PROJECTS_DIR,
  APPLICATION_SESSIONS_DIR,
  DATA_DIR,
  SETTINGS_FILE,
  AI_SETTINGS_FILE,
  XUONG_ANALYSIS_CACHE_FILE,
  ILLUSTRATION_CACHE_FILE,
  TEMPLATE_FILE,
  HOST,
  PORT,
  COMPANION_PORT,
  DEFAULT_TEMPLATE,
  DEFAULT_CHECKER_TEMPLATE,
  DEFAULT_SETTINGS,
  DEFAULT_AI_SETTINGS,
  FILE_KINDS,
  LIMITS,
  CONTEST,
  COREFILL,
  RUSH
};
