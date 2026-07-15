# README-LOOPS — Kiến Trúc 4 Vòng Lặp (rule file cho mọi agent)

> **Đọc file này trước khi làm bất kỳ task nào thuộc roadmap mới.**
> **2026-07-05:** có thêm 2 rule file ngang hàng: `README-AUTOPILOT.md` (triết lý automation "hệ thống đi trước một nước" + hệ Khoảnh Khắc + task board M1-M8 — Pháp y đã bị giáng làm nội tạng của nó) và `README-LOOPS-UX-CRITIQUE.md` (ngôn ngữ thị giác neon-ink). Task frontend/automation mới: đọc cả ba.
> Người viết: Claude Fable 5 (2026-07-05). Chủ dự án: Phúc.
> File này là **luật**, không phải gợi ý. Nếu task của bạn mâu thuẫn với file này, dừng lại và hỏi Phúc.

---

## 0. North star

> **"IDE duy nhất biến mỗi lần WA thành một bài học được cá nhân hóa — và biết chính xác em nên luyện gì sáng mai."**

Việc luyện CP chạy trên 4 vòng lặp lồng nhau. Mỗi update lớn = đóng một vòng đang hở:

| Vòng | Nhịp | Câu hỏi nó trả lời | Flagship | Trạng thái |
|---|---|---|---|---|
| 1 · GIẢI | giây→phút | "Code sai Ở ĐÂU?" | **WA Autopsy** | 🟢 backend xong (orchestrator+route), 🔴 UI/Coach hookup còn (A3/A4) |
| 2 · PHIÊN | một buổi | "Ván đấu hôm nay em chơi thế nào?" | **Game Review** | 🟢 v1 SHIPPED (backend+UI, verified thật trên workspace) |
| 3 · LUYỆN | ngày→tuần | "Hôm nay nên làm gì?" | **Giáo Án Động** | 🔴 chưa build |
| 4 · MÙA | tháng | "Đang ở đâu trên đường tới USACO Silver?" | **Season Engine** | 🔴 chưa build |
| xương sống | mọi vòng | "App biết gì về học sinh?" | **Student Model** | 🔴 chưa build |
| moonshot | vòng 1 | "Nhìn code MÌNH chạy từng bước" | **Execution Lens** | ⚪ chỉ làm sau Autopsy |

**Thứ tự build bắt buộc:** Event Recorder (ngay lập tức, vô hình) → Autopsy orchestrator + UI → Student Model v1 → Game Review → Giáo Án Động → Season Engine → Execution Lens.

---

## 1. Luật chung (áp dụng cho MỌI agent)

1. **Không xóa feature nào.** Chỉ thêm, cải thiện, nối. 25 feature hiện có đều được "thăng chức" vào một vòng lặp (xem §5).
2. **Trung thực là bản sắc.** Mọi con số AI/heuristic đưa ra phải kèm evidence đếm được (bao nhiêu lần, ngày nào). Noi gương `verifyTests`: thà nói "chưa kiểm chứng" còn hơn hứa bừa. Không bao giờ để AI "cảm nhận" hồ sơ học sinh.
3. **Pure-core pattern (strangler).** Logic mới = module thuần (không fs, không AI, không Express) + unit test trong `backend/test/*.test.js` (node:test, CJS, `"use strict"`). Mẫu chuẩn: `backend/src/autopsy/shrink.js` + `test/shrink.test.js` (8/8) và `core/sample-extract.js`. **Cấm** viết logic mới trực tiếp vào `ai.js` (108KB — chỉ được gọi ra từ đó).
4. **Tiếng Việt là ngôn ngữ chính** của UI mới; tiếng Anh cho thuật ngữ CP (verdict, stress, AC…).
5. **Không thêm lớp hiệu ứng canvas/particle mới.** Ngân sách "wow" chi cho **tài liệu đẹp** (xem §6).
6. **Gotchas kỹ thuật đã trả giá — đừng trả lại lần nữa:**
   - Sửa file frontend phải **bump `?v=`** tại chỗ import (index.html / main.js) — không bump là không thấy thay đổi.
   - Server `:5050` phải **restart** mới load code backend mới. Server verify: `node backend/dev-preview.js` (:5099), start **detached** (`Start-Process`) vì background process bị reap giữa các turn.
   - `.workbench` có transition 0.28s — đợi ~400ms trước khi đo DOM. Overlay blur làm treo screenshot — verify bằng eval/snapshot.
   - Editor/accent CSS vars bị pin **inline trên `<html>`** — đừng ngạc nhiên khi stylesheet không thắng.
7. **Diff tối thiểu.** Không refactor dạo. Không đụng trustLayer/registries/adapters nếu task không yêu cầu.
8. **Test đi kèm.** PR không có test cho phần logic thuần = chưa xong. Chạy `cd backend && npm test` trước khi báo cáo.

---

## 2. ĐÃ XONG — Shrink Engine (lõi khó nhất, Fable 5 viết)

**File:** `backend/src/autopsy/shrink.js` · **Test:** `backend/test/shrink.test.js` (8/8, có test quy mô 2000 dòng → co về 2 dòng trong 72 runs / 4ms).

```js
const { shrinkInput, normalizeInput } = require("../src/autopsy/shrink");
const res = await shrinkInput(failingInput, isInteresting, { maxRuns: 250, maxMs: 60_000 });
// res = { input, improved, runs, fromBytes, toBytes, durationMs, log }
```

Bên trong: ddmin theo dòng + theo token **với count-repair** (tự vá token đếm `n`/`n m` khi xóa phần tử), minimize số bằng bisection BigInt, đơn giản hóa chuỗi, fixpoint đa pass, cache + budget, adoption đơn điệu theo (length, lex) nên **không bao giờ cycle**. Engine mù hoàn toàn với judge/AI — chỉ thấy oracle.

**Oracle contract (phần các agent phải ghép — xem task A1):**
```
isInteresting(candidate) === true  ⟺
      chạy code HỌC SINH trên candidate → output SAI (khác reference / crash / TLE-mềm)
  AND chạy code THAM CHIẾU trên candidate → chạy OK trong limit
  AND (nếu có validator) candidate hợp lệ theo constraints
```
Oracle **phải deterministic**: time-limit có margin (×2 limit thật), không random không seed. Mỗi candidate chỉ bị hỏi một lần (cache), nhưng flaky oracle = kết quả rác.

**Ý tưởng ambitious phát sinh khi build (miễn phí, cùng engine):**
- **TLE certificate:** đổi oracle thành "student vượt soft-limit, reference OK" → tìm *input nhỏ nhất đã chậm* (vd n=5000 đã TLE → gợi ý độ phức tạp sai). Không tốn dòng code engine nào.
- **Test Distiller:** pipeline sinh test AI hiện có nên shrink các test WA trước khi lưu → mọi test thất bại trong workspace tự động ở dạng tối giản.
- **Flash Quiz nguyên liệu:** counterexample tối giản + code sai = câu hỏi quiz hoàn hảo ("test này làm đoạn code nào chết?").

---

## 2b. ĐÃ XONG (2026-07-05, phiên tiếp theo) — Autopsy backend + Game Review v1 trọn vẹn

**A1 Orchestrator** `backend/src/autopsy/orchestrator.js` + `backend/test/autopsy-orchestrator.test.js` (12/12, kể cả 4 test compile g++ THẬT với `ai.generateHelper` bị monkey-patch — không cần API key/mạng để test). Scope quyết định khác với bản phác thảo gốc: **KHÔNG có bước HUNT trong v1**. Lý do: judge của app này là local, file-based, không có hidden test — mọi WA đều xảy ra trên một input học sinh ĐÃ CÓ SẴN, nên luôn có input lỗi trong tay ngay khi có verdict; không có gì để "hunt"/fuzz tìm thêm. Pipeline thật là `ENSURE_REFERENCE → SHRINK(input đã biết) → PACK`. Fuzzing để tìm lỗi NGOÀI test học sinh tự có (tái dùng Stress Tester trong `lab.js` làm generator) vẫn là ý tưởng hay nhưng dời sang P2 — đừng build lại từ đầu, gọi vào lab.js khi làm.

**A2 Route** `POST /api/problems/:id/autopsy` (`backend/src/routes/autopsy.js`, đăng ký trong `server.js`). Scope: **KHÔNG có SSE progress/cancel trong v1** — một request/response (~vài giây đến ~30s tuỳ shrink). Body: `{ input, studentOutput?, trigger? }`. Đọc statement/code qua `problemStore`, ai key qua `settingsStore.getAiSettings()`, ghi Evidence Pack vào `workspace/problems/<id>/autopsy/<ts>.json`, bắn event `recordProblemEvent(id, "autopsy", {...})` (fire-and-forget). **A3 (UI Biên Bản Pháp Y) và A4 (Coach đọc Evidence Pack) CHƯA làm** — route đã sẵn sàng, chỉ cần build UI gọi nó.

**B1/B2 Recorder + Student Model**: xong đầy đủ như §3.2/§3.3 mô tả, cộng thêm: đã **wire thật** vào `backend/src/routes/judge.js` — mọi `/:id/judge` (không phải single-test) bắn event `"verdict"` `{verdict, timeMs, passed, total}`; mọi `/:id/run` bắn event `"run"` `{verdict}`; `moment-diagnose` bắn event `"moment"` (xem README-AUTOPILOT.md §2/§3). **2026-07-05 (M6, Sonnet 5):** thêm 2 loại nữa — `open-statement` (bắn từ `frontend/src/statement.js::loadProblemView`, mỗi lần mở bài) và `timer` `{action:"start"|"finish", totalSec}` (bắn từ `frontend/src/timer.js::start/finish`). Route mới `POST /api/problems/:id/event` (`backend/src/routes/problems.js`) là CỬA DUY NHẤT client được phép bắn event trực tiếp — allowlist CHỈ `open-statement`/`timer` (KHÔNG cho `verdict`/`run` qua route này — client tự khai báo verdict sẽ phá luật trung thực §1.2). `edit-snapshot`/`tab`/`idle` vẫn là placeholder chưa có nơi gọi. Tín hiệu "đọc đề trước khi code" giờ đã có dữ liệu thật — Game Review §2b có thể thêm tín hiệu thứ 4 vào công thức khi có đủ mẫu (đừng sửa công thức trước khi có dữ liệu, như luật cũ đã ghi).

**C1/C2/C3 Game Review v1 SHIPPED** — `backend/src/gamereview/session-analyze.js` (16/16 test) + route `GET /api/problems/:id/game-review` (`backend/src/routes/game-review.js`) + UI `frontend/src/features/game-review.js` (nút "📋 Ván đấu vừa rồi" trong tab History, modal `#game-review-modal`). **Đã verify thật** qua Playwright trên dev-preview :5099: click Judge thật → recorder ghi JSONL thật → mở Game Review → điểm 100/100 + công thức + nhận xét + timeline đúng dữ liệu thật. Quyết định scope quan trọng: **v1 chỉ chấm 3 tín hiệu có thật** (tỉ lệ test tay trước khi nộp từ event `run`, số lần WA liên tiếp không đổi `passed` count, tỉ lệ thời gian sau verdict WA/tổng thời gian) — **KHÔNG có** tín hiệu "đọc đề trước khi code" vì chưa có event `open-statement` (bịa số cho tín hiệu này là vi phạm luật trung thực §1.2). Công thức công khai qua `computeProcessScore(...).formula`, trọng số nằm trong `session-analyze.js` (`W_MANUAL=20, W_REPEAT=15 (cap 3), W_DEBUG=25, DEBUG_FREE_RATIO=0.6`). Muốn thêm tín hiệu thứ 4: wire event `open-statement` khi statement view mở (`frontend/src/statement.js`, hàm `loadProblemView`) rồi mới sửa công thức — đừng sửa công thức trước khi có dữ liệu.

---

## 3. Contracts (mọi agent build theo đây — KHÔNG tự chế format)

### 3.1 Evidence Pack v1 — output của Autopsy, input của Coach/UI/Mistake Book
Lưu tại `workspace/problems/<id>/autopsy/<timestamp>.json`:
```jsonc
{
  "version": 1,
  "problemId": "...",
  "trigger": "WA|RE|TLE",
  "minimalInput": "1\n-1",
  "expectedOutput": "-1",          // từ reference
  "studentOutput": "1",
  "shrink": { "runs": 72, "fromBytes": 5818, "toBytes": 4, "durationMs": 4021 },
  "reference": { "kind": "ai-brute|trusted-solution|editorial", "verifiedOnSamples": true },
  "generator": { "kind": "ai|mutation", "seed": 12345 },
  "studentCodeSnapshot": "...",     // code đúng thời điểm autopsy
  "diagnosis": null                  // Coach điền sau: { summary, suspectLines[], lesson }
}
```
Luật: `verifiedOnSamples === false` thì UI **bắt buộc** hiện cảnh báo "tham chiếu chưa kiểm chứng" (luật trung thực §1.2).

### 3.2 Event Recorder v1 — JSONL, append-only
`workspace/problems/<id>/session-log.jsonl`, mỗi dòng một event:
```jsonc
{ "t": 1751712000000, "type": "open-statement|edit-snapshot|run|verdict|tab|timer|autopsy|idle", "data": { } }
// edit-snapshot: { bytes, hash } mỗi 60s NẾU code đổi (không lưu full code — hash + size đủ cho timeline)
// run: { runId }, verdict: { runId, verdict, timeMs }, tab: { from, to }
```
Luật: ghi **fire-and-forget** (không được chậm vòng judge dù 1ms), không PII, một file/bài, rotate khi >2MB.

### 3.3 Student Model v1 — `data/student-model.json`
```jsonc
{
  "version": 1,
  "recurringBugs":  [{ "tag": "long-long-overflow", "count": 5, "lastSeen": "2026-06-28", "evidence": ["autopsy/...json"] }],
  "paceByTopic":    [{ "topic": "graph", "medianSolveMin": 40, "samples": 7 }],
  "mastery":        [],   // đọc từ /api/stats/skills — KHÔNG nhân đôi nguồn sự thật
  "habits":         [{ "tag": "fix-before-reread", "count": 7, "evidence": ["session-log refs"] }]
}
```
Luật: **mọi trường phải có `count` + `evidence`**. Writer: Autopsy, Game Review, judge. Reader: Coach (`/chat` nhét vào system context), Giáo Án, Season. Không có evidence → không được ghi.

---

## 4. Task board (việc cho các agent — độ khó đã được Fable 5 hạ sẵn)

### Flagship 1 · WA AUTOPSY (làm trước tiên)
| # | Task | Cỡ | Trạng thái |
|---|---|---|---|
| A1 | **Orchestrator** `backend/src/autopsy/orchestrator.js` — `ENSURE_REFERENCE → SHRINK(input đã biết) → PACK`. (KHÔNG có HUNT — xem §2b) | M | 🟢 XONG — 12/12 test |
| A2 | Route `POST /api/problems/:id/autopsy` (`backend/src/routes/autopsy.js`). (KHÔNG có SSE/cancel — xem §2b) | S | 🟢 XONG |
| A3 | **UI Biên Bản Pháp Y** (`frontend/src/features/autopsy.js` + modal `#autopsy-modal`): render Evidence Pack thành tài liệu §6, warning band khi chưa verify sample, actions Copy/Lưu-làm-test/Soi-test/Hỏi-Coach | M | 🟢 XONG 2026-07-05 — verified E2E thật (shrink 13B→4B, 17 runs) |
| A4 | Coach nhận Evidence Pack trong `/chat` context (mở rộng runHistory hiện có trong `ai.js`), điền `diagnosis` | S | 🟢 XONG 2026-07-05 qua đường mới (README-AUTOPILOT.md M3): `buildChatContext` đọc file `moment/*.json` mới nhất, gấp thành `momentDiagnosis` (≤600 ký tự) vào context `/chat` + `/chat-stream`. 4 test `coach-chat.test.js`. |
| A5 | Test Distiller: hook `shrinkInput` vào pipeline lưu test WA của test-gen | S | 🔴 CHƯA — ý tưởng §2 |

### Xương sống · EVENT RECORDER + STUDENT MODEL
| # | Task | Cỡ | Trạng thái |
|---|---|---|---|
| B1 | **Recorder** theo contract 3.2 (`backend/src/recorder.js`) | S | 🟢 XONG — 11/11 test, wired thật vào `/judge` + `/run` |
| B2 | Student Model store (`backend/src/studentModel.js`, atomic write như fileStore) | S-M | 🟢 XONG — 10/10 test. **Writer đầu tiên ĐÃ CÓ THẬT (2026-07-05):** hệ Khoảnh Khắc ghi `noteRecurringBug` với evidence file mỗi lần chẩn đoán thành công (xem README-AUTOPILOT.md §2). `noteSolveTime` vẫn chưa có writer. |
| B3 | Coach đọc Student Model: thêm block "hồ sơ học sinh" vào CHAT_SYSTEM context | S | 🔴 CHƯA — phụ thuộc B2 có dữ liệu thật trước |

### Flagship 2 · GAME REVIEW
| # | Task | Cỡ | Trạng thái |
|---|---|---|---|
| C1 | `backend/src/gamereview/session-analyze.js` — `splitSessions`/`analyzeSession`/`buildNotes` | M | 🟢 XONG — 16/16 test |
| C2 | `computeProcessScore` — công thức công khai, trọng số W_MANUAL=20/W_REPEAT=15(cap 3)/W_DEBUG=25 | S | 🟢 XONG |
| C3 | Route `GET /api/problems/:id/game-review` + UI `frontend/src/features/game-review.js` (nút trong tab History) | M | 🟢 XONG — verify thật qua Playwright trên workspace thật |

### Flagship 3 · GIÁO ÁN ĐỘNG
| # | Task | Cỡ | Ghi chú |
|---|---|---|---|
| D1 | Pure `planner.js` | M | 🟢 XONG 2026-07-05 (README-AUTOPILOT.md M8) — `backend/src/planner.js::composeSession` + route `GET /api/planner/session`, 15 test (13 fixture + 2 tích hợp). CTA "Nước tiếp theo" của Khoảnh Khắc (`moment.js`) đã đọc từ đây. Lưu ý: "Flash Quiz" nhắc ở §5 dưới đây thực ra chưa có UI (chỉ CSS chết) — xem README-AUTOPILOT M8. |
| D2 | Journey Home render giáo án + nút "Bắt đầu" | M | 🟢 XONG 2026-07-05 (Fable 5, flow v2 — README-AUTOPILOT §5): card "Hôm nay" (`jh-plan`) đứng ĐẦU Journey Home, rows click được, 1 CTA "Bắt đầu →" (mở bài / mở Flash Quiz theo item đầu). Layout Journey cũ giữ nguyên, chỉ thêm card. Timer/workspace-preset trong nút Bắt đầu: chưa, để agent sau. |

### Flagship 4 · SEASON ENGINE (chỉ sau khi C, D chạy thật)
| # | Task | Cỡ |
|---|---|---|
| E1 | Goal store + gap analysis (mục tiêu USACO Silver = danh sách topic chuẩn, so với mastery) | M |
| E2 | Báo Cáo Tuần (tài liệu §6, sinh Chủ nhật) + readiness gauge KÈM confidence | M |
| E3 | Virtual contest từ đề USACO thật (import qua pipeline copy-đề có sẵn, chấm trong contest domain có sẵn) | M-L |

### Moonshot · EXECUTION LENS — **chưa giao**. Chỉ mở sau khi Autopsy ship và Phúc duyệt.

---

## 5. Bản đồ "thăng chức" feature cũ (để hiểu vì sao không xóa gì)

Stress Tester (lab.js) → engine HUNT của Autopsy · Test Visualizer → renderer Biên Bản + Execution Lens · Mistake Notebook → được Autopsy/Game Review feed tự động · Skill Constellation → bộ não của Giáo Án · Boss/Flash Quiz/Ôn tập → hoạt động được Giáo Án điều phối (**Flash Quiz trước 2026-07-05 KHÔNG tồn tại — chỉ CSS chết; đã XÂY THẬT trong flow v2, xem README-AUTOPILOT §5**) · Contest generator → Season Engine · Synthesizer/Editorial → thư viện tài liệu cá nhân · Coach deep-context → người đọc Evidence Pack + Student Model.

## 6. Ngôn ngữ "tài liệu" (định nghĩa SANG TRỌNG của app này) — 🟢 v2 NEON-INK 2026-07-05

> **Quyết định hướng (Phúc duyệt qua README-LOOPS-UX-CRITIQUE.md §4.0):** ngôn ngữ tài liệu = **neon-ink**, cùng thế giới thị giác với Statement + Journey. Bản serif-Palatino + con dấu sáp + palette Forge của v1 đã bị thay — nó gây "tonal whiplash" đúng lúc học sinh vừa AC/WA. Chi tiết phản biện + lệnh thiết kế nằm trong `README-LOOPS-UX-CRITIQUE.md` — file đó là đối trọng chính thức của mục này.

`frontend/styles/document.css` v2 (zero !important, mọi animation hữu hạn + reduced-motion safe). **CINEMA RULE:** doc-sheet luôn tối (palette ink `#0f1929` hardcode, giống Statement/Journey — KHÔNG flip theo .light-theme, đây là chủ đích, đã ghi ở header statement-neon.css). Verdict rail là ngoại lệ duy nhất: nó sống trong shell nên token-driven, và **nhuộm màu theo verdict** qua `[data-verdict]` → `--rail-rgb`.

Components: `.doc-sheet(.doc-accent-amber/violet)/.doc-kicker/.doc-title(sans 760, KHÔNG serif)/.doc-meta/.doc-rule/.doc-section(-title)/.doc-glyph(--g)/.doc-insight(.di-good/.di-grow)/.doc-warn/.doc-pre/.doc-io(.is-expected/.is-student)/.doc-actions(.b-glyph)/.doc-foot/.doc-fine/.doc-seal` + score ring (`.ring-wrap`, `--ring-target`, `--tier-rgb`) + `.doc-tier/.tier-meter` + Game Review: `.gr-eval`(SVG eval graph)/`.gr-moves/.gr-move(.mv-*)/.gr-move-note`/`.gr-phase` + rail (`.verdict-rail/.rail-chip/.rc-g/.rail-primary`).

**Luật cứng:**
1. Mọi tài liệu mới (Báo Cáo Tuần, Contest report…) BẮT BUỘC dùng các class này — không tự chế sheet mới.
2. **CẤM emoji-as-icon.** Icon = glyph mono trong `.doc-glyph` (idiom của `.stmt-section-icon`): `Δ ≠ ≡ ✦ → % ! ❯ ◉ ▤ § ↗ ✎ » ❏ ‹/›`. Phân loại nước đi dùng ký hiệu cờ vua `!! ✓ ! + · ?! ? ??` (mv-* classes).
3. Thang bậc (tier) đọc được bằng mắt: MỘT glyph (◆), cấp bậc = số glyph sáng, không đổi hình icon giữa các bậc.
4. Nguyên tắc copy giữ nguyên: điểm sáng TRƯỚC, growth = "nước tiếp theo", điểm đo QUY TRÌNH ("đo cách em chơi, không đo em là ai"), mọi phân loại phải trích được field dữ liệu thật sinh ra nó.
5. Gotcha: `.doc-sheet` cần `flex: none` (đã có) — modal body là flex column, thiếu nó sheet bị bóp + `overflow:hidden` clip mất chân.

**Verdict Rail** (`frontend/src/features/verdict-rail.js`): hub nối tool theo verdict — AC → Game Review/Lời giải/Bản khó hơn/Giải thích lời giải/Bài tiếp; WA/RE/TLE → Pháp y/Coach/Soi test/Stress Lab; CE → Giải thích lỗi/Coach. Nghe `app.bus` "verdict" + "problem:opened" (emit mới trong main.js loadProblem). **Tool mới muốn vào flow: thêm chip vào chipsFor() — KHÔNG thêm nút rời rạc nữa.** Chip chỉ route tới entry point tool tự có (`btn-*` click / `app.*`), tôn trọng gating (dùng `visible()`).

## 7. KHÔNG LÀM (chủ động)

Đa ngôn ngữ ngoài C++ · cloud/account/leaderboard · lớp particle mới · rewrite `ai.js`/`statement.js` một phát · mobile · thay đổi format meta.json không kèm script migrate + backup.

---
*Cập nhật file này khi ship xong mỗi task (đổi 🔴→🟢 kèm ngày + commit). Mâu thuẫn giữa file này và code thực tế = bug tài liệu, sửa ngay.*
