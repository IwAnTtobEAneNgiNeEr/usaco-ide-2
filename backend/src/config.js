"use strict";

const path = require("path");

// backend/src/config.js  ->  project root is two levels up.
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");
const WORKSPACE_DIR = path.join(PROJECT_ROOT, "workspace");
const PROBLEMS_DIR = path.join(WORKSPACE_DIR, "problems");
const CONTESTS_DIR = path.join(WORKSPACE_DIR, "contests");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const AI_SETTINGS_FILE = path.join(DATA_DIR, "ai-settings.json");
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
  accentColor: "amber"      // "amber" | "blue" | "green" | "orange" | "purple" | "red"
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

module.exports = {
  PROJECT_ROOT,
  FRONTEND_DIR,
  WORKSPACE_DIR,
  PROBLEMS_DIR,
  CONTESTS_DIR,
  DATA_DIR,
  SETTINGS_FILE,
  AI_SETTINGS_FILE,
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
  CONTEST
};
