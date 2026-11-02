# Kế hoạch làm trực tiếp để mở public beta

> Dùng khi có máy tính, môi trường/chủ tài khoản và khả năng xem app, cấu hình, kiểm chứng hoặc vận hành thật. File đồng hành: [WORK_DIEN_THOAI.md](WORK_DIEN_THOAI.md). Làm từng mục theo thứ tự và điều kiện, không triển khai tất cả chỉ vì file này tồn tại.

## Kết luận và phạm vi beta — cập nhật 29/10/2026

**Chưa mở public submission hoặc AI bằng server hiện tại.** Bản code khảo sát là IDE local: `/api/problems/:id/workspace` trả code, notes và tests; API settings cho thay `baseUrl` AI; `runCpp.js` chạy tiến trình với quyền backend. Output cap, Host loopback và data root riêng có ích cho local nhưng không tạo phân quyền nhiều user hay sandbox cho Internet. Đây là kết luận từ code, không phải kết quả pentest.

Beta đề xuất chỉ có: **(1)** catalog các bài đã review → statement/sample → C++ → Run sample/custom → Submit hidden suite → verdict + lịch sử riêng; **(2)** user có quyền dùng nội dung nguồn → AI tạo **draft riêng** → xem/sửa, biết chưa kiểm chứng → nếu muốn đưa vào catalog thì người được phân quyền kiểm duyệt và chuẩn bị bộ chấm độc lập. Bài AI cá nhân có thể cho chạy thử sample trong runner an toàn, nhưng kết quả đó phải được gọi đúng là chạy thử; không hứa AC chính thức chỉ từ sample. Nguồn lớn được hỗ trợ từng nguồn sau khi xác minh quyền, API và hành vi thực tế; nhập link không đồng nghĩa đã fetch/copy/được phép đăng lại.

Không đưa Xưởng/Arena, rating, thi đấu, social, nhiều ngôn ngữ hoặc scale kiểu LeetCode vào điều kiện beta. Giữ chúng trong sản phẩm local và xem lại sau khi có feedback. Mục tiêu thực tế là người mới hoàn thành một vòng giải bài và một vòng tạo draft có thể hiểu được.

### Điều đã kiểm tra và chưa kiểm tra

- Ngày 29/10, GitHub: `main` 216e38d; PR #2 draft `962f209` vào main; PR #3 `d8d6d2f` và PR #4 `a5ca374` cùng nhắm integration; PR #17 W0 draft `cb391716` nhắm PR #3. PR #4 chưa nằm trong PR #17. Trước mọi thay đổi phải kiểm tra lại refs và base, không suy ra nhánh mới nhất theo ngày tạo.
- Work báo PR #17 có 62 targeted checks đạt và static CI đạt; chưa có browser/HTTP E2E, toàn bộ Judge suite hay compiler containment trên head đó. Báo cáo PR là bằng chứng Work cung cấp; chưa thay thế review độc lập.
- Ngày 29/10, Codex mở head #17 từ bản `git archive` vào `/tmp/usaco-plan-wm8gA3Bu/app`, dùng Node 24.22.1, `USER_DATA_ROOT` mới, loopback và Companion tắt. Browser mở bài mẫu, xem statement ở desktop và 390×844. Trên desktop tiêu đề lặp và toán hiện literal `$a$`/`\\le`; tại 390×844, panel Run ép vùng đề còn rất hẹp. Có thể tái hiện trong trạng thái được mô tả; chưa kiểm tra mọi viewport hay thiết bị thật. Ảnh đã xem trong lượt browser, chưa lưu thành tệp evidence.
- Lượt 28/10 ở snapshot `a98090c` từng thử AC → sửa → stale → WA và AI mock, tìm thấy lỗi provenance/receipt, filter và retry dịch UI. Đó là bằng chứng lịch sử cho snapshot đó; cần tái hiện trên base mới trước khi sửa. Lượt 29/10 **không chạy submit/compiler suite, provider thật, AI generation E2E, tải đồng thời hay security test**. Màn DMOJ public gặp security verification; phần so sánh DMOJ dựa trên repo/docs, không vượt qua challenge.
- Dữ liệu kiểm tra trong `/tmp/usaco-plan-wm8gA3Bu/user-data` là tổng hợp, không đưa vào Git. Runtime `node` đã kết thúc; không có bằng chứng từ lượt này rằng môi trường host là sandbox để chạy code không tin cậy.

**Đường code để bắt đầu kiểm tra:** danh sách `frontend/src/problems.js` → `backend/src/routes/catalog.js`/`problems.js`; đề/editor `frontend/src/statement.js`, `editor.js` và `i18n.js` → `routes/files.js`/`problemStore.js`; Submit `frontend/src/api.js` → `routes/judge.js` → `judgeService.js`/`runCpp.js` → `evidenceStore.js`; biến thể AI `frontend/src/features/synthesizer.js` → `routes/ai.js` và `routes/problems.js` → `oracleTrust.js`/`verifyTests.js`. Đối chiếu `judgeState.js`, `truthModel.js` và `docs/security/truth-core.md` trước thay đổi verdict hay trust.

### Tham khảo sản phẩm và mã nguồn mở

| Nguồn | Mẫu hữu ích | Quyết định cho beta và giới hạn |
| --- | --- | --- |
| [LeetCode: luyện bài](https://support.leetcode.com/hc/en-us/articles/360012016874-Start-your-Coding-Practice), [filter list](https://support.leetcode.com/hc/en-us/articles/360013577094-How-to-use-My-List) | Đọc đề + editor + lịch sử submission; lọc theo độ khó/trạng thái/tag | Ưu tiên vòng tìm → giải → kết quả; không dựng rating/acceptance rate giả khi chưa có dữ liệu |
| [DMOJ online-judge](https://github.com/DMOJ/online-judge), [settings](https://github.com/DMOJ/online-judge/blob/master/dmoj/settings.py) | Statement Markdown/toán, submission live, quyền và giới hạn queue | Học contract và UX; DMOJ là AGPL-3.0, phải xem giấy phép trước khi tái dùng code |
| [USACO Guide IDE](https://github.com/cpinitiative/ide) | IDE cho competitive programming, hỗ trợ mobile và CodeMirror 6 trên mobile | Tham khảo phân chia trải nghiệm; không bắt buộc đổi stack hiện tại. Repo dùng MPL-2.0, xem license nếu lấy code |
| [Polygon](https://polygon.codeforces.com/) và [DOMjudge problem format](https://github.com/DOMjudge/domjudge/blob/main/doc/manual/problem-format.rst) | Đề, generator, correct/wrong solutions, judging và validation; problem package | AI tạo draft; bài chính thức cần reference, test biên và lời giải sai điển hình để kiểm tra bộ test |
| [Judge0](https://github.com/judge0/judge0), [isolate](https://github.com/ioi/isolate), [DOMjudge](https://github.com/DOMjudge/domjudge) | Runner tách biệt, giới hạn tài nguyên và sandbox | **Ứng viên đánh giá**, không mặc định an toàn hoặc rẻ cho cấu hình này. Judge0 GPL-3.0, DOMjudge GPL-2.0-or-later; xem license, dịch vụ, vận hành và test trước khi chọn |
| [Hydro](https://github.com/hydro-dev/Hydro) | OJ đầy đủ, nguồn ngoài/virtual judge | Tham khảo tổ chức; Hydro có AGPL-3.0 và điều khoản bổ sung theo repo. Không xem hỗ trợ nguồn là quyền sao chép nội dung |

Ví dụ [Codeforces mô tả điều kiện công bố problem materials](https://codeforces.com/blog/entry/967): có yêu cầu ghi nguồn/link và giới hạn riêng cho một số materials. Đó là ví dụ để bắt đầu kiểm tra, không phải kết luận rằng mọi bài, test, biến thể AI hay provider đều được phép dùng. Kiểm tra license hiện hành cho từng nguồn và hành động.

### Các phase cố định và điểm giao giữa điện thoại/máy tính

| Phase | Việc chính và người thực hiện | Đầu ra và điều kiện qua phase | Ước lượng công chủ động* |
| --- | --- | --- | --- |
| **P0 — baseline & PR** | Codex trực tiếp: kiểm tra #2/#3/#4/#17, review W0 và test còn thiếu; Work sửa finding nếu được giao | Xác định base, diff, checks, thứ tự tích hợp, không còn finding chặn W0; gate thiếu được ghi rõ | 4–8 giờ |
| **P1 — độ đúng local** | W1 provenance/AI trust; W2 trạng thái lịch sử; W9 retry AI; W12 filter. Codex tái hiện, review và xác nhận | Không mất đề; candidate không tự trusted; current/stale và filter thống nhất; provider lỗi không lặp vô hạn | 16–30 giờ |
| **P2 — flow & nội dung** | Codex + owner chọn phạm vi nguồn D3; W3/W10/W11 catalog, render và mobile; W4 AI draft sau D3; W7 fixture nội dung | Người mới tìm → đọc → code và hiểu draft/official; browser desktop/390/768 xác nhận; nội dung mẫu có nguồn và review | 12–24 giờ |
| **P3 — thiết kế web** | Codex + owner quyết định D4: auth, model dữ liệu, runner và ngân sách | Một thiết kế vertical slice có quyền, version, queue, lỗi, migration/rollback và giới hạn; owner chọn phương án trước code | 10–20 giờ |
| **P4 — xây beta** | Theo task riêng sau P3: auth/ownership/storage, API submit/queue, runner, AI gateway; W5/W6 là các PR nhỏ theo thiết kế | Hai user không đọc/sửa chéo; hidden tests kín; C++ compile/run được cô lập; AI server key, quota, kill switch và budget; bản dữ liệu có backup | 40–80 giờ |
| **P5 — staging** | Codex trực tiếp chạy ma trận D2/D5/D6/D7, kiểm tra security/chi phí, backup restore, lỗi worker và rollback | Có bằng chứng theo commit + môi trường; không có blocker P0/P1; chủ sở hữu có runbook và đường dừng Judge/AI | 12–24 giờ |
| **P6 — beta mời → mở rộng** | Owner mời nhóm nhỏ; Codex theo dõi feedback và hotfix có kiểm soát | Người dùng hoàn thành hai flow; không có lỗi nghiêm trọng về verdict, rò dữ liệu hay chi phí vượt mức; owner quyết định mở rộng | 6–12 giờ công, cộng thời gian chờ feedback |

\* Ước lượng ban đầu **100–198 giờ công**, giả định một người dùng AI hỗ trợ, C++ là ngôn ngữ duy nhất, bắt đầu với ít bài và dùng runner đã được đánh giá. Với 10–15 giờ/tuần là khoảng **7–20 tuần công**, chưa tính thời gian chờ phê duyệt/nhà cung cấp hoặc học thêm. Đây không phải cam kết; nếu phải tự xây/cứu sandbox hay tích hợp phức tạp, thời gian có thể lớn hơn. Chốt lại sau P0/P3 dựa trên thử nghiệm và ngân sách.

**Điều kiện public:** P0–P5 đạt trên cùng phiên bản triển khai, owner duyệt triển khai; bắt đầu P6 bằng nhóm mời và quota thấp. Một preview chỉ đọc có thể mở sớm hơn sau khi tách hoàn toàn API nhạy cảm và kiểm tra quyền nội dung; preview không thu được submission và chưa hoàn thành mục tiêu OJ. Nếu judge sandbox hoặc AI gateway chưa đạt, giữ riêng tính năng tương ứng đóng.

### Thiết kế beta đề xuất để quyết định ở P3

1. **Frontend:** danh sách có tìm/lọc thực, bài chi tiết có statement + editor + Run/Submit rõ nghĩa, result có queued/running/verdict và lịch sử riêng. Màn hẹp chọn một vùng Đề / Code / Kết quả với nút quay lại; desktop có thể chia hai vùng. Giao diện AI phải hiển thị nguồn, draft/chưa review, loading/error/cancel và quyền publish; không tiết lộ hidden tests.
2. **API/data:** `user`, `problem`, `problem_version`, `test_suite_version` private, `submission` với source snapshot, `judge_job` và `attempt` bất biến, `ai_draft`/review/nguồn. API public theo quyền user; API curator/admin riêng. Auth/session, kiểm tra ownership từng object, CSRF/CORS theo cơ chế session được chọn; không đưa nguyên các router local `/workspace`, `/tests`, `/settings` ra Internet.
3. **Judge:** frontend gửi source + problem/version + idempotency key → API kiểm quota và ghi submission → queue → worker/runner cách ly compile **và** run → so khớp output phía server → lưu attempt và trả trạng thái. Worker có timeout, CPU/memory/disk/process/output/network limits, không có secret, không reuse môi trường giữa user; callback và retry phải kiểm chứng, không ghi hai verdict hoặc mất job.
4. **AI:** UI gửi nội dung có quyền và lựa chọn cố định → API authenticated kiểm size/quota/budget → provider do server kiểm soát → validate schema → lưu draft riêng, báo AI có thể sai. Không cho user chọn `baseUrl` sử dụng key chung; giới hạn retry, timeout, concurrency, log/redaction và kill switch. Nhánh verify reference C++ phải qua runner như submission hoặc tắt.
5. **Bảo toàn dữ liệu:** version schema, backup trước migration, thử restore, rollback có thể làm theo; không đưa source bài nộp, hidden tests, key, prompt cá nhân hay runtime vào repo public. Thông báo mục đích thu thập, thời gian giữ/xóa và cách phản hồi; không mặc định dùng bài nộp để train AI.

**Lựa chọn kiến trúc ở P3:**

| Phương án | Lợi và đổi lại | Đề xuất bước tiếp |
| --- | --- | --- |
| Giữ frontend hiện có, xây API web và tích hợp runner đã được đánh giá | Giữ tài sản UX/Truth Core; vẫn phải xây auth, data ownership, queue và kiểm chứng runner | **Ưu tiên khảo sát đầu tiên** cho beta nhỏ; làm một vertical slice staging và đo chi phí/thời gian trước khi chọn |
| Dùng trọn OJ mở như DMOJ/Hydro, gắn AI qua service riêng | Có nhiều chức năng OJ; đổi stack, vận hành và có ràng buộc license/tích hợp UX; chưa chứng minh phù hợp | Làm spike so sánh import, auth, hidden tests và giấy phép nếu phương án đầu quá nặng |
| Tự triển khai runner/sandbox trên VM | Linh hoạt và có thể chủ động chi phí; chủ dự án chịu phần lớn việc cách ly, cập nhật và sự cố | Chỉ chọn nếu có người vận hành và chứng minh được D5; `g++` local hoặc container mặc định không đủ |

Ở P3, so cả **thời gian tích hợp, chi phí ở mức dùng thử, license, quyền dữ liệu, độ tin cậy và khả năng dừng/khôi phục**; không quyết định chỉ theo số dòng code hay giá rẻ nhất. Tên nhà cung cấp, tài khoản và domain là quyết định sau khi có kết quả spike; không mua/deploy trong task lập kế hoạch này.

### Kiểm chứng tối thiểu trên staging

| Nhóm | Các ca phải có bằng chứng trước beta |
| --- | --- |
| Sản phẩm | User mới tìm/lọc/mở bài; Run sample khác Submit; AC/WA/CE/RE/TLE, reload, lịch sử, stale; 390/768/desktop và keyboard; AI thành công/lỗi/quota/cancel/reload |
| Truth Core | Full-suite AC → đổi source/test → stale → WA; CE qua restart; AI candidate không chấm như trusted; cancelled/single-test không cấp AC; import/Stop nếu liên quan |
| Phân quyền | User A/B + admin: không đọc/sửa source, draft hoặc submission của nhau; hidden inputs/expected không trong public API/client; route admin/settings bị chặn |
| Judge/AI abuse | Trên hạ tầng riêng được phép: vòng lặp, output/disk/process spam, timeout/memory, network/filesystem trái phép, job trùng, worker chết/retry, quota và concurrent requests; mock AI sai schema/429/5xx |
| Vận hành | Test khôi phục backup, dừng AI/Judge, cảnh báo chi phí, rollback phiên bản, kiểm tra secret/log và lỗi service. Ghi pass/fail/skip, số lần, SHA và môi trường; không suy luận từ static CI |

**Ngân sách:** chi phí tháng = domain phân bổ tháng + web/API + DB/lưu trữ/backup + queue/runner + AI theo input/output token + băng thông + dự phòng. Tham khảo [Railway](https://railway.com/pricing): Hobby tối thiểu $5/tháng gồm usage credit, dùng thêm trả thêm; [Render](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses) từng nêu ví dụ web + Postgres khoảng $13/tháng (tháng 7/2026), chưa gồm worker/AI/domain. Đây là **ví dụ giá, không phải báo giá cho app**. Đo thử trên staging, xác nhận giá hiện hành, ngân sách tối đa và hard limit/thông báo thực tế trước khi mở. [OWASP API4](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/) giải thích giới hạn tài nguyên và chi phí.

**Cần học theo thứ tự làm:** Git refs/PR/diff/revert → browser/API/HTTP và data flow → auth/ownership/session → test oracle/sample/hidden và Judge/sandbox → DB/queue/retry → AI token/quota/structured output → DNS/TLS/backup/logs/rollback. Mỗi phase yêu cầu giải thích được input, output, ai có quyền, lỗi và cách kiểm chứng trước khi chấp nhận patch AI.

## Mục tiêu và phạm vi

Hai luồng phải đến được người dùng thật: **kho OJ → đọc đề → code C++ → nộp → nhận verdict và lịch sử**, và **AI dựa trên nguồn có quyền → tạo đề draft → xem lại → dùng/publish theo quyền**. Nhóm thử đầu tiên nhỏ, có giới hạn quota và cách báo lỗi. Các tính năng Xưởng/Arena là tài sản dài hạn nhưng không cần phơi toàn bộ trong beta.

Trạng thái khảo sát ngày 28/10/2026: source local-first, Node/Express + vanilla JS, lưu file; `backend/server.js` cảnh báo local-only; `backend/src/runCpp.js` spawn chương trình với quyền backend; app chưa có bằng chứng kiến trúc đa người dùng và sandbox public. `README.md`, `AGENTS.md`, `docs/security/truth-core.md`, `docs/security/threat-model.md`, `docs/operations/development.md` là tài liệu phải đọc trước thay đổi. Hướng nghiên cứu cũ `docs/NCKH.md` vẫn tồn tại, nhưng mục tiêu beta mới được owner nêu trong cuộc trò chuyện; không xóa lịch sử hay tự claim các thay đổi nghiên cứu đã được duyệt.

## D1 — xác nhận repo và cách làm việc

- [ ] Xem main, integration, PR #2/#3/#4 và nhánh kế hoạch trên GitHub; xác định source commit thực dùng cho từng patch. Các SHA trong `WORK_DIEN_THOAI.md` là ảnh chụp, phải kiểm tra live.
- [ ] Review diff và checks của từng PR; #3 và #4 vào integration, #2 vào main. Hợp nhất theo quyết định riêng sau khi xem lại base/conflict/checks; không giả định một PR chứa các PR song song. CI hiện là static check, không phải full test.
- [ ] `main` chưa có branch protection tại thời điểm khảo sát; chọn quy tắc review/checks phù hợp và thực hiện khi được owner yêu cầu. Không tự thay quyền repo trong lúc đọc tài liệu.
- [ ] Nếu muốn tiếp tục bằng điện thoại, hoàn thành [Issue #9](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/issues/9): kết nối đúng GitHub, kiểm tra môi trường phù hợp, chứng minh phone → task → diff/test được phép → branch/PR → review khi PC tắt. Việc Work từng push PR không đủ chứng minh setup điện thoại. [Hướng dẫn Cloud](https://learn.chatgpt.com/docs/environments/cloud-environments).

**Đạt:** biết file kế hoạch đang ở nhánh nào, dùng được GitHub từ thiết bị sẽ làm việc, không ghi đè thay đổi khác; các điều chưa chứng minh được đánh dấu pending.

## D2 — tự xem app và kiểm tra trải nghiệm

- [ ] Chạy bản đúng commit trong môi trường được phép; nếu là Windows mượn, chỉ dùng MXC wrapper đã xác minh như `docs/operations/development.md`. `USER_DATA_ROOT` mới chỉ tách dữ liệu, không cô lập OS. Không copy profile/API key thật; test với dữ liệu tổng hợp.
- [ ] Trên desktop: mở danh sách → tìm/lọc → xem đề → viết code → Run → Judge → mở lịch sử → sửa code/test → xem current/stale → reload. Ghi lỗi theo bước, expected/actual, ảnh hoặc video sạch, commit/môi trường.
- [ ] Với AI: dùng provider mock hoặc tài khoản/cấu hình thử được phép; chọn input có quyền, tạo biến thể → kiểm tra nhãn draft/AI, sample, test candidate, lỗi/timeout/cancel → reload. Không coi output AI hoặc sample-matching reference là oracle độc lập.
- [ ] Kiểm tra viewport điện thoại để xem app public (không nhầm với việc dùng điện thoại giao Work): list, statement, editor và nút submit có thể dùng; desktop vẫn là trải nghiệm code chính nếu mobile editor chưa tốt. Kiểm tra keyboard, thông báo chờ/lỗi, tải lại và đường quay lại.
- [ ] Test E2E cần thiết theo `AGENTS.md`: AC → edit → stale → WA, CE qua reload/restart, AI candidates excluded, Stop/import nơi liên quan. Ghi lệnh, counts, failures/retries. Nếu không có môi trường an toàn, không chạy và không đánh dấu PASS.

**Đạt:** có danh sách lỗi theo mức ảnh hưởng và bằng chứng thật, ưu tiên lỗi chặn 2 flow thay vì đại tu giao diện. W1/W2/W3/W4 được review lại theo bằng chứng này.

## D3 — nội dung, nguồn lớn và sản phẩm AI

Đầu tiên chọn **một** flow: (A) user dán nội dung họ có quyền sử dụng rồi AI tạo bài luyện cá nhân; hoặc (B) owner xây bộ nguồn đã có giấy phép/được phép để AI hỗ trợ soạn draft. Link đến OJ lớn có thể là nguồn tham khảo, nhưng không mặc nhiên đồng nghĩa được crawl, copy, gửi AI, chỉnh sửa rồi tái đăng. Kiểm tra điều khoản/quyền cho từng nguồn và hoạt động; contest đang diễn ra còn có quy tắc riêng. Ví dụ [quy tắc AI của AtCoder](https://info.atcoder.jp/entry/llm-rules-en) áp dụng theo bối cảnh contest, không suy diễn thành cấm mọi sử dụng ngoài contest.

- [ ] Ghi nguồn, tác giả/quyền, thời điểm, giới hạn sử dụng, nguồn input thực tế và trạng thái review cho từng bài. Nếu chưa rõ quyền, chưa đưa nội dung vào kho public.
- [ ] Xác định người dùng có thể tạo bài nháp riêng hay chỉ curator tạo; nội dung AI chưa review không được gọi là bài OJ chính thức. Bài AI có thể có nhiều đề sai/thiếu constraints, sample mâu thuẫn hoặc giống nguồn; cần sửa, kiểm tra reference độc lập + edge cases và review nội dung.
- [ ] Với bài chính thức: version bất biến, statement rõ, sample công khai, hidden suite riêng, lời giải/reference đúng độc lập và các lời giải sai điển hình phải bị bắt; cần người review chịu trách nhiệm. Không dùng vài sample làm bằng chứng bộ chấm đầy đủ.
- [ ] Chọn số bài đầu tiên vừa sức kiểm định, ví dụ một bộ nhỏ tự viết/được cấp quyền; đây là mục tiêu thử nghiệm, không phải bằng chứng dataset có sẵn.
- [ ] Xem tác động riêng tư: người dùng biết source/code/đề nào được gửi cho provider; hạn chế lưu prompt, có đường báo lỗi/xóa phù hợp và xem quy định liên quan trước mở rộng đối tượng. Telemetry nghiên cứu hiện append log local, không mặc định là consent cho dùng dữ liệu người thật.

**Đạt:** có danh sách nguồn + quyền cụ thể, một quy trình draft/review, một số bài có test được kiểm chứng, không hứa AI luôn đúng. Chưa rõ quyền thì dùng nội dung tự viết hoặc chỉ link về nguồn theo điều kiện cho phép.

## D4 — thiết kế tối thiểu cho web đa người dùng

Vẽ và review flow trước khi code, chốt nhà cung cấp theo ngân sách và quyền truy cập thực tế. Phương án gợi ý, không bắt buộc công nghệ: web/API → auth/authorization → storage bền vững → queue → judge worker cô lập; AI qua service có quota riêng. Có thể dùng dịch vụ managed thay vì tự vận hành, nhưng phải kiểm chứng giới hạn, giá, privacy, khả năng xóa và bảo mật theo nhu cầu.

- [ ] Chốt mô hình user, problem/version, public statement/sample, private test data, submission/version/source snapshot/status/verdict, AI draft/review, ownership và quyền admin. Không để ID đoán được cấp quyền xem/sửa dữ liệu người khác.
- [ ] Xác định DB/lưu trữ bền vững, migration có version, backup/restore đã diễn tập, và policy giữ/xóa submission; không lưu user data vào Git, không dùng workspace file chung làm giả DB đa user.
- [ ] Tách API người học khỏi API quản trị: `routes/files.js` hiện trả code/tests/workspace và cho sửa test; `routes/problems.js` cho tạo/sửa/xóa; `routes/settings.js` cho sửa cấu hình AI. Các API local này không thể đưa nguyên xi cho khách public.
- [ ] Xây queue/status có giới hạn và idempotency; khi worker chết, timeout hoặc gửi trùng, một submission có trạng thái rõ và không bị ghi verdict sai. Lưu version/test fingerprint để truy vết verdict; bảo toàn Truth Core, không sửa lịch sử cho khớp UI.
- [ ] Lên contract auth/session, CSRF/CORS theo mô hình triển khai, authorization theo đối tượng, validation/size limits, redaction, an toàn upload/Markdown/URL, logs và ngưỡng cảnh báo. Kiểm tra thực tế chứ không suy ra an toàn chỉ vì đã có sanitizer.

**Đạt:** một thiết kế nhỏ có data model, sequence, giới hạn, nguồn tin cậy, quyền, lỗi/khôi phục, threat model và kế hoạch migration/rollback; owner đồng ý từng task triển khai. Không tự viết lại toàn bộ app trước khi chốt.

## D5 — Judge: điều kiện bắt buộc trước khi nhận code public

- [ ] Chọn một runner đã thiết kế cho code không tin cậy (ví dụ đánh giá [Judge0](https://github.com/judge0/judge0) hoặc môi trường cách ly khác); xác minh version, giấy phép, chi phí, API, mức hỗ trợ và cấu hình thực. Dịch vụ/VM/container không tự trở thành an toàn chỉ vì tên sản phẩm.
- [ ] Thiết kế compile **và run** trong môi trường bị giới hạn: no secrets, không truy cập DB/control plane/metadata, egress deny theo thiết kế, filesystem phù hợp, process count, CPU/wall time, memory, disk, file descriptor, output, đồng thời và cleanup. Mỗi trust boundary phải có lý do và kiểm chứng.
- [ ] Hidden tests và đáp án không gửi tới client; hạn chế lộ qua output/error/timing theo threat model. Sandbox có thể cần đọc test input để chấm, vì thế thiết kế dữ liệu tối thiểu, xóa sau job, không giữ secrets hay reuse môi trường giữa user. Không hứa chống mọi side-channel.
- [ ] Chạy thử: AC, WA, CE, RE, TLE, memory/output limit, vô hạn vòng lặp, spam output/disk/process, thử đọc file/network trái phép, concurrency, worker chết/retry/cancel. Chạy trên môi trường riêng được phép, không nhằm vào hệ thống người khác. Dùng dữ liệu tổng hợp và ghi kết quả thực.
- [ ] Sự cố verdict: trace submission → phiên bản đề/test/compiler → log an toàn; rejudge có version và lịch sử, không sửa kết quả quá khứ âm thầm. Tắt queue/worker nếu phát hiện sự cố.

**Đạt:** cách ly + giới hạn + kết quả đúng được chứng minh trên hạ tầng dự định dùng, kèm runbook và người chịu trách nhiệm. Nếu chưa đạt, chỉ demo giao diện/đọc đề; không mở endpoint chạy code cho cộng đồng.

## D6 — AI, API key và chi phí

Hiện `backend/src/settingsStore.js` lưu key/baseUrl local; route `/api/settings/ai` cho chỉnh; `backend/src/ai.js` gửi key đến baseUrl. **Nếu bê nguyên server local lên internet**, người truy cập có thể thay cấu hình chung và từ đó có nguy cơ khiến key được gửi tới endpoint khác; đây là phân tích đường code, chưa kiểm thử exploit. AI `/process` còn có nhánh chạy reference code, không chỉ gọi HTTP.

- [ ] Chọn provider/model dựa trên giá, khả năng, điều khoản dữ liệu và giới hạn hiện hành; key chỉ lưu secret manager/env server, không vào browser/repo/log; có cách rotate và vô hiệu hóa.
- [ ] Public API chọn provider và endpoint phía server, có auth + quyền, per-user/IP quota, concurrency và global budget; định mức request/token, timeout/retry, cache/idempotency và kill switch. SSRF/redirect/URL không tin cậy phải được xử lý; không cho user thay provider URL dùng key của owner.
- [ ] Khi AI lỗi, quota cạn hoặc provider down: giải thích cho user, không lưu draft nửa chừng thành đề đã review; UI cho retry có giới hạn. C++ reference AI đi qua cùng sandbox nghiêm ngặt như submission, hoặc tắt bước đó.
- [ ] Theo dõi request, token, chi phí ước tính/thực tế, lỗi, latency và số user; tránh ghi nội dung nhạy cảm. Đặt giới hạn chi phí thật ở provider nếu hỗ trợ và alert; alert không tự đồng nghĩa hard cap. OWASP mô tả việc giới hạn tài nguyên và chi tiêu là hai việc liên quan nhưng khác nhau. [OWASP API4](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/).

**Ước tính trước khi mua:** chi phí tháng ≈ domain phân bổ theo tháng + hosting/API + storage/backup + judge (số submission × thời gian/tài nguyên) + AI (số lượt × token input/output × đơn giá model) + băng thông. Thêm dự phòng; tính lại từ giá thật và usage thử, không đoán “chỉ domain + key”.

## D7 — beta, feedback và vận hành

- [ ] Staging riêng production, TLS/domain cấu hình đúng, secret và dữ liệu tách biệt; kiểm thử quyền hai user + admin; backup/khôi phục thử; dependency/secret review; log/monitoring/alert và rollback đã diễn tập.
- [ ] Invite nhóm nhỏ trước, quota và số job đồng thời thấp; có liên hệ hỗ trợ, nút report bài lỗi và đường tắt AI/Judge. Không cần scale như LeetCode ngay; cần verdict và dữ liệu nhất quán cho nhóm thử.
- [ ] Theo dõi funnel tối giản: xem list → mở bài → bắt đầu code → submit → verdict → quay lại, cùng lỗi, thời gian chờ, chi phí/user và feedback. Chỉ thu phần cần thiết, thông báo rõ cách dùng/xóa dữ liệu; không mặc định dùng bài nộp để train model.
- [ ] Lịch trình public do owner quyết định sau khi thấy bằng chứng D3–D6, không tự triển khai hay mua domain. Nếu một gate đỏ, có thể mời dùng **demo chỉ đọc đề** hoặc AI draft giới hạn khi endpoint tương ứng đã an toàn; mô tả đúng phần chưa mở.

## So sánh với OJ lớn và bài học từ cộng đồng

LeetCode/Codeforces/AtCoder có kho bài, chấm và cộng đồng tích lũy nhiều năm; beta này không cần bắt kịp số lượng, nhưng nên học yêu cầu cốt lõi: đề rõ, verdict đáng tin, UX dễ tìm và feedback nhanh. Một thảo luận [người ra đề trên r/codeforces](https://www.reddit.com/r/codeforces/comments/1rqn7du/how_i_used_to_generate_test_cases_for_competitive/) nêu khó khăn tạo edge cases và kiểm tra brute-force; [thảo luận r/QualityAssurance](https://www.reddit.com/r/QualityAssurance/comments/1jil8pw/have_you_used_aigenerated_test_cases_how_was_your/) cho thấy trải nghiệm AI tests khác nhau nhưng vẫn cần review. Đây là quan sát từ vài thảo luận, không đại diện cho toàn bộ cộng đồng và không chứng minh nhu cầu của người dùng dự án.

## Những thứ owner nên học song song

1. Git: base/head, PR xếp chồng, diff, conflict, revert và kiểm tra SHA. Xem PR AI trước merge.
2. Web: browser → API → auth → DB/queue → worker, HTTP, session, authorization, secret, CORS/CSRF và validation.
3. Judge: compiler/runtime, hidden vs sample, oracle độc lập, sandbox/quota, các verdict và cách tạo case biên.
4. AI: token/cost, output có cấu trúc, mock, timeout/retry, prompt injection, kiểm chứng nội dung và quản lý nguồn.
5. Vận hành: domain/DNS/TLS, deploy/rollback, backup/restore, log, quota và incident. Học ngay trên một vertical slice nhỏ thay vì đọc lý thuyết toàn bộ trước khi bắt đầu.

**Báo cáo sau mỗi buổi:** commit/nhánh, việc hoàn thành, bằng chứng test thật và phần chưa test, rủi ro, chi phí đã phát sinh và bước tiếp theo. Không gắn nhãn “ready” cho checklist chưa được xác minh.
