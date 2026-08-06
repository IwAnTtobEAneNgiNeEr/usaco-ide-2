# HANDOVER — USACO IDE 2.0 → Fullstack Learning Workspace

> **Tài liệu chuyển giao vận hành, KHÔNG phải north-star.** Tầm nhìn & luật thiết kế
> sống trong [root README.md](../README.md) — đọc §1 (thesis), §4 (15 sai lầm cấm),
> §8 (IA), §10 (repair roadmap), §11 (fullstack roadmap), §15 (LUẬT thiết kế). File
> này chỉ ghi: đã làm gì, ai làm sai gì, đang đứng ở đâu, làm gì tiếp.
>
> *Cập nhật: 2026-07-24 (đợt 2: 15 thiết kế authored + catalog tổ hợp Preview). Branch: `codex/applied-algorithms-v1-closure`. Toàn bộ thay đổi CHƯA COMMIT (working tree chung nhiều agent).*

---

## 1. App thực sự hướng đến điều gì (một đoạn)

App khởi đầu là **local-first C++ competitive programming IDE** (nhập đề → code → g++ Judge thật → evidence → sửa). Tầm nhìn mới: **AI-assisted software engineering learning workspace** — đưa học sinh đi từ *bài toán/ý tưởng* đến *sản phẩm chạy được*. Trước tiên hoàn thiện C++ (giải bài → hiểu thuật toán → **biến lời giải thành project thật**), sau đó mở dần sang UI/UX → frontend → backend → database → Python/AI → fullstack, **code trực tiếp trong app**, tất cả theo **một core loop duy nhất**:

```
Brief/Problem → Understand → Plan → Build → Verify → Diagnose → Run → Evolve
```

AI là **kiến trúc sư** (đọc code, đề xuất hướng, sinh brief/task/test) — KHÔNG phải chatbot trang trí, KHÔNG tự xác nhận hoàn thành. **Verifier thật** (compiler, judge, tests, browser, API runner, benchmark, E2E) là trọng tài duy nhất. Chi tiết: README §5–§7.

Câu hỏi mấu chốt mọi tính năng phải trả lời được: *"Học cái này để **xây được cái gì**?"* — không phải một bài OJ nữa, mà một sản phẩm có bối cảnh đời thật.

---

## 2. Lỗi "ngu học" của các agent TRƯỚC (để KHÔNG lặp lại)

Đây là các sai lầm đã xảy ra thật, có bằng chứng, đã hoặc đang được sửa. README §4 liệt kê 15 điều cấm — dưới đây là những cái đã thực sự vấp:

1. **Coi 3 module (GridPathfinder/WeightedGraphRouter/RangeSum) là sản phẩm hoàn chỉnh**, nhét thẳng vào sidebar Luyện tập → user không biết đó là bài, kiến thức hay project.
2. **Mượn xác panel Contest cho module** rồi chỉ đổi chữ "Judge"→"Verify" — module workspace hiện nguyên chữ "CONTEST · Tiến độ contest" + nút "Đổi đề" vô nghĩa. GỐC: `activityProfile()` fallback mặc định trả profile CONTEST cho mọi kind lạ (đã sửa 2026-07-17).
3. **Rò metadata/enum backend ra UI**: `Runtime proof E:\...·Electron·:50`, `Standalone`, `local › applied-algorithms-v1`, `≠ GIAO HỮU`, `(GridPathfinder seed)`, slug `tran-mang`. Vi phạm README §15.2.
4. **Hard-code từng thuật toán thành từng ứng dụng** (BFS = Micromouse) thay vì để AI đọc code thật sinh nhiều hướng động.
5. **Tự chấm "GO" bằng tests xanh / branch riêng / dev port** trong khi app canonical user mở vẫn lỗi. README §12 giờ bắt buộc canonical walkthrough.
6. **Làm rò dữ liệu test vào workspace THẬT — TÁI PHÁT 3 LẦN**: `zz-arena-route-test`, `zz-hint-tracking`, rồi "Xưởng HTTP"/"Delivery Roads"/"Flooded Barn" + 8 project "X · pathway 1". Mỗi lần dọn tay. Nay đã vá tận gốc (mục 4).
7. **Tạo rừng doc mâu thuẫn** (8+ README/ROADMAP/north-star) → không ai biết cái nào đúng. Đã gộp về 1 README + xóa 13 doc cũ.
8. **AI trả tiếng Anh, không ai chặn/ép tiếng Việt** — pathway/requirement/analysis đổ thẳng văn AI tiếng Anh vào UI tiếng Việt. GỐC: `applicationAnalysis.js` system prompt 0 chỉ thị ngôn ngữ + nhét seedCatalog JSON thô làm AI học văn phong đó.
9. **Route gọi hàm AI chưa từng được implement** (`ai.generatePersonalizedProblem`) — "Bài phù hợp" hỏng ngầm từ đầu, không ai test end-to-end (đã sửa 2026-07-19).

## 3. Lỗi "ngu học" của TÔI (Fable/Opus, các session vừa qua)

Ghi thẳng để agent sau không tin tôi mù quáng:

1. **Coi "dùng lại shell chung" = xong design.** Ship Xưởng verify được E2E kỹ thuật (fail→pass→evolve) nhưng bỏ trống tầng NỘI DUNG user đọc — brief tiếng Anh, cột phải trùng khối, requirements tiếng Anh. Đúng sai lầm #5 & #15 của chính README tôi viết. Owner phải chỉ ra bằng mắt tôi mới thấy.
2. **Viết contract mơ hồ** (chỉ vẽ mũi tên "→ Session/Project", không nói rõ envelope có bọc key hay không) → backend implement 4/6 route trả object trần, frontend đọc `raw.session` ra undefined → hiện "phân tích thất bại" dù AI chạy đúng. Mất một vòng mới phát hiện.
3. **Giao brief bằng văn xuôi dài** cho agent design/backend → họ đọc lướt, làm phần dễ (CSS, thêm card), bỏ phần khó (sửa prompt AI, sửa logic trùng). Bài học: giao **checklist tick-box từng dòng**, không văn xuôi.
4. **Nhắc "ép AI tiếng Việt" 2 lần nhưng không tự kiểm** — tưởng agent backend đã làm, thực ra chưa bao giờ. Phải grep prompt mới biết.
5. **Tạo bug trùng khối cột phải Xưởng** khi ghép vào shell chung mà không vá — để nguyên qua nhiều session tới khi owner chửi (đã sửa 2026-07-19).

### Lỗi của chính chuỗi tranh luận redesign Xưởng (2026-07-20 → 2026-07-22)

Các PNG trong `docs/media/xuong-*.png` là artifact tư duy, **không phải spec/DONE**. Chuỗi trao đổi đã đi qua nhiều phương án sai; ghi lại để agent sau không lặp:

1. **Đổi OJ thành nhiều file + Verify rồi gọi đó là project.** Sai vì user chưa thấy sản phẩm/behavior nào sống; chỉ tăng ceremony.
2. **Demo-first nhưng demo chỉ là stdout chung chung.** Đúng hơn OJ, vẫn thiếu scenario state, mapping tới code và replay nên user không biết output tồn tại để làm gì.
3. **Card hóa pathway/brief thành dashboard học tập.** Sửa copy, thêm card/milestone/evidence không sửa được mô hình tương tác; editor và sản phẩm bị đẩy thành phần phụ.
4. **Ép 3–5 hướng và ba milestone cố định.** Kiến trúc seed nông buộc AI bịa nhiều câu chuyện quanh vài hộp có sẵn; quota làm filler trở thành tất yếu.
5. **Gọi đổi bối cảnh là phát triển.** “BFS trong trường học” không thêm capability; định nghĩa đúng phải có `oldAssumption + breakingEvent + newCapability + observableOutcome`.
6. **Reference preview và user preview có cùng hình thức.** Chỉ đổi badge/màu không đủ; user dễ tưởng sản phẩm mẫu là code mình đã chạy đúng. Chốt: reference storyboard inert, user runtime mới có Run/Replay.
7. **Chỉ đặt link lời giải gốc, bỏ mapping code AC → component.** User không học được cách chuyển từ `main()` sang component và thấy skeleton lạ bị ném vào editor.
8. **Dùng chat/list làm ca chứng minh tổng quát.** Gắn lỗi vào một hàng quá dễ, không chứng minh được grid/graph/timeline; non-list E2E là checkpoint bắt buộc.
9. **Đặt Verify/Evidence ở trung tâm và lặp đúng-sai nhiều nơi.** Chốt: trung tâm là `Code ↔ Preview`; build output chỉ compile/runtime, behavior ở Preview, requirement truth ở Checks/Evidence.
10. **Gán thuật toán vào preview/domain** (`BFS→robot`, `Dijkstra→chi phí`, `sorting→animation`). Đây chỉ là hard-code mới. Preview phải xuất phát từ ObservableModel và primitive composition.
11. **Xem preview là renderer riêng theo project.** Không scale tới math/parser/resource/fullstack. Chốt: một Preview Surface + khoảng 12 base projection + overlay/control dùng chung + Universal Inspector.
12. **Đề xuất ghép factorial tự do để đạt số lượng lớn.** Phần lớn tổ hợp vô nghĩa, không test được. Chốt grammar 1 base + tối đa 2 overlay + compatibility/canonicalization; 1.500–3.000 là capacity recipe, không KPI/component count.
13. **Đưa ba tier preview ra UI.** Vô tình phân hạng project. Chốt: product simulation/algorithm lab/inspector là chiến lược ẩn; user luôn thấy `Preview`.
14. **Lúc muốn backend tag-match semantic, lúc muốn giao match hết cho AI.** Cả hai cực đều sai. Chốt hybrid: AI semantic proposal; backend eligibility/validate/counterexample/runtime; registry giữ runner/oracle/verifier.
15. **Tin `brokenAssumption` là đủ.** AI có thể viết câu hay nhưng code cũ không thất bại. Phải có breaking event chạy thật và red-before-green.
16. **Trao một AI call quyền sinh project + verifier + UI.** Phá nguyên tắc verifier trung thực. AI chỉ proposal/binding/copy; runtime tay người kiểm soát quyết đúng-sai.
17. **Over-correct bằng cách xóa mọi cảm giác tiến trình hoặc khóa Checks.** Chốt growth spine phi điểm số `đã có → đang build → có thể mở rộng`; Checks luôn dùng được.
18. **Các concept composition mới vẫn còn lỗi.** Một số ảnh lộ `BASE/OVERLAY`, raw event `LINK_DOWN/WALL_DISCOVERED`, lặp Checks ở header+tab, ghi “đang chạy” trên state tĩnh, foreground cả test/harness. Không pixel-copy mockup.
19. **Nhầm mockup đẹp với khả thi runtime.** Chưa có ObservableModel/recipe/anchor/API thật thì chưa được gọi thiết kế đã khép. Mỗi quyết định phải được chứng minh trên canonical state thật.

**Bài học chung**: verify bằng MẮT trên canonical như user thật + đọc tầng nội dung, không chỉ tests xanh. Grep để xác minh, đừng tin "đã giao rồi chắc xong".

---

## 4. Trạng thái hiện tại (2026-07-24)

### Đang chạy tốt — GIỮ
- **Core OJ loop (Luyện tập)**: sidebar → statement → CM6 editor → Run/Judge g++ thật → verdict/diff. Lõi tốt nhất app.
- **4 công cụ Luyện tập** (Bộ đề, Điền lõi, Debug tốc độ, Stress) — cùng shell chung, cùng nhịp, không tool nào tự chế skin. Đạt chuẩn từ R1.
- **Backend Xưởng R2/R3/R4 + v2 runtime**: `applicationProjectStore/applicationAnalysis/applicationSeedRegistry/projectVerifier.js` + `routes/xuong.js` và Preview runtime. AI sinh pathway thật; verifier đủ compile/unit-test/benchmark/simulation; v2 `/run`/`/replay`/`/checks` khớp contract.
- **Xưởng frontend v2**: nav 4 mục (Hôm nay/Luyện tập/Xưởng/Hồ sơ), S6 list, S5 workbench với mapping + PreviewSurface/Universal Inspector, provenance reference/user, replay/checks adapters.
- **Tests sau C1–C3**: backend **722/722**, frontend **152/152**; canonical acceptance C4 vẫn mở.

### Vừa sửa (2026-07-20 — prompt/nội dung AI Xưởng)
- ✅ `applicationAnalysis.js`: system prompt bắt buộc toàn bộ copy cho học sinh là tiếng Việt tự nhiên; title phải là tên sản phẩm tiếng Việt, không phải tên seed/`pathway 1`; `seedId` chỉ còn trong danh sách định tuyến kỹ thuật, không nhét raw `seedCatalog` JSON vào văn phong AI.
- ✅ Boundary schema chặn output sai trước khi vào UI: summary/title/purpose/verification/task/contract criteria thiếu tiếng Việt; title fallback; metadata `seed` trong display field; purpose trùng verification; requirement viết meta kiểu "Introduce/Add a requirement…". Hậu tố kỹ thuật dạng `(GridPathfinder seed)` được bỏ khỏi display title, `seedId` vẫn giữ nguyên đúng API contract.
- ✅ `applicationProjectStore.js`: prompt evolve viết tiếng Việt, giao yêu cầu trực tiếp giọng HLV; `normalizeEvolution` chặn tiếng Anh/meta-phrase cho cả provider thật lẫn provider test.
- ✅ **API thật trên canonical :5050 sau restart**: analyze trả 3 title `Bản đồ cứu hộ nhanh` / `Bộ định vị cứu hộ 4 hướng` / `Ứng dụng di động cứu hộ`, không title nào rò seed; select → verify thật pass compile/unit-test/benchmark; evolve thật sinh `Cho phép di chuyển chéo; từ (0,0) đến (1,1) có khoảng cách 1` (không meta-phrase). Các session/project dùng để verify đã dời khỏi workspace thật vào quarantine tạm, không để lại data test.
- ✅ **Bằng mắt trên canonical :5050**: S4 hiện summary + 3 card tiếng Việt, không `(… seed)`; S5 hiện requirement evolve trực tiếp và evidence PASS thật. Screenshot: `xuong-pathways-vietnamese-canonical-5050.png`, `xuong-ai-vietnamese-canonical-5050.png` trong artifact của phiên.
- ✅ Regression của lần sửa prompt: `node --test test/xuong-api.test.js` 8/8; `backend/npm.cmd test` 724/724; frontend 94/94. Browser console 0 error/warn tại thời điểm chụp bằng chứng đó.

### Vừa sửa (2026-07-20 — Demo-first đã được owner duyệt và triển khai)
- ✅ Contract thêm `POST /api/xuong/projects/:id/demo` → `{project,demoRun}`; `DemoRun` tách khỏi `Evidence`, không có pass/AC và không được đánh dấu requirement `met`.
- ✅ Cả 5 seed C++ có `demo/main.cpp` read-only chạy cùng source hiện tại. Runner compile/run thật; stdout tiếng Việt có dấu, giải thích **tình huống / kết quả / vai trò thuật toán**. Test chạy đủ 5 demo.
- ✅ `Pathway` có `context` + `application`; AI prompt nhận chính header của seed để không bịa public method. Project baseline `mission/acceptance/requirements` lấy từ registry verifier, không lấy lời hứa AI không có test đứng sau.
- ✅ Product-facing fields `title/purpose/context/application` chặn cả tên file/class/method nội bộ. Provider thật được sửa một lần theo lỗi schema trước khi trả thất bại; canonical AI call sau restart đã sinh đủ 3 card không rò scaffold identifier trong bốn field này.
- ✅ S4 card tách **Ai đang cần / Thuật toán làm gì / Demo đầu tiên / Kiểm chứng**; bỏ dòng “Em sẽ thấy” lặp. S5 dùng brief thật, nút **Chạy demo** cạnh Verify, milestone tuần tự và output lưu đọc lại được. S6 nói thẳng khác biệt với “Bản khó hơn”.
- ✅ Ba bug copy còn ngoài Xưởng đã khép: “Bài phù hợp” không hứa AC sẵn; Stress nói rõ cần bài có lời giải; planner dùng nhãn `Truy cập ngoài mảng` thay vì slug `tran-mang`.
- ✅ Canonical :5050 đi thật: AI analyze → select → demo `completed` (stdout tiếng Việt) nhưng 0 Evidence → Verify AC với compile/unit-test/benchmark → milestone 3 active. Screenshots thật: `xuong-demo-first-s4-canonical-5050.jpg`, `xuong-demo-first-s5-verified-canonical-5050.jpg`, `xuong-demo-first-s6-canonical-5050.jpg` trong artifact phiên.
- ✅ Regression trên trạng thái Demo-first cuối: gọi trực tiếp `node --test test/xuong-api.test.js` xanh 10/10; `cd backend && npm test` xanh 726/726; `cd frontend && node --test "test/**/*.test.mjs"` xanh 96/96.
- ℹ Hai project cũ tạo trước bản vá vẫn giữ copy tiếng Anh trong dữ liệu owner; không tự migrate/ghi đè. Read model chỉ đưa chúng vào flow Demo-first (next action “Chạy demo”).

### Vừa chốt (2026-07-23 — kiến trúc rebuild Xưởng/Preview Engine; C0 contract DONE, C1–C3 đã triển khai)
- ✅ Owner và agent đã chốt north-star mới trong `README.md` §6/§11/§15: pathway biến thiên; phát triển = phá giả định + breaking event + capability mới; AI không sinh verifier; Code ↔ Preview là trung tâm.
- ✅ Chốt một `Preview Surface` từ `ObservableModel → ViewPlanner → PreviewRecipe`, khoảng 12 base projection + overlay/control có compatibility; mục tiêu 1.500–3.000 recipe canonical là cấu hình dữ liệu, **không** phải component/KPI và không ghép factorial tự do.
- ✅ Chốt provenance: S4 chỉ là **Mẫu hành vi** inert; S5 là **Bản của em** chạy source thật. Chốt code mapping symbol/span/hash, EventAnchor non-list, replay và Universal Inspector.
- ✅ Chốt hai agent song song trong README §11.1: Agent A chỉ `frontend/**`, Agent B chỉ `backend/**`; root/coordinator giữ README/HANDOVER/API contract; checkpoint C0 contract freeze → C4 canonical.
- ℹ 12 PNG `docs/media/xuong-*.png` chỉ là concept. Bốn ảnh composition mới (RouteWatch/MergeForge/ShardBalancer/LogMatcher) chứng minh hướng UI, **không chứng minh runtime/API**; một số ảnh còn raw label/event và action lặp như mục 3 ghi.
- ✅ **C0 đã đóng băng 2026-07-23:** `docs/XUONG-API-CONTRACT.md` v2 có exact envelope `/run` + `/runs/:runId/replay`, type CapabilityProfile/PathwayTransformation/SourceMapping/ScenarioSpec/ScenarioRun/ObservableModel/PreviewRecipe/EventAnchor, validator recipe, provenance reference/user, red-before-green và transition v1. Golden fixture shared ở `docs/fixtures/xuong-contract-v2.json`: reference grid, user grid fail+anchor+replay, graph composition, Universal Inspector.
- ℹ C0 chỉ khóa dữ liệu/fixture, chưa sửa source Xưởng hay chạy lại suite source. Baseline source gần nhất vẫn backend 726/726, frontend 96/96 từ 2026-07-20; bước được phép bắt đầu bây giờ là C1.

### C1–C4 đã khép trên canonical (2026-07-23)

- ✅ **Agent A — frontend:** `frontend/src/core/xuong-v2-model.js`, `frontend/src/features/xuong.js`, `frontend/src/features/xuong-preview.js`, `frontend/styles/xuong.css` và test Xưởng. PreviewSurface dùng projection chung cho sequence/table/timeline/chart/text/request-response/runtime-resource; có exact run/replay/reference envelope adapter, provenance switch, mapping/replay/focus rail/growth spine; không giới hạn 3–5 pathway và không render metadata kỹ thuật.
- ✅ **Agent B — backend:** `backend/src/applicationAnalysis.js`, `applicationProjectStore.js`, `xuongRuntime.js`, `xuongScenarioRegistry.js`, `projectVerifier.js`, route `/run` + `/replay` + `/checks` và tests. Prompt không quota; ReferenceStoryboard inert; runtime kiểm ObservableModel cap/reference, compiler diagnostics có file/span/sourceMappingId; replay tính anchor hiện tại; MazeNavigator/RouteWatch/MergeForge/ShardBalancer/LogMatcher dùng trusted runtime.
- ✅ **Regression sau closure C4:** `cd backend && npm.cmd test` → **723/723**; `cd frontend && node --test "test/**/*.test.mjs"` → **161/161**. Direct `node --test test/xuong-api.test.js` → **7/7**, gồm cả quarantine v1 không xóa file.
- ✅ **Canonical :5050 bằng mắt + C4 slice:** mở Hôm nay → Xưởng → project MazeNavigator → `Chạy build`; UI hiển thị `PREVIEW SẢN PHẨM`, `Bản của em · chạy source hiện tại`, Preview grid `Bản đồ di chuyển`, event/anchor và `OK`; chuyển sang `Mẫu hành vi` hiển thị `Mẫu hành vi · không chạy code của em` với cùng tiêu đề trung tính, không nói dối provenance. `Replay` đổi cursor `2/2→1/2`, click anchor chọn đúng vùng CodeMirror (`.cm-selectionBackground`), `Checks` trả Evidence fail đọc được: expected 1, actual 2 tại Hàm tìm đường; Puppeteer ghi **0 page errors**. Bằng chứng: [xuong-canonical-user-2026-07-23.png](media/xuong-canonical-user-2026-07-23.png), [xuong-canonical-reference-2026-07-23.png](media/xuong-canonical-reference-2026-07-23.png), [xuong-canonical-api-2026-07-23.txt](media/xuong-canonical-api-2026-07-23.txt).
- ✅ **C4 canonical closure:** restart backend canonical `:5050`; gọi AI v2 thật trả 1 pathway `Bản đồ đường đi ngắn nhất`, đủ transformation, không lộ seed/pathway/BFS trong title. API audit: reference `200` inert/controlPack none; run `200` user-source/grid; replay cursor `0/1` hợp lệ với `anchor-diagonal`; checks `200` trả expected 1/actual 2; cursor `999` trả `422`. Canonical UI hiển thị một project v2, `Bản của em`, grid preview, replay, anchor và Evidence đọc được; console **0 warning/error**. Đóng workbench rồi chuyển sang Luyện tập vẫn hiện đủ năm hoạt động.
- ✅ **Quarantine v1 không phá dữ liệu:** `listProjects()` chỉ public project có `_v2Requirements`; 10 project v1/trùng, bao gồm copy tiếng Anh, vẫn nằm nguyên trong workspace nhưng không còn xuất hiện ở S6 như project v2. Điều này là policy read-model, không migration hay delete.
- ✅ **C5 backend checkpoint:** Scenario Registry đã chuyển ShardBalancer sang `chart` với bar/changed-field event và LogMatcher sang `text` với line/diff event. Bốn scenario C5 đều có runner/oracle local, fail có EventAnchor, replay và Evidence; test gọi source C++ thật theo vòng fail → sửa → pass cho từng scenario (`node --test test/xuong-api.test.js` 7/7).
- ✅ **C7 backend checkpoint:** replay dựng state tại cursor từ initial model + `TraceEvent.changedFields` (`observableAtCursor`), nên cursor 0 trả đúng state trước thay đổi thay vì snapshot cuối. Scenario selector đã đi qua `Project.scenarios` và `/run` trusted-registry validation; active anchors tiếp tục là contextual source anchors.
- ✅ **C8 backend checkpoint:** analysis cache persistent, bounded và in-flight coalesced có key SHA-256 của problem/direct-input, code, prompt, catalog và registry version. Run/Replay/Checks có regression chứng minh không gọi AI; replay tiếp tục dựng từ delta event thay vì giữ snapshot cursor đầy đủ.
- ✅ **C9 backend checkpoint:** suite contract kiểm tra toàn bộ compatibility base/overlay, canonical key, invariant một base/tối đa hai overlay và golden fixture. API E2E đi qua Run/Replay/Checks của MazeNavigator, RouteWatch, MergeForge, ShardBalancer, LogMatcher. Trusted evolution stage-2 của MazeNavigator cũng có scenario/verifier/evidence/red-before-green riêng.
- ✅ **Backend verification C5–C9:** `node --test test/xuong-contract.test.js test/xuong-api.test.js` → **14/14**; `git diff --check` sạch.
- ✅ **C6 backend checkpoint:** `xuongC6NativeSeeds.js` đăng ký 12 native C++ module độc lập (hai family cho mỗi base) cho tree, timeline, geometry, request-response, runtime-resource và state-machine. Mỗi adapter compile/run source+harness, so với independent oracle, tạo Observable/EventAnchor khi sai, replay stepper và recipe Inspector-compatible. Test xác nhận đúng hai family/base và bắt một anchored failure ở từng base.
- ✅ **Backend verification C5–C9 + C6:** `node --test test/xuong-api.test.js test/xuong-contract.test.js test/xuong-c6-adapters.test.js` → **15/15**; `git diff --check` sạch. Chưa có canonical screenshot/UI acceptance cho sáu base; đó là lane frontend.
- ✅ **C5 stage-chain regression (2026-07-23):** `/evolve` được khóa bằng API test phải mở requirement thứ hai `candidate`, công bố `maze-navigator-corner-guard`, rồi stage mới chạy red với `anchor-corner-cut` và evidence riêng. `cd backend && node --test test/xuong-api.test.js` → **10/10**.
- ✅ **F1–F5 frontend checkpoint (Agent B + integration, 2026-07-23):** scenario picker/evolve/scrub/anchor-provenance; 12 base renderers với 18 overlay semantic; lazy Preview Surface, cap/window, band composition (base → legend → stage → output → anchor → replay → metric), Logs và Checks count. `cd frontend && node --test "test/**/*.test.mjs"` → **198/198**. Canonical `:5050` browser acceptance → **68/68**, console 0 warning/error; screenshots thật: `frontend/test/e2e/shots/f5-maze-stage2-1600.png`, `f5-routewatch-1600.png`, `f5-mergeforge-1600.png`, `f5-shardbalancer-1600.png`, `f5-logmatcher-1600.png`, `f5-narrow-1180.png`.

### Corrective closure sau owner audit (2026-07-23 — không được xóa)

- ❌ Báo cáo C1–C9/F1–F5 phía trên **không đồng nghĩa sản phẩm đã dùng được**. Owner mở project thật vẫn thấy ba lỗi load-bearing: title AI kiểu `Danh sách v2 kho linh hoạt`, toàn bộ implementation đã viết sẵn không có TODO, và Preview 2×2 chỉ là bốn ô trang trí. Tests adapter/renderer đã không bắt được chất lượng workbench end-to-end này.
- ✅ `applicationAnalysis.js` tăng cache/prompt version, chặn title `v2`/`phiên bản`, tiếp tục cấm quota/filler/metadata. `applicationProjectStore.js` dùng tên sản phẩm trusted từ arc thay title AI rác trên read model; task/criteria/verification C++ lấy hành vi observable đã có runner đứng sau.
- ✅ `xuongScenarioRegistry.js` thêm `productTitle`, starter task huấn luyện theo stage và migration cộng thêm, idempotent. Project owner cũ được mở lại với đúng một TODO đặt trước bộ hướng BFS; không thay implementation, không xóa hay reset code của owner. Evolve cũng gắn TODO của stage mới.
- ✅ Workbench frontend được sửa theo visual contract §15.6: tool rail mỏng; focus rail chỉ còn Mục tiêu/Input/Em đổi/Xong khi; code là vùng lớn nhất; chỉ foreground header + file editable + test thay đổi yêu cầu; mapping ribbon chỉ ra lời giải cũ nằm trong hàm nào; Preview/Checks/Logs là một rail; Build output chỉ báo compile/runtime.
- ✅ Preview grid không còn bốn hộp vô nghĩa: có S/Đ, tuyến chéo lỗi, output `Cần 1 bước, hiện có 2 bước`, error anchor `Tuyến vẫn đi vòng thay vì dùng lối chéo`, `Đi tới hàm` và `Phát lại từ đây`. Reference được gắn nhãn `Mẫu hành vi · không chạy code của em` và không có replay; user run gắn nhãn `Bản của em · chạy source hiện tại`.
- ✅ `xuongViewPlanner.js` khép lỗ C9: base/overlay/control/layout được chấm từ entity/geometry/relation/event/changed-field/anchor/metric của ObservableModel; hint registry chỉ phá hòa cho adapter model nghèo. Test chứng minh input grid thắng hint text, graph lỗi chọn anchor non-list và resource metric tự chọn runtime-resource. Runtime không còn lấy nguyên `arc.recipe` làm quyết định cuối.
- ✅ Verify thật trên app dev `http://127.0.0.1:5099` dùng **workspace owner thật**: mở project `project-26ad539a-5396-4580-908b-6f0d9ad3cdb6`, Chạy build 3094ms, click anchor tạo 3 selection node trong CodeMirror, đổi Reference thì replay biến mất, Checks trả `expected 1, actual 2 tại Hàm tìm đường`. Browser console **0 warning/error**.
- ✅ Gọi **AI API thật** sau khi tăng prompt/cache version; sau quality boundary, `POST /api/xuong/analyze` public đúng `MazeNavigator` / `Cho phép đi chéo để tuyến tới ô chéo kề có độ dài một bước` / breaking event `Kho mở thêm lối đi chéo...`; không `v2`, `seed`, tên scaffold hay meta-phrase. AI chỉ đề xuất semantic match; trusted arc sở hữu tên/brief buildable nên một câu re-skin trôi chảy không còn lọt ra S4. Ba session audit đã được dời nguyên vẹn ra `C:\Users\Admin\AppData\Local\Temp\usaco-xuong-ai-audit-20260723`, không để data kiểm thử trong workspace owner.
- ✅ Bằng chứng mới: [user Preview đỏ](media/xuong-v3-maze-red-final.png) và [Checks/Evidence đỏ](media/xuong-v3-maze-checks-final.png). Đây là screenshot runtime thật, không phải concept PNG.
- ✅ **Corrective pass ShardBalancer / cầu nối C++ người mới (2026-07-23):** 5 scaffold trusted dùng `using namespace std`, comment phân vùng và nói rõ `main()` đã chuyển sang demo/test; project owner cũ migrate cộng thêm/format đúng các đoạn scaffold đã biết, không reset implementation. Workbench có mục `Từ main() sang project`, code gọi thật, vai trò `.hpp/.cpp/test` và đúng một TODO cần sửa. Brief ShardBalancer nêu dữ liệu `[2,4,8]`, update index 1 thành 10, tổng `14→20`; Preview có bar before/after, tổng cũ/thực tế/mục tiêu, prefix `[0,2,12,20]`, output và replay 4 bước. Bằng chứng runtime: [reference](media/xuong-v3-shard-learning-preview.png), [user run](media/xuong-v3-shard-learning-run.png); browser console 0 warning/error.
- ✅ **Verification sau corrective pass:** direct Xưởng API/ViewPlanner **14/14**, backend full `npm.cmd test` **735/735**, frontend full **199/199**; app dev `:5099` mở workspace owner thật, migration hiển thị 37 dòng code dễ đọc và build thật trả tổng 20.
- ✅ Regression tuần tự: `node --test backend/test/xuong-api.test.js` → **10/10**; Xưởng planner/contract/API/C6 → **19/19**; `cd backend && npm.cmd test` → **735/735**; `cd frontend && node --test "test/**/*.test.mjs"` → **198/198**. Không chạy browser E2E đồng thời full backend vì cùng tranh compiler.
- ⚠️ Electron/canonical `:5050` vẫn là process đã nạp module backend cũ; phải restart desktop/backend trước lần owner demo tiếp theo. Không được dùng trạng thái stale của `:5050` để phủ nhận hoặc tự nhận closure; URL đã verify vòng corrective là `:5099`.
- ⚠️ **Giới hạn còn lại của frontend:** MergeForge/những recipe nghèo dữ liệu không được bịa heap, chunk partition, output tape hay metric pass/fail. Renderer dùng đúng ObservableModel hiện có; phần dữ liệu cho composition sâu hơn là contract/backend work. Sáu C6 base có browser renderer proof từ real registry payload, nhưng chưa có project C6 đi trọn API vì `/analyze` cần AI và store chưa có entrypoint seed trusted.
- ⚠️ **Không được báo “đủ Preview” bằng số tổ hợp:** hiện có 13 base renderer, 18 overlay semantic; registry có 5 product arc trusted + 12 C6 adapter (17 arc, 11 base có runner). Con số này chỉ chứng minh type/compatibility/compile-run-replay. Chỉ 5 product arc được xem là ứng viên UI; MazeNavigator và ShardBalancer đã qua corrective visual audit sâu. 12 C6 adapter **không** được quảng bá là project/Preview hoàn thiện cho tới khi có brief, learning bridge, scenario có ý nghĩa, red/green debug và browser screenshot riêng.
- ⚠️ **Gotcha kiểm thử C++:** full backend từng có một C5 `compile-error` khi bị chạy đồng thời với canonical browser E2E (hai luồng cùng compile C++); chạy tuần tự lại xanh `backend 731/731`, Xưởng direct `10/10`, frontend `198/198`, browser `68/68`. CI/acceptance phải serialize compiler-heavy backend suite và browser E2E cho tới khi runner được harden cho contention.
- ✅ **Khoảng trống ViewPlanner Phase 3 đã khép trong corrective pass:** `xuongRuntime.projectionRecipe()` gọi planner tổng quát chấm ObservableModel; `arc.recipe` chỉ còn hint cho sparse adapter. Mục tiêu 1.500–3.000 vẫn là không gian recipe hợp lệ theo compatibility, không phải lời hứa rằng đã chụp/QA từng tổ hợp.
- ⚠️ **Nợ kỹ thuật không chặn C4:** `frontend/src/core/xuong-model.js` vẫn là engine fixture v1/fallback cũ và quota legacy trong code không dùng bởi v2. Chỉ được xóa sau import audit, tuyệt đối không dùng fallback đó để che lỗi API v2.
- ⚠️ **Nợ kỹ thuật không chặn C1–C3:** `frontend/src/core/xuong-model.js` vẫn còn engine fixture v1/fallback cũ và quota legacy trong code không dùng bởi v2. Chỉ được xóa sau khi xác nhận không còn import/đường UI; không dùng fallback đó để che lỗi API v2.

### Corrective MazeNavigator sau owner audit (2026-07-24)

- ❌ **Nguyên nhân ảnh Preview cũ tệ không nằm chủ yếu ở CSS:** trusted scenario chỉ có lưới 2×2, hai event và một cạnh chéo. Renderer không có state đủ giàu để kể một sản phẩm; phóng to bốn ô chỉ làm lộ sự sơ sài. Ảnh concept “robot phát hiện tường rồi tái tính khoảng cách” là một capability sau, không được giả làm build “thêm bước chéo” hiện tại.
- ✅ **Scenario thật đã nâng thành kho 9×9:** 81 cell, kệ chắn, robot `R`, khu giao `G`, trường khoảng cách có nhãn, tuyến code hiện tại 12 bước so với mục tiêu 6, bốn mốc trace, hai metric và output đọc được. Reference dùng trường/tuyến 8 hướng; user run baseline dùng trường/tuyến 4 hướng. Tất cả sinh từ trusted `ObservableModel`; frontend không bịa bản đồ riêng.
- ✅ **TODO đã đổi từ “đánh dấu vị trí” thành scaffold có thể làm:** `GridPathfinder.cpp` dùng `vector<pair<int,int>> directions`; bốn hướng thẳng có comment, user chỉ thêm bốn pair chéo. Vòng BFS dùng structured binding nên không còn phải tự đoán và sửa đồng thời `dr[4]`, `dc[4]`, `direction < 4`. Cầu nối `main()` → component hiển thị ba bước: cách đọc pair, đúng vùng được sửa, ca tự kiểm `(1,1)→(2,2)`.
- ✅ **Migration `cpp-learning-v2` chỉ biến đổi đúng scaffold baseline đã biết:** project cũ có block `dr/dc/for` nguyên bản được nâng cộng thêm; source đã khác baseline/đã giải không bị reset hay ghi đè tùy ý.
- ✅ **Preview grid generic được nâng chứ không hard-code BFS:** renderer đọc `geometry`, state có nhãn và glyph từ model để vẽ trục hàng/cột, số trong ô, start/target/wall và route relation. Raw field id `distance`/`badge` không được in ra UI.
- ✅ **Verify bằng mắt trên app dev workspace owner thật `:5099`:** mở `project-404a5565-3908-4ec7-93ef-8fbf2d1198f5`, chạy build 3193ms; UI hiện route 12 bước, mục tiêu 6, anchor đỏ “Xe vẫn đi vòng 12 bước”, `Đi tới hàm` tạo 3 selection node trong CodeMirror, `Phát lại từ đây` đưa replay tới `3/4 · Tuyến đang đi vòng 12 bước`; console 0 warning/error. Bằng chứng: [MazeNavigator 9×9 + TODO ba bước + Preview đỏ](media/xuong-maze-9x9-learning-red-2026-07-24.png).
- ✅ **Regression 2026-07-24:** direct `node --test test/xuong-api.test.js` **10/10**; backend full `npm.cmd test` **735/735**; frontend full `node --test "test/**/*.test.mjs"` **200/200**. Test khóa 81 entity/4 event/12→6, scaffold `directions`, trục lưới, glyph và numeric state không rò key.
- ⚠️ Project owner cũ `project-6f760ca6-d2a0-4213-a7ca-5342f6ee0782` đã có sẵn `#error readable failure` từ một phiên trước. Phiên 2026-07-24 chỉ đọc để phát hiện rồi đóng; không xóa/khôi phục vì đó là dữ liệu owner. Các project ID sinh bởi test lần này đã được đối chiếu và **không tồn tại** trong `workspace/xuong/projects`; guard test isolation vẫn hoạt động.

### Corrective 5 project authored + luật nhân rộng Preview (2026-07-24)

- ❌ **Sửa lại lời báo cáo sai:** 1.500–3.000 recipe là không gian tổ hợp hợp lệ của grammar, không phải 1.500–3.000 project/Preview đã được thiết kế đẹp. Không thể làm một lượt rồi tuyên bố mọi tổ hợp đạt chất lượng vì renderer không tự sinh bối cảnh, dữ liệu, trace và bài học C++ có nghĩa.
- ✅ **Năm project lõi là bộ mẫu authored đầu tiên:** MazeNavigator (grid/path), RouteWatch (graph/compare), ShardBalancer (chart/compare), MergeForge (sequence/window), LogMatcher (text/diff). Bốn project sau đã được nâng từ scene 2–3 item thành scenario ít nhất 6 entity + 4 event, có before/after, actual/expected, output đọc được và anchor trỏ đúng hàm. Con số 6/4 là mức giàu của bộ mẫu này, không phải quota cứng cho mọi domain.
- ✅ **Scaffold C++ thống nhất:** `using namespace std;`, comment giải thích `main()` nằm trong scenario/test, `PHẦN 1` helper/nền, `PHẦN 2` thuật toán cũ chỉ đọc, `PHẦN 3: VIỆC CỦA EM`. Mỗi build foreground đúng một hàm; signature có tên tham số; trong body chừa dòng và chia TODO `biên/đầu vào → xử lý/helper → return → tự kiểm`. Không ép mọi hàm thành `void`: Maze trả `int`, Route/Shard/Log trả `bool`, Merge trả `size_t`; helper `void` chỉ dùng nơi đúng trách nhiệm (`rebuild`, `prune`, validation).
- ✅ **Cầu nối UI rõ chỗ viết:** focus rail hiện block `Chỉ viết trong build này` với `file → symbol → Đến đúng vùng TODO`; sau đó mới hiện main() quen thuộc, danh sách 4 bước và vai trò `.hpp/.cpp/test`. Migration `cpp-learning-v3` chỉ nâng placeholder nguyên bản; implementation user đã khác stub không bị ghi đè.
- ✅ **Scenario authored hiện tại:** RouteWatch dùng mạng 6 điểm và sự kiện A→F `20→5`; ShardBalancer dùng 6 vùng, Vùng 2 `4→10`, tổng `28→34`; MergeForge dùng 6 request xen kẽ `upload/search`, cửa sổ tại 1250ms còn 2 request upload; LogMatcher dùng pipeline 6 dependency và chỉ gỡ `legacy-check→package-app`.
- ✅ **Runtime/API direct:** test C5 compile/run cả bản đỏ và bản sửa của RouteWatch/ShardBalancer/MergeForge/LogMatcher; C9 đi `/run → replay → checks` đủ 5 project. ViewPlanner từng chọn nhầm MergeForge thành `geometry` do request có tọa độ; đã bỏ geometry thừa để `sequence + window` thắng bằng observable semantics. Targeted C5+C9: **2/2 xanh**.
- ✅ **Verify thật sau corrective 5 project:** app dev workspace owner thật `:5099` đã restart với code mới. MergeForge chạy build 5885ms, Preview sequence 6 request hiển thị đúng cửa sổ 1000ms và `activeCount("upload", 1250) = 2`; nút `Đến đúng vùng TODO` focus CodeMirror và tạo selection đúng TODO. RouteWatch chạy build thật, Preview graph 6 nút hiển thị cạnh A→F đổi `20→5`, tuyến sau sự kiện A→F và actual/expected đều 5. Cả hai lượt audit có **0 warning/error console**. Bằng chứng: [MergeForge Preview authored](media/xuong-mergeforge-authored-final-2026-07-24.png), [MergeForge hướng dẫn một hàm](media/xuong-mergeforge-guidance-final-2026-07-24.png).
- ✅ **Regression cuối phiên:** direct `node --test test/xuong-api.test.js` **10/10**; backend full `npm.cmd test` **735/735**; frontend full `node --test "test/**/*.test.mjs"` **201/201**. Test frontend mới khóa sequence 5–9 item phải wrap thành hàng đọc được thay vì co thành một dải mỏng.

### Đợt 2: 5 → 15 thiết kế authored + catalog tổ hợp Preview (2026-07-24)

- ✅ **Mười thiết kế authored mới, mỗi cái là một component C++ thật:** BuildOrderTree (tree), PrefixRouter (tree), ShiftPlanner (timeline), SweepMonitor (timeline), FieldSurvey (geometry), ApiGateway (request-response), RetryBudget (request-response), MemoryPool (runtime-resource), OrderFlow (state-machine), LedgerAudit (table). File mới: `backend/src/xuongAuthoredSeeds.js` (hpp/cpp có TODO/test + `solvedSource` để test chứng minh đỏ→xanh), `xuongAuthoredArcs.js` (brief, transformation, learningBridge, scenario ≥6 entity + ≥4 event, anchor, metric, output), `xuongAuthoredDemos.js` (demo-first cho cả 10). Năm arc cũ được đánh dấu `authored: true`; 12 C6 adapter vẫn ẩn.
- ✅ **Đỏ trước xanh bằng compiler thật, không bằng lời hứa:** `node --test test/xuong-authored-arcs.test.js` biên dịch cả bản baseline và bản sửa của cả 10 (20 lượt g++), khớp đúng cặp giá trị đã khai báo — ví dụ chuỗi build `1→3`, tiền tố `2→5`, chồng ca `160→180`, đỉnh phiên `1→4`, phủ sóng `6→4`, tổng mã cổng `1404→2010`, lượt gọi `16→12`, trang bộ nhớ `3→6`, bước hợp lệ `3→4`, tổng lệch `300→510`. **61/61 xanh.**
- ✅ **Catalog tổ hợp Preview có cổng chứng cứ:** `backend/src/xuongPreviewCatalog.js` chỉ nhận một recipe khi (a) base có đúng cấu trúc model vẽ được — mật độ lattice, cột có nhãn, trục thời gian, số đo tài nguyên — và (b) **mọi overlay có dữ liệu thật đứng sau** (predicate `EVIDENCE` soi anchors/changedFields/relations/metric, mirror đúng `emphasis()` của renderer). `xuongObservableSamples.js` lấy model từ chính `arc.model()` cho cả hai kết cục đỏ/xanh. Fixture chung: `docs/fixtures/xuong-preview-catalog.json`, sinh lại bằng `node backend/scripts/build-preview-catalog.js`.
- ✅ **Con số, nói đúng nghĩa:** **2.476 tổ hợp canonical / 2.604 khả năng của grammar (95%), phủ đủ 13 base, 417 composition base+overlay riêng biệt, dựng từ 32 ObservableModel của 15 thiết kế.** Đây là *recipe đã được hợp đồng kiểm và renderer thật vẽ ra*, **không phải** 2.476 project và **không phải** 2.476 màn đã QA bằng mắt. Số này tụt xuống khi siết luật, không bao giờ được tăng bằng cách nới luật.
- ✅ **Render proof, không phải đếm suông:** `frontend/test/xuong-preview-catalog.test.mjs` cho **cả 2.476 tổ hợp** đi qua `previewModel → renderPreview` thật và bắt buộc: vẽ đúng base của mình (không rơi về Universal Inspector), mỗi overlay đúng một mục chú giải, bỏ overlay ra thì markup phải khác, không rò enum/`undefined`, và không hai tổ hợp nào vẽ ra HTML giống hệt nhau. **8/8 xanh.** Lần chạy đầu bắt được 88 tổ hợp rò `Adapter runtime-resource: memory-budget` → C6 adapter bị loại khỏi catalog (đúng luật mục 4 cũ).
- ✅ **Ba lỗi thật lộ ra nhờ quy trình này, đã sửa:**
  1. `xuongViewPlanner` chọn sai base cho **9/10** thiết kế mới (cây build → `graph`, sổ cái → `chart`, cổng API → `chart`) vì chấm điểm quá thô. Nay planner chấm **eligibility cấu trúc trước** (dùng chung `eligibleBases`), hint của registry chỉ được chọn trong số base model thật sự đỡ được, còn lại theo thang specificity; model nghèo (adapter một entity) vẫn đi nhánh chấm điểm cũ nên 4 test planner cũ giữ nguyên. Cả 15 arc nay plan đúng base thiết kế.
  2. `xuongRuntime.projectionRecipe()` giữ bảng nhãn riêng thiếu 12/18 overlay → MemoryPool hiện chú giải `Thông tin bổ sung`, và cả ba layout đều mang một nhãn cứng `Tập trung vào kết quả`. Nay dùng chung bảng nhãn với catalog; fixture chở luôn bảng nhãn nên frontend test không giữ bản sao thứ ba.
  3. MergeForge có mốc thời gian request **chỉ nằm trong chuỗi hiển thị** (`"upload · 250ms"`), không có trong state → planner đẩy nó sang `timeline`. Đã đưa `at/order/count` vào state (dữ liệu scenario có sẵn, không bịa) nên `sequence` thắng lại đúng như thiết kế.
- ✅ **Layout thành khác biệt thật:** `frontend/styles/xuong.css` nay có luật riêng cho `focus`/`balanced`/`wide`. Trước đó chỉ `focus` có luật, nên đếm layout như một trục tổ hợp là không trung thực.
- ✅ **Verify bằng mắt trên app thật:** `node backend/scripts/authored-arc-preview.js` dựng 15 project qua đúng `createAnalysisSession → selectPathway` với đề xuất **cục bộ, không gọi AI**, trên **workspace tạm trong temp** rồi phục vụ ở `:5098`. Cả 10 thiết kế mới: build C++ thật `completed`, base đúng thiết kế, đúng 1 EventAnchor đỏ, replay dựng lại state theo cursor (`sess-6.active` false ở cursor 0/2 → true ở cursor 4; `activeAnchorIds` rỗng ở cursor 1 và có anchor từ cursor 2), Checks đỏ đọc được. PUT bản sửa một hàm → **cả 10 chuyển sang `pass`, anchor về 0**. Puppeteer ghi **0 warning/0 error console**. Ảnh: `C:\Users\Admin\usaco-audit\shots\xuong-authored-*-red-2026-07-24.jpg` (10 màn), harness `authored-arcs-shot.js`.
- ✅ **Không rò dữ liệu test:** harness ghi vào `%TEMP%\usaco-xuong-preview-*` và đã xoá; `workspace/xuong/projects` giữ nguyên 22 project của owner, grep 4 seedId mới trong `workspace/` ra **rỗng**.
- ✅ **Regression:** `cd backend && npm.cmd test` → **805/805** (trước đợt này 735). `cd frontend && node --test "test/**/*.test.mjs"` → **209/209** (trước 201). `git diff --check` sạch. Chạy tuần tự, không chạy browser E2E song song suite backend.
- ⚠️ **Còn nợ, nói thẳng:** (1) 2.476 tổ hợp mới được *máy* chứng minh là vẽ đúng và khác nhau — mới 10/2.476 màn được nhìn bằng mắt; đừng quảng bá là "2.476 Preview hoàn thiện". (2) Chỉ chụp trạng thái **đỏ** cho 10 thiết kế mới; ảnh xanh và ảnh `Mẫu hành vi` chưa chụp. (3) 12 C6 adapter vẫn ẩn và vẫn rò từ vựng adapter trong copy — chúng chỉ là bằng chứng base có runner. (4) 128 tổ hợp còn lại của grammar chưa có model nào đỡ (phần lớn cần overlay `interval`/`partition`/`heap` trên base chưa có thiết kế phù hợp). (5) 10 thiết kế mới chưa có stage 2 (`/evolve`), khác MazeNavigator.

### Đợt 3: sửa chỗ "viết code" của Xưởng sau owner audit (2026-07-25)

Owner mở workbench và nói thẳng: đọc code không hiểu vì giao diện, cả code lẫn đề bài đều mơ hồ; bước nhảy từ "viết một thuật toán trong `main()`" sang "làm project" không được dạy ở đâu cả. Đọc lại hai ảnh runtime như một học sinh chỉ từng viết `main()` thì thấy sáu chỗ hỏng, **hai trong đó là lỗi thật chứ không phải thẩm mỹ**:

- ❌ **Nút "Đi tới hàm" nhảy vào code CHỈ ĐỌC.** `sourceMappings()` tìm vị trí hàm bằng tên trần (`retryable`, `allowed`) nên bắt trúng **chỗ gọi** nằm trong hàm read-only. Sai ở 2/10 thiết kế. ✅ Đã sửa: tìm theo `Class::method`, thứ chỉ xuất hiện ở định nghĩa (`definitionLine()` trong `xuongRuntime.js`). Cả 10 nay trỏ đúng dòng định nghĩa.
- ❌ **Bản đồ file gán sai file.** `.requirement-change.test.cpp` và `demo/main.cpp` đều kết thúc bằng `.cpp`, nên tab thứ ba từng mang nhãn "File em sửa", rồi sau đó cột trái chỉ "File em sửa → demo/main.cpp". ✅ Đã sửa: gán mỗi file cho vai trò **cụ thể nhất**, ưu tiên file thật sự editable, loại `demo/`. Có test khoá riêng.
- ❌ **Câu tiêu đề nói dối hiện tại:** "Trả về số trang… cần cấp cho sáu khối, **hiện là 6**" trong khi code đang trả 3 — con số nghiệm thu bị viết như một sự thật về hiện tại, ở cỡ chữ lớn nhất màn hình. ✅ Đã sửa cả 10 câu thành "… — bài chạy phải ra N."; bỏ từ `scenario` khỏi copy học sinh. Test chặn `hiện là` và 5 từ kỹ thuật tái phát.
- ❌ **Cùng một câu xuất hiện hai lần** (dải trên cùng và ô "EM ĐỔI" ngay dưới, chữ y hệt). ✅ Bỏ ô lặp.
- ❌ **Ba bước cụ thể nhất nằm dưới đáy cột**, sau một `<details>` và một đoạn `main()` mẫu. ✅ Đưa lên nửa trên.
- ❌ **Trong code, cái-phải-đọc và cái-phải-làm trông y hệt nhau:** TODO là `//` comment, lời giải thích cũng là `//` comment, và code cũ cần thay nằm sát ngay dưới không có ranh giới. Đánh số `PHẦN 1 → PHẦN 3` mà không có `PHẦN 2` ở 8/10 file. ✅ Bỏ đánh số, dùng ba mốc trả lời ba câu hỏi: `ĐÃ CHẠY ĐÚNG · CHỈ ĐỌC` / `VIỆC CỦA EM` / `ĐOẠN CẦN THAY … hết ĐOẠN CẦN THAY`.

**Thay đổi kiến trúc kèm theo:**

- `xuongAuthoredSeeds.js` không còn chứa 10 file `.cpp` viết tay. Seed khai báo *các phần* (`readOnlyRole`, `readOnlyCode`, `steps`, `editableHead`, `oldCode`) và `assembleSource()` lắp ra file — 10 file **không thể lệch khuôn** nữa. Test khoá: mỗi mốc xuất hiện đúng một lần, đúng thứ tự, và không còn `PHẦN <số>`.
- **Ba bước chỉ tồn tại một bản.** `AUTHORED.steps` được in vào file ngay trên hàm em sửa, và `learningBridge.editInstruction` đọc lại chính mảng đó. Test so khớp từng phần tử — brief và comment trong file không thể mâu thuẫn.
- Cột trái đổi thứ tự theo đúng thứ tự câu hỏi của người mới: *làm gì* → **vì sao bây giờ** (breakingEvent, trước đây không hiện ở đâu cả) → **em gõ ở đây** (`hàm() trong file.cpp` + nút) → *làm 3 bước* → *ba file, chỉ một là của em* (+ đoạn `main()` gọi hàm em) → *dữ liệu sẽ chạy* → *xong khi*.
- Tab file mang **vai trò trước, tên file sau**: `Bản mô tả` / `★ Em sửa` / `Bài chạy`. Ghi chú tab: "Chỉ sửa `allowed()` trong file này — hai file kia chỉ để đọc."
- Ribbon `Từ lời giải của em` từng in mô tả của hàm **helper** ngay cạnh chữ "đang sửa", đọc như đang nói về hàm em sửa. Nay có tiền tố `Đã chạy đúng sẵn:`.
- `.xg-focus-mission` bỏ `max-width: 18ch` (ép một câu bình thường xuống sáu dòng ngắt quãng) → `30ch`, cỡ chữ 24px → 19px.

**Verify:** `node --test test/xuong-authored-arcs.test.js` **81/81** (thêm 20 test mới: khuôn ba vùng, bước-trong-file ≡ bước-trên-cột, câu mục tiêu không rò con số/thuật ngữ). Backend full `npm.cmd test` **825/825**. Frontend full **210/210**. App thật `:5098`: MemoryPool / OrderFlow / LedgerAudit / PrefixRouter build C++ thật, tab đúng vai trò, bản đồ file trỏ đúng file, console **0 warning/error**. Ảnh mới: `xuong-authored-memorypool-red-2026-07-24.jpg`, `xuong-authored-orderflow-red-2026-07-24.jpg`.

⚠️ **Chưa làm:** 5 thiết kế cũ (MazeNavigator/RouteWatch/ShardBalancer/MergeForge/LogMatcher) vẫn dùng marker `TODO Xưởng 01.x` + `PHẦN 2` trong scaffold của `xuongNativeSeeds.js` và trong `applyLearningLayout()`. Cột trái, tab và bản đồ file đã dùng khuôn mới cho cả 15, nhưng **vùng code của 5 cái cũ chưa được chuẩn hoá** — chúng đi qua migration có test khoá chuỗi chính xác, phải làm thành một pass riêng.

ℹ Trong lúc phiên này chạy, một project owner mới xuất hiện trong `workspace/xuong/projects` (`project-46f19b51…`, seed `weighted-graph-router`, title AI tiếng Việt "Bản đồ chi phí di chuyển quân hậu", 2026-07-24T17:52Z). Không phải của phiên này — mọi thứ phiên này dựng đều nằm trong `%TEMP%` và grep 10 seedId mới trong `workspace/` ra rỗng. Không đụng vào.

**Checklist cho agent nhân rộng từ 5 mẫu lên catalog lớn hơn — làm tuần tự từng project, không clone câu chuyện:**

1. Chứng minh transformation phá một giả định thật của code cũ; chỉ đổi tên/bối cảnh là reject.
2. Viết scenario bằng dữ liệu domain cụ thể; before/after phải nhìn được và có ít nhất một hành vi user có thể tự mô tả mà không mở Checks.
3. Chọn base/overlay từ axes của `ObservableModel`, không từ tên thuật toán. Chạy ViewPlanner test để bắt projection sai như lỗi MergeForge→geometry.
4. Viết runner + oracle trusted trước; baseline phải đỏ, source sửa phải xanh. AI không viết oracle và Run/Replay/Checks không gọi AI.
5. Mỗi build chỉ giao một hàm; source có tên tham số, khoảng trống TODO, helper sẵn có, lời gọi main() tối thiểu và ca tự kiểm trùng hành vi Preview.
6. Anchor phải nối `event/entity → sourceMapping → đi tới hàm → replay`; compile error vẫn dùng diagnostic compiler, không đội lốt Preview.
7. Mở S4 reference và S5 user run trên app thật; chụp red + green hoặc reference/user theo DoD, console sạch, grep metadata. Chỉ sau bước này mới nâng project từ adapter ẩn thành authored/public.
8. Ghi bằng chứng vào mục 4 file này. Không tăng KPI bằng cách nhân recipe, không tạo renderer theo algorithm, không tạo spec/roadmap mới.

### Đóng sổ phiên 2026-07-22 — quyết định không được tự ý đổi ở chat mới

- **Mục đích Xưởng:** biến lời giải AC thành một sản phẩm nhỏ có người dùng giả định; user học cách làm cho code *build được, chạy được, quan sát được và tiến hóa được*. Xưởng không phải OJ khó hơn và không phải bảng điểm verifier.
- **Pathway hợp lệ:** phải chỉ ra `sourceEvidence → oldAssumption → breakingEvent → newCapability → observableOutcome → editableSymbols → trusted runtime`. Chỉ đổi tên/bối cảnh hoặc thêm input tương tự là re-skin và phải loại.
- **AI làm gì:** chỉ phân tích code, viết tiếng Việt tự nhiên, đề xuất pathway biến thiên, điền tham số ScenarioSpec/semantic binding và copy hướng dẫn. AI không được sinh verifier/oracle, không quyết định pass/fail, không viết JSX/Canvas tùy ý.
- **Runtime làm gì:** registry giữ ScenarioSpec, runner, oracle, verifier, capability/compatibility và trace schema. `Run`, `Replay`, `Checks` không gọi AI; mọi kết quả phải tái lập được từ source + fixture + registry version.
- **Preview:** một `PreviewSurface` duy nhất. Planner chọn recipe từ ObservableModel theo grammar hữu hạn (1 base + 0–2 overlay + control + layout), không tạo renderer riêng cho từng thuật toán và không ghép factorial tự do. Mục tiêu 1.500–3.000 recipe là cấu hình dữ liệu có kiểm soát, không phải KPI ship.
- **Không có preview riêng:** dùng Universal Inspector thật (input/output, state chính, event strip, changed fields, metric, anchor), không hiện chữ “fallback/tier” và không dựng preview giả/rỗng.
- **Ba nguồn đúng-sai tách biệt:** build output chỉ nói compile/runtime; Preview nói hành vi sống của scenario hiện tại; Checks/Evidence nói requirement/verifier. Không lặp cùng verdict ở header, preview và evidence.
- **Provenance bắt buộc:** S4 là “Mẫu hành vi” reference/inert; S5 là “Bản của em” chạy source thật. Hai vùng phải khác nhãn, màu, trạng thái và không được dùng chung output.
- **Debug bắt buộc:** lỗi hành vi phải có `EventAnchor → sourceMapping(symbol/span/hash) → jump-to-code → sửa → replay`; lỗi compile/runtime vẫn dùng diagnostic compiler bình thường. Renderer non-list (grid hoặc timeline) phải chứng minh được trước khi mở rộng catalog.
- **File C++:** vẫn giữ `.hpp`, `.cpp`, test/harness vì đó là cấu trúc sản phẩm thật, nhưng progressive disclosure: chỉ file/hàm đang sửa nổi bật; contract/test mở khi cần, không ném toàn bộ skeleton vào mặt user.
- **Milestone:** không khóa cứng 3 bước và không bắt buộc 3–5 pathway. Chỉ mở requirement tiếp theo sau red-before-green + verifier riêng; UI chỉ hiển thị growth spine phi-điểm-số và một next action có lý do.
- **Thứ tự làm:** C0 đã xong; A/B bắt đầu C1 bằng contract + golden fixture đã khóa. Không được lấy PNG concept, payload v1 hoặc lời hứa AI làm đặc tả.

### Vừa sửa (2026-07-19, phiên này)
- ✅ "Bài phù hợp" (implement `generatePersonalizedProblem` còn thiếu) — 502→201.
- ✅ Stress Test (bài main.cpp rỗng → seed `SOLUTION_STARTER` + Home card ưu tiên bài AC) — hết "Thiếu code Solution".
- ✅ Xưởng cột phải hết khối trùng "Yêu cầu & bằng chứng" (`hideReadyConsole`).
- ✅ Test-leak vá TẬN GỐC trong `config.js` (`NODE_TEST_CONTEXT` → auto tmp) — mọi cách chạy test đều cách ly.
- ✅ Dọn rác data (3 bài + 8 project + thư mục mồ côi).

### Hình thức
8/8 lỗi mục 5 đã sửa cho code và nội dung sinh mới. Hai project cũ vẫn giữ nguyên copy tiếng Anh trong dữ liệu owner; không tự migrate.

---

## 5. Danh sách bug HÌNH THỨC còn tồn (display / nội dung / phù hợp) — cần xử ở phần Xưởng redesign

> **Cập nhật 2026-07-20:** 8/8 lỗi đã khép cho code/nội dung mới và đã kiểm tra canonical. Project lưu từ trước bản vá không tự dịch/migrate.

1. **S4 pathway overlay = tường chữ AI tiếng Anh thô** (`analysis.summary` render nguyên khối, không xuống dòng). Màn đầu tiên user thấy khi vào Xưởng.
2. **Pathway card tiếng Anh + rò "(… seed)"** trong title. GỐC ở backend prompt (`applicationAnalysis.js`): 0 chỉ thị tiếng Việt + nhét `seedCatalog` JSON thô vào system prompt.
3. **Requirements tiếng Anh** ("No recursion used for traversal", "Memory usage ≤ 2MB") lẫn với nhãn VN ("YÊU CẦU", "ĐANG LÀM") — nửa nạc nửa mỡ.
4. **"Em sẽ thấy:" lặp y nguyên "Kiểm chứng:"** trên pathway card — thừa.
5. **Fallback name "X · pathway 1"** khi AI naming lỗi — vô nghĩa với user.
6. **Card "Bài phù hợp" hứa sai**: meta "Kết quả: thêm một bài AC" nhưng thực ra tạo bài MỚI để giải (chưa AC).
7. **Card "Stress Test" không nói cần bài đã giải trước** — user mở trên bài chưa code thì bối rối (đã dựng starter đỡ, nhưng card copy vẫn chưa truyền đạt điều kiện).
8. **Home "Nước đi tiếp theo" rò slug** `bug.tag` = "tran-mang" (planner.js:74) — nên là "tràn mảng".

> Lệnh CẤM trên chỉ áp dụng cho phiên bug-fix 2026-07-19. Owner đã duyệt redesign/rebuild Xưởng trong chuỗi trao đổi 2026-07-20→22; phạm vi mới phải theo README §6/§11.1/§15 và checkpoint C0–C4, không quay lại sửa card rời rạc.

---

## 6. Vấn đề BẢN CHẤT chưa giải quyết: "Xưởng để làm gì?"

Owner phản biện đúng: Xưởng hiện tại chỉ là *"class skeleton, sửa cho unit test pass"* = **một bài OJ nữa mặc áo library**, tệ hơn cả chế độ "Bản khó hơn" đã có. Cái phân biệt *project* với *bài tập* KHÔNG phải nhiều file — mà là **sản phẩm chạy được, nhìn thấy được, có người dùng giả định**.

**Quyết định "Demo-first" — OWNER PHÚC ĐÃ DUYỆT 2026-07-20, ĐÃ TRIỂN KHAI:**
- Mỗi project có `demo/main.cpp` chạy được NGAY + nút **"Chạy demo"** cạnh Verify → user thấy sản phẩm sống (mê cung ASCII + đường đi, feed vào Visualizer SVG có sẵn) trước khi sửa code.
- Brief 3 tầng: **Bối cảnh** (ai cần, dùng làm gì — đời thật) → **Việc của em** → **Nghiệm thu**.
- Định vị rõ vs "Bản khó hơn": Bản khó hơn = bài mới khó hơn (vẫn stdin/stdout); Xưởng = giữ code em, biến thành công cụ có bối cảnh, tiến hóa theo yêu cầu "khách hàng".
- Nếu không làm được demo-first → Xưởng không có lý do tồn tại; cắt về "Bản khó hơn" là lựa chọn hợp lệ.

**Bổ sung quyết định 2026-07-22:** Demo-first v1 là nền chạy thật cần giữ, nhưng stdout demo + seed nông **chưa đạt mục đích Xưởng**. Bản rebuild phải biến demo thành provenance/reference rõ ràng, thêm user ScenarioRun/Preview/Trace, mapping code AC và red-before-green. Không được vứt runner/verifier trung thực để đổi lấy AI tự do; cũng không được giữ seed đóng hộp rồi chỉ thay câu chuyện.

---

## 7. Việc tiếp theo — thứ tự ưu tiên

### Frontend visual contract — Xưởng workbench (owner-confirmed, 2026-07-23)

Các reference RouteWatch/LogMatcher là **visual target** cho workbench desktop; không phải
lý do để làm mock output hay rò metadata. Mức fidelity mục tiêu là 80–90% ở hierarchy,
proportion, dark/cyan system và interaction density.

- **Khung:** top bar mảnh + icon rail 60px; dưới là growth spine ngang. Workbench ba cột:
  narrative/growth trái 300–340px, code ở giữa là vùng lớn nhất, Preview/Checks/Logs phải
  440–520px. Dùng divider 1px, góc nhỏ, nền navy rất tối; không xếp card lồng card.
- **Màu & type:** cyan chỉ là primary action, active state, đường/tuyến hợp lệ và cursor;
  đỏ chỉ là failure/anchor; xanh chỉ là build/check đã pass. Nội dung dùng sans trung tính,
  code/offset/metric dùng mono. Không dùng gradient tím hay glow lớn.
- **Cột trái:** một mục tiêu có ngữ cảnh, ba bước hiện tại và growth spine. Copy phải lấy từ
  `Project.brief`, `transformation`, `growth`; không hiển thị seed, base, overlay, enum hoặc
  lời hứa verifier giả.
- **Code:** tabs file thật, mapping ribbon và jump-to-symbol/span thật. Chỉ vùng source đang
  neo mới có highlight; compiler error không giả làm EventAnchor.
- **Cột phải:** `Preview | Checks | Logs`, provenance user/reference rõ. Preview lấy duy nhất
  từ `ObservableModel + PreviewRecipe`; scenario/replay control chỉ active với user run.
  Event anchor là callout hành động (đi tới hàm / phát lại từ đây), không phải decoration.
- **Responsive:** desktop giữ ba cột; màn hẹp thu gọn narrative trước, Preview chuyển thành
  drawer/tab nhưng Inspector luôn truy cập được. Renderer tải lười và list/event dài phải cap/
  virtualize.
- **Năm acceptance screen:** MazeNavigator grid, RouteWatch graph, MergeForge sequence,
  ShardBalancer chart/table, LogMatcher text/state-machine. Mỗi màn phải có trạng thái fail
  thật, replay thật và check/evidence thật trước khi dùng làm screenshot golden.

**Trước khi lên fullstack, PHẢI khép vòng C++ cho tử tế:**

1. **[Backend] ✅ Sửa prompt AI Xưởng — XONG 2026-07-20** (`applicationAnalysis.js` + evolve trong `applicationProjectStore.js`): tiếng Việt/title/seedId/requirement được khóa bằng prompt + schema guard; API AI thật, verifier thật và canonical screenshots đã xác nhận. Phần "đặt tên boss theo evidence" là luồng khác, đã được sửa từ phiên 2026-07-19 như mục 4 ghi.
2. **[DONE 2026-07-20] Demo-first cho Xưởng** (mục 6): runner + schema tiếng Việt + milestone tuần tự + S4/S5/S6 canonical.
3. **[DONE 2026-07-20] Redesign tầng nội dung Xưởng + 8 bug hình thức** (mục 5), giữ shell chung.
4. **[DONE 2026-07-23 — C0, integration owner] Contract v2 đã freeze:** `docs/XUONG-API-CONTRACT.md` + `docs/fixtures/xuong-contract-v2.json`; giữ `/demo` v1 nguyên semantics, thêm `/run` + `/runs/:runId/replay`, exact DTO/validator/provenance/red-before-green. Cả A/B phải đọc cùng fixture, không được tự sửa contract theo code.
5. **[DONE 2026-07-23 — C1]** Frontend adapter/workbench và backend registry/runtime cùng ký contract v2; không dùng fixture fallback che lỗi API.
6. **[DONE 2026-07-23 — C2 corrective] BFS→MazeNavigator thật:** code AC map vào component; reference ≠ user run; starter có TODO thật; grid anchor → đúng symbol → replay; Checks tạo Evidence đỏ đọc được; evolve vòng sau có suite riêng, comment-only không pass.
7. **[DONE qua runtime/test — C3]** cùng một PreviewSurface chạy RouteWatch, MergeForge, ShardBalancer, LogMatcher và Universal Inspector. Trước khi coi từng project là UI golden vẫn phải mở nó bằng mắt; renderer test không thay acceptance sản phẩm.
8. **[DONE trên :5099 workspace thật; restart :5050 còn là bước vận hành] C4:** Run/Replay/Checks thật, screenshot user/checks, grep metadata, browser console sạch, backend/frontend suite xanh. Không tự nhận canonical mới đã nạp cho tới khi process `:5050` được restart.
9. **Chỉ SAU C4** mới bắt đầu **P2: Frontend adapter** (slice web đầu tiên — code HTML/CSS/JS trong app, browser preview, verifier DOM). Rồi P3 backend → P4 UI/UX → P5 DB/Python → P6 fullstack slice. Mỗi domain là một **adapter** trên cùng shell + artifact model, KHÔNG phải app mới. README §11.

**Quy tắc giao việc rút ra**: brief dạng **checklist tick-box từng dòng**, không văn xuôi. Mỗi task kèm DoD "verify bằng mắt trên canonical + screenshot". Grep để xác minh đã làm, đừng tin báo cáo.

### Ownership/checkpoint cho hai agent Xưởng

- **Agent A (Frontend):** `frontend/src/core/xuong-model.js`, `frontend/src/features/xuong.js`, `frontend/styles/xuong.css`, frontend tests/fixtures liên quan; không sửa backend/API contract/README/HANDOVER.
- **Agent B (Backend):** `backend/src/applicationAnalysis.js`, `applicationProjectStore.js`, registry/demo/verifier/runtime/route Xưởng và backend tests; không sửa frontend/PNG/README/HANDOVER.
- **Integration owner:** README + HANDOVER + `docs/XUONG-API-CONTRACT.md`, golden payload và quyết định conflict. Không bên nào được “sửa docs theo code lỡ viết”; code lệch contract thì sửa code.
- **Handoff A→B:** field request phải kèm behavior UI + fixture mong muốn. **Handoff B→A:** thay shape phải kèm validator/contract test + fixture mới + compatibility plan.
- **Mỗi checkpoint:** A chạy frontend suite; B chạy direct test + backend suite; integration owner nối API thật và đi canonical bằng mắt. Fixture chỉ hỗ trợ làm song song, không được fallback che 4xx/5xx production.

### Gói bàn giao sang chat mới

Chat mới phải nhận đúng ba việc theo thứ tự: (1) đọc `docs/HANDOVER.md`, `README.md`, `docs/XUONG-API-CONTRACT.md` và `docs/fixtures/xuong-contract-v2.json`; (2) Agent A/B viết contract tests đọc fixture chung; (3) chỉ sau test fixture của mỗi bên mới bắt đầu C1 UI/runtime. Không được tự ý bắt đầu từ UI mockup, seed mới, preview renderer riêng hay prompt AI mới; C0 đã freeze, code lệch contract thì sửa code.

Khi báo một checkpoint hoàn thành, bắt buộc ghi vào mục 4 của file này: files đã đổi, contract fixture đã dùng, lệnh test (kể cả `node --test file.js` trực tiếp), URL canonical đã mở, screenshot/log thật, grep metadata và các giới hạn còn lại. Không tạo `STATUS.md`, roadmap phụ hoặc README mới.

---

## 8. Vận hành / gotcha

- Dev server: preview `usaco-ide-2-dev` port 5099. **App thật :5050 phải RESTART** mới nhận backend mới; frontend sửa phải **bump `?v=`** trong `index.html` + `main.js`.
- Verify UI: puppeteer-core + system Chrome (`C:\Users\Admin\usaco-audit\*.js`); tắt welcome modal `localStorage.setItem("usaco2.welcomed","1")`; freeze `*{animation:none}` trước screenshot (infinite anim làm treo pipeline). `window.app` KHÔNG global.
- Test: `cd backend && npm test` (đã có `--test-concurrency=2` + isolate). Frontend: `cd frontend && node --test "test/**/*.test.mjs"` (KHÔNG `test/`).
- Chưa commit gì — làm tree chung. Khi commit: tách message frontend/backend rõ ràng.
