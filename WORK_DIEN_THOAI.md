# Kế hoạch giao ChatGPT Work qua điện thoại

> Câu lệnh mẫu: **Đọc `WORK_DIEN_THOAI.md` trên nhánh `codex/public-beta-playbook` và làm W0.**
>
> File đồng hành: [TRUC_TIEP_PUBLIC.md](TRUC_TIEP_PUBLIC.md). Nếu đã merge các file vào nhánh chính, chỉ định nhánh mới có chứa chúng. File này thay thế thứ tự task cũ trong `PUBLIC_BETA_TASKS.md`; giữ file cũ để truy vết, không tự xóa.

## Hướng sản phẩm và cách dùng

Owner muốn public beta nhỏ để lấy feedback với hai chức năng: **(1) tạo/biến thể đề bằng AI từ những nguồn được phép sử dụng; (2) kho OJ, viết code, nộp bài và lưu submission**. Làm ít tính năng nhưng trọn flow và đáng tin trước. Xưởng/đấu trường cùng tầm nhìn đa dụng có thể trở lại sau; không chặn beta bằng việc hoàn tất mọi tính năng cũ.

Đây là danh sách task, không phải một lệnh triển khai tất cả. Owner gọi đúng mã W0, W1, W2…; chỉ thực hiện task đó và các kiểm tra phụ thuộc cần thiết. Một yêu cầu làm task bao gồm tạo nhánh làm việc, commit, push nhánh và mở draft PR cho task khi tài khoản/môi trường cho phép; không push trực tiếp main, không merge hay deploy. Nếu nhánh PR không tạo được, bàn giao diff và blocker rõ ràng. Mọi tác vụ làm thay đổi hạ tầng, tài khoản, quyền, secret, domain hoặc dữ liệu thật cần một yêu cầu riêng cho đúng hành động.

**Trước mọi task:** đọc `AGENTS.md`, `README.md`, `docs/security/truth-core.md`, `docs/operations/development.md`, các file được task chỉ ra; kiểm tra working tree, remote, các PR và commit đầu nhánh thực tế. Ảnh chụp ngày 28/10/2026: main `216e38d`; integration `962f209`; PR #3 `fix/history-navigation-race` là `d8d6d2f`; tài liệu này ban đầu nằm trên `codex/public-beta-playbook` dựa trên PR #3. PR #4 là nhánh song song vào integration. Không giả định main là code mới nhất, PR #3/#4 đã merge, hoặc một commit cố định còn là mới nhất.

Mở PR vào base phù hợp sau khi kiểm tra lại. Nếu PR #3 còn mở và patch phụ thuộc nó, dùng PR xếp chồng vào nhánh đó; nếu đã merge, dựa vào integration mới. Không force-push hoặc sửa PR của owner. Không thay đổi dữ liệu người dùng thật.

**Giới hạn Cloud:** kết nối GitHub không tự chứng minh Cloud trên điện thoại đã sẵn sàng. Xem [Issue #9](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/issues/9) và [tài liệu Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments). Browser trong Codex Cloud được publish hiện không hỗ trợ; khả năng mỗi chế độ Work có thể khác. Bằng chứng UI thật và compiler vẫn cần môi trường thích hợp ở file trực tiếp. Không chuyển credential, MXC hoặc profile từ máy khác sang Cloud.

**Kiểm tra:** ngày 28/10/2026 đã có lượt thử browser và API trên commit `a98090c` với workspace tổng hợp, Node 24.22.1, GCC 13.3 và AI giả lập local; không dùng provider thật. Các task code tương lai phải tái hiện, có regression có ý nghĩa và chạy targeted/relevant tests trong containment theo `AGENTS.md`. Frontend test thuần chỉ chạy sau khi xem file test và xác nhận không spawn compiler/backend/network hoặc đụng dữ liệu thật. `npm test` ở root là compiler suite, không chạy trong Cloud chưa xác minh. Critical Truth Core cần browser E2E và containment; nếu chưa có thì ghi rõ **chưa đạt gate**, vẫn có thể bàn giao draft, không gọi là hoàn tất hay sẵn sàng merge.

## W0 — giữ nguyên đề gốc khi dịch

**Ưu tiên trước W1 vì có nguy cơ mất nội dung.** Đã tái hiện trên workspace tổng hợp: tạo bài `origin: imported` với đề tiếng Anh chỉ có trong `statement.md`, `statement.en.md` rỗng; mở bài khi giao diện là tiếng Việt và AI giả lập local trả về bản dịch hợp lệ. Backend sau đó trả bản dịch trong cả `statement.md` và `statement.vi.md`, còn `statement.en.md` vẫn rỗng. Ngoài ra, `PUT` metadata `statementSourceLanguage: "en"` trả giá trị đó, nhưng `GET` kế tiếp không còn trường này. Đây là bằng chứng cho điều kiện vừa nêu, không khẳng định tất cả dữ liệu cũ đã mất.

**Đọc:** `frontend/src/i18n.js` (`setStatementVariants`, `applyStatementLanguage`, `persistActiveStatementVariant`, paste), `frontend/src/main.js` (load problem), `backend/src/problemStore.js` (`defaultMeta`, `readMeta`, `updateProblem`), routes/files.js và contract lưu statement. Đối chiếu Truth Core trước khi đổi dữ liệu ảnh hưởng Judge/test.

**Làm:**

1. Kiểm tra nhánh/base hiện tại và tái hiện bằng dữ liệu tổng hợp, AI mock, không dùng key thật; thêm regression hành vi cho metadata đọc sau ghi và vòng đời đề nhập tiếng Anh → dịch → reload → chọn lại bản gốc. Nếu môi trường không có browser, tách được các kiểm tra backend/frontend thuần an toàn và nêu rõ browser E2E còn thiếu.
2. Sửa contract lưu/đọc để bảo toàn ngôn ngữ nguồn, bản gốc và bản dịch. Mở bài hoặc chuyển ngôn ngữ không được làm mất bản gốc hay âm thầm thay statement gốc bằng nội dung AI. Xem các nơi Judge, sample extraction và AI dùng statement để không làm sai fingerprint, trust hoặc các flow đang hoạt động. Không chỉ đổi nhãn UI.
3. Khi provider lỗi, trả rỗng hoặc nội dung không hợp lệ, không ghi đè nội dung đã có; tiếp tục cho người dùng đọc bản gốc và báo lỗi rõ. Không khẳng định có thể tự kiểm tra hoàn toàn độ chính xác bản dịch.
4. Giữ dữ liệu cũ đọc được. Không tự migrate, phục hồi hay ghi đè workspace của người dùng; trường hợp bản gốc cũ đã mất phải được báo riêng, không bịa nội dung. Không thay đổi receipt/test/Judge để che sai lệch.
5. Chạy kiểm tra hành vi phù hợp và an toàn với dữ liệu synthetic; báo lệnh, pass/fail/skip. Kiểm tra `git diff --check`; nếu không thể chạy browser E2E hoặc các kiểm tra theo `AGENTS.md`, ghi rõ trong draft PR, không tuyên bố sẵn sàng merge.

**Đạt:** sau dịch, reload và đổi ngôn ngữ vẫn lấy đúng đề gốc; metadata tồn tại qua đọc lại; lỗi provider không phá dữ liệu; regression cho trường hợp bài chỉ có `statement.md` và các trường hợp Việt/Anh liên quan. Bàn giao base/head SHA, diff, link draft PR hoặc blocker, kết quả kiểm tra và rủi ro.

## W1 — nguồn gốc và độ tin cậy của biến thể AI

**Vì sao:** `frontend/src/features/synthesizer.js` gọi `api.createProblem` để tạo biến thể mà không gửi `origin`; `backend/src/problemStore.js` mặc định `user-authored`. Đã tái hiện với browser và AI mock local: biến thể ghi `user-authored`, `derivedFrom` rỗng, một sample khớp đề được thêm là trusted; chương trình chỉ in đáp án sample nhận AC 1/1. AC đúng với bộ test chỉ có sample, nhưng không chứng minh lời giải đúng toàn bài. `backend/src/routes/ai.js` `/process` và `backend/src/oracleTrust.js` phân biệt `ai-generated` khi xét sample.

**Làm:**

1. Đọc đường từ nút tạo → payload API → metadata lưu/đọc → `/process`/thêm test → oracle receipt → tập test Judge. Tái hiện điều kiện thực sự bằng fixture tổng hợp, mock AI, không gọi provider thật. Nếu kết quả khác giả thuyết, báo nguyên nhân và không ép sửa.
2. Trên đúng đường synth, ghi `origin: "ai-generated"` và `derivedFrom` theo contract đang có, tham chiếu đúng id/tên bài gốc. Xác nhận qua store, không chỉ kiểm tra object trước khi gửi. Không thay đổi các luồng tạo bài khác hoặc tự migrate dữ liệu lịch sử.
3. Đảm bảo sample của biến thể AI không tự thành trusted chỉ vì trùng statement; kể cả sample cũ được ghép vào đề mới. Non-AI sample và explicit review vẫn theo Truth Core. Không đổi trust dựa trên flag client hay xóa receipt hợp lệ.
4. Khi người dùng tạo/xem biến thể, hiện rõ nguồn AI và test cần được xem xét; không nói AI xác minh được hidden tests. Giữ UI thay đổi gọn.
5. Thêm regression hành vi cho metadata và trust boundary, có control non-AI; chạy những kiểm tra an toàn có thể. Khi không có E2E/containment, draft PR phải ghi gate chưa hoàn tất và cách kiểm tra trực tiếp.

**Đạt:** test/fixture cho thấy metadata, provenance và trust đúng qua đường thực tế; không hồi quy luồng non-AI; báo đủ phần chưa chạy. Nếu lỗi đòi hỏi sửa sâu hơn, dừng phạm vi patch, báo riêng.

## W2 — trạng thái OJ không gây hiểu nhầm

**Đọc:** `frontend/src/statement.js`, `frontend/src/editor.js`, `frontend/src/problems.js`, `backend/src/judgeState.js`, Truth Core. Đã tái hiện: sau AC rồi sửa code và reload, editor báo `STALE` nhưng statement brief vẫn hiện “Đã giải”. Không suy rộng thành mọi màn đều sai.

**Làm:** tạo tình huống tổng hợp từng AC rồi thay input hoặc chưa lưu; xác định projection chính xác. Sửa nhãn ở phần bị ảnh hưởng: AC hiện tại, cần Judge lại, và từng AC trong quá khứ phải khác nhau; giữ lịch sử. Bao phủ current AC, stale, dirty, chưa từng AC và reload bằng regression phù hợp. Không thay đổi luật Judge, không coi AC lịch sử là current. Nếu browser E2E chưa chạy, PR ghi rõ và chuyển ca xác nhận cho D2 trong file trực tiếp.

## W3 — kho bài: một flow dễ tìm và bắt đầu

**Đọc:** `frontend/src/problems.js`, `frontend/src/core/search-model.js`, `frontend/src/main.js`, `frontend/index.html`, các styles liên quan và route search/catalog. Trước khi thiết kế lại, phân biệt chỗ nào đang hoạt động thật với mô hình local.

**Làm:** chọn một cải tiến nhỏ có thể kiểm chứng: list/search/filter, empty/loading/error, hoặc link mở đề; bảo đảm tên bài, nguồn, chủ đề, khó dễ và trạng thái hiển thị đúng dữ liệu có sẵn. Không bịa rating hay số bài. Giữ keyboard/accessibility và layout hẹp ở mức có thể đánh giá qua code. Một PR = một cải tiến; browser/mobile thật là D2, không tuyên bố đã kiểm tra giao diện nếu chưa xem app.

**Đạt:** fixture/hành vi chứng minh thay đổi; giữ các filter khác; không phát minh backend/search mới. Bàn giao ảnh trước/sau chỉ khi có browser hợp lệ.

## W4 — flow tạo đề: trạng thái draft và review rõ ràng

**Phụ thuộc:** W1 và quyết định nguồn tại D3. Đọc `/api/ai/process`, `/synthesize`, luồng personalized, `frontend/src/statement.js`, `frontend/src/features/synthesizer.js`, `docs/TestGeneration.md`.

**Làm:** trước tiên lập mapping thực tế của một flow cụ thể: chọn/dán nguồn → gửi AI → xem kết quả → lưu draft → người có quyền review. Sau khi xác định contract có thể sửa cục bộ, implement một lát cắt nhỏ giúp người dùng thấy trạng thái đang tạo/thành công/lỗi/đề AI chưa xác minh và tránh submit trùng. Dùng mock provider; không tự public đề, không auto-trust AI tests, không làm crawler đại trà, không giả định link nguồn = quyền sao chép.

**Đạt:** UX có thông báo lỗi/cancel và không đánh đồng draft với bài chấm chính thức; test hành vi chứng minh. Nếu hiện chưa có backend phân quyền/draft, ghi rõ UI chỉ là bước chuẩn bị, không tuyên bố đã có draft an toàn đa user.

## W5 — hợp đồng submission và dữ liệu để thiết kế web

**Phụ thuộc:** D4 chọn thiết kế; task này chỉ được làm khi owner gọi W5 như task riêng. Đọc `routes/judge.js`, `judgeService.js`, `judgeState.js`, `evidenceStore.js` và các API file/test. Đề xuất và implement từng lát cắt theo quyết định đã được duyệt: submission gồm user, problem/version, source snapshot, status queued/running/result, verdict/evidence; chỉ người có quyền xem source; hidden tests không trả client; idempotency và lỗi worker. Ưu tiên contract và test sử dụng store/worker giả lập trước.

Không chuyển local store sang SQL, thêm auth hoặc đổi runtime chỉ bởi task W5 nếu chưa có thiết kế và yêu cầu tương ứng. Kết quả mock không chứng minh multi-user isolation hay Judge thật. Tách PR theo schema/API/worker để review; migrations và xử lý data thật thuộc D4/D5.

## W6 — AI gateway ở mức ứng dụng, không lộ key

**Phụ thuộc:** D3/D4 và yêu cầu riêng W6. `settingsStore.js` lưu key/baseUrl dùng chung; `/api/settings/ai` cho sửa cấu hình; `ai.js` gửi key đến `baseUrl`. Các endpoint local này chưa có ranh giới public. Thiết kế/implement public API riêng có server-controlled provider/model, auth và quota theo user, giới hạn input/output/concurrency, timeout/cancel, error sạch, ID yêu cầu và cơ chế ngắt khẩn cấp. Không cho user tùy ý đổi baseUrl chứa key chủ web; kiểm tra SSRF/redirect và log redaction theo thiết kế. Mock provider và hai user trong tests.

**Đạt:** không có key trong frontend/response/log; user không thay cấu hình provider chung; quota thực thi phía server; thử lỗi/rate limit bằng mock. Đây chưa chứng minh an toàn khi public nếu D5/D6 chưa hoàn tất.

## W7 — chuẩn bị chất lượng nội dung

Sau D3, thiết kế công cụ/fixture cho một số bài tự viết hoặc có quyền sử dụng: statement, input/output, sample, constraints, reference và hidden tests đã review; phân biệt public sample với private tests, ghi nguồn/version/quyền. Làm một bài mẫu tổng hợp để chứng minh contract; không copy bulk từ OJ, không commit hidden test thực hoặc nguồn có quyền chưa rõ vào repo public. Nội dung AI chưa được review giữ trạng thái draft.

## W8 — quality, CI và bàn giao

Đánh giá CI hiện chỉ `node scripts/verify-repository.cjs`; đề xuất thêm các kiểm tra targeted có thể chạy an toàn trên runner đã xem xét, tuyệt đối không quảng cáo static pass là Judge/E2E/security pass. Với PR được owner giao riêng: bổ sung test phù hợp và tài liệu lệnh, pin quyền workflow tối thiểu, không cấp secret cho code chưa tin. Ghi matrix pass/fail/skip, môi trường, phạm vi và gate còn ở D2/D5.

## Mẫu báo cáo sau mỗi task

1. Base/head SHA, đường dẫn PR hoặc lý do chưa push; các file thay đổi.
2. Triệu chứng đã tái hiện, nguyên nhân, thay đổi; điều gì là giả thuyết.
3. Lệnh kiểm tra, môi trường, pass/fail/skip và bằng chứng thực tế; browser/compiler nào chưa chạy.
4. Rủi ro, giới hạn, rollback bằng revert và điều kiện để người dùng review/merge; đề xuất task tiếp theo.

Nguồn tham khảo: [OWASP API4 về giới hạn tài nguyên](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/), [Judge0](https://github.com/judge0/judge0), [thảo luận QA về AI tests](https://www.reddit.com/r/QualityAssurance/comments/1jil8pw/have_you_used_aigenerated_test_cases_how_was_your/). Đây là nguồn tham khảo, không phải bằng chứng repo đã triển khai các kiểm soát đó.
