# Verified Artifact API

## Phase 0 audit: BFS slice

Slice được chọn: `workspace/problems/ok-sang-bai-108-me-cung-it-buoc-nhat-bfs`.

| Thành phần | Dữ liệu thật | Kết luận |
|---|---|---|
| Brief/meta | `statement.md`; `meta.json` có `source="speedrun 120 bài"`, `topic="bfs"`, 3 tags. Chưa có `provider/collection/origin/activityKind`. | Đọc tương thích qua projection; không migrate hàng loạt. |
| Work/code | `main.cpp`; snapshot đầy đủ nằm trong 4 entry của `history.json`. | Solution gốc tiếp tục là `main.cpp`; derived artifact không ghi đè file này. |
| Checks | 28 test trong `tests/`; toàn bộ `generatedBy="ai"`; metadata cũ chưa có provenance. | Judge vẫn chấm suite hiện hữu, nhưng test AI cũ không tự tạo rating/mastery. |
| History | `meta.history` có 16 entry; `history.json` chỉ có 4 snapshot. Judge gần nhất là AC 28/28 ngày 2026-07-05. | AC này là historical evidence, không phải fresh win ở ngày audit 2026-07-15. Run `OK`/`AC` không được tính completion. |
| Moment | Không có thư mục `moment/`; hai câu chẩn đoán nằm trong `chat.json` và không trỏ run/test/snapshot. | Không coi chat cũ là Moment evidence. Failure mới phải tạo evidence trước khi analysis/feedback tham chiếu. |
| Arena | `arena/reference.cpp` + `arena/meta.json` có reference trusted; `meta.match=null`; rating đã confirm. Live eligibility: `sample=false`, `reference=true`, `problemRatingConfirmed=true`, `neverSolvedBefore=false`. | AC cũ không Rated; reference tạo sau AC không được retroactively biến AC đó thành rated progress. |

Fake progress đã thấy:

- `meta.status="learning"` nhưng `lastVerdict="AC"`: field status lưu tay không phản ánh truth và không được dùng làm nguồn completion mới.
- `lastVerdict` bị cập nhật bởi cả Run lẫn Judge; vì vậy consumer mới phải derive completion chỉ từ full Judge history.
- AC cũ có snapshot thật nhưng không có freshness/attempt evidence; historical view luôn trả `freshWin=false` và `ratedProgress=false`.
- Suite AI cũ đã được Judge chấm, nhưng provenance thiếu; không nâng nó thành trusted/rated evidence ngoài semantics hiện tại của Judge/Arena.

Freeze/defer trong slice: mở rộng Arena, Planner/recommendation, Flash Quiz, taxonomy, statement auto-add và mọi frontend redesign.

## Contract boundary

Contract mới là projection/read model từ `meta.json` + Judge history và các evidence file gắn run. Nó không lưu `derivedStatus` hoặc `nextAction` như một source of truth thứ hai. Chi tiết endpoint và schema được chốt ở các phase tiếp theo trong chính tài liệu này.

## HTTP contract v1

Tất cả route nằm dưới `/api/problems/:id`. Field mới là additive; client cũ có thể bỏ qua.

### Run và Judge

`POST /run` và `POST /judge` giữ nguyên verdict/result hiện có, cộng ba field:

```jsonc
{
  "evidence": {
    "id": "run-<uuid>",
    "kind": "run-evidence",
    "runType": "run|judge",
    "verdict": "AC|WA|CE|RE|TLE|OK",
    "codeHash": "sha256",
    "testId": "01|main|null",
    "href": "/api/problems/<id>/evidence/<run-id>"
  },
  "completion": {
    "created": false,
    "verified": false,
    "freshWin": false,
    "ratedProgress": false,
    "reason": "..."
  },
  "nextAction": { "id": "...", "state": "work|verify|feedback|evolve", "label": "...", "reason": "...", "evidence": {} }
}
```

Luật consumer:

- Run và single-test Judge luôn `completion.created=false`, kể cả verdict AC.
- Full Judge AC đầu tiên có thể `freshWin=true`; re-judge bài đã AC luôn false. `ratedProgress=true` chỉ khi Arena thực sự trả một rating entry cho chính verdict đó.
- Chỉ render một `nextAction` chính. Không suy ra completion từ `meta.status`, `lastVerdict` hoặc evidence file.

### Artifact projection và evidence

- `GET /verified-artifact?intent=competitive|derive-module`
- `GET /evidence/:evidenceId`

Artifact response có `activityKind`, `provider`, `collection`, `origin`, `concept`, `difficulty`, `derivedStatus`, `evidence`, `derivedFrom`, `nextAction`, `freshness`. Các giá trị `derivedStatus`: `unverified`, `in-progress`, `needs-work`, `historically-accepted`, `stale`, `verified`.

`derivedStatus` chỉ `verified` khi full Judge AC gần nhất có code snapshot khớp code hiện tại. Old AC thiếu snapshot là `historically-accepted`; code đổi sau AC là `stale`. Historical GET luôn trả `freshness.freshWin=false` và `ratedProgress=false`.

Evidence document trả đúng `run`, full `codeSnapshot`, `test` (input/expected/actual/stderr/diff) và compiler stderr. Evidence là immutable reference; history vẫn là verdict truth.

### BFS analysis

`POST /analysis/bfs-trace` body `{ "evidenceId": "run-..." }`.

Server luôn lấy code/input từ evidence, không lấy bản client gửi kèm. Khi nhận dạng được slice, response có:

```jsonc
{
  "analysis": {
    "supported": true,
    "model": "recognized-grid-bfs-semantic-v1",
    "deterministic": true,
    "executionMode": "semantic-model-not-arbitrary-cpp-instrumentation",
    "basis": { "codeHash": "...", "inputHash": "..." },
    "sourceLines": {},
    "steps": [],
    "result": { "reachable": true, "distance": 5, "path": [], "visitedCount": 8 },
    "warnings": [],
    "evidence": {},
    "nextAction": {}
  }
}
```

Khi `supported=false`, không có `steps`; client dùng `fallback.input`/`fallback.visualizer` và vẫn render `nextAction`. Không gọi đây là arbitrary C++ trace.

### Derived GridPathfinder

- `GET /derived`
- `POST /derived/grid-pathfinder` body `{ "evidenceId": "<full Judge AC evidence>" }`
- `GET /derived/grid-pathfinder`
- `POST /derived/grid-pathfinder/verify` body `{ "suite": "baseline|requirement-change" }`
- `POST /derived/grid-pathfinder/requirement-changes/allow-diagonal-v2/activate`

Create chỉ nhận full Judge AC, không ghi đè artifact cũ và không sửa `main.cpp`. Response chứa source/test files, `derivedFrom`, requirements, `derivedStatus`, derived check runs và một `nextAction`.

Baseline suite cover adjacent, same-cell, unreachable, rectangular grid, blocked endpoint, out-of-bounds và ragged grid. Requirement change đi chéo ban đầu fail thật; chỉ endpoint `activate` explicit mới đổi current requirement và mở lại Work. Backend không dùng AI hoặc auto-rewrite module.

### Module tests and requirement changes

`GET /derived/:artifactId/source` returns `{ "artifactId", "file": "GridPathfinder.cpp", "source" }`.

`PUT /derived/:artifactId/source` accepts `{ "source": "..." }` (or `content`) and returns `{ "artifact": <derived artifact> }`. Only `GridPathfinder.cpp` changes; the original problem `main.cpp` is preserved. Re-run the existing verify route after editing.

`POST /derived/:artifactId/verify` accepts `{ "suite": "baseline|requirement-change" }` and returns `{ "check": { "id", "suite", "requirementId", "verdict", "codeHash", "stdout", "stderr", "timeMs", "at" }, "artifact": <derived artifact> }`. A failed suite is a real check run and never mutates `main.cpp`.

`POST /derived/:artifactId/requirement-changes/:changeId/activate` accepts `{}` and returns `{ "artifact": <derived artifact> }`; the returned artifact has the activated `currentRequirementId` and `nextAction.state="work"` until its suite passes. Activation is explicit and does not rewrite source.

All verified-artifact errors use `{ "error": "stable human-readable message", "code": "OPTIONAL_MACHINE_CODE" }`. `400` is malformed/unsupported input or non-AC derivation, `404` is missing problem/evidence/artifact, and `409` is a conflicting artifact or invalid activation state. Clients must not infer verdict from HTTP status.

### List summary

`GET /api/problems` summary items include `rating`, `cfRating`, `derivedStatus`, and `provenance: { provider, collection, origin, activityKind, derivedFrom }`. These are projections; Judge history remains verdict truth.

## HTTP contract v2: Dijkstra, Prefix Sum, and smart entry

All analysis and derived routes below remain under `/api/problems/:id` unless an absolute `/api/...` path is shown.

### Dijkstra analysis

`POST /analysis/dijkstra-trace` with `{ "evidenceId": "run-..." }` reads only the stored code/input snapshot. The supported input is `n m`, exactly `m` integer weighted edges, then `source target`; weights must be non-negative and vertices must fit one consistent 0/1-based range.

A supported `recognized-dijkstra-semantic-v1` response includes graph direction/index base, source-line markers, and bounded steps with `heapBefore`, `popped`, `stale`, `dist`, `visited`, `relaxations`, and `heapAfter`. The result includes all distances, reachability, distance, visited nodes, and reconstructed path. Unsupported source shapes, malformed graphs, and negative weights return a stable reason plus the exact evidence-input fallback; no trace steps are fabricated.

### Prefix Sum analysis

`POST /analysis/prefix-sum-trace` with `{ "evidenceId": "run-..." }` accepts evidence formatted as `n`, `n` integer values, `q`, then exactly `q` inclusive ranges. It recognizes either conventional 0-based (`prefix[i+1]`, `prefix[r+1]-prefix[l]`) or 1-based (`prefix[i]`, `prefix[r]-prefix[l-1]`) source contracts.

The response includes the prefix construction, every range's index mapping/formula/terms/result/direct sum, and an evidence-backed off-by-one counterexample. If the stored values cannot distinguish the common wrong formula, the counterexample is honestly unavailable rather than invented.

### Derived modules

Concrete create routes are:

- `POST /derived/weighted-graph-router`
- `POST /derived/range-sum-module`

Both require full Judge AC evidence, reject duplicate creation, and never edit the original `main.cpp`. WeightedGraphRouter tests distance, path, unreachable and validation behavior; `update-edge-weight-v2` is a real initially-failing requirement change. RangeSum tests 0/1-based boundaries, empty input, and multiple queries; `point-update-v2` is a real initially-failing requirement change.

The existing `GET|PUT /derived/:artifactId/source`, `POST /derived/:artifactId/verify`, list/read, and explicit requirement activation routes work for all three fixed artifact ids. This is concrete dispatch, not a plugin framework.

### Moment provider-output fallback

Moment validates provider output before accepting a diagnosis. Empty or malformed output returns `ok=false`, `status="evidence-only"`, and `provider-output-empty|provider-output-invalid`. It persists only observed verdict/test data and code/input hashes. It never adds a tag, line, why, hint, mastery, rating, recurring bug, or Bug Card.

### Search

`GET /api/problems/search` supports `q`, `track`, `concept`, `provider`, `collection`, `status`, `minRating`, and `maxRating`. Every result has deterministic `whyMatched` and `matchScore`. Numeric filters exclude entries without rating evidence. Matching is normalized literal metadata search, not background semantic AI.

### Recommendation entry

`GET /api/recommendations/entry` supports `track`, `concept`, rating bounds, optional `targetRating`, and explicit CSV `liked`/`dismissed` feedback. It returns at most three items, each with `reason`, `scoreBreakdown`, evidence-preserving `ratingEvidence`, and `action.autoOpen=false`.

Arena rating is used only when recorded games exist; otherwise difficulty context remains null. Recent content contributes only to the named freshness component and is never treated as a weakness. The response does not invent mastery or rating.

### Curated migration

`node backend/scripts/curated-content-migration.js` is dry-run by default; `--apply` writes after backing up every changing `meta.json`. The allowlist is exactly 15 real problems: 5 BFS, 5 Dijkstra, and 5 Prefix Sum. Only provider, collection, origin, activityKind, track, concept, and rating are patched. Titles and other user data are preserved, ratings must equal existing `analysis.cfRating`, and a second run is idempotent.

`derivedStatus` is reported from Judge history and the current code snapshot. It is deliberately not persisted as a second source of truth.

This v2 scope is only the three narrow C++ slices above. It adds no arbitrary tracer, Java/fullstack workspace, Arena/Quiz/reward expansion, large taxonomy, or universal plugin contract.

## Agent B integration notes

- Dùng `evidence.href` thay vì tự dựng path hoặc ghép history bằng timestamp.
- Với failure, CTA chính đọc trực tiếp `nextAction`; trace/Coach chỉ là secondary capability.
- Với AC, truyền `intent=derive-module` chỉ khi user đã chọn hướng module; mặc định giữ `competitive`.
- Không write ngược `derivedStatus`, `completion`, `freshWin` hay `ratedProgress` từ frontend.
- API hiện chỉ hỗ trợ C++ grid BFS slice và `GridPathfinder`; không có contract cho arbitrary tracing, Java, fullstack workspace, Arena/quiz/recommendation mới.
