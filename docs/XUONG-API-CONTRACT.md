# Xưởng API Contract — v2 Preview Runtime (backend ↔ frontend)

> **Trạng thái C0:** ĐÓNG BĂNG 2026-07-23. Đây là contract triển khai P1 Xưởng.
> Mọi route/payload v1 Demo-first còn được giữ để tương thích trong transition,
> nhưng không phải input cho UI rebuild. Frontend và backend phải dùng fixture
> chung tại [`docs/fixtures/xuong-contract-v2.json`](fixtures/xuong-contract-v2.json).

Tài liệu này khóa dữ liệu giữa backend và frontend. Định hướng sản phẩm sống ở
[`README.md`](../README.md) §6, §11.1, §15.6; lịch sử và thứ tự làm sống ở
[`HANDOVER.md`](HANDOVER.md) §4, §7. Không bên nào tự thêm field hoặc đổi tên
route trong code rồi yêu cầu bên còn lại chạy theo.

## 1. Nguyên tắc protocol

- Mọi response thành công luôn có **envelope đúng bảng §3**; không trả object trần.
- JSON dùng `camelCase`, thời gian ISO-8601 UTC, id opaque và ổn định trong một
  project/run. Frontend không render raw id/enum/path/hash.
- `display.label`/`display.description` là copy product-facing tiếng Việt. `kind`,
  `id`, `filePath`, `contentHash`, `registryVersion` chỉ phục vụ code, không lộ UI.
- `Run`, `Replay`, `Checks` là deterministic: **không gọi AI**. AI chỉ có mặt ở
  `/analyze`, lúc user chủ động đổi pathway, hoặc lời giải thích chủ động có cache.
- Một source revision sinh được tối đa một `ScenarioRun` cache cho cùng
  `scenarioId + controlState`; cache hit vẫn trả DTO đầy đủ nhưng không được giả
  “đang chạy”.
- `ReferenceStoryboard` và `ScenarioRun` là hai type khác nhau. Không dùng cờ
  `isReference` để biến run của user thành mẫu.

## 2. Vòng đời v2

```text
Solution AC
  → POST /api/xuong/analyze
  → POST /api/xuong/sessions/:sessionId/select
       { project, reference }
  → GET  /api/xuong/projects/:projectId/reference        (reload S4)
  → PUT  /api/xuong/projects/:projectId/files/:filePath (save source)
  → POST /api/xuong/projects/:projectId/run              (Bản của em)
       { project, run, observable, recipe }
  → GET  /api/xuong/projects/:projectId/runs/:runId/replay?cursor=N
       { run, replay }
  → POST /api/xuong/projects/:projectId/checks
       { project, checkedRunId, evidence }
  → POST /api/xuong/projects/:projectId/evolve
       { project }
```

`/demo` và `/verify` v1 vẫn tồn tại trong transition (§10), nhưng S4/S5 mới không
được dùng chúng làm nguồn chính cho Preview hoặc verdict.

## 3. Route và envelope chính xác

| Route | Request | Response thành công |
|---|---|---|
| `POST /api/xuong/analyze` | `AnalyzeInput` | `{ session: Session }` |
| `POST /api/xuong/sessions/:sessionId/select` | `{ pathwayId: string }` | `{ project: Project, reference: ReferenceStoryboard }` |
| `GET /api/xuong/projects` | — | `{ projects: ProjectSummary[] }` |
| `GET /api/xuong/projects/:projectId` | — | `{ project: Project }` |
| `GET /api/xuong/projects/:projectId/reference` | — | `{ reference: ReferenceStoryboard }` |
| `PUT /api/xuong/projects/:projectId/files/:filePath` | `{ source: string, expectedContentHash: string }` | `{ project: Project }` |
| `POST /api/xuong/projects/:projectId/run` | `RunRequest` | `{ project: Project, run: ScenarioRun, observable: ObservableModel \| null, recipe: PreviewRecipe \| null }` |
| `GET /api/xuong/projects/:projectId/runs/:runId/replay?cursor=N` | — | `{ run: ScenarioRun, replay: ReplayFrame }` |
| `POST /api/xuong/projects/:projectId/checks` | `{ runId?: string }` | `{ project: Project, checkedRunId: string, evidence: Evidence[] }` |
| `POST /api/xuong/projects/:projectId/evolve` | `{ request?: string }` | `{ project: Project }` |

Lỗi API có duy nhất shape:

```ts
type ApiError = {
  error: {
    code: string;       // machine-readable, không render nguyên văn
    message: string;    // tiếng Việt đọc được
    details?: Record<string, unknown>;
  };
};
```

Mã bắt buộc: `PROJECT_NOT_FOUND` (404), `STALE_SOURCE` (409),
`RUN_NOT_REPLAYABLE` (409), `CURSOR_OUT_OF_RANGE` (422),
`INVALID_CONTRACT_PAYLOAD` (500; backend bug, phải log), `SCENARIO_NOT_FOUND`
(404), `RUN_FAILED` (422 khi request không thể materialize). Không fallback fixture
khi API trả 4xx/5xx thật.

## 4. Core types

```ts
type Display = {
  label: string;                 // VN, ngắn, product-facing
  description?: string;
};

type SourceSpan = {
  startLine: number;             // 1-based, inclusive
  startColumn: number;           // 0-based, inclusive
  endLine: number;               // 1-based, inclusive
  endColumn: number;             // 0-based, exclusive
};

type SourceMapping = {
  id: string;
  filePath: string;              // chỉ dùng mở tab, không render raw
  symbol: string;                // C++ symbol, không phải copy chính
  span: SourceSpan;
  contentHash: string;           // SHA-256 UTF-8 toàn file ở revision này
  display: Display;              // ví dụ: "Hàm tìm đường"
  role: "source-evidence" | "editable" | "supporting";
};

type SourceEvidence = {
  mappingId: string;
  claim: string;                 // "Em đã duyệt được ô kề để tìm đường ít bước"
};

type CapabilityProfile = {
  summary: string;
  capabilities: { id: string; display: Display; evidence: SourceEvidence[] }[];
  constraints: string[];
};

type PathwayTransformation = {
  oldAssumption: string;
  breakingEvent: string;
  newCapability: string;
  observableOutcome: string;
  editableMappingIds: string[];  // phải trỏ SourceMapping.role === "editable"
};

type Pathway = {
  id: string;
  display: Display;
  purpose: string;
  context: string;
  application: string;
  capability: CapabilityProfile;
  transformation: PathwayTransformation;
  sourceMappings: SourceMapping[];
  scenarioId: string;
};

type Session = {
  id: string;
  status: "analyzed" | "selected";
  origin: { type: "problem" | "direct-input"; problemId?: string; title?: string };
  analysis: { summary: string; concepts: string[]; constraints: string[] };
  pathways: Pathway[];           // 0..N; tuyệt đối không ép 3–5
  selectedPathwayId: string | null;
  projectId: string | null;
};

type ProjectFile = {
  path: string;
  display: Display;
  editable: boolean;
  source?: string;                // chỉ GET detail, không có trong ProjectSummary
  contentHash?: string;           // chỉ GET detail cho file editable
};

type ScenarioSummary = {
  id: string;
  display: Display;
  inputSummary: string;
};

type GrowthItem = {
  id: string;
  display: Display;
  state: "present" | "current" | "next"; // growth spine, không có locked/percent
};

type Requirement = {
  id: string;
  display: Display;
  state: "candidate" | "failing" | "met";
  verifierIds: string[];
  failureEvidenceIds: string[];
  passEvidenceIds: string[];
};

type Project = {
  id: string;
  display: Display;
  status: "building" | "ready" | "needs-attention" | "evolving";
  sourceRevision: string;         // SHA-256 canonical aggregate of editable files
  brief: {
    context: string;
    application: string;
    mission: string;
    doneWhen: string;
  };
  capability: CapabilityProfile;
  transformation: PathwayTransformation;
  files: ProjectFile[];
  sourceMappings: SourceMapping[];
  scenarios: ScenarioSummary[];
  growth: GrowthItem[];
  requirements: Requirement[];
  nextAction: { label: string; reason: string };
};

type ProjectSummary = Omit<Project, "files" | "sourceMappings"> & {
  files: Omit<ProjectFile, "source" | "contentHash">[];
};
```

`ScenarioSpec` là schema trusted trong registry/backend. Nó không được AI tự sinh
verifier và không nhất thiết trả nguyên văn cho UI:

```ts
type ScenarioSpec = {
  id: string;
  version: string;
  display: Display;
  inputSchema: Record<string, unknown>;
  initialState: Record<string, unknown>;
  controlDefaults: Record<string, boolean | number | string>;
  observation: {
    entityKinds: string[];
    metricKinds: string[];
    maxEntities: number;          // 1..400
    maxEvents: number;            // 1..500
  };
  runnerBinding: string;          // registry-only; không render UI
  oracleBinding: string;          // registry-only; không render UI
  verifierBindings: string[];    // registry-only; không render UI
};
```

## 5. Reference, user run, observable, preview và replay

```ts
// S4: từ registry/reference code; không có runId, status, verdict hay controls live.
type ReferenceStoryboard = {
  type: "reference-storyboard";
  id: string;
  projectId: string;
  display: Display;
  scenario: ScenarioSummary;
  recipe: PreviewRecipe;
  frames: {
    id: string;
    caption: string;
    observable: ObservableModel;
    highlightMappingIds: string[];
  }[];
};

type RunRequest = {
  scenarioId: string;
  controlState?: Record<string, boolean | number | string>;
};

type CompilerDiagnostic = {
  severity: "error" | "warning";
  message: string;
  filePath?: string;
  span?: SourceSpan;
  sourceMappingId?: string;
};

// S5: source hiện tại của user. "completed" chỉ nói runtime đã quan sát xong,
// không đồng nghĩa requirement pass.
type ScenarioRun = {
  type: "scenario-run";
  id: string;
  projectId: string;
  scenarioId: string;
  sourceRevision: string;
  provenance: "user-source";
  status: "completed" | "compile-error" | "runtime-error" | "timed-out";
  startedAt: string;
  durationMs: number;
  eventCount: number;
  diagnostics: CompilerDiagnostic[];
  outputSummary: string;
};

type ObservableEntity = {
  id: string;
  kind: string;
  display: Display;
  state: Record<string, string | number | boolean | null>;
  geometry?: { x: number; y: number; width?: number; height?: number };
};

type ObservableRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  kind: string;
  display?: Display;
  state?: Record<string, string | number | boolean | null>;
};

type ChangedField = {
  entityId?: string;
  fieldId: string;
  display: Display;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};

type TraceEvent = {
  id: string;
  index: number;                  // zero-based, contiguous
  kind: string;
  display: Display;
  entityIds: string[];
  changedFields: ChangedField[];
  anchorIds: string[];
};

type EventAnchor = {
  id: string;
  eventIndex: number;
  entityId?: string;
  sourceMappingId: string;
  severity: "info" | "warning" | "error";
  display: Display;               // ví dụ: "Ô (3,4) không được cập nhật"
};

type ObservableModel = {
  schemaVersion: "xuong.observable.v2";
  runId: string;
  scenario: ScenarioSummary;
  cursor: number;                 // snapshot sau event cursor; 0..eventCount
  entities: ObservableEntity[];   // ≤ 400
  relations: ObservableRelation[];// ≤ 1,000
  events: TraceEvent[];           // ≤ 500, full trace hoặc trace đã cap
  anchors: EventAnchor[];         // ≤ 100
  metrics: { id: string; display: Display; value: number | string; unit?: string }[]; // ≤ 20
  outputs: { id: string; display: Display; value: string }[]; // ≤ 40
  controls: { id: string; display: Display; type: "toggle" | "number" | "select" | "stepper"; value: boolean | number | string }[];
  truncation?: { eventsDropped: number; entitiesDropped: number; display: Display };
};

type BaseKind =
  | "grid" | "graph" | "tree" | "sequence" | "table" | "timeline"
  | "chart" | "text" | "geometry" | "state-machine" | "request-response"
  | "runtime-resource" | "universal-inspector";

type OverlayKind =
  | "path" | "frontier" | "window" | "partition" | "heap" | "threshold"
  | "heatmap" | "diff" | "selection-range" | "dependency" | "interval"
  | "compare" | "frequency" | "constraint" | "error-anchor" | "annotation"
  | "target" | "resource-usage";

type PreviewRecipe = {
  schemaVersion: "xuong.preview-recipe.v2";
  base: { kind: BaseKind; display: Display };       // đúng một base
  overlays: { kind: OverlayKind; display: Display }[]; // 0..2
  controlPack: { kind: "stepper" | "playback" | "scenario-input" | "time-window" | "none"; display: Display };
  layout: { kind: "focus" | "balanced" | "wide"; display: Display };
  inspector: { alwaysAvailable: true; display: Display };
};

type ReplayFrame = {
  cursor: number;
  totalEvents: number;
  observable: ObservableModel;
  recipe: PreviewRecipe;
  activeAnchorIds: string[];
};
```

`ObservableModel` có thể bằng `null` ở response `/run` khi compile/runtime/timeout.
Khi đó `recipe` cũng phải `null`; frontend hiển thị diagnostic compiler/runtime,
không bịa Preview. `GET replay` chỉ hợp lệ khi `run.status === "completed"`.

## 6. PreviewRecipe compatibility và canonicalization

Frontend dùng `display.*` cho text UI; `kind` chỉ để chọn component. Một recipe
chỉ hợp lệ nếu đúng tất cả:

1. Có đúng một `base`; `overlays.length` từ 0 tới 2; không có overlay trùng.
2. `base.kind === "universal-inspector"` chỉ được dùng khi ViewPlanner không có
   projection domain phù hợp. UI vẫn chỉ ghi “Preview”, không gọi đây là tier/fallback.
3. `inspector.alwaysAvailable === true`; không được bỏ inspector ở base khác.
4. Overlay phải nằm trong matrix dưới; `error-anchor` chỉ hợp lệ khi observable có
   ít nhất một anchor; `resource-usage` chỉ hợp lệ khi có metric resource.
5. `controlPack.kind !== "none"` phải có control tương ứng trong observable.
6. Canonical sort overlay theo thứ tự `error-anchor, target, path, frontier, window,
   partition, heap, threshold, heatmap, diff, selection-range, dependency, interval,
   compare, frequency, constraint, annotation, resource-usage`; sau sort, serialize
   JSON stable để cache/dedupe.

| Base | Overlay được phép |
|---|---|
| `grid` | path, frontier, heatmap, selection-range, constraint, error-anchor, target, annotation |
| `graph` / `tree` | path, frontier, heap, dependency, compare, selection-range, error-anchor, target, annotation |
| `sequence` | window, partition, heap, threshold, diff, selection-range, frequency, error-anchor, annotation |
| `table` | window, partition, threshold, diff, compare, frequency, constraint, error-anchor, annotation |
| `timeline` | window, interval, threshold, compare, frequency, error-anchor, annotation |
| `chart` | threshold, heatmap, compare, frequency, target, error-anchor, annotation, resource-usage |
| `text` | diff, selection-range, constraint, error-anchor, annotation, target |
| `geometry` | path, heatmap, selection-range, constraint, error-anchor, target, annotation |
| `state-machine` | dependency, constraint, diff, error-anchor, target, annotation |
| `request-response` | diff, threshold, compare, constraint, error-anchor, annotation, resource-usage |
| `runtime-resource` | threshold, heatmap, compare, target, error-anchor, resource-usage, annotation |
| `universal-inspector` | error-anchor, diff, compare, constraint, annotation |

Backend thực hiện `validateAndCanonicalizeRecipe(recipe, observable)` trước khi trả
response. Lỗi validation không được “sửa” ở frontend: backend trả
`INVALID_CONTRACT_PAYLOAD` và test fail.

## 7. Quy tắc mapping, replay và red-before-green

- `SourceMapping.contentHash` phải khớp đúng content hash của file tại
  `Project.sourceRevision`. Nếu save source làm mapping cũ stale, backend phải
  materialize mapping mới hoặc bỏ `sourceMappingId`; không được nhảy sai dòng.
- Mọi `EventAnchor.eventIndex` phải trỏ một event tồn tại; `entityId` (nếu có)
  phải tồn tại trong snapshot; `sourceMappingId` phải có trong `Project.sourceMappings`.
- `GET replay?cursor=N` trả snapshot **sau** N event, với `0 ≤ N ≤ totalEvents`.
  `cursor=0` là initial state, `cursor=totalEvents` là final state. Không có auto-play
  hay phần trăm tiến trình giả.
- Build error dùng `CompilerDiagnostic`; behavior error dùng `EventAnchor`. Không
  ép compiler error thành trace và không gọi trace là verifier.
- Một Requirement chỉ chuyển `candidate → failing` khi `/checks` trả Evidence fail
  có `requirementId` tương ứng. Chỉ chuyển `failing → met` khi có pass Evidence của
  cùng requirement + verifier id/version và đã tồn tại fail Evidence trước đó ở source
  revision khác. Đây là red-before-green; comment-only hoặc pass baseline không mở
  capability mới.
- `Evidence.detail` phải nêu hành vi, expected/actual hoặc điều kiện đo được và nơi
  xảy ra. `PASS · 472ms` không hợp lệ.

## 8. Golden fixtures bắt buộc

Nguồn duy nhất: [`docs/fixtures/xuong-contract-v2.json`](fixtures/xuong-contract-v2.json).
Agent A và B phải đọc file này trong contract tests, không copy object inline.

| Fixture | Chứng minh |
|---|---|
| `mazeReference` | `ReferenceStoryboard` khác type với user run, grid recipe, mapping highlight |
| `mazeUserFail` | run source user, grid error anchor → source mapping, recipe 2 overlay, replay cursor |
| `routeWatchGraph` | renderer non-list graph, composition recipe, run completed không đồng nghĩa pass |
| `logMatcherInspector` | Universal Inspector thật khi không có projection domain phù hợp |

Fixture là golden contract, không phải simulation production hay hard-code domain.
Backend test phải validate rồi round-trip fixture; frontend test phải normalize/render-model
fixture mà không render raw metadata. Khi thêm field bắt buộc: coordinator sửa contract
và fixture trước, rồi cả A/B cập nhật test trong cùng checkpoint.

## 9. Transition từ Demo-first v1

| v1 giữ lại | Quy tắc transition |
|---|---|
| `POST /projects/:id/demo` → `{ project, demoRun }` | Giữ nguyên semantics: stdout để xem, không Evidence/pass. Không dùng làm S5 Preview mới. |
| `POST /projects/:id/verify` → `{ project, evidence }` | Giữ tương thích. v2 UI gọi `/checks`; backend có thể delegate cùng verifier runtime. |
| `milestones[]` v1 | Không thêm vào Project v2. Thay bằng `growth[]` biến thiên. |
| `seedId`, `contractCriteria`, fixed 3–5 pathways | Không xuất hiện trong v2 public DTO/UI. Registry có thể dùng id nội bộ nhưng không rò response. |

Không có migration âm thầm cho project v1. Backend có thể trả `PROJECT_REQUIRES_V2_MATERIALIZATION`
cho UI rebuild hoặc materialize dự án mới từ pathway v2; không bọc seed cũ bằng copy mới.

## 10. Test và ownership

- Coordinator sở hữu file contract + fixture shared.
- Agent A chỉ sửa `frontend/**`; Agent B chỉ sửa `backend/**`.
- A0/B1 phải có contract tests đọc fixture §8 trước UI/runtime feature.
- Backend test phải chạy cả `node --test test/xuong-api.test.js` trực tiếp và
  `npm test`, không rò workspace thật (`NODE_TEST_CONTEXT` guard).
- Chỉ C2/C4 mới là bằng chứng implementation: API thật, app canonical `:5050`,
  screenshot/log, grep metadata và regression Luyện tập. C0 này chỉ khóa dữ liệu,
  không được tự nhận Preview Engine đã build.
