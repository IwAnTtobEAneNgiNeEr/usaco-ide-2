# Bắt đầu: làm việc với agent

Đây là bảng chỉ đường cho chủ dự án và agent. [AGENTS.md](../../AGENTS.md) là chỉ dẫn dự án; tình trạng trong các file dưới đây là ảnh chụp có ngày, không cấp quyền và có thể cũ. GitHub Issues/PR và checkout thực tế là nơi kiểm tra trạng thái hiện tại.

## Chủ dự án chỉ cần giao việc

Mở thư mục dự án trên **nhánh có file này**, tạo một cuộc trò chuyện mới, rồi nói:

> Đọc AGENTS.md và docs/agent-work/START.md. Kiểm tra tình hình thực tế, rồi thực hiện [mục tiêu]. Tự chia việc, sửa, kiểm tra, sửa lỗi và commit cục bộ các thay đổi thuộc task; cập nhật kế hoạch/bàn giao khi cần. Báo ngắn kết quả, SHA, điều chưa kiểm chứng và bước tiếp theo. Chỉ thực hiện hành động từ xa theo quyền đã được tôi cấp.

Agent phải kiểm tra base và phần việc có sẵn trước khi sửa. Không cần bạn tự viết kế hoạch chi tiết. Nếu bạn muốn **chỉ nghiên cứu**, nói rõ “chỉ đọc, không sửa/commit”. Các việc cần quyết định sản phẩm hoặc quyền cụ thể vẫn phải được nêu rõ; agent tiếp tục phần độc lập có thể làm an toàn.

## Kiểm kê nhanh

```sh
node scripts/agent-status.cjs
```

Lệnh này kiểm tra trạng thái Git **trên máy hiện tại**: branch/SHA, số file staged, unstaged, untracked, trạng thái detached và số stash của các worktree. `--json` dành cho máy; `--details` hiện đường dẫn/tên file để tự kiểm tra, nên cần rà lại trước khi chia sẻ. Trạng thái không đọc được là **UNKNOWN**, không phải sạch. Các số staged/unstaged có thể cùng tính một file. Git có thể đọc file để tính trạng thái; công cụ không in nội dung file và không chủ động add, commit, fetch, push, xóa hay đổi cấu hình Git.

Lệnh không liệt kê file bị ignore, không chứng minh không có secret, không xác minh quyền hay trạng thái GitHub hiện tại và không thay thế kiểm tra file thuộc task. Kiểm tra remote/PR theo task khi có kết nối; không suy ra push thành công từ commit local. Không dùng công cụ này làm sandbox.

## Nơi lưu thông tin

- [Mẫu task và bàn giao](TASK-TEMPLATE.md): dùng cho việc nhiều bước, có phụ thuộc, nghiên cứu hoặc cần qua nhiều phiên. Việc nhỏ chỉ cần bàn giao ngắn trong kết quả/PR.
- [Bản đồ tính năng và kiểm chứng](feature-map.md): các luồng quan trọng, code liên quan và giới hạn bằng chứng trên base được ghi trong file.
- [Nghiên cứu workflow 2026-11-02](research-2026-11-02.md): nguồn gốc, giới hạn và lý do chọn cách làm.
- [Task chuẩn hóa workflow 2026-11-02](workflow-2026-11-02.md): phạm vi thực hiện và các việc còn mở tại thời điểm khảo sát.
- [Kế hoạch beta trực tiếp](../../TRUC_TIEP_PUBLIC.md) và [task giao từ điện thoại](../../WORK_DIEN_THOAI.md): bối cảnh sản phẩm trên nhánh chứa chúng; không tự triển khai toàn bộ chỉ vì đã đọc.
- [Định hướng nghiên cứu NCKH](../NCKH.md): bối cảnh nghiên cứu C++ → Xưởng; kế hoạch beta mô tả phạm vi khác do owner giao. Giữ file nghiên cứu nguyên vẹn, đối chiếu yêu cầu hiện tại và nêu rõ nếu còn xung đột sản phẩm chưa được owner quyết định.

Tạo **một file theo task** khi cần, ví dụ `docs/agent-work/2026-11-03-history-browser.md`. Mỗi task tự cập nhật trạng thái và quyết định của mình; không ép các agent cùng ghi vào một sổ trạng thái chung. Khi task có issue/PR, liên kết thay vì chép lại toàn bộ. Đưa thay đổi kế hoạch cùng patch tương ứng vào nhánh của task, và ghi ngày/base để người sau kiểm tra lại. Không commit secret, dữ liệu thật, profile, log thô hay bằng chứng nhạy cảm.

## Ảnh chụp cần biết — 2026-11-02

- GitHub `main` khi khảo sát là `216e38d`, chưa có `AGENTS.md` của nhánh integration. [PR #2](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/2) còn draft; [#3](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/3), [#4](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/4), [#17](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/17), [#18](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/18), [#19](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/19) còn mở. Đừng giả định `main` đã nhận Truth Core hay các tài liệu này.
- Có thay đổi chưa commit trong worktree W0, P2 và một báo cáo chưa theo dõi; còn một stash. Không tự dọn, reset, pop stash hoặc gom phần việc của người khác.
- CI của nhánh integration lúc khảo sát chỉ kiểm tra tĩnh. [Issue #7](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/issues/7) theo dõi branch protection; [#8](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/issues/8) provenance; [#10](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/issues/10) History browser; [#11](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/issues/11) browser harness an toàn. Kiểm tra lại live trước khi tạo việc trùng.

Muốn bộ hướng dẫn hiện diện trên GitHub/default branch thì commit cục bộ chưa đủ: cần push, review và tích hợp theo quyền và gate hiện hành. Không tự coi draft PR hay CI xanh là đã merge hoặc đã kiểm chứng toàn bộ.

## Cập nhật GitHub — 2026-11-03

- [PR #21](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/21) đưa playbook vào nhánh của PR #3; [PR #20](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/20) là workflow này, còn [PR #22](https://github.com/IwAnTtobEAneNgiNeEr/usaco-ide-2/pull/22) cải tiến cấu hình Xưởng browser harness. Cả ba là draft; #20 và #22 dựa trên nhánh của #21, không phải `main`. Kiểm tra lại base, trạng thái và xung đột khi tích hợp.
- `main` đã bật bảo vệ áp dụng cả admin: yêu cầu PR, giải quyết các cuộc thảo luận, chặn force-push và xóa nhánh; số approval bắt buộc là 0. **Chưa có CI check bắt buộc**: workflow hiện trên `main` không tạo check `static` mới. Issue #7 chưa hoàn tất; sau khi workflow đích được tích hợp và kiểm chứng, chọn check bắt buộc, kiểm tra thực thi và ghi nhận kết quả. `integration` chưa được cấu hình bảo vệ trong task này.
- PR #22 có test cấu hình cục bộ, nhưng browser E2E thật còn chờ môi trường/browser có containment phù hợp; issue #11 chưa hoàn tất. Không coi test tĩnh hoặc test cấu hình là bằng chứng E2E.
