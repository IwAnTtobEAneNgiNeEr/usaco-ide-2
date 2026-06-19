# Local Judge

How the `g++` judge works, the verdicts, comparison modes, special judges, and the Lab.

## Run vs. Judge

- **Run** (`Ctrl+Enter`) compiles `main.cpp` and runs it once against the **Run** tab's
  `stdin` (and optional `expected`). Good for quick iteration.
- **Judge All** (`Ctrl+Shift+Enter`) runs every test under `tests/` and reports a verdict
  per test plus an overall verdict.

Builds happen in an isolated OS temp directory, so your workspace stays clean. A compile
cache + precompiled headers make repeat runs ~9× faster. Tests run in a **bounded parallel
pool**; any TLE measured under parallel load is re-confirmed serially before it's trusted.

The **⏹ Stop** button (Run/Judge become Stop while busy) aborts a long judge; cancelled
runs never pollute history or the last verdict.

## Verdicts

| Verdict | Meaning |
|---------|---------|
| **AC** | Accepted — output matches expected |
| **WA** | Wrong Answer — see the side-by-side diff |
| **CE** | Compile Error — stderr shown; **✨ Giải thích lỗi** explains it (with a key) |
| **RE** | Runtime Error — non-zero exit / crash |
| **TLE** | Time Limit Exceeded |
| **MLE** | *Reserved* — colored throughout but **not currently enforced** (see below) |

> **MLE note:** a best-effort memory sampler exists but is intentionally not wired into the
> run loop (it spawns a per-run monitor that slows every judge and still misses sub-200ms
> programs). Doing it correctly needs OS job objects / a native module, which would break the
> zero-dependency rule. So memory limits are not enforced today.

## Comparison modes (Settings)

| Mode | Behavior |
|------|----------|
| **loose** (default) | Ignores trailing spaces and the final newline. |
| **strict** | Exact byte match. |
| **token** | Whitespace-insensitive token comparison. |
| **float** | Numeric comparison within `epsilon` (absolute or relative). |

## Special judges (SPJ)

For problems with multiple valid answers, turn on **Special judge (SPJ)** in **Edit info**.
A starter `checker.cpp` is scaffolded; edit it via **⚖️ Checker** in the Tests tab. It's
invoked as `checker <input> <expected> <actual>` and must exit `0` for Accepted, non-zero for
Wrong Answer; anything it prints becomes the checker message. The checker is compiled once
and cached.

## USACO file mode (freopen)

In **Edit info**, set a **File name** (e.g. `milk`) and enable **USACO file mode**. Code using
`freopen("milk.in","r",stdin); freopen("milk.out","w",stdout);` is then judged correctly. The
editor warns if your `freopen` filename doesn't match the configured one.

## Stress Lab

Open the **🧪 Lab** (editor toolbar). It has three tools:

1. **Stress test** — provide a *generator* (prints a random valid input) and a *brute force*
   (a simple, obviously-correct solution). The Lab runs many random cases, feeding each to
   both your `main.cpp` and the brute, and stops at the **first mismatch**, showing the input
   that breaks you. With an AI key, **auto-write** the generator/brute from the statement.
2. **Complexity profiler** — runs your solution on growing inputs and estimates the time/space
   growth curve.
3. **Dry-run debugger** — (AI) simulate your code on an input, tracking chosen variables.

The Lab is the most reliable way to find the hidden boundary bug an online judge would WA you
on — no AI guessing about expected output is involved in the stress loop itself.

## Backend API (judge-related)

```
POST /api/problems/:id/run            POST /api/problems/:id/judge
GET/PUT /api/problems/:id/checker     # SPJ source
GET  /api/problems/:id/history        # run snapshots (code + stdout/stderr)
POST /api/problems/:id/stress         POST /api/problems/:id/profile
GET  /api/settings/compiler           # g++ availability + version
```
