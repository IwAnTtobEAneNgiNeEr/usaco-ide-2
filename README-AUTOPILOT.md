# README-AUTOPILOT — Hệ Dẫn Dắt (rule file, ngang hàng README-LOOPS.md)

> Người viết: Claude Fable 5 (2026-07-05), sau khi Phúc tuyên bố: *"Pháp y vô dụng, tôi không xài. App vẫn chưa automatic như chess.com — mọi thứ vẫn do tôi thao tác thay vì được hệ thống dẫn dắt."*
> File này định nghĩa triết lý automation của app + contract của hệ "Khoảnh Khắc" (đã ship v1) + task board cho agent tiếp theo.
> Đọc cùng: README-LOOPS.md (luật chung, §1 vẫn áp dụng nguyên) và README-LOOPS-UX-CRITIQUE.md (ngôn ngữ thị giác).
>
> **STATUS 2026-07-05 (phiên tiếp theo, Sonnet 5): TOÀN BỘ TASK BOARD §4 ĐÃ XONG (M1-M8).** M5 hóa ra đã có sẵn từ trước (chỉ audit, không code). Verified E2E thật trên :5099: momentum "Bài thứ 2 hôm nay · streak 8 ngày" (M7) + CTA "Nước tiếp theo" đọc đúng từ planner "Ôn lại: Bài 7. Đếm cặp số 2 · đến hạn ôn (lần 1)..." (M8), settings toggle hiện đúng (M1), timer click không lỗi (M6), 0 console error toàn phiên. Backend 230 test (224 pass), frontend 46 (45 pass) — 6+1 fail còn lại đều pre-existing, không liên quan. Phát hiện quan trọng nhất: "Flash Quiz" nhắc trong README-LOOPS §5 **không tồn tại** (chỉ CSS chết + help-text) — xem M8. Việc còn mở cho agent sau: D2 (Journey Home UI cho giáo án), xây UI Flash Quiz thật (hoặc xóa nhắc-tới nếu quyết định không làm), `edit-snapshot`/`tab`/`idle` recorder events, prompt-tuning thêm nếu GOIY vẫn lộ đáp án trong thực tế dùng.

---

## 0. Khám nghiệm tử thi của chính Pháp y (root-cause — đọc để không lặp lại)

Pháp y (WA Autopsy) là kỹ thuật giỏi gắn vào sản phẩm sai. Bốn vết tử thương:

1. **Pull thay vì push.** Sau WA, học sinh bực và muốn biết *tại sao* — nhưng app bắt em **tự bấm** một chip tên là ẩn dụ ("Pháp y"), rồi **chờ 10–30s** nhìn spinner. Friction đặt đúng chỗ cảm xúc tệ nhất. chess.com không bao giờ bắt bạn "xin" phân tích — phân tích **đã ở đó** khi bạn nhìn.
2. **Trả lời "input nào" trong khi câu hỏi là "tại sao".** Judge của app này là local, file-based: input/expected/actual của test fail **ĐÃ nằm sẵn trong kết quả judge** (judgeService trả `input, expected, actual, stderr, diff` cho từng test). Shrink một test 3 dòng của giáo viên về 2 dòng không tạo ra thông tin. Shrink chỉ có giá trị khi input LỚN (stress test) — trường hợp hiếm trong ngày thường của Phúc.
3. **Đứt mạch.** Evidence Pack sinh ra rồi... nằm im: `diagnosis: null` vĩnh viễn (A4 chưa từng được build), Student Model không có writer, Mistake Book không tự nhận gì. Dữ liệu chết.
4. **Chi phí đập vào mặt user.** Toàn bộ giá của ENSURE_REFERENCE (build lời giải AI + verify sample) trả TRƯỚC MẶT học sinh, mỗi lần, trong khi phần lớn giá trị (đáp án đúng) đã có sẵn miễn phí trong expected của test.

**Kết luận:** không xóa Pháp y (luật §1.1) — **giáng nó xuống làm nội tạng**. Nó là "Biên bản đầy đủ" (chip phụ) và sẽ là bước auto-shrink cho input lớn (task M4). Bộ mặt mới là Khoảnh Khắc.

## 1. Triết lý: "Hệ thống đi trước một nước"

Điều làm chess.com/Duolingo *cảm giác* automatic không phải AI — là **thứ tự**: sự kiện xảy ra → hệ thống phản ứng NGAY (không chờ lệnh) → trình bày **một** nước đi tiếp theo rõ ràng.

**Luật vàng của mọi update sau này:**
1. **Sự kiện là lệnh.** Verdict, paste đề, mở bài, hết timer — mỗi sự kiện phải kích hoạt được phản ứng hệ thống mà không cần click. Nút bấm chỉ dành cho việc hệ thống không đoán được.
2. **Đắt tiền chạy nền, rẻ tiền chạy tức thì.** Cái gì local/miễn phí (diff, game review, review queue) hiện trong 0ms. Cái gì tốn AI bắt đầu NGAY khi có sự kiện và **stream** vào chỗ đã dành sẵn — học sinh đọc verdict xong (~3-5s) là chẩn đoán đã tới.
3. **Một nước tiếp theo, không phải một menu.** Mỗi khoảnh khắc kết thúc bằng đúng MỘT hành động to (CTA), các tool khác là chip phụ. Menu 5 nút ngang hàng = bắt học sinh làm product manager.
4. **Tự động nhưng không hỗn.** AI tự chạy phải: (a) có cache theo (code, test) — re-judge không tốn token; (b) bị abort khi đổi bài/re-judge; (c) chỉ chạy trên **judge** (trận thật), không chạy trên run nháp; (d) là GIẢ THUYẾT có nhãn, kèm bằng chứng click được (số dòng).
5. **Luật trung thực §1.2 không nhân nhượng:** mọi con số từ dữ liệu ghi thật; taxonomy tag là danh sách ĐÓNG; mọi entry Student Model phải trỏ evidence file.

## 2. ĐÃ SHIP v1 (2026-07-05, Fable 5) — Khoảnh Khắc

**Backend:**
- `backend/src/moment/diagnose.js` — pure core (11/11 test `test/moment-diagnose.test.js`): taxonomy 11 tag đóng (`bien-tran, off-by-one, canh-bien, sai-cong-thuc, sai-dinh-dang, chua-khoi-tao, tran-mang, sai-kieu-doc, do-phuc-tap, de-quy-sau, khac`), `buildDiagnoseMessages` (code **đánh số dòng** — vì thế model cite được đúng dòng; contract trả lời 4 dòng `TAG/LINES/VISAO/GOIY` theo thứ tự đó để stream được), `parseDiagnosis` (chịu lỗi: fence, prose, hoa thường; validate lines trong range, tag ngoài danh sách → `khac`; không có VISAO → `ok:false`), `cacheKey` sha1(code,testId,input,verdict).
- `POST /api/problems/:id/moment-diagnose` (`routes/moment.js`, SSE `start→delta*→done{diagnosis}`): cache đĩa `moment/cache.json` (≤20 entry) — cùng code cùng test = replay 0 token; abort khi client đóng; **writers fire-and-forget**: evidence `moment/<ts>.json` + recorder event `"moment"` + `studentModel.noteRecurringBug` (writer B2 ĐẦU TIÊN có thật — đã verify entry `sai-cong-thuc` với evidence pointer).
- `ai.js` diff đúng 1 dòng: export `chat` (engine retry/fallback/stream có sẵn). Prompt/parse nằm ngoài ai.js đúng luật §1.3.

**Frontend:** `features/moment.js` (v1.1) chiếm slot `#verdict-rail`, nghe bus `verdict`/`problem:opened`:
- **WA/RE/TLE (judge):** card bằng chứng 0ms từ `lastJudge` (Vào / Chờ đợi / Em in ra + "Lệch đầu tiên ở dòng N") → diagnosis stream vào khu Coach (parser tăng dần: thấy VISAO là chữ chảy) → tag pill "giả thuyết: …" + **chip số dòng click = editor nhảy + chọn đúng dòng** (`_cmView.dispatch`, exposed `app.jumpToLine`) → "Gợi ý một bước" giấu sau 1 click (progressive disclosure — em phải tự nghĩ trước).
- **AC (judge):** ring mini + tier ◆-meter + điểm sáng nhất (reuse `derivePositives`) + **CTA "Nước tiếp theo"**: bài đến hạn ôn từ `/api/stats/review-queue` (`app.loadProblem`) hoặc bài ngẫu nhiên. Chuỗi Duolingo v0.
- **CE:** 3 dòng đầu stderr + chip Giải thích lỗi.
- **run (nháp):** chips nhẹ, KHÔNG auto-AI (quyết định chủ đích — run là nước thử, judge mới là nước đi).
- Chips tool cũ reuse `chipsFor` (verdict-rail.js export); "Pháp y" đổi nhãn "Biên bản đầy đủ", hết primary.
- Dedup 2 tầng: memory FE (4 entry) + cache đĩa BE.
- CSS: khối "Khoảnh Khắc" trong document.css (SHELL family — token-driven, flip theo theme, tint verdict qua `--rail-rgb`; KHÔNG phải cinema-dark như doc-sheet).

**Verified thật (:5099, key mercury-2 thật, 0 console error):** WA a−b → card tức thì → diagnosis thật "Sai công thức / logic · dòng 6" → click dòng 6 → editor nhảy đúng `cout << a - b` → re-judge → cache replay 0 token → sửa code → AC → ring 60 + CTA "Ôn lại: Bài 7. Đếm cặp số 2 · đến hạn hôm nay" (queue thật). Sandbox + student-model thử nghiệm đã xóa sạch.

**Gotchas trả giá rồi:**
- Chip số dòng inject SAU render → phải **event delegation** trên rail, đừng bind lúc render.
- Đo màu chip có transition .15s → đợi ~250ms rồi hãy đọc computedStyle.
- `.mo-wait` pulse phải HỮU HẠN (8 lần) — luật animation + screenshot gotcha.

## 3. Contract Khoảnh Khắc v1 (agent sau build theo đây)

**SSE `POST /api/problems/:id/moment-diagnose`** — body `{verdict: WA|RE|TLE, test:{testId,input,expected,actual,stderr}, code?, timeMs?, limitMs?}`; events `{stage:"start",cached}` → `{delta}`* → `{done:true,diagnosis}` | `{error,code}` (NO_KEY → FE hiện mời cài key, không chặn card).
**Diagnosis object:** `{ok, tag, tagLabel, lines[≤3], why, hint, raw}` — `raw` giữ nguyên cho evidence.
**Evidence file** `workspace/problems/<id>/moment/<ts>.json`: `{version:1, problemId, verdict, testId, key, diagnosis, savedAt}`.
**Student Model:** chỉ ghi khi `ok && tag!=="khac"`, evidence = đường dẫn file trên. KHÔNG ghi khi cached (không đếm trùng).
**Recorder:** event `"moment"` `{verdict, tag, cached}`.

## 4. Task board cho agent tiếp theo (đơn giản → khó; tuân §1 README-LOOPS)

| # | Task | Cỡ | Spec |
|---|---|---|---|
| M1 | **Settings toggle** `momentAuto` (mặc định BẬT) trong Settings → AI: tắt = card vẫn hiện evidence local, không gọi AI. FE check trước fetch. | S | Thêm checkbox cạnh `set-visualizer` (settings.js), lưu qua settings store có sẵn. |
| M2 | **Prompt tuning GOIY**: với bug tầm thường model hay lộ đáp án ("thay '-' bằng '+'"). Thêm vào system prompt: "GOIY chỉ được nêu HƯỚNG KIỂM TRA (câu hỏi, thí nghiệm), cấm nêu phép sửa cụ thể" + 1 test parse mẫu. | S | Sửa `moment/diagnose.js` + test. Chạy lại 11 test cũ. |
| M3 | **Coach đọc moment**: nhét diagnosis mới nhất (nếu có, ≤1) vào context `/chat` — hoàn thành A4 cũ bằng đường mới. Đọc `moment/` file mới nhất trong `buildChatContext` (routes/ai.js). | S-M | Giới hạn 600 chars. Đây là cách A4 nên đã được làm từ đầu. |
| M4 | **Auto-shrink cho input lớn** | M | 🟢 XONG 2026-07-05 (Sonnet 5). `routes/moment.js::autoShrinkIfLarge` — ngưỡng 400 ký tự, budget 80 runs/8s. WA: reuse `orchestrator.ensureReference` + `orchestrator.runAutopsy` y nguyên (không viết lại oracle); không có reference → degrade êm về input gốc. RE/TLE: oracle không cần reference — `isInteresting = status === verdict` (chính lỗi crash/timeout của student). SSE emit `{stage:"shrunk", trustworthy, minimalInput, expectedOutput?, studentOutput?}` TRƯỚC `start`; frontend (`moment.js::applyShrunk`) thay nóng ô "Vào" (+"Em in ra"/"Chờ đợi" nếu `trustworthy`) trong card đã render sẵn. 4 test `moment-autoshrink.test.js` (g++ thật, `ai.generateHelper` monkey-patch, không cần key/mạng) — cover cả 4 nhánh: input nhỏ bỏ qua / RE không cần reference / WA có reference / WA degrade êm. Backend 212 test (206 pass, 6 fail pre-existing). |
| M5 | ~~Paste đề = sự kiện~~ | — | 🟢 ĐÃ CÓ SẴN từ trước (audit 2026-07-05, Sonnet 5) — không cần build. `statement.js` (`scheduleAuto`, dòng ~1029-1039) đã debounce 1.5s sau MỌI `input` event (gõ hoặc paste đều bắn "input") trên `#io-statement`, ngưỡng ≥30 ký tự (thấp hơn, ít ma sát hơn con số 200 mình định làm), gọi `runPipeline(app,{force:false})` tự động — có busy banner "Đang phân tích đề & tạo test…" (`busyStatus`, abortable), và cờ tắt sẵn `app.state._aiAutoDisabled` (tự bật khi lỗi lặp, tắt khi user bấm Analyze thủ công). Verified thật qua Playwright :5099: set giá trị + dispatch `input` trên `#io-statement` (không click nút nào) → banner "Đang tạo test…" xuất hiện ~1.8s sau, đúng cơ chế. Task ban đầu viết dựa trên giả định sai (chưa audit code trước khi lên task) — bài học: luôn `grep` trước khi thêm task "build X" vào board này. KHÔNG thêm hộp thoại xác nhận lần-đầu — nó sẽ vi phạm chính triết lý "sự kiện là lệnh" mà M5 định phục vụ. |
| M6 | **Recorder events còn thiếu** | S | 🟢 XONG 2026-07-05 (Sonnet 5). Route mới `POST /api/problems/:id/event` (`routes/problems.js`) — allowlist `open-statement`/`timer` CHỈ (client không được tự khai `verdict`/`run`, phá luật trung thực). `api.recordEvent` (frontend/src/api.js) gọi từ `statement.js::loadProblemView` (mỗi lần mở bài) và `timer.js::start/finish` (`{action, totalSec}`). 3 test `problems-event.test.js` (throwaway zz-* problem, đúng convention `problem-store.test.js`). README-LOOPS §2b đã cập nhật dòng "2 loại event". `edit-snapshot`/`tab`/`idle` vẫn chưa có nơi gọi — còn mở cho agent sau nếu cần. |
| M7 | **Momentum sau AC** | M | 🟢 XONG 2026-07-05 (Sonnet 5) — **0 dòng backend**: `GET /api/progress` (`backend/src/progress.js::computeProgress`) đã tính sẵn mọi thứ cần — `week[6].ac` (7-ngày, entry cuối = hôm nay) cho "Bài thứ N hôm nay", `streak.current` cho streak. `moment.js::momentumLine()` chỉ đọc, không bịa; ẩn hoàn toàn khi cả hai =0 (trung thực, không giả vờ có mạch). Hiện ngay trên CTA "Nước tiếp theo" trong AC card. CSS `.mo-momentum` (document.css, family SHELL token-driven, không particle). |
| M8 | **Giáo Án Động D1** | L | 🟢 XONG 2026-07-05 (Sonnet 5). `backend/src/planner.js::composeSession` — pure, deterministic, greedy-fill theo đúng thứ tự ưu tiên (ôn đến hạn [homogeneous cost, cap `MAX_REVIEWS=3`] → quiz seed từ recurringBugs [cap `MAX_QUIZZES=2`, tag đông nhất trước] → bài mới từ skill frontier [mỗi topic yếu nhất khớp 1 candidate, topic không fit thì thử topic tiếp chứ không bỏ cuộc cả bucket] → quota chung [rẻ nhất trước]); dedup id qua mọi bucket. 13 test fixture (`planner.test.js`) + route `GET /api/planner/session` (`routes/planner.js`, gộp `computeReviewQueue`+`computeSkillMap` [đọc mastery có sẵn, KHÔNG tính lại] + `studentModel.load`+ danh sách unsolved) + 2 test tích hợp (`planner-route.test.js`, zz-* throwaway problems đúng convention `problem-store.test.js`). `moment.js` AC-CTA "Nước tiếp theo" giờ đọc `api.plannerSession()` thay `api.reviewQueue()`, dùng `item.reason` có sẵn thay vì tự dựng chữ. **Phát hiện khi làm:** "Flash Quiz" trong README-LOOPS §5 ("Boss/Flash Quiz/Ôn tập → được Giáo Án điều phối") **không tồn tại** — chỉ có CSS chết (`journey.css` `.quiz-*`) + 1 dòng help-text trong `index.html`, không JS nào implement. `composeSession` vẫn phát `kind:"quiz"` (dữ liệu recurringBugs có thật, hữu ích) nhưng chưa có UI để mở nó — việc D2/agent sau, đừng giả định nó chạy được. Backend 230 test (224 pass, 6 fail pre-existing), frontend 46 (45 pass, 1 pre-existing). |

**KHÔNG LÀM:** auto-AI trong contest domain (integrity) · auto-diagnosis cho run nháp · popup/modal cho moment (nó là dòng chảy, không phải chuông báo) · thêm nút vào topbar.

## 5. FLOW v2 (2026-07-05, Fable 5) — CTA state machine: MỘT nước tiếp theo cho MỌI trạng thái

> Phúc chấm flow cũ 6/10: "backend đã có nhưng frontend chưa kết nối, chưa tạo cảm giác app chủ động dẫn dắt". Flow v2 trả lời bằng một luật duy nhất: **mọi trạng thái kết thúc bằng đúng MỘT nút `.mo-next`** (kicker "Nước tiếp theo"), mọi tool khác là chip lặng. `renderChips` không còn khái niệm primary.

| Trạng thái | CTA chính (`.mo-next`) | Nguồn quyết định |
|---|---|---|
| Mở app (Journey Home) | **"Bắt đầu →"** trên card "Hôm nay" (D2 — ĐÃ SHIP: `jh-plan`, journey.js + journey-neon.css) | `GET /api/planner/session` |
| WA/RE/TLE lần đầu | **"Sửa theo gợi ý — dòng N"** (jump editor tới dòng nghi vấn; hiện khi diagnosis về) | moment-diagnose LINES |
| WA lặp (`failStreak ≥ 2` — passed không tăng) | **"Mở Coach"** (escalation — hiện NGAY, không chờ diagnosis) | failTrack trong moment.js |
| Diagnosis fail / tắt momentAuto / NO_KEY | **"Hỏi Coach"** | fallback |
| AC | **Nước đi đầu của Giáo Án** (Ôn lại X / Bài mới Y / **Flash Quiz**) kèm `item.reason` | planner (quiz giờ mở được thật) |
| CE | **"Giải thích lỗi biên dịch"** (fallback "Hỏi Coach") | btn-ai-explain-ce gating |
| Hết giờ tập trung | **"Tiếp tục +10 phút"** (card session-end trong slot moment; nhường chỗ nếu đang có verdict card) | bus `timer:done` (timer.js emit) + `app.timerExtend` |

**Flash Quiz ĐÃ THẬT** (quyết định: XÂY, không ẩn/không placeholder): `backend/src/moment/quiz.js` (pure, 7 test — câu hỏi = `diagnosis.why` THẬT từ evidence file của chính học sinh, đáp án = tag đã ghi, distractors từ taxonomy, thứ tự deterministic theo savedAt) + `GET /api/planner/quiz` (resolve evidence pointers trong workspace, chống traversal) + `frontend/src/features/flash-quiz.js` (hồi sinh CSS `.quiz-*` chết trong journey.css — dots tiến trình, A-D, explain kèm "Mẹo cũ của Coach", màn kết quả). Verified thật: câu hỏi đầu tiên là chính lỗi `canh-bien` Bài 110 của Phúc ngày 2026-07-05.

**Planner reorder (bug thật tìm ra khi verify):** 3 review × 15p = nuốt trọn budget 45p, quiz 5p chết đói. Fix: **quiz = màn khởi động, xếp TRƯỚC review** (composeSession, +2 test; như Duolingo mở phiên bằng recall). Thứ tự mới: quiz → ôn đến hạn → chủ đề yếu → quota.

**Kết nối hiện hình:** coach zone có dòng "Coach sẽ nhớ chẩn đoán này nếu em mở chat" (M3 hết vô hình) · Journey Home mở màn bằng plan thật (D2 đóng) · route session dùng `allSettled` (bài bị xóa giữa scan không 500 cả plan).

**Còn mở cho agent sau:** quiz kết quả chưa ghi ngược vào Student Model (đo "đã nhớ chưa" → giảm count?) · `edit-snapshot`/`tab`/`idle` events · tín hiệu thứ 4 của Game Review từ `open-statement` (đủ dữ liệu rồi, cần đủ mẫu).

---
*Cập nhật file này khi ship mỗi M-task (🔴→🟢 + ngày). Mâu thuẫn giữa file này và code = bug tài liệu.*
