# Local Judge: current boundaries

Use security/truth-core.md for the canonical current/stale contract. Full Judge selects the trusted suite; AI candidates are excluded. Fingerprints cover all verdict-affecting inputs; immutable attempts preserve source, compiler and per-test evidence, including CE and cancellation. Single-test/Stop attempts never grant full AC.

g++ compiles and the resulting process runs with the backend's OS rights. A temporary work directory is not an OS sandbox. On the borrowed Windows machine execute server/compiler tests only through verified MXC. No hosted/multi-user isolation, enforceable memory limit or general disk quota is implemented by this app.

The runner enforces timeouts and bounded captured stdout/stderr/USACO .out output, with explicit OUTPUT_LIMIT on overflow. This does not prevent all disk growth by arbitrary programs. File-mode .out is checked before bounded reading; tests cover it alongside stdout/stderr overflow.

Normal AC/WA/CE/RE/TLE, Stop, import and restart are covered by the existing suite and campaign browser checks. See operations/development.md for commands and external REGRESSION_REPORT.md for actual counts. No performance claim is made without a benchmark.
