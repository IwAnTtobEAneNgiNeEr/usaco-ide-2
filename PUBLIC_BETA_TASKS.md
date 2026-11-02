# USACO IDE 2 — kế hoạch làm việc hướng tới public beta

> Chủ repo có thể nói: **“Đọc PUBLIC_BETA_TASKS.md và làm Task 1.”**
> Agent: chỉ làm task được yêu cầu; phần còn lại là bối cảnh, không tự triển khai hàng loạt.

## Đọc trước khi làm

- Mục tiêu mới của owner: một bản web beta nhỏ cho cộng đồng, tập trung vào **kho bài OJ + nộp bài**, và **AI tạo/biến thể bài từ nguồn được phép**, lấy feedback rồi cải tiến dần. Tầm nhìn hợp nhất các sản phẩm lớn là dài hạn, không phải phạm vi beta.
- File này được owner yêu cầu riêng ngày 28/10/2026. `docs/NCKH.md` mô tả hướng nghiên cứu cũ C++ → Xưởng, vẫn có giá trị cho nghiên cứu; không tự xóa/sửa nó hoặc giả vờ nó là kế hoạch public hiện tại. Tuân thủ `AGENTS.md`, `docs/security/truth-core.md`, `docs/operations/development.md`; các task bên dưới chỉ là các yêu cầu riêng khi owner chọn làm, không tự cho phép triển khai toàn bộ.
- Trước mọi thay đổi: đọc các file trên, kiểm tra remote/nhánh/PR live, nội dung source hiện tại và working tree. Số commit sau đây là **ảnh chụp ngày 28/10/2026**, không phải mặc định mãi mãi.
- Ảnh chụp: `main` = `216e38d`; `integration/truth-core-governance` = `962f209` ([PR #2](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/2), draft vào main); `fix/history-navigation-race` = `d8d6d2f` ([PR #3](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/3), vào integration); [PR #4](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/4) là một nhánh khác vào integration. Không coi `main` hay một nhánh bất kỳ là đã có toàn bộ patch chưa merge.
- File này ban đầu nằm trên `codex/public-beta-playbook`, dựa trên `d8d6d2f`. Khi bắt đầu, xác định lại base thực tế: nếu PR #3 vẫn mở và người dùng muốn code mới nhất, có thể tạo PR xếp chồng vào `fix/history-navigation-race`; nếu đã merge, dùng integration mới. Nếu base đã đổi, xử lý trên nhánh mới từ base hiện hành, giữ file này trong phạm vi PR khi cần. Không reset/force-push hoặc tự merge các PR cũ.
- Khi owner yêu cầu làm một task, thực hiện task đó và tạo nhánh, commit, push nhánh và draft PR phù hợp nếu có quyền; không push trực tiếp main, không merge/deploy, không đổi cài đặt repo, không dùng secrets thật. Nếu môi trường hoặc quyền không cho phép, làm phần an toàn có thể rồi báo chính xác blocker. Không chạy tùy tiện C++/backend trên máy mượn hay Cloud chưa xác minh cô lập.
- `npm test` ở root chạy backend/compiler suite. Với máy Windows mượn, chỉ dùng MXC đã xác minh theo tài liệu; trên môi trường khác phải kiểm tra ranh giới cô lập tương ứng. Cloud không tự thừa hưởng MXC. CI hiện chỉ kiểm tra tĩnh, không chứng minh Judge/UI an toàn.

## Kết luận sau khi đọc source

Đây là **local-first IDE có nền tảng đáng tái sử dụng**, chưa phải web OJ đa người dùng. `backend/server.js` tự cảnh báo không đưa server hiện tại ra internet; `backend/src/runCpp.js` spawn compiler/chương trình bằng quyền OS của backend. Timeout và giới hạn output không thay thế cô lập filesystem, process, network, memory, disk và concurrency. `backend/src/config.js` dùng workspace/data theo file; chưa thể coi đây là cơ sở dữ liệu bài nộp đa user. Phải thiết kế đường public riêng trước khi nhận code không tin cậy.

Kho hiện có list/search (`frontend/src/problems.js`, `backend/src/routes/catalog.js`) và editor/Judge; không đồng nghĩa đã có kho đề web có tài khoản, submission riêng từng user, hidden tests, queue và chống lạm dụng. `frontend/src/statement.js` hiển thị “Đã giải” dựa trên AC trong lịch sử, trong khi `frontend/src/editor.js` và Truth Core phân biệt AC hiện tại / stale / chưa lưu; đây là điểm có thể gây hiểu nhầm, cần tái hiện trước khi sửa.

AI hiện có luồng phân tích + sinh test (`backend/src/routes/ai.js` `/process`), tạo biến thể (`/synthesize`, `frontend/src/features/synthesizer.js`), và một số luồng tạo bài khác. Competitive Companion import local, paste/OCR/PDF và tracker import là các con đường nhập khác nhau; không mặc định đã có công cụ tự crawl mọi OJ, hoặc có quyền tái đăng đề. `/process` có thể gọi AI, sinh reference rồi thực thi nó; không được coi đây là API public an toàn chỉ vì là “AI”.

Trust Core là điểm mạnh cần giữ: full AC phải gắn fingerprint hiện tại, lịch sử AC không tự thành current AC; AI-generated output là candidate cho đến khi được review theo cơ chế hiện có. Trong local workflow, statement samples có đường trust riêng; sample không chứng minh đủ hidden tests hay chất lượng một bài mới. Không thay đổi trust chỉ bằng nhãn UI.

Đọc tĩnh phát hiện rủi ro cụ thể cho Task 1: `frontend/src/features/synthesizer.js` tạo bài biến thể bằng `api.createProblem` nhưng không truyền `origin`; `backend/src/problemStore.js` mặc định `user-authored`. `/api/ai/process` và `backend/src/oracleTrust.js` lại phân biệt `origin === "ai-generated"` khi xét sample. Vì vậy **có khả năng** sample từ statement biến thể được đánh giá như sample của statement đáng tin khi các điều kiện tương ứng xảy ra. Đây là suy luận từ code, chưa phải kết quả tái hiện runtime. Không kết luận mọi bài AI trong repo đều bị ảnh hưởng.

Chi phí không chỉ là domain + API key: cần dự trù hosting, lưu trữ/backup, compute chấm, băng thông và chi phí AI theo lượng dùng; giá phụ thuộc lựa chọn nhà cung cấp. Trước beta đặt hạn mức người dùng, số lượt AI/submission, ngân sách và cảnh báo chi tiêu. Không ước tính giá khi chưa chọn dịch vụ và workload.

## Task 1 — sửa nguồn gốc bài biến thể AI và ngăn sample được tin nhầm

**Mục tiêu:** một patch nhỏ trực tiếp phục vụ tính năng tạo đề AI. Không mở rộng sang việc build web, database, hosting hoặc thay đổi mọi luồng tạo bài.

1. Kiểm tra lại hiện trạng live và tái hiện bằng regression test có ý nghĩa, với dữ liệu tổng hợp và AI giả lập: tạo biến thể qua đúng đường UI/API; chứng minh metadata nguồn và trạng thái oracle của một sample khớp statement. Chỉ dùng test không gọi provider thật; không chạy reference C++ hoặc app/backend nếu chưa xác minh containment. Nếu test cần runtime bị chặn, báo blocker thay vì giả lập thành PASS.
2. Sửa đường tạo biến thể ở `frontend/src/features/synthesizer.js` để bài mới mang nguồn `ai-generated` và `derivedFrom` trỏ đúng bài gốc theo contract hiện có (`id`, `title` nếu có). Đối chiếu `api.createProblem` và `problemStore.createProblem` để chắc metadata thực sự được lưu/đọc; không tin riêng payload UI. Tránh tạo ra một contract mới nếu contract có sẵn đã đủ.
3. Bảo đảm qua đường pipeline/store thực tế rằng sample của statement biến thể AI **không tự trở thành trusted** chỉ vì trùng nội dung statement; bao gồm cả sample cũ được ghép vào statement mới. Không tự xóa, đổi nhãn, migrate hay làm mất review receipt của bài cũ. Bài non-AI, sample được phép và review có chủ đích phải tiếp tục hoạt động theo contract. Nếu phát hiện đường đi khác cần thay đổi rộng hơn, ghi nhận và tách task, không nới trust.
4. UI phải giúp người dùng hiểu đây là biến thể do AI tạo và sample/test cần được kiểm tra trước khi chấm chính thức, không hứa dữ liệu đúng hay hidden tests đầy đủ. Nếu hiện trạng không thể biểu đạt điều này mà không sửa rộng, dùng nhãn rõ ràng ở đúng điểm tạo/đọc và ghi hạn chế.
5. Viết regression hành vi cho đường tạo bài và trust boundary, kiểm tra cả trường hợp AI và non-AI. Dùng kiểm tra targeted phù hợp trong môi trường đã xác nhận an toàn, báo chính xác lệnh/kết quả. Không dùng snapshot/regex đơn thuần để tuyên bố end-to-end đã chạy; không gọi AI thật hoặc chạy C++ chỉ để làm demo. Kiểm tra `git diff --check` và static check khi phù hợp.
6. Đây là thay đổi liên quan Truth Core. Nếu không có browser E2E và môi trường compiler an toàn theo `AGENTS.md`, vẫn có thể nộp **draft PR** với bằng chứng phần đã chạy, nhưng đánh dấu **chưa hoàn thành gate/không sẵn sàng merge**, ghi rõ phần E2E còn thiếu. Tuyệt đối không nói đã public-ready.

**Đạt khi:** bài biến thể mới có nguồn và liên kết gốc đúng; sample AI không được tự tin nhầm; non-AI không hồi quy; test hành vi tương ứng có kết quả thật; giới hạn kiểm thử được ghi rõ. PR chỉ chứa patch và test cần thiết (và file kế hoạch này nếu cần cho base), không tái cấu trúc hệ thống.

**Báo lại:** base/head SHA, link draft PR, tóm tắt nguyên nhân/cách sửa, test đã chạy/chưa chạy, điểm cần review, việc tiếp theo. Nếu bằng chứng mới cho thấy giả thuyết ban đầu sai, không ép sửa: giải thích bằng đường code/test và đề xuất task nhỏ thay thế.

## Task 2 — trạng thái bài OJ đúng và dễ hiểu

Tái hiện trường hợp lịch sử từng AC nhưng hiện tại stale/dirty; đối chiếu list, editor, statement brief và backend projection. Sửa phần hiển thị để “AC hiện tại”, “cần chấm lại/chưa lưu” và “từng AC trong lịch sử” không nhập nhằng, vẫn giữ lịch sử. Có regression hành vi và kiểm thử theo Truth Core. Không thay đổi logic Judge để UI xanh. Browser E2E theo `AGENTS.md` là gate riêng nếu môi trường hiện tại không đáp ứng.

## Task 3 — đặc tả nhỏ cho AI tạo đề

Vẽ flow duy nhất: người dùng chọn nguồn có quyền sử dụng hoặc dán nội dung được phép → chọn yêu cầu → AI đề xuất → xem/kiểm tra đề, sample, nguồn và version → lưu draft → người có quyền review/publish. Chốt ai trả phí, quota, timeout, retry, lỗi, idempotency, chống prompt injection, logging không chứa secrets và quyền nội dung. So sánh flow này với `/process`, `/synthesize`, Companion và các luồng tạo bài hiện hữu; phân biệt cái đã có, thiếu và rủi ro. AI không biến output của chính nó thành oracle. Không tự crawl/rehost đề từ website bên thứ ba chỉ vì có URL; kiểm tra điều khoản/quyền từng nguồn trước khi chọn cách dùng.

## Task 4 — thiết kế đường beta web và triển khai thành patch nhỏ

1. Chốt trải nghiệm beta tối thiểu: danh sách bài → đọc đề → code → nộp → xem trạng thái/kết quả và lịch sử; AI generation là flow riêng có giới hạn. Bài công khai phải có nguồn, version, test đáng tin và người chịu trách nhiệm review. Một bộ ít bài chất lượng tốt hơn kho lớn không rõ oracle.
2. Thiết kế và review tách public API/UI, lưu trữ bền vững và worker chấm: danh tính/quyền, submission gắn user + problem version, trạng thái queued/running/result, atomic/idempotent processing, hidden test không lộ client, log/backup/restore và phiên bản dữ liệu. Kiểm soát truy cập tới code/submission của từng user; cho người dùng biết dữ liệu thu thập và cách feedback.
3. Judge cần môi trường cô lập thực sự, giới hạn CPU/time/memory/disk/output/process/network, hủy/timeout, hàng đợi và giới hạn đồng thời; kiểm tra bằng các tình huống đối kháng trước khi nhận code công khai. Không đưa local Express/g++ ra internet, không coi container mặc định hay temp folder là đủ.
4. Bảo vệ AI và API: secret chỉ ở server, authentication/authorization, giới hạn lượt và concurrency, giới hạn input/output, budget/alert, giới hạn URL/provider, xử lý lỗi, monitoring. Phân biệt quota ứng dụng và giới hạn của nhà cung cấp; cân nhắc AI tắt hoặc chỉ cho nhóm nhỏ khi chưa kiểm soát chi phí.
5. Làm từng PR nhỏ: chuẩn bị nền tảng, vertical slice với dữ liệu giả, rồi kết nối storage/worker đã kiểm chứng. Chỉ mở pilot giới hạn sau kiểm tra bảo mật, kết quả chấm, phục hồi dữ liệu, chi phí và quyền nội dung. Thu feedback, theo dõi lỗi/latency, có cách tạm tắt AI/Judge. Không hứa deadline hay GO dựa vào static CI.

## Cần học để giao việc và review AI hiệu quả

- Git: branch/base, commit, diff, PR xếp chồng, conflict và review; luôn hỏi AI nêu SHA và phạm vi thay đổi.
- Web: HTTP, frontend → API → storage, authentication/authorization, session, secrets, rate limits, request validation và deploy/rollback.
- OJ: phân biệt sample/hidden test, reference/oracle độc lập, comparator, AC/WA/CE/RE/TLE, giới hạn tài nguyên và sandbox chạy code không tin cậy.
- AI: structured output, sai/hallucination, prompt injection, timeout/retry, cache, token/cost, quota; biết dùng mock và kiểm tra output thay vì tin model.
- Vibe coding: giao một hành vi cụ thể + ví dụ trước/sau + ranh giới + tiêu chí đạt; yêu cầu test có ý nghĩa, đọc diff, hỏi điều gì chưa kiểm tra, và chỉ merge khi review cùng bằng chứng tương xứng với rủi ro.

**Quy ước báo cáo:** facts theo source/commit; suy luận ghi là giả thuyết; không bảo đã test hoặc đã xem UI khi chưa làm. Không ghi API key, dữ liệu người dùng, browser profile hoặc logs nhạy cảm vào repo/PR.
