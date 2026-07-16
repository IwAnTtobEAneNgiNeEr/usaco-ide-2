# Verified Artifact Loop

Deprecated — xem README-CPLUSPLUS-PLAN.md.

> **BFS vertical slice: implemented and release-gated (2026-07-16).** Competitive Judge evidence, deterministic supported/unsupported BFS trace, editable derived `GridPathfinder`, requirement-change Work loop, legacy compatibility, and original `main.cpp` preservation are covered by canonical tests. No broader algorithm/runtime support is implied.

> **Trạng thái: đề xuất để chủ dự án duyệt.** Khi được duyệt, file này là luật cho mọi thay đổi liên quan flow sản phẩm mới. Nó không thay thế các ràng buộc local-first, an toàn chạy C++ và tính trung thực dữ liệu hiện có.

## 1. North Star

**Đưa một đề bài hoặc yêu cầu vào, biến nó thành code được kiểm chứng, rồi giúp người dùng dùng chính artifact đó để sửa, hiểu, luyện hoặc phát triển tiếp.**

## 2. Product thesis

Người dùng chỉ nhìn thấy hai hướng công việc:

| Hướng | Việc cần hoàn thành | Không phải |
|---|---|---|
| **Luyện thi** | Giải một đề trong giới hạn, Judge xác minh solution. | Một thư viện tag hay một session được gọi tùy tiện là contest. |
| **Thuật toán & ứng dụng** | Biến một thuật toán/requirement thành module, checks xác minh behavior. | Một tab “Build” độc lập hay một framework fullstack. |

Hai hướng dùng cùng vòng đời. Explore, trace, explain, Coach và visualizer là **capability theo ngữ cảnh**, không là track hay destination thứ ba.

`Brief → Work → Verify → Feedback → Evolve`

Fullstack chỉ là hướng tương thích sau này: artifact có thể trở thành project và verifier có thể mở rộng từ unit test sang integration/E2E/deploy check. Không xây adapter, workspace hay runtime fullstack ở V1.

## 3. Canonical loop

| State | Input bắt buộc | User action | Evidence tạo ra | Next action hợp lệ |
|---|---|---|---|---|
| **Brief** | Đề/requirement, nguồn gốc, constraints hoặc acceptance criteria. | Chọn, import, viết hoặc sửa brief. | Brief đã lưu; provenance nếu AI/OCR/import. | Mở Work; không được tuyên bố đã học/đã thắng. |
| **Work** | Brief và artifact hiện hành. | Viết code, input, test, module hoặc ghi chú thiết kế. | Draft/snapshot cục bộ; chưa là completion. | Run, Judge, test, stress, trace theo loại work. |
| **Verify** | Artifact + checks xác định. | Run/Judge/test/stress. | Run record: code snapshot/hash, input/test/seed, verdict, output/diff, thời gian. | Feedback nếu fail; Complete hoặc Evolve nếu pass. |
| **Feedback** | Evidence của một verify cụ thể. | Sửa code, mở đúng dòng, thêm test, xem trace, hỏi Coach. | Diagnosis/trace/review phải trỏ evidence gốc và mang provenance/confidence. | Trở lại Work hoặc Verify; không tự tạo mastery. |
| **Evolve** | Artifact đã pass và ý định rõ (luyện tiếp, hiểu, tái sử dụng, đổi requirement). | Mở bài/contest tiếp, phân tích, hoặc tạo derived artifact. | `derivedFrom`, checks mới, requirement change hoặc transition decision. | Brief/Work của artifact tiếp theo. |

Một feature không có state kích hoạt, input evidence, action, output evidence và đường quay lại loop là feature chưa hợp lệ để phát triển.

## 4. Artifact contract V1

Không dựng framework tổng quát. Mỗi problem folder hiện có vẫn là đơn vị lưu trữ local-first. Chỉ thêm field/file khi một consumer trong loop dùng nó.

```text
brief          statement hoặc requirement; provenance
artifact/code  solution.cpp hoặc module source; snapshot/hash khi verify
checks         tests, judge config, seed/stress plan, acceptance criteria
runs           lịch sử Run/Judge/Test có verdict
evidence       input/output/diff/trace/diagnosis gắn với một run
derivedFrom    id + snapshot/run đã pass của artifact gốc (nếu có)
nextAction     state nhỏ, có lý do và expiry; không là progress vĩnh viễn
```

Mở rộng theo kiểu additive: `meta.json` nhận field tùy chọn; `evidence/`, `derived/` hoặc `modules/` là thư mục mới trong folder bài; history cũ vẫn đọc được. Không đổi id, không nhân đôi verdict/status/history, không để một consumer ghi completion trực tiếp.

`status` là view derive từ history/verifier, không phải nguồn sự thật cạnh tranh. Derived artifact luôn giữ link đến code và run gốc; tuyệt đối không ghi đè solution OJ.

## 5. Track contracts

| Contract | Luyện thi | Thuật toán & ứng dụng |
|---|---|---|
| Artifact | Solution cho đề có constraints. | Module/API cho requirement nhỏ. |
| Verifier | Judge trên bộ test; Run chỉ là khám phá. Stress là bằng chứng bổ sung. | Unit/behavior tests và requirement change; trace chỉ là quan sát. |
| Completion | Một Judge hoàn chỉnh pass bộ checks đã biết. Không suy ra solved/rated fresh từ AC cũ. | Checks pass cho requirement hiện hành; requirement mới mở vòng mới, không phủ nhận lịch sử cũ. |
| Feedback | Verdict, failing input/diff, CE/RE/TLE evidence; Moment/Coach đúng lúc. | Failing test, trace deterministic, invariant/counterexample nếu có. |
| Transition | Bài tiếp, contest, review, hoặc hiểu sâu khi user chọn. | Refactor, edge case, requirement change, hoặc module khác dùng lại. |

Đường tương thích fullstack về sau: `brief` có thể là issue/spec, `artifact` là project nhiều file, `checks` là unit/integration/E2E/deploy. Chỉ được mở khi V1 chứng minh contract trên, không phải trước.

## 6. Placement rules for existing features

| Feature | Vai trò hợp lệ | Phân loại | Giới hạn hiện tại |
|---|---|---|---|
| Library / Search | Tìm hoặc mở Brief/artifact đã biết. | core tool | Không là taxonomy explorer hay dashboard. |
| Import / OCR | Tạo Brief có origin/provenance. | core tool | AI/OCR phải đánh dấu confidence, không tự phong dữ liệu chuẩn. |
| Editor | Work trên artifact. | core tool | Không tự tạo completion. |
| Run / Judge / Tests | Verify. | core tool | Judge là nguồn verdict; Run không là thắng. |
| Stress Lab | Verify bổ sung, tìm failure tái lập. | contextual capability | Không thay Judge, không chạy chỉ để lấy điểm. |
| Moment / Coach | Feedback dựa evidence thật. | contextual capability | Không auto-AI khi Run nháp; không nói chắc hơn evidence. |
| Visualizer | Quan sát behavior/trace trong Work hoặc Feedback. | contextual capability | Không là màn hình độc lập, không bịa trace. |
| Game Review / History | Đọc lại run/evidence đã tồn tại. | derived information | Không tạo rating/mastery/completion. |
| Skill Map / Journey | Chỉ dẫn entry/continue dựa dữ liệu thật. | derived information / optional destination | Home chỉ có một next action; không thành feature gallery. |
| Contest | Một Brief bundle có luật, deadline/intent rõ. | optional destination | Không gọi mọi session là contest; generator không tự là recommender chính. |
| Arena | Lớp challenge/rating trên fresh verified attempt. | optional destination | Không phát triển reward/card/currency trước khi fresh-attempt contract rõ. |
| Flash Quiz | Recall từ evidence lỗi thật. | contextual capability | Không tự mở một “vũ trụ quiz”; freeze nếu không quay lại Work/Verify. |

**Freeze ngay khi lập kế hoạch, không xóa code:** mở rộng Arena, Next Bet, card/rush/season; thêm quiz; mở rộng contest generation; bulk taxonomy; và dashboard mới. Lý do: chưa chứng minh chúng làm next action tốt hơn trong loop.

## 7. CTA policy

Mỗi state/surface có **một** CTA chính. Tối đa hai secondary actions có nhãn giải thích; tool không liên quan ẩn đi.

- WA/RE/TLE: CTA chính quay về editor tới evidence hoặc thao tác sửa phù hợp; Coach/trace là secondary theo evidence.
- CE: CTA chính là mở lỗi biên dịch/đi đúng dòng.
- AC: CTA chính phụ thuộc track và intent đang chọn: tiếp tục plan luyện thi **hoặc** hoàn thành requirement/module hiện hành. “Phân tích code này” và “Biến thành module” là secondary, không được ngang hàng mặc định.
- Không có intent/evidence: CTA chính là tiếp tục Work hiện tại, không random challenge.

## 8. Evidence and honesty

1. Không evidence thì không mastery, skill progress, completion hay “học được”.
2. Không fresh challenge (artifact mới hoặc attempt mới với eligibility rõ) thì không rated win. AC lịch sử chỉ là evidence quá khứ.
3. Mọi AI metadata/test/diagnosis ghi `origin`, model/tool, input basis, confidence và trạng thái verified. AI không được biến hypothesis thành fact.
4. Review, Moment, trace và Coach phải link lại code snapshot, input/test/seed và verdict thật mà chúng đang nói tới.
5. Completion chỉ derive từ verifier của track; UI không được ghi tùy tiện vào `status` như một source of truth mới.
6. Một test AI-generated chưa verified không thể làm nền cho rating hay mastery.

## 9. Content and naming minimum

Chỉ chuẩn hóa các field có consumer: `provider`, `collection`, `origin`, `activityKind`, `concept`, `difficulty/rating`, `derivedStatus`, `externalId/url`, `quality/provenance`.

- `provider`: nơi phát hành hoặc `local`/`user`/`ai`.
- `collection`: series/course/contest có tên ổn định, không là source tự do lẫn mục đích.
- `origin`: imported, OCR, user-authored, AI-generated, derived.
- `activityKind`: competitive-problem, algorithm-module, exercise, contest-item.
- `concept`: ít concept dùng để tìm/transition; không xây ontology lớn.

`topic`, tags và source cũ được đọc tương thích; không migrate hàng loạt trước khi BFS slice có consumer thực.

## 10. Search and recommendation

**Search** phục vụ intent đã biết: tên, provider/collection, concept, difficulty/rating, trạng thái, loại activity. Kết quả phải cho biết vì sao nó khớp và mở thẳng Brief/artifact.

**Recommendation** không là chủ sản phẩm và chỉ xuất hiện ở ba chỗ:

| Policy | Khi nào | Output |
|---|---|---|
| Entry | Người dùng chưa có work hiện tại. | 2–3 lựa chọn có lý do, hoặc Search. |
| Feedback | Sau fail evidence rõ. | Một hành động sửa/kiểm tra, không bài random. |
| Transition | Sau pass/complete. | Một CTA chính theo track/intent, tối đa hai alternate. |

Recommendation phải nói dữ liệu/lý do, cho bỏ qua, và không lặp lại topic chỉ vì recent history nếu mục tiêu/coverage không ủng hộ.

## 11. Non-goals

Không implement trong đợt này: fullstack workspace; Java/JUnit; deployment; universal adapter engine; gacha/reward/currency; large taxonomy migration; redesign toàn app; cloud, accounts hoặc telemetry. Không tạo ba tab Solve/Explore/Build và không thêm destination Explore.

## 12. Falsification

Hướng này thất bại hoặc phải rework nếu vertical slice cho thấy một trong các điều sau:

- Trace/explain đặt đúng ngữ cảnh nhưng không giúp quay lại Work/Verify hoặc không được dùng.
- GridPathfinder không hữu ích hơn solution OJ và user không tiếp tục artifact dẫn xuất.
- Thêm flow làm tăng click/thời gian mà không cải thiện debugging, completion hoặc evidence quality.
- `derivedFrom` chỉ được nhìn, không được mở/so sánh/dùng để tiếp tục.
- Feature count tăng nhưng người dùng vẫn không biết CTA tiếp theo.
- Dữ liệu cũ tạo fake win, fake mastery hoặc rating không có fresh evidence.

## 13. Conflict order

Sau khi chủ dự án duyệt file này: **Security/local-first correctness → Verified Artifact Loop → README-LOOPS/README-AUTOPILOT → roadmap/task board → UI copy**.

README-LOOPS và README-AUTOPILOT vẫn giữ các luật hợp lệ về evidence, pure-core, recorder, Moment và một CTA; phần nào định nghĩa North Star chỉ là CP coach, coi mọi feature là “thăng chức” vào game loop, hoặc mặc định Planner/Flash Quiz/Arena là đích phát triển phải nhường file này. Mọi conflict chưa được chủ dự án duyệt phải dừng thay vì tự hòa giải bằng code.
