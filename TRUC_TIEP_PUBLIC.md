# Kế hoạch làm trực tiếp để mở public beta

> Dùng khi có máy tính, môi trường/chủ tài khoản và khả năng xem app, cấu hình, kiểm chứng hoặc vận hành thật. File đồng hành: [WORK_DIEN_THOAI.md](WORK_DIEN_THOAI.md). Làm từng mục theo thứ tự và điều kiện, không triển khai tất cả chỉ vì file này tồn tại.

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
