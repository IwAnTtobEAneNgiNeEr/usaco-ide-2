# USACO IDE 2.0 → Forge Workspace

**Nguồn sự thật duy nhất của dự án.** Mọi tài liệu định hướng khác trong repo (PRODUCT.md, ROADMAP*.md, README-*.md, docs/WORKSPACE-ARCHITECTURE.md…) đã **Deprecated — xem file này**. Không tạo thêm README chiến lược / roadmap / product spec mới; mọi thay đổi định hướng sửa trực tiếp vào đây.

> **Định hướng nghiên cứu khoa học:** xem [`docs/NCKH.md`](docs/NCKH.md). Agent phải đọc file đó trước khi làm bất kỳ tính năng mới nào — nó quyết định cái gì được làm, cái gì bị đóng băng, và bốn con số đề tài phải đo được.

*Cập nhật: 2026-07-24 · Xưởng C++ v3 đã có năm project authored đầu tiên: MazeNavigator, RouteWatch, ShardBalancer, MergeForge và LogMatcher. Mỗi build chỉ giao một hàm có TODO theo bước, cầu nối `main()` → component, Preview chạy source từ ObservableModel, anchor → code và replay. App dev workspace thật đã chạy MergeForge và RouteWatch; backend 735/735, frontend 201/201; branch `codex/applied-algorithms-v1-closure`, toàn bộ working tree chung vẫn chưa commit.*

---

## Mục lục

1. [Product thesis](#1-product-thesis)
2. [Target users & jobs-to-be-done](#2-target-users--jobs-to-be-done)
3. [Current reality — audit 2026-07-17](#3-current-reality--audit-2026-07-17)
4. [Deprecated directions — sai lầm không lặp lại](#4-deprecated-directions--sai-lầm-không-lặp-lại)
5. [Core loop & vai trò của AI / verifier](#5-core-loop--vai-trò-của-ai--verifier)
6. [Flow C++ hoàn chỉnh](#6-flow-c-hoàn-chỉnh)
7. [Flow theo domain: UI/UX · Frontend · Backend · Python · Fullstack](#7-flow-theo-domain)
8. [Unified workspace & information architecture mới](#8-unified-workspace--information-architecture-mới)
9. [Artifact / project model](#9-artifact--project-model)
10. [Kế hoạch cứu base hiện tại (repair roadmap)](#10-kế-hoạch-cứu-base-hiện-tại-repair-roadmap)
11. [Roadmap C++ → fullstack theo vertical slices](#11-roadmap-c--fullstack-theo-vertical-slices)
12. [Definition of Done cho mỗi phase](#12-definition-of-done-cho-mỗi-phase)
13. [Non-goals & nguyên tắc chống feature island](#13-non-goals--nguyên-tắc-chống-feature-island)
14. [Màn hình chính & user journeys](#14-màn-hình-chính--user-journeys)
15. [Design rules thống nhất (frontend / UI-UX)](#15-design-rules-thống-nhất-frontend--ui-ux)
16. [Cài đặt & chạy](#16-cài-đặt--chạy)
17. [Cấu trúc repo & tài liệu](#17-cấu-trúc-repo--tài-liệu)

---

## 1. Product thesis

App bắt đầu là **local-first C++ competitive programming IDE**: nhập đề → code → g++ Judge thật → evidence → sửa lỗi. Cái lõi đó **đang chạy tốt và là tài sản quý nhất của repo** — nó không bị thay thế, nó được *mở rộng*.

Tầm nhìn mới: **AI-assisted software engineering learning workspace** — đưa user đi từ *bài toán / ý tưởng* đến *sản phẩm chạy được*, theo thứ tự:

1. **Hoàn thiện C++**: giải bài (OJ loop hiện tại) → hiểu thuật toán → **phát triển lời giải thành project C++ thật** (nhiều file, unit test, benchmark, simulation).
2. **Mở rộng domain**: UI/UX → frontend → backend → database → Python/AI → fullstack. Code trực tiếp trong app (không bắt user rời sang VS Code/Node setup riêng), vẫn theo đúng một core loop.

Câu trả lời cho "học BFS để làm gì?" không phải một bài OJ tiếp theo, và cũng **không phải một đáp án hard-code duy nhất (Micromouse)** — mà là: AI đọc *chính code của user* và đề xuất **một số hướng đủ chất lượng, không ép số lượng** (routing, maze solver, web crawler, dependency resolver, flood fill trong image tool…). Mỗi hướng phải chỉ ra giả định cũ nào bị phá, capability nào được thêm và hành vi mới nào nhìn thấy được; user chọn một hướng, app dựng project workspace thật để build nó, và verifier thật (tests / benchmark / browser / API runner) quyết định "xong hay chưa".

**Một câu:** *Luyện tập dạy user giải bài; Xưởng dạy user biến lời giải thành sản phẩm; AI là kiến trúc sư gợi ý; verifier là trọng tài duy nhất.*

---

## 2. Target users & jobs-to-be-done

Người dùng chính hiện tại: **học sinh cấp 3 luyện competitive programming (VN-first)**, dùng app hằng ngày làm IDE + judge chính. Người dùng mở rộng: học sinh/sinh viên muốn đi từ CP sang software engineering thật mà không biết bắt đầu từ đâu.

| Job | Câu user tự hỏi | Bề mặt phục vụ |
|---|---|---|
| **J1 — Giải bài nhanh** | "Bài này AC chưa? Sai ở đâu?" | Luyện tập (OJ loop) — *lõi đang dùng được, được bảo vệ tuyệt đối* |
| **J2 — Hiểu sâu sau verdict** | "Vì sao WA? Thuật toán này bản chất là gì?" | Coach, Pháp y, Game Review, Điền Lõi, Ôn tập |
| **J3 — Biến kiến thức thành sản phẩm** | "Học BFS xong thì xây được cái gì?" | Xưởng (project workspace) — *đang là prototype hỏng, phải xây lại* |
| **J4 — Đi xa hơn C++** | "Muốn làm web/app/AI thì học tiếp thế nào?" | Domain adapters (roadmap §11) — *chưa tồn tại* |
| **J5 — Biết mình đang ở đâu** | "Hôm nay nên làm gì? Mình tiến bộ chưa?" | Home (Hôm nay) + Hồ sơ |

Nguyên tắc: **J1 không bao giờ bị hy sinh cho J3/J4.** Mọi thay đổi phải qua regression checklist Luyện tập (§12) trước khi merge.

---

## 3. Current reality — audit 2026-07-17

Audit chạy app thật (dev-preview :5099, cùng code với app canonical :5050) bằng screenshot + đi từng flow như user mới. Kết luận từng phần:

### 3.1. Phần TỐT — giữ nguyên, là nền của mọi thứ

- **Core OJ loop (Luyện tập)**: sidebar bài tập → statement sheet → CodeMirror 6 editor → Run (stdin tùy ý) / Judge (g++ thật, AC/WA/CE/RE/TLE, diff side-by-side, compile cache ~9×) → verdict console. **Đây là flow tốt nhất app, mượt, rõ, đang được dùng thật hằng ngày.** Layout 3 cột + 3 chế độ (Code / Đề + Code / Đề bài, Ctrl+Shift+M) hoạt động đúng.
- **Visual nền của main IDE**: workbench graphite tối + neon-ink accent + verdict color language. Đây là **anchor thẩm mỹ của toàn app** (§15).
- **Import đề**: gõ/dán, dán ảnh (OCR local Tesseract), PDF/DOCX (MarkItDown), AI phân tích + sinh test candidates.
- **Hệ công cụ quanh verdict**: Stress Lab (generator + brute force), Input Visualizer (graph/tree/grid SVG), AI Coach (đọc bài + code + verdict + run timeline, giọng "sửa code học sinh, không viết bài mới"), Pháp y WA, Game Review, Mistake Notebook, Ôn tập giãn cách [3,7,21,60], Lời giải chuẩn (AC-gated).
- **Điền Lõi (Core Fill)**: layout đề-trái/code-phải y IDE chính, CM thật, chấm test thật. **Flow con tốt nhất trong nhóm luyện thêm** — dùng nó làm chuẩn khi sửa các tool khác.
- **Backend hạ tầng**: Express + file-per-problem (không DB), atomic writes + write locks, judge pool có TLE re-confirm, SPJ, AI layer cancellable + model fallback, ~700 unit tests. Đã audit riêng: judge đáng tin (AC 16/16 trên bộ chuẩn).

### 3.2. Phần HỎNG — bị các update trước phá, phải sửa/gỡ

Đây là những gì một user mới **nhìn thấy thật** hôm nay:

1. **Ba "module" (GridPathfinder / WeightedGraphRouter / RangeSum) chiếm đầu sidebar Luyện tập** dưới nhãn "MODULE THUẬT TOÁN", chen giữa filter và danh sách bài — user không biết nó là bài, là kiến thức hay là project (sai lầm #4).
2. **Module workspace = panel Contest tái chế nguyên xi**: mở GridPathfinder, cột phải hiện chữ **"CONTEST · Tiến độ contest"** với các bước "Đọc constraint / Lưu bài / Chuyển bài" — hoàn toàn vô nghĩa với một module; kèm nút **"Đổi đề"** (control của contest) ngay trên header (sai lầm #3).
3. **Metadata/internal enum leak thẳng ra UI**: `Runtime proof E:\usaco-ide-2 · Electron · :50…` trên header module; `local › applied-algorithms-v1 · Standalone` và chip `cần làm`/`đã verified` trên card sidebar; chip `≠ GIAO HỮU` cạnh khu Run của bài thường (sai lầm #12).
4. **Module không có công việc thật**: "VIỆC CẦN LÀM: *Sửa code trong editor rồi Verify module*" — không nói sửa *gì*, vì *sao*, đạt *tiêu chí nào*. Statement chỉ là 4 heading generic mỗi cái một câu. Lịch sử kiểm chứng chỉ có `PASS · 472ms / FAIL · 4721ms` — không nói fail *cái gì*. Editor chỉ có đúng 1 tab `.cpp`, không thấy `.hpp`, không thấy bộ test, không word-wrap (sai lầm #1, #2, #5, #8, #9).
5. **Mỗi thuật toán một file backend hard-code** (`gridPathfinder.js`, `rangeSum.js`, `weightedGraphRouter.js`, route `weighted-graph-router/simulate` viết chết trong `routes/modules.js`) — không scale, không AI (sai lầm #6, #7).
6. **Bài rác test lộ production**: `zz-gauntlet-reject-test` nằm chình ình trong danh sách bài của user.
7. **Home Journey pha loãng**: nhiều unit cùng trả lời "làm gì tiếp" (Next move / Gợi ý bắt đầu / Plan / Kèo); card Luyện tập mô tả bằng meta kỹ thuật ("CodeMirror · chấm test · phản hồi tức thì") thay vì nói *user sẽ làm gì và được gì*.
8. **UI/UX các công cụ Luyện tập bị "chế ra" ngoài flow app** (owner xác nhận khi dùng thật, 2026-07-17): Tạo contest, Debug tốc độ (Rush), Stress/Thi đấu, các overlay arena… mỗi cái một layout, một hệ nút, một giọng copy riêng — không theo nhịp chuẩn *đề → code → verify → verdict* của bài thường. User mở vào không biết bắt đầu từ đâu, không dùng được. Chuẩn đúng duy nhất trong nhóm này là **Điền Lõi** (đề trái / code phải / chấm thật). → Sửa ở **R1** (§10): mọi tool luyện phải quy về cùng một shell với bài thường, cái nào không quy về được thì gỡ.
9. **8+ file định hướng mâu thuẫn ở root** (PRODUCT.md, 2 ROADMAP, 5 README-*) — không ai biết cái nào đúng (sai lầm #13). *(Đã xóa 2026-07-17 — git history còn giữ.)*

### 3.3. Phần PROTOTYPE — có code, chưa phải sản phẩm

- **3 module + `standaloneModuleStore`**: từ nay chỉ được coi là **seed/template kỹ thuật** để test hạ tầng verify đa file. Không phải navigation, không phải giáo trình.
- **Application engine (nhánh lịch sử `codex/algorithm-application-engine`, chưa merge)**: seed registry + project store + UI 326 dòng. Đúng *hướng* (bài → project) nhưng vẫn seed-registry hard-code — chỉ được refactor theo §6 và IA §8. Đây là tên agent của lịch sử cũ; không nhầm với **Agent A Frontend** trong kế hoạch song song §11.1.
- **Nhánh `agentb/experience-redesign` (e737ff6, chưa merge)**: đã sửa đúng nhiều lỗi trên (module = project workspace, file tabs, stepper, xóa metadata leak, fix bug lens filter làm trống danh sách). Là **nguồn tham khảo/cherry-pick chính cho R2** (§10) — nhưng phải kiểm chứng lại trên canonical, không tin GO cũ.
- **Arena/reward layer** (Ấn, Kèo, Gauntlet, Boss…): backend dày + có data thật, nhưng UI nhiều chỗ còn cryptic. Đông lạnh mở rộng; chỉ sửa copy/label khi đụng tới.

### 3.4. Nguyên nhân gốc (để không tái phạm)

Các agent trước tối ưu cho "diff nhỏ + tests xanh + báo cáo GO" thay vì "user mở app canonical hiểu được flow". Kết quả: tính năng mới **mượn xác** UI cũ (contest panel), **né** việc sửa IA sai, và **tự chấm đậu** bằng bằng chứng kỹ thuật thay vì trải nghiệm thật. §12 và §13 tồn tại để chặn đúng pattern này.

---

## 4. Deprecated directions — sai lầm không lặp lại

Bất kỳ PR/agent nào lặp lại một mục dưới đây là **tự động fail review**, dù tests xanh:

1. ~~Xem GridPathfinder / WeightedGraphRouter / RangeSum là sản phẩm hoàn chỉnh~~ → chúng là seed kỹ thuật.
2. ~~Biến module thành một bài OJ khác (mô tả → sửa code có sẵn → Verify)~~ → module/project phải có brief, task, file structure, verifier riêng.
3. ~~Tái sử dụng panel Contest cho project/module rồi chỉ đổi chữ Judge thành Verify~~ → mỗi ngữ cảnh có contextual tools đúng của nó (§8).
4. ~~Trộn module vào sidebar Luyện tập~~ → Luyện tập và Xưởng là hai bề mặt khác nhau.
5. ~~"Một activeArtifact + một editor" = UX xong~~ → UX xong khi user mới đi hết flow không cần giải thích.
6. ~~Hard-code từng thuật toán thành từng ứng dụng (BFS = Micromouse)~~ → AI đề xuất số pathway biến thiên từ capability/assumption của code thật; backend chỉ materialize hướng có trusted runtime.
7. ~~Làm từng pathway thủ công thay vì dùng AI API phân tích code và sinh hướng động~~.
8. ~~Chỉ thêm card, label, purpose, checklist mà không tạo công việc hay output thực tế~~.
9. ~~Để user tự đoán phải học gì, sửa gì, kiểm chứng gì, xây được gì~~.
10. ~~Cho tests xanh / branch riêng / dev port làm bằng chứng GO trong khi app canonical vẫn lỗi~~ → GO chỉ tính trên app canonical user mở thật.
11. ~~Ưu tiên diff nhỏ và compatibility đến mức không dám sửa IA sai~~ → IA sai thì sửa IA.
12. ~~Để metadata backend / internal enum xuất hiện trong UI~~ (Runtime proof, Standalone, applied-algorithms-v1, GIAO HỮU…).
13. ~~Tạo nhiều README / roadmap / north star mâu thuẫn~~ → chỉ file này.
14. ~~Sửa module mà làm chệch/phá flow Luyện tập~~ → regression checklist §12 bắt buộc.
15. ~~Báo cáo kỹ thuật thay cho kiểm chứng trải nghiệm user thật~~ → DoD yêu cầu walkthrough bằng mắt trên canonical.
16. ~~Ép AI luôn sinh 3–5 pathway~~ → số hướng là biến thiên; chỉ giữ hướng có `breakingEvent`, capability mới và runtime đáng tin. Không đủ hướng tốt thì trả ít hơn, không sinh filler.
17. ~~Gọi việc đổi bối cảnh là “phát triển”~~ → một pathway hợp lệ phải phá ít nhất một giả định của lời giải cũ và thêm hành vi quan sát được; “BFS trong trường học” vẫn chỉ là BFS đổi skin.
18. ~~Đổ sẵn nhiều file `.hpp/.cpp/test` rồi gọi đó là project~~ → Build đầu phải chỉ rõ đoạn code AC nào đi vào component/hàm nào; user sửa một phạm vi nhỏ và thấy sản phẩm thay đổi.
19. ~~Cho preview tham chiếu và preview chạy code user trông/hoạt động giống nhau~~ → reference chỉ là **Mẫu hành vi**, không có pass/fail/Play; workspace mới có **Bản của em đang chạy**.
20. ~~Chứng minh mô hình lỗi trên renderer list/chat rồi tuyên bố dùng chung~~ → trước khi mở rộng phải chạy được `error → event/entity anchor → code symbol → replay` trên ít nhất một renderer non-list (grid/graph).
21. ~~Gán một thuật toán vào một preview/domain~~ (`BFS→robot`, `Dijkstra→chi phí`, `sorting→animation`) → preview được chọn từ observable axes và primitive composition, không từ tên thuật toán.
22. ~~Viết một preview/component riêng cho từng project~~ hoặc ~~cho AI ghép factorial tự do~~ → dùng grammar có kiểu: đúng 1 base projection, tối đa 2 overlay chính, control pack và layout canonical qua compatibility matrix.
23. ~~Lộ ba “mức preview” như ba hạng project~~ → frontend chỉ có một `Preview Surface`; planner âm thầm chọn product simulation, algorithm lab hoặc universal inspector.
24. ~~Đặt Verify/Evidence ở trung tâm trải nghiệm Xưởng~~ → trung tâm là `Code ↔ sản phẩm đang chạy`; Checks/Logs/Evidence là công cụ phụ. Verify không bị khóa nhưng không chiếm primary attention.
25. ~~Báo đúng/sai hành vi ở cả preview và build bar~~ → build bar chỉ báo compile/runtime; behavioral truth sống duy nhất tại event/entity trong Preview, verifier truth sống trong Checks/Evidence.
26. ~~Để AI sinh verifier/oracle hoặc tự viết simulator tùy ý~~ → AI chỉ đề xuất semantic transformation, scenario data và binding; registry/runtime tay người kiểm soát quyết runner/oracle/verifier.
27. ~~Lưu mapping code cũ bằng số dòng cứng~~ → mapping nội bộ dùng symbol + source span + content hash; số dòng chỉ là cách hiển thị hiện thời.
28. ~~Khóa milestone/check như một khóa học tuyến tính~~ → growth spine chỉ nói `đã có / đang build / có thể mở rộng`; số build step biến thiên và Checks luôn dùng được.
29. ~~Cho frontend/backend phát triển song song bằng văn xuôi và tự đoán contract~~ → khóa fixture/envelope/checkpoint trước; mỗi bên sở hữu thư mục riêng và không tự đổi shape chung.

---

## 5. Core loop & vai trò của AI / verifier

Một loop duy nhất, dùng chung cho **mọi** domain (competitive C++, project C++, UI/UX, frontend, backend, Python, fullstack):

```
Brief/Problem → Understand → Plan → Build → Verify → Diagnose → Run → Evolve
     ↑                                                                  │
     └────────────── requirement mới / iteration tiếp theo ─────────────┘
```

**AI là kiến trúc sư & người phân tích — không phải chatbot trang trí, không phải giám khảo.** AI đọc requirement, code, artifact và evidence để:

- phân tích vấn đề & nhận diện kiến thức/thuật toán trong code của user;
- đề xuất **số hướng phát triển biến thiên** — user chọn, không quota/filler;
- viết brief/task copy, đề xuất phép biến đổi + scenario/binding **trong catalog đã đăng ký**; kiến trúc thực thi, API contract và verifier phải đến từ registry/runtime đáng tin;
- giải thích failure từ evidence thật (không đoán mò);
- đề xuất requirement tiếp theo để project "sống" (evolve).

**AI không bao giờ được tự xác nhận hoàn thành.** Nguồn bằng chứng duy nhất là verifier thật:

| Domain | Verifier |
|---|---|
| Competitive C++ | g++ compiler, Judge, Stress Lab |
| Project C++ | unit tests, benchmark, simulation |
| UI/UX | usability/a11y evidence, prototype click-through |
| Frontend | browser preview, console, network, DOM/a11y tests |
| Backend | API runner, integration/load/security tests, DB state |
| Python/AI | dataset execution, evaluation metrics, job logs |
| Fullstack | E2E, staging run, observability/logs |

Quy tắc bất biến: **mọi trạng thái "đạt" trong UI phải trace về ít nhất một lần chạy verifier thật, xem được evidence.** Không có evidence → không có checkmark.

Ranh giới bổ sung cho Xưởng: **AI không sinh verifier/oracle và không sinh JSX/Canvas tùy ý.** AI được phép phân tích code, đề xuất semantic transformation, điền scenario data và đề xuất binding vào primitive đã đăng ký. Registry/runtime chịu trách nhiệm compile, runner, oracle, verifier, trace và tính tương thích của preview recipe. `Run`, `Replay`, `Checks` không gọi AI; chỉ lúc tạo project/đổi pathway hoặc user chủ động xin giải thích mới được gọi AI, có cache.

---

## 6. Flow C++ hoàn chỉnh

Flow trung tâm của phase hiện tại, nối J1 → J2 → J3:

```
Đề bài / ý tưởng / code có sẵn
  → AI cấu trúc yêu cầu + sinh test candidates            (import pipeline — ĐÃ CÓ)
  → user giải trong Competitive C++ workspace              (OJ loop — ĐÃ CÓ, lõi)
  → Judge / Stress / Evidence                              (ĐÃ CÓ)
  → AI giúp hiểu: thuật toán, invariant, complexity,
    giới hạn của lời giải                                  (Coach/Analysis — ĐÃ CÓ, cần nối)
  → user bấm  「Phát triển lời giải」                        (entry point MỚI, post-AC)
  → AI đọc code thật + sinh MỘT SỐ application pathways đủ chuẩn
    (BFS → micromouse / route planner / crawler / flood
    fill / dependency resolver …)                          (MỚI — AI API, không hard-code)
  → user chọn MỘT hướng
  → AI trả semantic proposal/binding; registry gắn ScenarioSpec,
    file contract, runner/oracle/verifier thật             (P1 rebuild)
  → user xem Mẫu hành vi reference (không chạy code user),
    mapping code AC → component và phạm vi cần sửa
  → user phát triển project C++ nhiều file trong Xưởng,
    Chạy build để thấy Bản của em trong Preview             (P1 rebuild)
  → trace/anchor/replay để debug; Checks sinh Evidence      (P1 rebuild)
  → requirement mới chỉ active sau red-before-green        (evolve integrity)
  → user sửa, chạy lại, artifact + evidence được lưu
  → lặp: pathway khác, hoặc requirement sâu hơn
```

Ghi chú ranh giới:

- **Ba module hiện tại chỉ là seed/template kỹ thuật** cho bước "project C++ nhiều file + verifier" — không phải navigation chính, không phải giáo trình bắt buộc, không xuất hiện trong Luyện tập.
- "Phát triển lời giải" là **một hành động** (xuất hiện trên verdict rail sau AC, và trong Xưởng), không phải một tab thường trực đập vào mặt user đang luyện thi.
- Về sau, các ngôn ngữ khác code **trực tiếp trong app** (không bắt user setup Node/HTML ngoài) — và vẫn áp dụng đúng flow này để gợi ý cách build app.

### 6.1. Định nghĩa cứng của “phát triển”

Một pathway Xưởng chỉ hợp lệ khi có đủ chuỗi sau:

```
sourceEvidence → oldAssumption → breakingEvent → newCapability
               → observableOutcome → editableSymbols → trusted runtime
```

- `sourceEvidence`: symbol/span/hash trong lời giải AC chứng minh năng lực đang có.
- `oldAssumption`: điều lời giải cũ đang dựa vào (bản đồ cố định, toàn bộ input có sẵn, một nguồn, không có cập nhật…).
- `breakingEvent`: counterexample/sự kiện cụ thể làm code hiện tại không còn đủ.
- `newCapability`: hành vi mới project phải thêm; không được chỉ đổi danh từ/bối cảnh.
- `observableOutcome`: user nhìn được điều gì thay đổi trong Preview, output, metric hoặc trace.
- `editableSymbols`: phạm vi hàm/component nhỏ user thực sự sửa; Build đầu phải map code cũ vào đây.
- `trusted runtime`: runner + oracle/verifier + error anchor có thật. Thiếu bất kỳ phần nào → pathway chỉ là ý tưởng tham khảo, không được materialize thành project có nhãn “đạt”.

`brokenAssumption` một mình chưa đủ: AI có thể viết hay nhưng không tạo ra khác biệt chạy được. `breakingEvent` phải làm code hiện tại đỏ thật trước khi requirement được activate (**red-before-green**).

### 6.2. Phân quyền AI · registry · runtime · frontend

| Lớp | Được làm | Cấm làm |
|---|---|---|
| **AI analysis** | đọc code thật; tìm capability/assumption; đề xuất số pathway biến thiên; viết copy VN; đề xuất scenario data + view binding | sinh oracle/verifier; tự kết luận pass; ép quota; đổi bối cảnh để giả phát triển |
| **Catalog / development arc** | giữ primitive, component contract, runner/oracle/verifier và extension đã kiểm chứng; khai báo `breakingEvent` có thể chạy | hard-code `BFS=robot`; biến một seed thành một skin sản phẩm duy nhất |
| **Backend compiler/runtime** | validate schema/binding; lọc eligibility cơ học; materialize scenario; compile/run; tạo ObservableModel/Trace/Evidence; cache | dùng tag thô để tự quyết semantic match; tin field AI không có runtime đứng sau |
| **Frontend Preview Engine** | render recipe canonical; gắn lỗi vào entity/event; jump-to-symbol/replay; fallback Universal Inspector | hiểu raw enum; tự suy diễn đúng/sai; viết renderer theo tên thuật toán; hiển thị metadata nội bộ |

Phương án này là **hybrid**, không chọn một trong hai cực “seed đóng hộp nông” hoặc “AI tự do sinh cả project”. Arc/registry bảo vệ tính trung thực; AI cá nhân hóa phép biến đổi và mapping; composition mở rộng độ đa dạng.

### 6.3. Preview Engine — một surface, grammar hữu hạn

Preview không phải asset hoặc component riêng theo bài. Nó là phép chiếu `ObservableModel` thành `PreviewRecipe`:

```
ScenarioSpec → chạy code → ObservableModel → ViewPlanner
             → PreviewRecipe → PreviewSurface
```

**12 base projections mục tiêu:** grid · graph · tree · sequence · table · timeline · chart · text · geometry · state-machine · request/response · runtime/resource.

**Overlay dùng chung:** path · frontier · window · partition · heap · threshold · heatmap · diff · selection/range · dependency · interval · compare · frequency · constraint · error anchor · annotation · target · resource usage.

Grammar bắt buộc:

```
PreviewRecipe = đúng 1 base
              + 0..2 overlay chính tương thích
              + 1 control pack
              + 1 layout canonical
              + Universal Inspector luôn sẵn
```

Không nhắm factorial. Với 12 base, trung bình 7 overlay tương thích, 4 control pack và 3 layout, có khoảng 4.176 recipe thô; sau compatibility/canonicalization/dedupe, mục tiêu an toàn là **1.500–3.000 recipe hợp lệ**, nhưng frontend vẫn chỉ có khoảng mười mấy base component + plugin overlay. Chất lượng/đa dạng đến từ dữ liệu, event, invariant, binding và code mapping — không từ việc tạo hàng nghìn skin.

`ViewPlanner` chấm coverage + anchor/replay support + domain fit − complexity/ambiguity, rồi chọn recipe. Ba chiến lược product simulation / algorithm lab / universal inspector là **nội bộ**; UI luôn chỉ gọi là **Preview**. `universal-inspector` là một base fallback kỹ thuật trong contract, không phải “tier” user nhìn thấy. Nếu project không có bất kỳ behavior/output/metric/resource/trace nào quan sát được thì pathway không hợp lệ; không hiện preview rỗng và không bịa ứng dụng.

### 6.4. Reference, user run, trace, checks — bốn vai trò không trộn

- **Mẫu hành vi (S4):** storyboard/reference run từ registry để user hiểu đích; nhãn rõ “không chạy code của em”; không Play, pass/fail hoặc Evidence.
- **Bản của em (S5):** chạy source hiện tại qua runner; Preview là sản phẩm/lab thật của user.
- **Trace:** event + entity/location + before/after state + code symbol + replay cursor. Đây là công cụ debug, không phải verifier đội lốt.
- **Checks/Evidence:** kiểm invariant, edge case, benchmark và regression. Luôn dùng được nhưng nằm trong tab phụ; chỉ Evidence được phép đánh dấu Requirement `met`.

Một nguồn sự thật cho mỗi lớp: build output chỉ báo compile/runtime; lỗi hành vi sống tại Preview anchor; kết quả verifier sống tại Checks/Evidence. Không lặp cùng verdict ở nhiều panel.

### 6.5. Vòng thao tác Xưởng đã chốt

```
Bài AC → AI đề xuất pathway đủ chuẩn → Mẫu hành vi tham chiếu
→ chọn hướng → thấy mapping code cũ vào component mới
→ sửa một symbol nhỏ → Chạy build → quan sát Bản của em
→ lỗi neo vào event/entity → Đi tới hàm → Phát lại từ đây
→ Checks khi cần → Evidence → capability/build tiếp theo
```

Growth spine chỉ mô tả `đã có → đang build → có thể mở rộng`; số build/milestone biến thiên, không XP/phần trăm/khóa cưỡng ép.

---

## 7. Flow theo domain

Cùng một core loop (§5), mỗi domain là một **adapter** thay editor/tools/verifier. Flow tham khảo (có thể tinh chỉnh khi build thật):

**UI/UX**
research assumptions → user journey → information architecture → wireframe → prototype → usability/a11y check → component specification (đầu vào cho frontend).

**Frontend**
user story/design → component/page → state management → API integration → browser preview trong app → interaction/responsive/a11y tests.

**Backend**
business requirement → API/schema/service design → auth/error handling → database integration → request runner (gửi request, xem response/logs ngay trong app) → unit/integration/load/security tests.

**Python / AI**
automation/data/model requirement → environment & dependencies → script/service → chạy trên dataset thật → evaluation → đóng gói CLI/API/job → tích hợp vào fullstack.

**Fullstack (trung tâm của tầm nhìn, không phải "sau này")**
product brief → xác định user, problem, constraints, acceptance criteria
→ UI/UX thiết kế journey + IA + wireframe + interaction
→ chia sản phẩm thành **vertical slices** (mỗi slice = một luồng user hoàn chỉnh xuyên các tầng)
→ frontend xây page/component + browser behavior
→ backend xây API/service/auth/business logic
→ database schema + migration + query
→ Python đảm nhiệm automation/data/AI khi cần
→ nối các domain trong **một** project workspace
→ unit/integration/E2E/a11y/security/performance verification
→ chạy preview/staging thật → đọc logs + evidence + user feedback
→ AI đề xuất iteration tiếp theo.

---

## 8. Unified workspace & information architecture mới

**Không** biến mỗi domain thành một app con hay một danh sách "module" riêng. Một shell chung, công cụ thay theo ngữ cảnh.

### 8.1. Sơ đồ IA

```
APP
│
├── 🏠 HÔM NAY (Home)
│     Trả lời ĐÚNG MỘT câu: "Tiếp tục gì / bắt đầu gì?"
│     = Continue card + 1 next-move + search. Hồ sơ/stats là phụ.
│
├── 🎯 LUYỆN TẬP (Practice) — J1/J2, flow lõi, BẤT KHẢ XÂM PHẠM
│     ├── Danh sách bài (nguồn/trạng thái/độ khó/topic) — KHÔNG có module
│     ├── Bài đang mở: Statement · Editor · Run/Judge · Coach · Tests
│     ├── Công cụ luyện: Điền Lõi · Debug tốc độ · Contest · Stress · Ôn tập
│     └── Sau verdict: Pháp y / Game Review / Lời giải chuẩn / 「Phát triển lời giải」→ Xưởng
│
├── 🔨 XƯỞNG (Build / Projects) — J3/J4, bề mặt MỚI thay cho "module"
│     ├── Danh sách project của user (mỗi project: domain, trạng thái, evidence gần nhất)
│     ├── 「Phát triển lời giải」: chọn 1 bài AC → AI pathways → tạo project
│     ├── Project workspace (shell chung §8.2, adapter theo domain)
│     └── Seed templates (3 module cũ nằm ĐÂY, được dán nhãn đúng là template)
│
└── 👤 HỒ SƠ (Profile) — J5
      Kỹ năng · nhịp luyện · xếp hạng · sổ lỗi · thành tích
```

Điều hướng: topbar 3 mục (Hôm nay · Luyện tập · Xưởng) + avatar Hồ sơ + Ctrl+K palette xuyên suốt. **Luyện tập và Xưởng là hai job khác nhau**: Luyện tập giữ flow giải bài nhanh, không bị project chen vào; "Phát triển lời giải" là *cây cầu một chiều có chủ đích* từ Luyện tập sang Xưởng.

### 8.2. Shell chung của project workspace

```
┌────────────────────────────────────────────────────────────────┐
│ Header: tên project · domain chip · trạng thái verify gần nhất │
├───────────┬────────────────────────────────┬───────────────────┤
│ TRÁI      │ GIỮA                           │ PHẢI              │
│ project / │ editor / design canvas /       │ contextual tools  │
│ artifact  │ preview — theo công việc       │ + evidence        │
│ explorer  │ đang làm                       │ (theo adapter)    │
│ +         │                                │                   │
│ milestone │                                │                   │
│ / task    │                                │                   │
├───────────┴────────────────────────────────┴───────────────────┤
│ DƯỚI: logs / test output / console — hiện khi cần              │
└────────────────────────────────────────────────────────────────┘
```

Contextual tools theo adapter:

| Adapter | Giữa | Phải (tools + evidence) |
|---|---|---|
| **Competitive C++** | statement + editor | STDIN, Judge, Stress, trace *(= UI hiện tại, giữ nguyên)* |
| **Applied C++ / Xưởng** | editor chiếm chính + mapping ribbon; file phụ mở khi cần | **Preview** mặc định; Checks + Logs là tab phụ; contextual error anchor liên kết về symbol |
| **UI/UX** | design canvas / wireframe | journey map, design tokens, usability evidence |
| **Frontend** | editor + browser preview | component state, console, network, DOM/a11y |
| **Backend** | editor | API client (request/response), logs, traces, DB state |
| **Python** | editor + runner | environment, data preview, evaluation, job logs |
| **Fullstack** | project topology + preview | services, E2E, observability |

Một coding shell dùng chung được; nhưng **navigation, task flow và verifier phải đúng ngữ cảnh** — không bao giờ mượn panel của ngữ cảnh khác (sai lầm #3).

Riêng Xưởng, “3 cột” không có nghĩa ba dashboard ngang vai. Trái là focus rail gọn (outcome/input/symbol/done-when), giữa là CodeMirror, phải là Preview Surface. Không lặp CTA Run/Checks ở cả header lẫn panel; không dựng worksheet dài, requirement scoreboard hoặc evidence timeline trên màn chính. File `.hpp`/test vẫn tồn tại như cấu trúc C++ thật nhưng không buộc người mới đọc tất cả ngay: file đang sửa nổi bật, contract/test mở theo nhu cầu.

---

## 9. Artifact / project model

Mô hình dữ liệu ở mức sản phẩm (backend giữ file-per-entity như hiện tại):

- **Problem** — một bài OJ: statement, tests, meta, history. *(đã có)*
- **Solution** — code + chuỗi verdict/evidence của user cho một Problem. *(đã có, nằm trong problem folder)*
- **Pathway** — một phép phát triển do AI đề xuất từ Solution AC, có `sourceEvidence/oldAssumption/breakingEvent/newCapability/observableOutcome/editableSymbols` và reference storyboard. Số pathway biến thiên; chỉ hướng được backend gắn trusted scenario/runtime mới buildable. Chọn một pathway ⇒ tạo Project.
- **Project** — đơn vị của Xưởng: `brief/focus`, `domain`, `files/`, `sourceMappings[]`, `scenarios[]`, `growth[]`, `requirements[]`, `tasks[]`, `runs[]`, `evidence/`, `history`. Requirement truth luôn đến từ verifier; Preview/run không tự đổi `met`.
- **DemoRun** — output có timestamp của `demo/main.cpp` chạy cùng source project hiện tại. Demo giúp hiểu sản phẩm, **không phải Evidence**, không tạo AC/pass và không được đánh dấu Requirement `met`.
- **ScenarioSpec** — input + initial state + event sequence + bindings + expected invariants do backend validate. AI có thể đề xuất data, nhưng spec chỉ buildable khi registry gắn được runner/oracle/verifier thật.
- **ObservableModel** — dạng trung gian renderer-neutral sau khi chạy: `entities/relations/events/stateDeltas/metrics/outputs/anchors/controls`. Mọi project hợp lệ phải tạo được ít nhất một observable.
- **PreviewRecipe** — cấu hình canonical `base + overlays + controlPack + layout`; là output của ViewPlanner, không phải field AI tự do và không được lộ tên enum/primitive thô ra UI.
- **TraceEvent / EventAnchor** — liên kết `event → entity/location → before/after → code symbol → replay cursor`; cùng protocol dùng cho message, grid cell, graph edge, timeline interval, sequence index, text range…
- **Evidence** — output có timestamp của một lần chạy verifier thật (judge run, test suite, benchmark, browser check, API call log). UI chỉ được hiển thị trạng thái "đạt" khi trỏ được vào một Evidence. *(mở rộng từ run history hiện tại)*
- **Seed template** — bộ khung project có sẵn (3 module cũ). Chỉ là dữ liệu khởi tạo Project, không có UI riêng.

Quan hệ: `Problem 1—n Solution 1—n Pathway 0..1—1 Project 1—n ScenarioSpec 1—n Run`; mỗi Run sinh `ObservableModel`, `TraceEvent[]`, có thể sinh `Evidence[]` khi chạy Checks. `PreviewRecipe` là projection của ObservableModel, không phải nguồn đúng/sai.

---

## 10. Kế hoạch cứu base hiện tại (repair roadmap)

Thứ tự ưu tiên cứng: **bảo vệ Luyện tập trước, gỡ rác trước, xây mới sau.** Mỗi bước là một PR độc lập, DoD §12 áp dụng từng bước.

### R0 — Cầm máu (không đụng flow OJ) — làm ngay
- Gỡ section "MODULE THUẬT TOÁN" khỏi sidebar Luyện tập (module chuyển về Xưởng/ẩn sau flag tạm).
- Xóa mọi metadata leak: `Runtime proof …`, `Standalone`, `local › applied-algorithms-v1`, chip `≠ GIAO HỮU` và mọi enum backend khác đang lộ (grep có chủ đích toàn frontend).
- Dọn bài rác `zz-gauntlet-reject-test` khỏi workspace + chặn test data lọt production store.
- Đánh dấu deprecated toàn bộ docs định hướng cũ (đã làm cùng README này).

> **Trạng thái 2026-07-20:** R0/R1 đã xong. R2–R4 đã tích hợp API thật; Xưởng chạy **Demo-first v1** trên shell chung: S4 nói rõ ai cần sản phẩm và thuật toán làm gì, project mới có `demo/main.cpp` read-only, S5 đặt **Chạy demo** cạnh Verify và hiển thị milestone tuần tự *Hiểu sản phẩm → Hoàn thiện lõi → Tiến hóa*, S6 phân biệt thẳng với "Bản khó hơn". DemoRun và Evidence là hai luồng tách biệt; requirement/acceptance baseline lấy từ registry của verifier, không lấy lời hứa AI không có test đứng sau. **Audit 2026-07-22:** đây là baseline vận hành cần giữ tương thích, không còn là spec UX cuối; P1 rebuild theo §6.1–§6.5 và §11.1 thay demo stdout/seed nông bằng scenario/preview/mapping/red-before-green.

### R1 — Tái chuẩn hóa toàn bộ công cụ Luyện tập (ưu tiên cao nhất sau R0)
Owner xác nhận: UI/UX của Tạo contest, Debug tốc độ, Stress/Thi đấu và các overlay quanh chúng bị "chế ra" ngoài flow — không dùng được. Sửa theo đúng một nguyên tắc: **mọi hoạt động code là một biến thể của màn hình giải bài (S3), không phải một app con.**
- **Chuẩn tham chiếu = Điền Lõi**: đề/brief TRÁI · code GIỮA-PHẢI · chấm thật · verdict → next action. Từng tool một, đối chiếu và ép về chuẩn này:
  - **Contest**: một contest = một dãy bài, mỗi bài mở ĐÚNG màn hình S3 (statement sheet + editor + Judge chuẩn); phần "contest" chỉ là thanh tiến độ + điều hướng bài mỏng phía trên. Bỏ mọi panel/wizard riêng.
  - **Debug tốc độ (Rush)**: bỏ zone full-viewport tự chế với textarea trần; dùng shell S3 + đồng hồ đếm ngược là một chip trên header. Code trong CodeMirror thật.
  - **Stress / Thi đấu**: giữ engine (đang tốt), gom UI về console phải của S3 thay vì màn riêng.
- Tool nào không map được về nhịp *đề → code → verify → verdict* thì **gỡ khỏi UI** (giữ backend), chờ thiết kế lại — không giữ "cho có".
- Viết lại copy 5 practice card theo card contract §15.4.
- DoD riêng: đi lần lượt 5 tool bằng mắt trên canonical, mỗi tool trả lời được "đây là gì / làm gì / được gì" trong 5 giây.

### R2 — Xưởng v0: module → project workspace thật
- Dựng bề mặt **Xưởng** (route + nav topbar 3 mục theo §8.1).
- Rebuild module workspace theo shell §8.2 (cherry-pick có kiểm chứng từ `agentb/experience-redesign`): statement = project brief (Xây gì / Thiết kế / Cần đạt / Kiểm chứng thế nào), file tree tabs (impl sửa được, tests/header read-only), requirement list i/N có nội dung thật, panel phải = verifier + evidence + history có chi tiết fail. **Xóa hẳn contest panel + nút "Đổi đề" khỏi ngữ cảnh này.**
- Fix bug lens filter (enum canonical `competitive/algorithm-engineering` vs filter `compete/build`) nếu còn trên canonical.

### R3 — "Phát triển lời giải" chạy bằng AI thật
- Entry point trên verdict rail sau AC + trong Xưởng.
- Backend: endpoint nhận (statement, code AC, analysis) → AI trả **số pathway biến thiên** (schema JSON validate, không seed registry hard-code, không quota filler). Chỉ pathway đủ §6.1 và gắn được trusted runtime mới buildable. Application engine của Agent A được refactor về contract này hoặc bỏ.
- Chọn pathway → AI trả semantic proposal/binding; backend gắn trusted arc/ScenarioSpec/file contract/runner-oracle-verifier từ registry → materialize Project vào Xưởng. AI không sinh verifier spec tự do.

### R4 — Project C++ nhiều file + verifier thật
- Compile/run multi-file (mở rộng `runCpp.js`), unit-test runner, benchmark harness, simulation runner (simulate hiện tại của WeightedGraphRouter tổng quát hóa thành verifier loại "simulation").
- Requirement evolve: AI đề xuất requirement mới → activate → project fail → sửa → verify → evidence.

### R5 — Đồng bộ Home & Hồ sơ với IA mới
- Home gọn về "một câu trả lời" (§8.1); gộp các unit trùng vai (Next move / Gợi ý / Plan / Kèo → một khối duy nhất có ưu tiên).

> **Trạng thái 2026-07-18:** R2/R3/R4 **backend xong luôn trong một lượt** (vượt brief ban đầu):
> `backend/src/{applicationProjectStore,applicationAnalysis,applicationSeedRegistry,projectVerifier}.js`
> + `routes/xuong.js`, route cũ `modules.js`/`standaloneModuleStore.js`/`moduleWorkspaceContract.js` đã
> **xóa hẳn** (không phải deprecate — xóa). AI pathway xác nhận thật (2 bài AC khác nhau → 2 bộ pathway
> khác nhau, test tự động chặn fallback tĩnh). Verifier có đủ 4 loại: compile, unit-test, benchmark,
> simulation (multi-file compile qua `runCpp.compileProject`). 4/4 test `xuong-api.test.js` xanh.
> R2/R3 frontend cũng xong (fixture engine, §mục ngay dưới) — tích hợp thật phát hiện lệch envelope
> giữa 2 bên (đã sửa trong `docs/XUONG-API-CONTRACT.md`, xem bảng route ở đó). R5 (Home) coi như xong
> từ R1.
>
> **TÍCH HỢP THẬT ĐÃ KHÉP (2026-07-18, cùng ngày):** backend bọc lại 4 route lệch envelope; E2E thật
> trên :5099 không fixture đi trọn vòng: AI sinh 5 pathway thật từ bài BFS → project materialize →
> Verify AC (g++, 3 evidence pass) → Tiến hóa (AI sinh yêu cầu mới, yêu cầu cũ chuyển "Đạt") → Verify
> WA với evidence đọc được ("allow-diagonal: expected 1, got 2") → sửa impl → AC 4/4. `backendOr` giờ
> chỉ fallback fixture khi route 404; lỗi thật hiện thật. Bonus cùng lượt: dọn `zz-*` khỏi
> `data/arena-boss-cases.json` + Hồ sơ "Bộ nhớ lỗi" hết leak hash («Sai kết quả #5fec» → tên bài thật
> + test nhỏ nhất). **Việc còn lại trước fullstack: P1 hardening (mục 11) — backend agent đang làm.**

Sau khi khép R2–R4 (tích hợp thật, hết fixture) mới bắt đầu roadmap fullstack (§11). **Không feature lớn nào ngoài danh sách này trước khi owner duyệt.**

---

## 11. Roadmap C++ → fullstack theo vertical slices

Nguyên tắc: mỗi phase ship **một vertical slice user dùng được trọn vẹn**, không ship "nền tảng chờ tương lai". Domain mới = **adapter mới** trên cùng shell + artifact model, không phải app mới.

| Phase | Slice user cầm được | Nội dung chính |
|---|---|---|
| **P0 = R0–R5** | "Giải BFS xong, bấm một nút, AI cho tôi một số hướng đủ chất lượng, tôi build một project C++ nhiều file và thấy verifier thật. Và mọi công cụ Luyện tập đều dùng được, cùng một nhịp." | Repair roadmap §10 |
| **P1 — Applied C++ trưởng thành + Preview Engine** | User xem Mẫu hành vi, thấy code AC được map vào component, sửa một symbol rồi quan sát Bản của em thay đổi; lỗi neo vào event/entity và replay được; Checks/Evidence kiểm nhiều vòng requirement thật. | schema §6/§9, trusted scenario runtime, ObservableModel, Preview Surface/recipe, red-before-green evolve, 5 project kiểm chứng nhiều family |
| **P2 — Frontend adapter (slice web đầu tiên)** | User build một trang web nhỏ (HTML/CSS/JS) **trong app**, thấy browser preview, console, verifier DOM/interaction chạy thật. Pathway từ C++ cũng gợi được hướng web (vd BFS → visualizer tương tác). | editor web + preview pane + verifier browser |
| **P3 — Backend adapter** | User build một API service nhỏ (Node hoặc C++ HTTP) trong app, gọi bằng API client tích hợp, xem logs, pass integration tests. | request runner, service run/stop, verifier API |
| **P4 — UI/UX adapter** | Trước khi code slice, user làm brief → journey → wireframe trên design canvas; output là component spec đổ thẳng vào project frontend. | canvas nhẹ, journey/IA tools, usability checklist |
| **P5 — Database + Python adapter** | Slice có dữ liệu thật: schema + migration + query; Python script xử lý data/automation chạy trong app với evaluation. | SQLite-first, python runner + env |
| **P6 — Fullstack slice hoàn chỉnh** | Một product brief → UI/UX → FE → BE → DB → (Python) → E2E xanh → chạy preview/staging thật → AI đề xuất iteration. | project topology view, E2E runner, observability panel |

Mỗi phase: AI tham gia phân tích/pathway/copy ngay từ đầu, nhưng adapter/registry cung cấp contract/runtime/verifier đáng tin (không chờ "làm tay trước, AI sau" và cũng không giao quyền đúng-sai cho AI).

### 11.1. P1 Xưởng rebuild — hai agent làm song song

**Luật chia ownership:** Agent A chỉ sửa `frontend/**`; Agent B chỉ sửa `backend/**`. Root/coordinator là người duy nhất hợp nhất `README.md`, `docs/HANDOVER.md` và sửa `docs/XUONG-API-CONTRACT.md` sau khi hai bên chốt shape. Không agent nào tự đổi envelope/enum chung rồi bắt bên kia chạy theo.

| Agent A — Frontend/UX | Agent B — Backend/AI/runtime |
|---|---|
| A0. Khóa fixture exact theo contract; test model/adapter trước UI. | B0. Sửa prompt/schema: VN tự nhiên; pathway biến thiên; bắt buộc sourceEvidence/oldAssumption/breakingEvent/newCapability/observableOutcome/editableSymbols; AI không sinh verifier. |
| A1. Dựng một `PreviewSurface` + recipe interpreter + Universal Inspector; mọi raw enum qua label/view-model. | B1. Dựng/chuẩn hóa ScenarioSpec, ObservableModel, PreviewRecipe, TraceEvent/EventAnchor; contract tests cho envelope đầy đủ. |
| A2. S4 decision sheet: danh sách hướng gọn, một Mẫu hành vi reference, một CTA; không card gallery/quota. | B2. Scenario Registry + trusted development arcs/primitive bindings; runner/oracle/verifier/red-before-green; demo/reference tách user run. |
| A3. S5 workbench: focus rail gọn · CodeMirror + mapping ribbon · Preview mặc định · Checks/Logs phụ · build output compile-only. | B3. ViewPlanner + compatibility matrix + canonicalization; AI semantic proposal, backend chỉ eligibility/validation cơ học; cache và không gọi AI lúc Run/Replay/Checks. |
| A4. Implement vertical slice Universal Inspector + grid; error anchor/jump-to-symbol/replay; sau checkpoint mới mở graph, sequence/table, chart/table, text/state-machine. | B4. Implement vertical slice BFS→MazeNavigator chạy thật; sau checkpoint thêm RouteWatch, MergeForge, ShardBalancer, LogMatcher bằng cùng contract. |
| A5. Responsive 1280×800, reduced-motion, virtualization/lazy-load, zero metadata leak; canonical walkthrough/screenshots. | B5. Trace delta/cap event, timeout/resource guard, direct `node --test` isolation, Evidence.detail đọc được; API/canonical logs. |

**C0 đã đóng băng tài liệu/fixture ngày 2026-07-23; hai agent đã làm song song từ C1:**

1. **C0 — Contract freeze (DONE 2026-07-23):** `docs/XUONG-API-CONTRACT.md` khóa exact envelopes, route `/run` + `/replay`, validator/canonicalization và fixture chung `docs/fixtures/xuong-contract-v2.json`; `/demo` v1 giữ đúng semantics trong transition. Cả A/B phải ký bằng contract tests trước UI/runtime feature.
2. **C1 — Parallel foundation (DONE 2026-07-23):** frontend có adapter/envelope/recipe projections; backend có schema/runtime validation, prompt không quota; không integration bằng lời hứa.
3. **C2 — First live slice (DONE 2026-07-23):** BFS→MazeNavigator chạy thật; reference ≠ user run; grid anchor → symbol → replay; build hiện tại chạy OK và preview hiển thị output của source.
4. **C3 — Composition proof (DONE qua test/runtime 2026-07-23):** cùng PreviewSurface/Universal Inspector phủ RouteWatch (graph), MergeForge (sequence/heap), ShardBalancer (table/chart), LogMatcher (text/state); không cần mở renderer riêng.
5. **C4 — Canonical acceptance (DONE 2026-07-23; corrective pass):** project owner cũ được migrate cộng thêm TODO mà không ghi đè source; app dev `:5099` dùng workspace thật đã đi S6→S5→Chạy build→Preview đỏ→anchor→đúng vùng CodeMirror→Replay→Checks/Evidence. `Bản của em` và `Mẫu hành vi` tách provenance; browser console 0 warning/error; backend 735/735, frontend 198/198. Electron/canonical `:5050` phải restart để nạp backend module mới trước lần demo tiếp theo.

**Conflict protocol:** nếu Agent A cần thêm field, ghi request với UI behavior + fixture mong muốn; Agent B trả shape + validator/test. Nếu Agent B cần đổi field, cung cấp migration/compat window và fixture mới trước. Không ai sửa thư mục bên kia để “cho nhanh”.

---

## 12. Definition of Done cho mỗi phase

Một phase/PR chỉ được coi là DONE khi **tất cả** các điều sau đúng:

1. **Canonical walkthrough**: đi hết flow trên app canonical user mở thật (`:5050`, sau restart server) bằng mắt + screenshot, không phải chỉ dev port hay branch riêng. Báo cáo phải kèm screenshot/evidence của walkthrough này.
2. **First-user test**: một người chưa đọc docs nhìn màn hình phải trả lời được 3 câu: *Đây là gì? Tôi phải làm gì tiếp? Làm xong tôi được gì?* — nếu phải giải thích miệng là fail.
3. **Zero metadata leak**: không enum backend, path, port, commit hash, tên branch nào xuất hiện trong UI.
4. **Luyện tập regression checklist pass** (chạy tay, ~5 phút): mở bài cũ → sửa code → Run stdin → Judge AC → Judge WA thấy diff → Coach trả lời → import 1 đề mới → tạo test → sidebar filter/search đúng → reload giữ trạng thái.
5. **Verifier-backed**: mọi trạng thái "đạt/xong" mới trong UI trace về Evidence thật.
6. **Tests**: `npm test` không tăng số fail so với baseline đã ghi nhận (~700 pass; các fail pre-existing được liệt kê trong PR).
7. **Docs**: chỉ cập nhật file này (mục Current reality / roadmap), không sinh doc định hướng mới.
8. **Direct backend test safety**: mọi file test backend mới/chạm tới phải chạy an toàn khi gọi trực tiếp `node --test file.js`; không phá `NODE_TEST_CONTEXT`, không ghi data vào workspace owner.
9. **Xưởng source-of-truth**: Run/Replay không gọi AI và không tạo Evidence; build/behavior/requirement truth không trùng; requirement/evolve mới phải red-before-green với verifier riêng.
10. **Parallel contract proof**: frontend fixtures và backend golden payload cùng pass exact envelope; integration không dùng fixture để che 4xx/5xx thật.

---

## 13. Non-goals & nguyên tắc chống feature island

**Non-goals (hiện tại và trung hạn):**
- Không cloud, không account, không telemetry — local-first là bản sắc.
- Không thêm currency/economy/gamification mới (reward layer hiện tại đông lạnh).
- Không multi-language judge cho *competitive* (g++ là đủ); ngôn ngữ khác chỉ vào qua **project adapters**.
- Không chatbot AI trang trí (AI không gắn vào đâu đó "cho có"); không AI tự chấm hoàn thành.
- Không framework frontend / build step cho app (vanilla ESM giữ nguyên).
- Không README/roadmap/spec mới ngoài file này.

**Nguyên tắc chống feature island** (điều kiện để một feature mới được tồn tại):
1. Nằm đúng một trong 4 bề mặt (Hôm nay / Luyện tập / Xưởng / Hồ sơ) và trả lời một job §2 cụ thể.
2. Có **đường vào tự nhiên** từ flow đang có (không chỉ một nút trong menu ⋯) và **đường ra** rõ (làm xong user về đâu).
3. Dùng chung artifact model §9 và evidence pipeline — không tự chế store/trạng thái "đạt" riêng.
4. Dùng shell + design tokens chung §15 — không tự chế visual language riêng.
5. Nếu là biến thể của việc đã có (thêm một kiểu luyện, thêm một verifier) → mở rộng surface hiện có, không mở màn hình mới.
6. Trước khi build: nói được nó **thay thế/gộp** cái gì. App đang thừa bề mặt, không thiếu.

---

## 14. Màn hình chính & user journeys

### 14.1. Các màn hình

**S1 — Hôm nay (Home).** Một continue card lớn (bài/project đang dở + verdict gần nhất) + một next-move duy nhất do AI/planner chọn + ô search. Stats strip mỏng. *Transition:* click continue → S3 hoặc S5 đúng trạng thái cũ; next-move → surface tương ứng.

**S2 — Luyện tập / danh sách.** Sidebar bài (search, filter nguồn/trạng thái/độ khó/topic), nút + Bài mới (import pipeline), lối vào công cụ luyện (Điền Lõi, Debug tốc độ, Contest, Stress, Ôn tập). **Không có module/project ở đây.** *Transition:* chọn bài → S3.

**S3 — Bài đang giải (Competitive C++ workspace).** Giữ nguyên UI hiện tại: statement sheet / editor CM6 / console Run-Tests-Coach…, 3 layout modes. Sau verdict: verdict rail đề xuất bước tiếp (WA → Pháp y/Coach; AC → Game Review/Lời giải chuẩn/**Phát triển lời giải**). *Transition:* "Phát triển lời giải" → S4 (overlay chọn pathway) → S5.

**S4 — Chọn pathway (decision sheet).** AI hiện **số hướng biến thiên đã qua quality gate** trong một rail gọn. Một hướng được chọn chiếm phần chính: `đang có → giả định bị phá → capability sẽ build`, mapping code nguồn và một **Mẫu hành vi** storyboard inert có nhãn “không chạy code của em”. Đúng một CTA `Build hướng này`; không gallery card, không CTA lặp, không pass/fail/Play. Chọn → backend materialize trusted project/scenario → S5. *Không phải màn hình thường trực — là một bước chuyển.*

**S5 — Project workspace (Xưởng).** Shell §8.2: trái = focus rail bốn ý **Outcome / Input / Change / Done-when**; giữa = CodeMirror + mapping ribbon, file active nổi bật; phải = **Preview Bản của em** với scenario controls, event/entity anchor, jump-to-symbol và replay. Checks/Logs là tab phụ luôn mở được; build output drawer chỉ báo compile/runtime. Growth spine mỏng `đã có → đang build → có thể mở rộng`. *Transition:* chạy build → quan sát → sửa/replay; Checks → Evidence; requirement mới chỉ active sau red-before-green.

**S6 — Xưởng / danh sách project.** Nói rõ ranh giới: **Bản khó hơn = đề stdin/stdout mới; Xưởng = chạy sản phẩm trước, hiểu ứng dụng, rồi thực hành/Verify/tiến hóa**. Grid project hiển thị demo đã xem chưa, requirement/evidence gần nhất và một next action. *Transition:* chọn project → S5.

**S7 — Hồ sơ.** Kỹ năng, nhịp luyện, xếp hạng, sổ lỗi, thành tích — chỉ đọc, không chen vào flow làm việc.

### 14.2. Ba journey chuẩn (để test theo)

- **Journey A (J1, phải luôn sống):** mở app → continue card → S3 → sửa code → Judge → AC trong ≤ 4 click từ lúc mở app.
- **Journey B (J3, mới):** S3 AC → "Phát triển lời giải" → S4 chọn một hướng có breaking event thật → xem Mẫu hành vi + mapping → S5 sửa một symbol → Chạy build → Preview chỉ đúng event/entity sai → Đi tới hàm → sửa → Replay → Checks sinh Evidence → requirement tiếp theo đỏ thật rồi mới active.
- **Journey C (J4, từ P2):** S6 → new project frontend → viết page → browser preview trong app → verifier interaction pass → E2E slice.

---

## 15. Design rules thống nhất (frontend / UI-UX) — LUẬT CỨNG

Các rule/doc thẩm mỹ cũ đã **xóa**. Đây là bộ luật duy nhất. Nó là **luật, không phải gợi ý**: AI agent nào ship UI vi phạm bất kỳ mục 15.2/15.3 nào là **fail review tự động**, dù tests xanh, dù "đẹp theo ý nó". Lý do tồn tại: các agent trước liên tục "chế" UI theo gu riêng thay vì theo flow app — bộ luật này chặn đúng hành vi đó.

### 15.1. Nguồn chân lý thị giác (visual ground truth)

Hai màn hình chuẩn, mọi UI mới phải đặt cạnh chúng mà **không phân biệt được ai làm**:

- **Màn hình giải bài (S3)** — workbench graphite tối nhiều lớp, accent neon-ink, verdict colors, 3 cột statement/editor/console. Đây là *nền phát triển* của toàn app.
- **Điền Lõi** — cách đúng để làm một "tool luyện": mượn nguyên shell S3, chỉ thay nội dung.

Khi phân vân bất kỳ quyết định thị giác nào → mở 2 màn hình này và làm giống chúng. **Không được sáng tạo visual language mới.** Cái cần sáng tạo là *nội dung và flow*, không phải skin.

### 15.2. Luật cứng — cấm tuyệt đối (vi phạm = fail review)

- ❌ **Cấm tạo zone/màn hình full-viewport tự chế** với layout riêng (kiểu Bug Rush cũ). Mọi hoạt động code diễn ra trong shell S3 hoặc shell project §8.2.
- ❌ **Cấm mượn panel của ngữ cảnh khác** rồi đổi chữ (contest panel gắn vào module là án điểm).
- ❌ **Cấm enum/metadata backend trong UI**: path, port, commit, branch, tên internal (`Standalone`, `applied-algorithms-v1`, `GIAO HỮU`…). Mọi enum phải qua VN label map.
- ❌ **Cấm textarea trần cho code** — code luôn nằm trong CodeMirror thật.
- ❌ **Cấm thêm hệ màu trạng thái mới** — chỉ verdict colors: xanh = AC/pass, đỏ = WA/fail, vàng = đang chạy/cần chú ý.
- ❌ **Cấm trạng thái "đạt/xong" không có Evidence** click xem được.
- ❌ **Cấm emoji làm icon hệ thống** cho surface mới; cấm gradient-text; cấm infinite animation.
- ❌ **Cấm thêm màn hình/panel mới mà không chỉ ra nó gộp/thay cái gì** (chống dilution — app thừa bề mặt, không thiếu).
- ❌ **Cấm màu/space/type ngoài token** — mọi giá trị qua `tokens.css` (load cuối cùng).

### 15.3. Luật flow — một nhịp thao tác duy nhất

Mọi hoạt động code giữ cùng hierarchy **brief → code → output quan sát được → bằng chứng → next action**. Hai nhịp hợp lệ, không trộn:

```
Luyện tập: Đề → Code → Run/Judge → Verdict + Evidence → một next-action
Xưởng: Brief → Code → Chạy build/Preview → Diagnose/Replay → Checks/Evidence → một next-action
```

- Biến thể chỉ được **thêm chip/thanh mỏng** vào shell (đồng hồ Rush = chip trên header; tiến độ contest = thanh mỏng trên statement), **không được đổi cấu trúc shell**.
- Feature nào không map được vào một trong hai nhịp này → không ship; nếu đang tồn tại → gỡ khỏi UI (giữ backend) chờ thiết kế lại. Không lấy nhịp Judge của Luyện tập áp lên Xưởng hoặc lấy Preview chen vào OJ.
- Mỗi state màn hình đúng **một primary CTA**; CTA là hành động cụ thể có đối tượng ("Chạy build", "Sửa BFS cho phép đi chéo →"), không phải khẩu hiệu ("Làm cho đạt →"). Ở Xưởng, `Chạy build` là primary của khám phá; Checks luôn dùng được nhưng là secondary.

### 15.4. Card contract — 4 câu bắt buộc

Mọi card (Home, practice, project, pathway) phải để user đọc trong 5 giây trả lời được:
**Đây là gì → Tôi làm gì → Tôi được gì → Bằng chứng/trạng thái hiện tại là gì.**
Card chỉ có label + meta kỹ thuật ("CodeMirror · chấm test · phản hồi tức thì") là sai. Copy tiếng Việt giọng HLV — nói việc và kết quả; thuật ngữ kỹ thuật giữ English.

### 15.5. Checklist bắt buộc trước khi ship UI (AI agent dán vào báo cáo, tự trả lời từng dòng)

1. Đặt screenshot cạnh S3 + Điền Lõi — có lệch visual language không?
2. Một user mới nhìn 5 giây có biết *đây là gì / làm gì / được gì* không?
3. Có dòng chữ nào là enum/metadata backend không? (grep cả code lẫn screenshot)
4. Mọi trạng thái "đạt" có Evidence thật phía sau không?
5. Nhịp thao tác có đúng §15.3 không? Primary CTA là gì, có đúng một cái không?
6. Nó gộp/thay cái gì? Nếu câu trả lời là "không gộp gì, thêm mới hoàn toàn" — dừng lại, hỏi owner.
7. Đã đi flow bằng mắt trên **canonical** (:5050 sau restart) chưa? Screenshot đâu?
8. Regression checklist Luyện tập (§12.4) còn pass không?
9. Responsive 1280×800 sống không? Reduced-motion ổn không?

### 15.6. Luật cứng riêng cho Xưởng / Preview Surface

- **Concept PNG không phải specification hay bằng chứng DONE.** Các ảnh `docs/media/xuong-*.png` chỉ lưu quá trình tranh luận. Một số ảnh còn lộ `BASE/OVERLAY`, raw event như `LINK_DOWN/WALL_DISCOVERED`, lặp Checks và ghi “đang chạy” trên state tĩnh; implementation phải sửa các lỗi này, không pixel-copy.
- **Một hành động — một lối vào.** `Chạy build`, `Checks`, `Logs`, `Replay` không được lặp ở header và panel/tab cùng lúc. Primary CTA thay theo state nhưng mỗi state chỉ có đúng một.
- **State label phải trung thực theo process.** Chỉ hiện “ĐANG CHẠY” khi process active; idle hiện “Chưa chạy” hoặc “Lần chạy gần nhất …”; reference không giả làm runtime.
- **Provenance phải phân biệt cả hành vi, không chỉ màu/badge.** Reference là storyboard inert; user runtime mới có Run/Step/Replay/diagnostic. Thiết kế vẫn phân biệt được khi tắt màu.
- **Editor là vùng chính.** Focus rail tối đa Outcome/Input/Change/Done; mapping ribbon thu gọn được; `.hpp`, test, harness progressive disclosure, không ném toàn bộ cấu trúc vào người mới.
- **Bắt buộc có cầu nối từ `main()` sang component.** Với user mới chỉ quen `#include <bits/stdc++.h>`, `using namespace std` và một `main()`, scaffold phải nói `main()` đang nằm ở file nào, đưa lời gọi C++ tối thiểu, giải thích vai trò `.hpp/.cpp/test`, comment phân vùng code cũ/phần nền/VIỆC CỦA EM, và chỉ ra đúng TODO. Không được coi việc tách file tự nó là bài học.
- **Một build chỉ foreground một hàm có trách nhiệm rõ.** Signature phải có tên tham số; body chừa dòng giữa các bước `đầu vào/biên → xử lý/helper → giá trị trả`; comment nói chính xác user viết ở đâu và tự kiểm bằng hành vi nào trong Preview. Không ép mọi helper thành `void`: dùng kiểu trả về đúng nghĩa (`int`, `bool`, `size_t`, object...) và chỉ tách helper khi nó giảm tải nhận thức.
- **Error anchor giải được chuỗi** `event → entity/location → actual/expected → source symbol/span → replay point`. Raw enum/ID không xuất hiện; backend/frontend adapter phải cung cấp copy VN theo ngữ cảnh.
- **Universal Inspector là fallback thật, không là project hạng thấp.** Input/output + primary state + event strip + changed fields + metric + anchor sống trong cùng Preview Surface; không lộ tên tier.
- **Recipe là dữ liệu có kiểu, không là UI copy.** Frontend validate đúng 1 base, tối đa 2 overlay chính, layout/control hợp lệ; unknown enum không render thô mà dùng fallback VN an toàn + diagnostic dev.
- **Một nguồn đúng-sai:** compile/runtime → Build output; behavior scenario hiện tại → Preview; requirement → Checks/Evidence; growth → Evidence tương ứng. Không lặp verdict ở header/preview/build bar.
- **Độ phủ renderer không đồng nghĩa Preview đạt chất lượng.** Base/overlay/recipe chỉ là grammar hiển thị. Mỗi project muốn public phải có dữ liệu tình huống cụ thể, before/after nhìn được, output/metric có nghĩa, trace dẫn tới source và browser screenshot red/green. C6 adapter hoặc một tổ hợp canonicalize được chưa đủ điều kiện gọi là project hoàn thiện.
- **Không quảng bá “hơn 1.000 Preview đã hoàn thiện”.** Không gian recipe chỉ là capacity có thể canonicalize. Chất lượng được đếm theo project authored đã qua đủ scenario có nghĩa, scaffold học được, runner/oracle, anchor/replay, red/green và browser audit; adapter kỹ thuật chưa đạt các cửa này phải ở catalog ẩn.
- **Ba con số phải luôn nói tách nhau** (đo tự động bởi `backend/src/xuongPreviewCatalog.js` + hai suite catalog; xem HANDOVER §4 đợt 2 để biết giá trị hiện tại):
  1. **Capacity của grammar** — mọi recipe hợp lệ về mặt hợp đồng. Chỉ là số học của bảng compatibility.
  2. **Tổ hợp đã catalog** — recipe có ObservableModel thật đỡ *từng overlay* (cổng `EVIDENCE`) và đã được renderer thật vẽ ra khác biệt, không rơi về Inspector. Số này chỉ được tăng bằng thiết kế mới, không bằng cách nới luật; siết luật làm nó tụt là đúng.
  3. **Thiết kế authored** — project có brief, cầu nối C++, scenario có nghĩa, runner/oracle trusted, red→green bằng compiler và đã mở bằng mắt trên app thật. Đây là con số duy nhất được gọi là “Preview hoàn thiện”.

### 15.7. Checklist nghiệm thu riêng cho Xưởng

1. Chụp S4 reference và S5 user runtime của cùng pathway; một người mới có nhầm hai provenance không?
2. Mapping từ lời giải AC tới target symbol có click/highlight được sau khi source đã đổi dòng không?
3. Có ít nhất một E2E non-list (grid/graph) chạy `anchor → đi tới hàm → replay` bằng data backend thật không?
4. Có một project dùng Universal Inspector mà vẫn debug được, không hiện “thiếu preview” không?
5. Tắt màu: hierarchy, selected state, reference/user, error anchor vẫn hiểu được không?
6. Grep code + đọc screenshot: còn `seedId`, runner/oracle/recipe ID, `BASE`, `OVERLAY`, raw event, path/port/branch không?
7. Có action nào lặp hai nơi hoặc status nào mô tả process không đúng thời điểm không?
8. Checks có chạy độc lập; Run/Replay có tuyệt đối không tạo Evidence hoặc đổi Requirement `met` không?
9. 1920×1080 và 1280×800 sống; keyboard-only, focus visible, reduced-motion, event dài được virtualize/cap không?

---

## 16. Cài đặt & chạy

Yêu cầu: **Node ≥ 18** và **g++** (Windows: MinGW-w64/MSYS2; macOS: `xcode-select --install`; Linux: `apt install g++`). Tùy chọn: Python + Tesseract (OCR ảnh đề), MarkItDown (PDF/DOCX), API key OpenAI-compatible (mọi tính năng AI — nhập ở Settings → AI, lưu local trong `data/ai-settings.json`, gitignored).

```bash
git clone https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2.git
cd usaco-ide-2
npm run setup   # lần đầu
npm start       # mở http://127.0.0.1:5050
```

Windows: double-click `launcher/start-usaco-ide.bat`. macOS/Linux: `bash launcher/start-usaco-ide.sh`. Desktop (Electron, experimental): xem `desktop/`. Lần chạy đầu app seed một bài mẫu để test Run/Judge ngay.

**Gotcha vận hành quan trọng:** server `:5050` phải **restart** mới nhận code backend mới; frontend sửa file phải **bump query `?v=`** trong `index.html` mới hết cache. Tests: `npm test` (từ root). App bind `127.0.0.1` và chặn Host lạ — **không bao giờ expose ra internet** (nó compile & chạy C++ tùy ý).

---

## 17. Cấu trúc repo & tài liệu

```
usaco-ide-2/
  backend/           # Express + g++ judge + AI layer + stores (file-per-entity)
    src/routes/      # problems, judge, ai, contests, modules, arena-*, …
  frontend/          # vanilla ES modules, không build step
    src/features/    # ~37 feature modules (journey, corefill, rush, derived-module, …)
    styles/          # cascade nhiều layer; tokens.css load CUỐI
  workspace/         # bài + contests + history của user (gitignored)
  data/              # settings + AI key (gitignored; *.example committed)
  launcher/ desktop/ # start scripts + Electron wrapper
  docs/              # HƯỚNG DẪN KỸ THUẬT còn hiệu lực: GettingStarted, LocalJudge,
                     # AIConfiguration, ProblemImport, TestGeneration, Shortcuts,
                     # Troubleshooting + API contracts (APPLIED-ALGORITHMS-V1-API,
                     # VERIFIED-ARTIFACT-API — mô tả code hiện có, không phải định hướng)
```

**Tài liệu định hướng cũ đã XÓA (2026-07-17, git history còn giữ):** `PRODUCT.md`, `ROADMAP.md`, `ROADMAP-VERIFIED-ARTIFACT-LOOP.md`, `README-AUTOPILOT.md`, `README-CPLUSPLUS-PLAN.md`, `README-LOOPS.md`, `README-VERIFIED-ARTIFACT-LOOP.md`, `README_FABEL_EVOLUTION.md`, `docs/WORKSPACE-ARCHITECTURE.md`, `docs/DESIGN-SYSTEM.md`, `docs/FEATURE-RULES.md`, `docs/INTEGRATION-GAPS-AGENT-B.md`, `docs/TRUST-ARCHITECTURE-AUDIT.md`. Không tái tạo chúng; định hướng chỉ sống trong file này. Hai dòng gitignore 48–49 (PRODUCT.md, README_FABEL_EVOLUTION.md) có thể dọn khi tiện.

Branch đang chờ quyết định (không branch nào là canonical ngoài cái đang checkout): `codex/algorithm-application-engine` (Agent A — application engine, cần refactor theo §6/§9 trước khi merge), `agentb/experience-redesign` (Agent B — nguồn cherry-pick cho R2).

## License

[MIT](LICENSE) © 2026 Ho Thien Phuc
