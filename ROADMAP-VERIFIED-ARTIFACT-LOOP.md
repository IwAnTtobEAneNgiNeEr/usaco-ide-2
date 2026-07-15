# Roadmap — Verified Artifact Loop

> Lộ trình này chỉ định thứ tự chứng minh giá trị. Không là giấy phép triển khai toàn bộ feature hiện có.

## Phase 0 — Product and flow audit

**Mục tiêu:** map feature vào canonical loop, xác định dead branch/fake progress và audit evidence thực của problem folder.

**Output:** feature-flow map; freeze list; compatibility report cho `meta.json`, history, tests, session log, Moment evidence và derived candidates.

**Gate:** mọi feature hoặc có state/read/write/next action, hoặc được FREEZE/DEFER. Không feature nào tự nhận progress mà thiếu evidence. Audit hiện tại cho thấy cần đặc biệt kiểm tra old AC, Arena eligibility, Planner/Recommendation và topic aliases.

## Phase 1 — Contract foundation

**Mục tiêu:** định nghĩa Activity/Artifact contract additive; tối thiểu hóa naming (`provider/collection/origin/activityKind/derivedStatus`); chuẩn hóa một nhóm BFS nhỏ, không migrate kho cũ.

**Output:** pure-core contract + tests; compatibility mapping data cũ; vài folder BFS có metadata/evidence đúng.

**Gate:** dữ liệu cũ đọc được; Judge/history vẫn là truth; status derive khớp history; không duplicate source of truth; file-per-problem intact.

## Phase 2 — BFS competitive slice

**Mục tiêu:** chứng minh một bài BFS thật đi hết `Brief → Work → Verify → Feedback`.

- Import/chọn bài cho thấy provider/collection/origin và trạng thái rõ.
- WA, CE, RE, TLE dẫn về action có evidence đúng; Run không tạo completion.
- AC có một CTA theo intent; bài AC cũ không thành fresh/rated win.
- Library/Search hiển thị tên nguồn/trạng thái và mở đúng artifact.

**Gate:** manual QA live; evidence trỏ đúng code snapshot, input/test và verdict; không fake win; Judge không regress; người dùng biết chính xác bước tiếp theo mà không mở dashboard.

## Phase 3 — Artifact analysis

**Mục tiêu:** secondary action “Phân tích code này” cho BFS dùng code/input thật: queue, visited, counterexample và invariant khi dữ liệu cho phép.

**Không làm:** quiz standalone, explanation chỉ LLM, trace không tái lập.

**Gate:** trace deterministic; luôn link về run/snapshot; user quay lại editor đúng line/state; analysis đưa một next action thật (sửa, thêm test, hoặc hiểu invariant).

## Phase 4 — Derived module proof

**Mục tiêu:** từ solution BFS đã pass tạo `GridPathfinder` dẫn xuất, giữ nguyên solution gốc, có `derivedFrom`, unit tests, edge cases và một requirement change.

**Gate:** mở/so sánh được bản gốc; unit tests pass/fail thật; requirement change mở vòng mới; user tiếp tục trên module hoặc quay lại solution mà không mất evidence.

## Phase 5 — Library and transition

**Mục tiêu:** làm hai track nhìn thấy được qua entry/transition, không tạo ba library hay tab Explore. Library/Search hiểu activity kind; AC/complete mở transition phù hợp; recommendation giới hạn 2–3 lựa chọn có lý do.

**Gate:** người dùng phân biệt Luyện thi với Thuật toán & ứng dụng trước khi bắt đầu; không CTA mơ hồ; Home không thành bảng trưng bày feature; Search vẫn hữu ích khi không dùng recommendation.

## Phase 6 — Validate before generalize

**Mục tiêu:** đánh giá lát cắt theo falsification rules và quyết định GO/REWORK/STOP.

Chỉ khi qua gate mới mở rộng Dijkstra/prefix sum/matrix, migrate 163 bài, cải thiện C++ multi-file, hoặc nghiên cứu Java/backend/frontend. Không có gate này thì không mở rộng taxonomy hay fullstack.

## Current feature decision table

| Feature | Current job | Flow state | Reads | Writes | Next action | Decision |
|---|---|---|---|---|---|---|
| Library / Search | Danh sách/lọc problem bằng metadata cơ bản. | Brief/Entry | meta summary, topic/tags/source. | Không. | Mở bài hoặc tạo brief. | REWORK |
| Import / statement pipeline | Tạo đề/test từ text. | Brief | statement/OCR/AI input. | problem folder, tests/metadata. | Work. | KEEP |
| Editor / Workspace | Viết code, tái dùng cho contest/activity. | Work | statement, code, samples. | code/input/statement. | Run/Judge. | KEEP |
| Run | Thử input hiện tại. | Verify exploratory | code/input. | run history/event. | Sửa hoặc Judge. | KEEP |
| Judge / Tests | Chấm toàn bộ checks local. | Verify | code/tests/checker. | verdict/history/evidence. | Feedback hoặc Evolve. | KEEP |
| History | Snapshot timeline và restore. | Feedback/derived | history.json, run records. | Không. | Mở evidence/code gốc. | EMBED |
| Moment | Evidence rail + diagnosis sau judge. | Feedback | failing test, code, verdict. | diagnosis evidence, recorder/student bug. | Editor/Coach. | KEEP |
| Coach | Giải thích/hint theo context. | Feedback | statement, code, Moment evidence. | chat only; đôi khi hint count. | Work/Verify. | REWORK |
| Stress Lab | Fuzz correctness/performance theo seed. | Verify contextual | generator/brute/solution/settings. | stress result/seeds. | Reproduce failure/Work. | KEEP |
| Visualizer | Minh họa input/algorithm. | Work/Feedback contextual | chosen input/config. | Không hoặc scene config. | Editor/test. | REWORK |
| Game Review | Tổng kết attempt từ recorded events. | Feedback/derived | session-log/verdict history. | Không. | Return to Work or next planned item. | EMBED |
| Skill Map | Mastery derive theo topic/history. | Derived information | meta/history/tags. | Không. | Search/plan; never completion. | FREEZE |
| Journey | Home, continue/current plan. | Entry/Transition | progress/planner/arena. | Không. | One primary next action. | REWORK |
| Planner | Compose review/quiz/new problem. | Entry/Transition | review queue, skills, student model. | Không. | Open selected work. | REWORK |
| Recommendation | Recent-topic/rating selection. | Entry/Transition | history/topics/rating. | generated problem optionally. | Start selected brief. | FREEZE |
| Contest Generator | Bundle eligible topic problems/AI-generated items. | Optional destination | topic/difficulty/problem metadata. | contest store/problem copies. | Contest workspace. | FREEZE |
| Arena | Rated/friendly challenge layer, rating and gates. | Optional destination | judge verdict, reference/rating eligibility. | match/rating stores. | Return to artifact/work. | FREEZE |
| Flash Quiz | Recall diagnosis evidence. | Feedback contextual | moment evidence, error tags. | arena card training. | Return to Work/Verify. | FREEZE |

`KEEP` means retain and connect; `REWORK` means contract/flow is insufficient; `EMBED` means no independent destination/CTA; `FREEZE` means retain but do not expand before BFS proof. No row authorizes deletion.

## Seven-day BFS prototype

| Day | Scope | Proof required |
|---|---|---|
| 1 | Audit one real BFS folder and map all current reads/writes. Define old-data compatibility and fake-progress cases. | Written folder/evidence map; selected BFS source and owner intent. |
| 2 | Freeze unrelated branches. Finalize additive artifact fields and test fixtures, not migration. | Contract accepted; legacy Judge/history path unchanged. |
| 3 | Make the competitive BFS flow evaluable from Brief to Run/Judge, including provenance/name display. | Manual path reaches actual compiler/Judge. |
| 4 | Exercise WA, CE, RE/TLE and AC. Validate CTA policy and old-AC/rated exclusion. | Each result links evidence and exactly one primary action. |
| 5 | Add the smallest deterministic BFS analysis based on actual code/input: queue + visited + one invariant/counterexample. | Trace repeatable and returns to exact editor state. |
| 6 | Prove one derived `GridPathfinder` artifact with original preservation, tests and one changed requirement. | Original opens intact; derived tests demonstrate pass and fail. |
| 7 | Manual QA end-to-end, inspect stored files/evidence and decide GO/REWORK/STOP. | Signed checklist and verdict against gates below. |

## Go / rework / stop gate

**GO** only if a user can complete both BFS paths without ambiguity: solve → verified feedback → continue; and solution → verified derived module → requirement change. Evidence is inspectable, original survives and no old AC becomes a fresh win.

**REWORK** if verifier/evidence work but CTA, trace or transition does not cause a useful next action. Fix the narrow broken loop; do not add features.

**STOP** if the module path is unused or offers no value beyond an OJ solution, if trace is non-deterministic/LLM-only, or if the contract forces a broad storage/runtime rewrite. Preserve existing CP core and do not generalize.

## Relationship to the old roadmap

`ROADMAP.md` should not be silently overwritten. Its local-first, reliability and competitive-programming priorities remain compatible. Its medium-term items (editorial/skill map/import limits) must be reordered behind Phases 0–6; generic “skill map”, broad visualizer work and import expansion cannot be treated as automatic next work.

After owner approval, either replace its near/medium-term section with this phase list or add a short pointer declaring this document authoritative for product flow. Keep security and compiler reliability work independently prioritized.

## First update after approval

**Phase 0/1 contract audit on one real C++ BFS problem; no UI redesign, no migration, no Arena/quiz/contest work.**

## Explicit implementation prohibitions

### BFS slice closure (2026-07-16)

Phases 0-4 PASS. Phase 5 is satisfied only for the existing BFS entry/transition UI; Phase 6 GO applies to this BFS/C++ slice alone. Dijkstra, Java/fullstack, taxonomy and new Arena/Quiz/Contest work remain closed.

Do not implement Java/JUnit, backend/frontend workspaces, deployment, universal adapters, three Solve/Explore/Build tabs, gacha/rewards, a large taxonomy migration, cloud/accounts/telemetry, or new Arena/Flash Quiz/Contest mechanics until the seven-day gate is GO.
