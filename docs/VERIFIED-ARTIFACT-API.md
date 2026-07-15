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

`POST /derived/:artifactId/verify` accepts `{ "suite": "baseline|requirement-change" }` and returns `{ "ok": true, "suite", "status": "passed|failed", "run": { "id", "verdict", "stdout", "stderr", "tests" }, "nextAction" }`. A failed suite is a real check run and never mutates `main.cpp`.

`POST /derived/:artifactId/requirement-changes/:changeId/activate` accepts `{}` and returns `{ "ok": true, "activeRequirement": "...", "nextAction": { "state": "work", "reason": "..." } }`. Activation is explicit and does not rewrite source.

All verified-artifact errors use `{ "error": "stable human-readable message", "code": "OPTIONAL_MACHINE_CODE" }`. `400` is malformed/unsupported input or non-AC derivation, `404` is missing problem/evidence/artifact, and `409` is a conflicting artifact or invalid activation state. Clients must not infer verdict from HTTP status.

### List summary

`GET /api/problems` summary items include `rating`, `cfRating`, `derivedStatus`, and `provenance: { provider, collection, origin, activityKind, derivedFrom }`. These are projections; Judge history remains verdict truth.

## Agent B integration notes

- Dùng `evidence.href` thay vì tự dựng path hoặc ghép history bằng timestamp.
- Với failure, CTA chính đọc trực tiếp `nextAction`; trace/Coach chỉ là secondary capability.
- Với AC, truyền `intent=derive-module` chỉ khi user đã chọn hướng module; mặc định giữ `competitive`.
- Không write ngược `derivedStatus`, `completion`, `freshWin` hay `ratedProgress` từ frontend.
- API hiện chỉ hỗ trợ C++ grid BFS slice và `GridPathfinder`; không có contract cho arbitrary tracing, Java, fullstack workspace, Arena/quiz/recommendation mới.
