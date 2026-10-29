# P1 trực tiếp — bàn giao 30/10/2026

**Trạng thái:** phần W2/W9/W12 và P0 EPIPE được chuẩn bị để commit trên một nhánh riêng dựa trên head `b7043630692bd89a0120da6e80fd41b5cc8944ae` của PR #18. PR #18 đã có implementation và regression tests W1 đầy đủ hơn bản W1 local ban đầu; commit này kế thừa W1 từ PR #18 và không thay thế các file W1 đó. PR #18 dựa trên PR #3; W0 P0 ở worktree khác, không có trong nhánh này. Đây vẫn là patch thử nghiệm, chưa qua gate tích hợp/public.

**Đối chiếu nhánh:** checkout gốc của lượt triển khai là PR #2 `962f209095cb2c1be3257033b292e143a07224e5` (detached). Khi chuẩn bị commit, phát hiện nhánh `fix/w1-synth-provenance` và PR #18 đã có trên GitHub. Phần synth local cũ và test trùng tên được giữ ngoài commit; `frontend/src/statement.js` vẫn giữ cảnh báo đề AI/test của W1 cùng nhãn trạng thái Truth Core W2.

**Kiểm thử cho commit follow-up:** lượt commit này không chạy test lại. Số 65/65 ở dưới thuộc bản ghép tạm trước khi phát hiện nhánh PR #18; không được hiểu là kết quả test trên head cuối của nhánh GitHub.

## Kết quả

- **W1 — provenance:** được kế thừa từ PR #18 `fix(W1): preserve AI variant provenance and candidate tests`, head `b7043630692bd89a0120da6e80fd41b5cc8944ae`. Bản local ban đầu không được chép đè lên implementation/test của PR #18. PR đó ghi lại bằng chứng test riêng; mô tả không coi đề/test AI là oracle đã tin cậy.
- **W2 — brief:** trước sửa, browser cho thấy STALE ở editor nhưng brief ghi Đã giải. Sau sửa, brief phân biệt AC hiện tại, code chưa lưu, stale và AC lịch sử; cập nhật khi metadata hoặc dirty state đổi. Đã xem browser ca stale sau reload; các trạng thái còn lại được kiểm tra bằng test logic, chưa có browser E2E đầy đủ.
- **W12 — lọc:** trước sửa, fixture cho thấy filter Đã giải trả ba bài status thủ công `solved` dù stale/chưa chấm, và bỏ bài current AC đang `learning`. Sau sửa, filter dùng `truth.derivedStatus === verified`, giống bộ đếm. Đường tìm kiếm bỏ status `solved` khỏi query backend vì backend hiểu đó là status thủ công; lọc theo truth ở client, dùng projection từ danh sách hiện tại. Browser: một bài synthetic được Judge AC thật 1/1; filter local và search server đều hiện 1/2 và 1 AC; sau sửa code, 0/2 và 0 AC. Các lựa chọn Đang học/Cần ôn vẫn là trạng thái học thủ công.
- **W9 — dịch UI:** response sai schema/rỗng, lỗi 429/5xx dừng sau tối đa ba lần với backoff 500ms/1000ms; NO_KEY dừng ngay. Đổi ngôn ngữ/lưu cài đặt abort request cũ, reset giới hạn; có thể thử lại. Test dùng đồng hồ giả và provider mock; browser mock response `{}` quan sát đúng ba request rồi dừng, đổi tab không phát sinh request. Chưa thử provider thật.

## Kiểm chứng

- Node 24.22.1, g++ 13.3, bubblewrap 0.9.0. Preflight xác nhận source và dependencies chỉ đọc, user data tổng hợp `/work/...` riêng, không có home credentials, network namespace riêng. Giới hạn process được áp dụng. Cách ly này không chứng minh an toàn để public.
- Tái hiện: W1 0/2 pass (thiếu origin, sai bài nguồn), W12 8/9 pass (sai filter), W9 0/1 pass (10 request thay vì 3). W2 được tái hiện bằng browser; test mới ban đầu fail vì helper chưa tồn tại. Một lượt W1 sau sửa fail do test mong chữ `review` trong khi UI viết `xem xét`; đã sửa assertion, không tính đó là bug sản phẩm.
- Chạy nhóm P1 trên checkout: 36/36 đạt trước khi bổ sung W9; W9 3/3 đạt. Trên bản ghép tạm tạo từ head #17 `cb391716bdf7237f44e8d126d9e8f3b743148c36` + diff W0 P0 + diff P1 + patch EPIPE: 65/65 đạt, 0 fail/skip. Việc áp patch tạm không phải merge hoặc commit và chưa chứng minh mọi conflict/gate sau này.
- Lệnh trong sandbox: `/node --test frontend/test/synthesizer-provenance.test.mjs frontend/test/search-model.test.mjs frontend/test/statement-truth-status.test.mjs frontend/test/ui-translation-retry.test.mjs frontend/test/statement-language-runtime.test.mjs backend/test/run-cpp-stdin.test.js backend/test/trust-layer.test.js backend/test/statement-samples.test.js backend/test/truth-model.test.js`; `/node` là Node 24 bind read-only, `/src` là bản ghép read-only, `/deps` là dependencies read-only và user data là `/work/combined-data`. Browser đi qua proxy localhost tới Unix socket backend trong sandbox; AI được giả lập, không dùng key thật. Các tiến trình do lượt này tạo đã dừng.
- Evidence tạm: `/tmp/usaco-p1-nepPmuPo/evidence/` gồm `red.tap`, `search-red.tap`, `status-red.tap`, `retry-red.tap`, `p1-final.tap`, `retry-final.tap`, `combined-final.tap`. Có thể mất khi hệ thống dọn `/tmp`; không đưa dữ liệu runtime thô vào Git.
- Không chạy full suite, provider thật, full browser E2E với profile mới, Stop/import, các gate P0 còn thiếu hoặc staging đa user. Chưa kiểm tra sau ghép patch bằng browser. Các mẫu trên chỉ chứng minh các tình huống đã nêu.

## Manifest của patch local ban đầu

SHA-256 `trước → sau` dưới đây tính so với checkout PR #2; file mới không có hash trước. Đây là snapshot patch local ban đầu, không phải complete diff của nhánh GitHub mới. Trong commit dựa trên PR #18, phần W1 ở `frontend/src/features/synthesizer.js` và `frontend/test/synthesizer-provenance.test.mjs` được lấy từ PR #18. Patch P0 `backend/src/runCpp.js` và `backend/test/run-cpp-stdin.test.js` được đưa cùng commit theo yêu cầu commit hiện tại; chúng không phải sửa mới của W2/W9/W12.

| File | Trước | Sau |
| --- | --- | --- |
| `frontend/index.html` | `9fe0a653a7dba59337c6f4cc0af4565be05df63b3c383a9d50f4b218127d8ce9` | `a48be0b0da5ceb41b67d44c6f1af254cae2b73a8c15e6f82abfe7fe74fcd7028` |
| `frontend/src/core/search-model.js` | `67a75004a32f2ae752096723279880ddd889d188e92d4f32bfa53a12c5cc3503` | `578b7b98719d40c42fba3d0271ba793a92453ea58766f11c21b26a7aaa60a7c7` |
| `frontend/src/editor.js` | `0aa74b84b721caf1f3047357a44bb640ea6cccdd6ca811d80a7bfc7af294964e` | `9311e1f31d6441a1015d5e107fef1840eadf8215c30b9eae4bcbf8405a3ed089` |
| `frontend/src/features/synthesizer.js` | `61137726b0ae1fa2136200e13a7739debaf6e17f0293025b02fe5d7996bf344a` | `d445dd1cb0b092fc0b4ca82bd27981ab64db5f99d4cdc87cf56bafe50d92672a` |
| `frontend/src/i18n.js` | `7844abe53e3d26f48fd1da89eb022bd1f6aa1d7143272d468d162dbffa70e148` | `121a36e8c75c461163e48e13cdf9ccaf64970347a96d10a4d6ce70bee300ecb9` |
| `frontend/src/problems.js` | `3ee51eb00b6215be3c91beddccebd2825e3580b03d9ae3b18c5397ba0d043c08` | `614fbb82bbd33ab2bbf6c458b702e98f657b85350d24b64b7cb951e418224f94` |
| `frontend/src/statement.js` | `edce5afc5eead3e9e809420fea9bbe7c6672368a1f22b498f1470251c8a39e48` | `5a0b72615f87623b6cf861e8dc4a1b89486e60fc8ead87ce2553212cf8d4c37e` |
| `frontend/test/search-model.test.mjs` | `c1923c4efa65245bd0762a0c3231a02aff1970525014d5f7b8ecbae00586c636` | `62418fe0c9f1154941fad5ac853b696ca549e9c4f71d59da964b11b2839d3660` |
| `frontend/test/synthesizer-provenance.test.mjs` | mới | `bee91298d3d9dc4a2600c84b8acb962ba6c346797f664e28a3cbc5a86d2cb93f` |
| `frontend/test/statement-truth-status.test.mjs` | mới | `ff9071c2b51ab6209e4e09cf31ff25ec5c9797ec369f9eba4944cead9861947a` |
| `frontend/test/ui-translation-retry.test.mjs` | mới | `e6570322ee803ac5d203ec2ac60a942e7d88f5fcfa97e76a8357736027fa2e92` |

## Rủi ro, rollback và tiếp theo

## Manifest thực của commit follow-up

SHA-256 `trước → sau` so với head PR #18 `b7043630692bd89a0120da6e80fd41b5cc8944ae`. File báo cáo này tự loại khỏi bảng vì nội dung không thể chứa hash cuối của chính nó.

| File | Trước | Sau |
| --- | --- | --- |
| `backend/src/runCpp.js` | `408f8dd838726ba3df43526fe978e892bd85c30ad002df6a5196891f27877d9f` | `9326dcb0b30e2d5e0c53a6bae1f5c6998b989573f6755547d3fc78ddbfb4e9d7` |
| `backend/test/run-cpp-stdin.test.js` | mới | `d3177a668367c2b520c03f57f4733ae4d2baa5641e68a5a0e087eaf8dec1a7f0` |
| `frontend/index.html` | `9fe0a653a7dba59337c6f4cc0af4565be05df63b3c383a9d50f4b218127d8ce9` | `a48be0b0da5ceb41b67d44c6f1af254cae2b73a8c15e6f82abfe7fe74fcd7028` |
| `frontend/src/core/search-model.js` | `67a75004a32f2ae752096723279880ddd889d188e92d4f32bfa53a12c5cc3503` | `578b7b98719d40c42fba3d0271ba793a92453ea58766f11c21b26a7aaa60a7c7` |
| `frontend/src/editor.js` | `0aa74b84b721caf1f3047357a44bb640ea6cccdd6ca811d80a7bfc7af294964e` | `9311e1f31d6441a1015d5e107fef1840eadf8215c30b9eae4bcbf8405a3ed089` |
| `frontend/src/i18n.js` | `7844abe53e3d26f48fd1da89eb022bd1f6aa1d7143272d468d162dbffa70e148` | `121a36e8c75c461163e48e13cdf9ccaf64970347a96d10a4d6ce70bee300ecb9` |
| `frontend/src/problems.js` | `3ee51eb00b6215be3c91beddccebd2825e3580b03d9ae3b18c5397ba0d043c08` | `614fbb82bbd33ab2bbf6c458b702e98f657b85350d24b64b7cb951e418224f94` |
| `frontend/src/statement.js` | `02f35837cd3872e118ecfef09908883048555b75d9be0cd275fd5662007f3264` | `35f9355171337770400bae7c20825649ad30c2b452ed5df1f983cef30e293c52` |
| `frontend/test/search-model.test.mjs` | `c1923c4efa65245bd0762a0c3231a02aff1970525014d5f7b8ecbae00586c636` | `62418fe0c9f1154941fad5ac853b696ca549e9c4f71d59da964b11b2839d3660` |
| `frontend/test/statement-truth-status.test.mjs` | mới | `ff9071c2b51ab6209e4e09cf31ff25ec5c9797ec369f9eba4944cead9861947a` |
| `frontend/test/ui-translation-retry.test.mjs` | mới | `e6570322ee803ac5d203ec2ac60a942e7d88f5fcfa97e76a8357736027fa2e92` |

`BAO_CAO_P1_TRUC_TIEP.md` là file mới thứ 12 trong commit; commit chứa 12 file tổng cộng.

- P1 và W0 P0 cùng sửa `i18n.js`/`statement.js`; bản ghép tạm test được nhưng cần review và E2E trên phiên bản tích hợp thật. Không tự migrate hoặc sửa metadata của các biến thể AI đã tạo trước patch; chúng vẫn có thể bị gắn nhãn sai và cần xử lý riêng sau khi kiểm kê.
- UI local và kiểm soát retry chưa tạo auth/quota public. Judge hiện không an toàn để phơi Internet; cần các phase thiết kế web, sandbox, data ownership, hidden tests, AI budget, staging và owner duyệt.
- Rollback: revert commit nhánh follow-up tương ứng, không reset/force-push hay tự xóa dữ liệu. Không đưa W0 hoặc deploy/public trong commit này.
- Tiếp theo: review độc lập từng diff, hoàn thành gate P0/P1 trên bản ghép cùng head mới nhất, xác nhận E2E fresh profile/Stop/import và PR #4; sau đó quyết định thứ tự tích hợp. Tiếp tục P2 chỉ khi nhận diện rõ các blocker còn mở.
