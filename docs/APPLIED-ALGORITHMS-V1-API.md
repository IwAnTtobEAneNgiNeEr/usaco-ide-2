# Applied Algorithms v1 API Contract

Status: **locked for v1**  
Owner: Core/Product Systems  
Base: `56fed199d3627733faf2e862778f041e5773852a`

This is the binding backend/frontend contract for the module-first Applied Algorithms v1 slice. Additive fields are allowed; existing field names, enum values, nullability, endpoint meanings, and response envelopes must not change during v1 integration.

## Canonical vocabulary

Only these persisted/API values are canonical:

```text
track: competitive | algorithm-engineering
activityKind: competitive-problem | algorithm-module | applied-simulation
```

UI labels are presentation-only:

```text
competitive           -> Luyện thi
algorithm-engineering -> Thuật toán & ứng dụng
```

Aliases may be accepted at legacy input boundaries, but every v1 response returns canonical values. A requirement variant is an `algorithm-module` catalog entry or module requirement, not a fourth activity kind. `implementation-task` is not part of this contract.

## Shared types

Timestamps are ISO-8601 strings. IDs are opaque strings. `derivedFrom` is either a real lineage reference or `null`; standalone modules must never synthesize lineage.

```ts
type Track = "competitive" | "algorithm-engineering";
type ActivityKind =
  | "competitive-problem"
  | "algorithm-module"
  | "applied-simulation";
type DerivedStatus = "unverified" | "verified" | "needs-work";
type Verdict = "AC" | "WA" | "CE" | "RE" | "TLE";

type Lineage = {
  problemId: string;
  evidenceId: string;
  runId: string;
  codeHash: string;
};

type OpenTarget =
  | { type: "problem"; problemId: string }
  | { type: "module"; scope: "standalone"; artifactId: string }
  | { type: "module"; scope: "derived"; artifactId: string; problemId: string }
  | { type: "simulation"; simulationId: string; artifactId: string };
```

`derivedStatus` is computed from the active requirement, saved source hash, and verifier history. Metadata alone cannot mark a module verified. A passing check is current only when its `requirementId` and `codeHash` match the active requirement and current saved files.

## Catalog and search summary

### `GET /api/catalog`

```json
{
  "items": ["CatalogSummary"],
  "count": 12,
  "tracks": ["competitive", "algorithm-engineering"],
  "activityKinds": ["competitive-problem", "algorithm-module", "applied-simulation"]
}
```

### `GET /api/catalog/search`

Query parameters: `q`, `track`, `activityKind`, `concept`, `status`, `provider`, `collection`, `minRating`, `maxRating`. Filters combine with AND semantics. `q` is case/diacritic-insensitive text search. Exact enum filters do not silently broaden.

```json
{
  "results": ["CatalogSummary"],
  "count": 3,
  "filters": {
    "q": "route",
    "track": "algorithm-engineering",
    "activityKind": "algorithm-module",
    "concept": "dijkstra",
    "status": "verified"
  }
}
```

```ts
type CatalogSummary = {
  id: string;
  title: string;
  track: Track;
  activityKind: ActivityKind;
  concept: string;
  status: string;
  derivedStatus: DerivedStatus | null;
  derivedFrom: Lineage | null;
  provider: string;
  collection: string;
  requirement: string | null;
  updatedAt: string;
  open: OpenTarget;
};
```

GridPathfinder, WeightedGraphRouter, and RangeSum appear as direct `algorithm-module` entries. Their standalone entries have `derivedFrom: null`. A separately created module derived from an OJ solution retains its real `Lineage`.

## Module brief, source, tests, and history

### Open/materialize a standalone module

`POST /api/modules/:artifactId/open`

Materializes the curated module in local storage on first open and is idempotent thereafter. It never requires a problem ID and never overwrites an existing local artifact.

```json
{ "artifact": "ModuleWorkspace" }
```

### Open a derived module

`GET /api/problems/:problemId/derived-artifacts/:artifactId`

The existing Verified Artifact route remains canonical for derived storage. The returned artifact uses the same workspace fields and includes non-null `derivedFrom`.

### Read workspace

`GET /api/modules/:artifactId`

```ts
type ModuleWorkspace = {
  id: string;
  title: string;
  track: "algorithm-engineering";
  activityKind: "algorithm-module";
  concept: string;
  interface: { language: "cpp"; summary: string; entrypoints: string[] };
  brief: string;
  derivedFrom: Lineage | null;
  derivedStatus: DerivedStatus;
  currentRequirementId: string;
  requirements: Requirement[];
  files: Record<string, string>;
  tests: { public: TestDescriptor[]; hidden: TestDescriptor[] };
  runs: VerificationCheck[];
  evidence: Lineage | null;
  nextAction: string;
  storage: "catalog-default" | "local";
  createdAt: string;
  updatedAt: string;
};
```

Minimum multi-file support is an explicit module file set (`.h`/`.hpp`, `.cpp`, and test files). It is not a universal project/build-tool API. Hidden test descriptors expose IDs and intent, not hidden source.

### Read source

`GET /api/modules/:artifactId/source`

```json
{ "artifactId": "weighted-graph-router", "file": "WeightedGraphRouter.cpp", "source": "..." }
```

### Save source

`PUT /api/modules/:artifactId/source`

Request:

```json
{ "source": "..." }
```

Response:

```json
{ "artifact": "ModuleWorkspace" }
```

Save updates the local copy only. The immutable curated default and any original OJ solution/evidence are never overwritten. Saving invalidates current verification through source-hash mismatch; it does not delete history.

### Verify

`POST /api/modules/:artifactId/verify`

Request:

```json
{ "suite": "baseline" }
```

`suite` is `baseline` or `requirement-change`.

```json
{
  "check": {
    "id": "check-...",
    "artifactId": "weighted-graph-router",
    "suite": "baseline",
    "requirementId": "shortest-path-v1",
    "verdict": "AC",
    "codeHash": "sha256...",
    "stdout": "OK\n",
    "stderr": "",
    "timeMs": 12,
    "at": "2026-07-16T00:00:00.000Z"
  },
  "artifact": "ModuleWorkspace"
}
```

### Read verification history

`GET /api/modules/:artifactId/history`

```json
{ "artifactId": "weighted-graph-router", "runs": ["VerificationCheck"] }
```

History is newest-first and append-only.

## Requirement activation

`POST /api/modules/:artifactId/requirement-changes/:requirementId/activate`

Baseline must be currently verified. Activation is idempotent for the already-active requirement and returns:

```json
{ "artifact": "ModuleWorkspace" }
```

The requirement change becomes active, `derivedStatus` becomes `needs-work`, and its own suite must pass for `verified`. The expected loop is save -> verify -> feedback -> work; a WA remains in history and the next saved fix can reach AC without destroying prior evidence.

## Recommendation feedback

Signals:

```text
too_easy | too_hard | not_relevant | already_know | reset
```

### Write/reset signal

`PUT /api/recommendations/feedback/:itemId`

Request:

```json
{ "track": "algorithm-engineering", "signal": "too_hard" }
```

Response:

```json
{
  "feedback": {
    "itemId": "module:weighted-graph-router",
    "track": "algorithm-engineering",
    "signal": "too_hard",
    "updatedAt": "2026-07-16T00:00:00.000Z"
  }
}
```

For `reset`, the response is `{ "feedback": null }`. Storage is local-first and keyed by `(track,itemId)` with last-write time. No mastery inference or cloud sync is implied.

### Ranked recommendations

`GET /api/recommendations/entry?track=algorithm-engineering`

```json
{
  "items": [
    {
      "item": "CatalogSummary",
      "score": 75,
      "reason": ["Matches selected track.", "Deferred after too_hard feedback."],
      "feedback": { "signal": "too_hard", "updatedAt": "..." }
    }
  ],
  "count": 3,
  "maxItems": 3,
  "autoOpen": false
}
```

Ranking is deterministic for the same catalog, filters, feedback file, and clock bucket. Signals adjust ordering; they never lock or auto-open content. `not_relevant` and `already_know` strongly demote the exact item, `too_easy` favors harder alternatives, `too_hard` favors easier alternatives, and `reset` removes the adjustment. Reasons expose applied adjustments.

## Route Planner Simulation

`POST /api/modules/weighted-graph-router/simulate`

Request uses structured JSON and directed non-negative weighted edges:

```json
{
  "input": {
    "nodeCount": 4,
    "edges": [
      { "from": 0, "to": 1, "weight": 5 },
      { "from": 1, "to": 3, "weight": 2 }
    ],
    "start": 0,
    "target": 3
  }
}
```

Reachable response:

```json
{
  "output": { "reachable": true, "distance": 7, "path": [0, 1, 3] },
  "module": { "artifactId": "weighted-graph-router", "derivedStatus": "verified", "codeHash": "sha256..." },
  "run": { "verdict": "AC", "timeMs": 3 }
}
```

Unreachable response uses `{ "reachable": false, "distance": null, "path": [] }`. Invalid nodes, negative/unsafe weights, malformed edges, and oversized graphs return HTTP 400. A non-verified current module returns HTTP 409. Compile/runtime/invalid-output failures return HTTP 422.

Each call compiles/runs the current saved WeightedGraphRouter module with the supplied input. Repeated calls are isolated and deterministic; changing graph weights or endpoints executes the module again. The backend does not hard-code route results and does not use AI-generated output.

## Error envelope and compatibility

All errors use the existing envelope:

```json
{ "error": "Human-readable message." }
```

The competitive problem/judge flow and existing derived-artifact endpoints remain supported. Applied Algorithms adds direct module/catalog/simulation paths and shares the Verified Artifact core; it does not introduce Java, fullstack adapters, Arena/Quiz/Contest/reward/cloud behavior, or a general taxonomy/project engine.
