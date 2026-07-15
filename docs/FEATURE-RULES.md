# FEATURE-RULES.md — Luật chuẩn cho mọi tính năng (mới & cũ)

> **Trạng thái: CHỐT — file này là hợp đồng.** Bất kỳ tính năng mới nào (do người hay AI agent build) phải qua đủ §1→§8 trước khi merge. Tính năng cũ được "nâng mặt bằng" bằng cùng checklist (§9).
> Bản đồ đặt chỗ: [REDESIGN-IA.md](REDESIGN-IA.md) · Token/màu: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## §0. Triết lý sản phẩm (một đoạn, học thuộc)

USACO IDE là **công cụ làm việc** cho học sinh luyện thi tin học. Gameplay chính là vòng lặp *đề → test → judge → debug*; mọi thứ khác chỉ phục vụ vòng lặp đó. Chuẩn tham chiếu: **cơ chế của chess.com, bề mặt của Linear, giọng của một HLV giỏi**. Một tính năng tốt là tính năng *biến mất* khỏi tầm chú ý cho đến đúng lúc cần — không phải tính năng chiếm được nhiều pixel nhất.

---

## §1. Decision tree: tính năng mới sống ở đâu?

Trả lời lần lượt. Dừng ở câu đầu tiên trả lời "có".

1. **Nó có phải là việc-cần-làm-tiếp-theo của học sinh không?** (bài mới, nợ WA, ôn tới hạn)
   → Nó là **một trạng thái của CTA machine** (`moment.js`). KHÔNG thêm block mới vào Home — thêm 1 case vào máy trạng thái.
2. **Nó chỉ có ý nghĩa sau một sự kiện cụ thể?** (sau AC, sau WA, sau khi bí, sau timer)
   → **Lớp ngữ cảnh L1**: verdict-rail / Tools ▾ / banner Run console. Khai báo rõ điều kiện xuất hiện VÀ điều kiện biến mất.
3. **Nó là cách chọn việc / nguồn bài mới?** (contest, bài đề xuất, thử thách)
   → **S2 «Luyện tập»**.
4. **Nó là dữ liệu nhìn lại quá khứ?** (lỗi, thống kê, thành tích, tiến độ)
   → **S3 «Hồ sơ»**.
5. **Còn lại** (công cụ, cấu hình, tiện ích)
   → **L2**: bắt buộc có trong Ctrl+K; entry thứ hai (nếu xứng đáng) nằm trong Tools ▾. Hết.

**Ngân sách cứng, không thương lượng:**
- Home = 3 đơn vị, vĩnh viễn. Tính năng mới không bao giờ thêm đơn vị thứ 4; nó cạnh tranh suất trong Đơn vị 1 (CTA machine) hoặc Đơn vị 3 (dòng ngữ cảnh) theo mức ưu tiên.
- Mỗi tính năng được tối đa **1 entry-point thường trực** + 1 mục Ctrl+K. Mọi entry-point thêm phải là state-driven (có điều kiện hiện/ẩn).
- Topbar và editor toolbar **đóng băng số nút cấp 1** như hiện tại — nút mới đi vào menu "⋯" / "Tools ▾".

## §2. Luật giọng nói (voice)

1. **Giọng HLV, không giọng game show.** Tên tính năng = danh từ mô tả đúng việc, một học sinh lớp 10 khác đọc lần đầu hiểu ngay không cần giải thích. Test nhanh: *nếu phải mở ngoặc giải thích nghĩa, tên đó sai.*
2. **Từ cấm trong UI:** kèo, đấu, trả thù, sới, thuần hóa, sổng chuồng, tàng, bảo vật, loot, farm — và mọi ẩn dụ đặt cược/săn bắt mới cùng họ. (Cơ chế RNG/stakes/streak được GIỮ — chỉ cấm từ ngữ.)
3. **Tiếng Việt chuẩn, xưng hô nhất quán:** app gọi học sinh là "em" hoặc trung tính — chọn một, dùng toàn app (hiện Coach dùng "em" → chuẩn hóa theo đó).
4. Microcopy theo khuôn: **[Việc gì] + [vì sao đáng làm, ≤1 mệnh đề]**. Ví dụ đúng: "Ôn lỗi 5 phút — 3 lỗi cũ tới hạn hôm nay." Ví dụ sai: "⚡ Thử vận may với kèo ẩn!!!"
5. Emoji không phải icon hệ thống — dùng glyph mono/SVG theo DESIGN-SYSTEM (nợ cũ emoji ×24 sẽ trả dần ở §9).

## §3. Luật hình thức (visual contract)

1. **Màu/bo/shadow/spacing/motion chỉ lấy từ `tokens.css`.** Một giá trị hex mới trong CSS feature = reject.
2. **Từ vựng component đóng:** card (`.jh-card` spec), modal (1 spec chung), empty-state, button (`.btn` họ hiện có), banner, chip. Tính năng mới **lắp từ bộ này**, không phát minh hình dáng mới. Muốn thêm từ vựng mới → sửa DESIGN-SYSTEM.md trước, có lý do.
3. **Cấm tuyệt đối:** gradient text (`background-clip: text`), glassmorphism/backdrop-blur trang trí, side-stripe border màu, `!important` mới, `z-index` số tự chế (dùng scale token). **NGOẠI LỆ đã duyệt (2026-07-10):** global animated starfield background (main.js `initGlobalParticles`) là bản sắc app, Phúc muốn GIỮ — ON mặc định, tự tắt khi `prefers-reduced-motion` + có opt-out ở Settings. Đừng thêm particle/glow feature-level MỚI ngoài nền global này.
4. **Motion 150–250ms, chỉ để truyền trạng thái** (đổi state, feedback, loading, reveal). Không animation vô hạn (đã từng treo cả screenshot pipeline). Mọi animation có nhánh `prefers-reduced-motion`.
5. **Modal là lựa chọn cuối cùng.** Thứ tự bắt buộc: inline → panel phải → view riêng → modal. Modal chỉ cho tác vụ chặn-luồng thật sự (xác nhận xóa, nhập liệu ngắn).
6. **Empty state phải dạy:** nói dữ liệu sẽ đến từ đâu và hành động gần nhất để có nó (mẫu tốt sẵn có: `renderEmpty` của flash-quiz.js).

## §4. Luật dữ liệu thật (data honesty)

1. **Không có dữ liệu thật → không có CTA.** Tính năng học tập chỉ được mời gọi khi đủ dữ liệu để trải nghiệm có nghĩa (bài học Flash Quiz: 1-2 câu lặp đi lặp lại còn tệ hơn không có).  Khai báo ngưỡng ngay từ intake (§8): "hiện khi ≥ X items".
2. **Số liệu derive từ lịch sử thật** (runs/, moments/, history) — không seed số ảo, không placeholder "coming soon".
3. **Nội dung ôn tập lấy từ lỗi của chính học sinh** trước khi nghĩ đến nội dung bịa/AI-sinh. AI chỉ sinh khi dữ liệu thật đã cạn vai trò.
4. Tính năng có tính lặp lại (quiz, ôn, thử thách) **phải có lịch** — dùng hạ tầng intervals [3,7,21,60] sẵn có, không tự chế bộ đếm mới, không hiện lại thứ vừa hoàn thành.

## §5. Luật xuất hiện đúng lúc (appear-when)

Mọi tính năng L1 khai báo đủ 3 dòng, ghi thẳng vào comment đầu file:
```
// APPEARS: <điều kiện hiện — sự kiện + ngưỡng dữ liệu>
// DISMISSES: <điều kiện biến mất — hoàn thành / hết hạn / user đóng>
// PRIORITY: <thắng/thua gì khi tranh cùng một slot>
```
Hai tính năng cùng tranh một slot (vd. Đơn vị 3 Home) → so PRIORITY, **chỉ hiện một**, không xếp chồng. Đây chính là lỗi cũ của Home — không lặp lại.

## §6. Luật tích hợp kỹ thuật

1. FE: vanilla ESM theo cấu trúc `frontend/src/features/<tên>.js`, init qua `main.js`, event qua bus/`journey:painted` pattern sẵn có. Không framework mới, không dependency mới nếu không bàn trước.
2. **Một format code duy nhất:** mọi hoạt động có sửa/chạy C++ (bài thường, Điền lõi, Debug tốc độ, Contest) phải dùng canonical workspace: Statement trái, CodeMirror giữa, Run/Judge + kết quả phải. Feature chỉ cung cấp dữ liệu và adapter `run/judge/save`; cấm tạo primary editor/textarea/shortcut riêng. Stress Test được phép có ba tab editor vì ba chương trình là bản chất nghiệp vụ, nhưng vẫn phải dùng cùng factory, toolbar, console và shortcut của canonical workspace.
3. Đăng ký **bắt buộc** vào `command-palette.js` (mọi feature có hành động).
4. Tôn trọng workspace policy (`workspace-policy.js`) — feature phải ẩn được theo preset.
5. Không đụng backend trustLayer/registries/adapters; route mới theo pattern REST hiện có + test backend (chuẩn 553-test hiện tại).
6. Sau khi sửa FE: **bump `?v=` trong index.html**; sau khi sửa backend: nhắc restart :5050.

## §7. Ship checklist — Definition of Done (tick đủ mới merge)

- [ ] Qua decision tree §1, ghi rõ vị trí + appear-when §5
- [ ] Tên + microcopy theo §2 (không từ cấm, hiểu ngay không cần giải thích)
- [ ] 100% giá trị style từ token; lắp từ component vocabulary §3
- [ ] Đủ trạng thái: default / hover / focus / disabled / **loading (skeleton)** / error / **empty-dạy**
- [ ] Esc/cancel/undo cho mọi flow; keyboard đi được hết đường chính
- [ ] `prefers-reduced-motion` cho mọi animation
- [ ] Có mục Ctrl+K; tôn trọng workspace policy
- [ ] Ngưỡng dữ liệu thật §4 được gate đúng
- [ ] Verify sống trên :5099 (snapshot/eval, không tin screenshot mù); bump `?v=`
- [ ] Không `!important` mới, không hex mới, không modal mới ngoài quy định

## §8. Feature Intake — điền 6 dòng TRƯỚC khi viết dòng code nào

```md
### <Tên chuẩn theo §2>
1. Vòng lặp chính hưởng lợi gì? (đề→test→judge→debug — nếu không chỉ ra được, dừng)
2. Vị trí theo decision tree §1: S1-case / L1 / S2 / S3 / L2
3. APPEARS / DISMISSES / PRIORITY (§5)
4. Dữ liệu thật lấy từ đâu + ngưỡng tối thiểu (§4)
5. Lắp từ component nào sẵn có (§3)
6. Cái gì bị THAY THẾ hoặc gộp? (mỗi feature mới phải trả lời "có trùng chức năng với cái cũ nào không" — nếu trùng, gộp hoặc thay, không xếp cạnh)
```
Dòng 6 là chốt chống "rời rạc": app hiện tại rời rạc vì feature mới cứ *xếp cạnh* feature cũ thay vì *gộp vào* — ví dụ quests đứng cạnh plan dù cùng là "việc hôm nay".

## §9. Nâng mặt bằng chung (leveling sweep) — cho tính năng CŨ

Quy trình: mỗi sprint chọn 2-3 feature cũ, chạy checklist §7 như thể nó là feature mới. Không đạt mục nào → sửa mục đó, không redesign lại từ đầu.

**Sổ nợ hiện tại (2026-07-10, xếp theo mức lệch chuẩn):**
| Feature | Lệch gì | Ai xử |
|---|---|---|
| Contest create | Đảo glass + gradient-text + hex riêng (§3) | B1 |
| Particles + mouse-glow | GIỮ — user-approved 2026-07-10; ON default + reduced-motion guard + opt-out (§3.3 ngoại lệ). ĐỪNG xóa | done |
| Sổ tay lỗi | Modal thay vì view, không filter (§3.5, §7) | B2 |
| Flash Quiz | Thiếu gate dữ liệu + lịch (§4) | A2 |
| Ngôn ngữ game ~50 chỗ | §2 | A2 |
| Home 10+ khối | §1 ngân sách | A1 |
| Snippets | Tĩnh, modal, chưa có user snippets (§3.5) | B3 |
| Coach appearance | Hình thức cứng, xuất hiện chưa theo ngữ cảnh (§5) | B3 |
| Bug stdin + animation | §7 verify | B2 |
| Emoji-icon ×24, `!important` tồn dư | §2.5, §3.3 | B3 (dần) |
