# Định hướng Nghiên cứu Khoa học — USACO IDE 2.0

> **File này dành cho agent.** Đọc trước khi làm bất kỳ tính năng mới nào.
> Mọi quyết định kỹ thuật phải khớp với file này. Nếu mâu thuẫn, hỏi lại owner.

---

## 1. App là gì — một câu, không thêm

App dẫn người học đi từ một đề bài đến một sản phẩm chạy được, và ở mỗi bước đều có máy chấm thật nói đúng hay sai.

---

## 2. Người dùng cụ thể

Học sinh cấp 3 Việt Nam, biết viết C++ cơ bản, đã giải được vài chục bài OJ, đang bí ở câu "giải xong rồi thì sao?".

Không mở rộng hơn cái này cho tới khi nghiên cứu chính xong.

---

## 3. Vòng lặp duy nhất — mọi tính năng phải nằm trong đây

```
có đề
  → hiểu đề
  → viết code
  → máy chấm (g++ thật)
  → sai → hiểu vì sao sai
  → đúng rồi (AC) → Xưởng: biến thành sản phẩm
  → sản phẩm chạy được → mở rộng tiếp
       ↑____________________________|
```

Tính năng nào không nằm trong vòng này → không làm, hoặc giấu đi không phơi trên navigation.

---

## 4. Câu hỏi nghiên cứu — đây là lý do app tồn tại với tư cách đề tài

> Nếu app dẫn người học đi từng bước thay vì để họ tự mò, thì họ có tự làm được nhiều hơn không — và có bớt phụ thuộc vào AI không?

Câu hỏi phụ quan trọng nhất (nếu có thời gian):
> AI gợi ý bao nhiêu thì giúp người học, quá bao nhiêu thì làm hư người học?

---

## 5. Bốn con số sẽ đo — không thêm

| Ký hiệu | Đo cái gì | Cách đo |
|---|---|---|
| **A** | Số lần người dùng phải tự nghĩ "giờ làm gì tiếp" trong một buổi | Đếm lần họ dừng > 30s mà không có bước tiếp theo rõ |
| **B** | % người bắt đầu một bài đi được tới sản phẩm chạy | funnel từ `mở bài` → `AC` → `Xưởng start` → `project runs` |
| **C** | % người tự giải bài mới không cần trợ giúp, sau 1 tháng | bài trong bộ held-out, không mở Coach |
| **D** | % lỗi cố tình cài vào bị test AI sinh ra bắt được | mutation testing trên bộ bài chuẩn |

Telemetry phải ghi đủ để tính được bốn con số này. Nếu một event không phục vụ A–D → không bắt buộc ghi.

---

## 6. Kiến trúc — ba lớp không được trộn

```
LÕI (không biết gì về ngôn ngữ cụ thể)
  ├── Máy trạng thái vòng lặp §3
  ├── Giao diện máy chấm: verify(artifact, scenario) → đúng/sai + bằng chứng
  └── Bus sự kiện: mỗi lần chuyển bước → 1 event có nhãn, timestamp, userId ẩn danh

ADAPTER (biết về từng ngôn ngữ / domain)
  ├── C++ → g++ judge (đã có)
  └── Domain thứ 2 → Backend/API (HTTP request → assert response)
      ⚠ Python AI/ML KHÔNG được thêm vào đây vì không có máy chấm tất định

BỀ MẶT (UI)
  └── Chỉ thêm màn hình mới nếu vòng lặp §3 có thể TỰ ĐỘNG điều hướng tới đó
```

**Quy tắc domain:** chỉ cần hai domain để chứng minh lõi dùng chung được. Không thêm domain thứ ba trước khi nghiên cứu chính kết thúc.

---

## 7. Xưởng — mắt xích quan trọng nhất

Xưởng là bằng chứng sống của câu hỏi nghiên cứu. Nó phải:
- Được kích hoạt **tự động** sau khi user đạt AC — không để user tự tìm
- Sinh ra pathway bằng AI, nhưng **AI chỉ đề xuất, máy chấm thật mới phán**
- Pathway hợp lệ = phá ít nhất một giả định cũ của lời giải + thêm hành vi nhìn thấy được
- Replay phải tất định: chạy lại cùng code + cùng scenario → cùng kết quả (quan trọng cho tái lập)

Các bước S1–S7 đã có trong `docs/XUONG-API-CONTRACT.md`. Không sửa contract mà không cập nhật file đó.

---

## 8. Danh sách KHÔNG LÀM

Agent nào vi phạm một trong các điều dưới đây → tự động coi là sai, dù test xanh:

- ❌ Thêm tính năng mà navigation không tự dẫn tới được
- ❌ Thêm ngôn ngữ thứ ba trước khi nghiên cứu xong
- ❌ Làm bất cứ thứ gì liên quan AI/ML (không có máy chấm tất định)
- ❌ Mở rộng Arena / Ấn / Kèo / Gauntlet / Boss → đóng băng hoàn toàn
- ❌ Thêm event telemetry không phục vụ số A–D
- ❌ Báo GO bằng "tests xanh" hoặc "branch riêng" — GO chỉ tính trên app canonical user mở thật
- ❌ Tạo thêm file README / roadmap / north star ngoài `README.md`
- ❌ Làm tính năng mới trong giai đoạn đóng băng (sau khi bắt đầu thu số liệu người thật)

---

## 9. Trạng thái hiện tại và ưu tiên

**Đang cần làm (theo thứ tự):**

1. **Một đường thông không ngõ cụt** — mở app → nhập đề → code → AC → Xưởng → sản phẩm chạy. Mọi thứ khác giấu đi trước.
2. **Bus sự kiện** — mỗi chuyển bước phát 1 event. Không có cái này thì người thật dùng cũng không có dữ liệu.
3. **Cài đặt dưới 10 phút không cần hướng dẫn** — đây là rào cản số một với người dùng thật.
4. **Bộ bài held-out** — 30–50 bài không xuất hiện trong quá trình học, dùng làm bài kiểm tra.
5. **Mutation testing** — tính số D, chứng minh AI của mình đáng tin.

**Đóng băng hoàn toàn (không động vào):**
Arena · Ấn · Kèo · Gauntlet · Boss · Contest mode · Rush mode

**Đang là prototype, chưa phải sản phẩm:**
Xưởng UI — backend contract đã ổn, frontend cần rebuild theo §3 vòng lặp

---

## 10. Mốc thời gian (đếm từ 07/2026)

| Tháng | Việc chính | Điều phải xong trước khi qua tháng kế |
|---|---|---|
| **T8–T9** | Một đường thông + Bus sự kiện | 3 người lạ đi hết một vòng không cần giải thích |
| **T10–T11** | Bộ bài held-out + mutation testing | Tính được số A, B, D |
| **T12** | Pilot 5–8 người | Biết effect size sơ bộ, chốt cỡ mẫu |
| **T1–T2/2027** | Thu số liệu chính (n=25–50) | **ĐÓNG BĂNG TÍNH NĂNG từ cuối T12** |
| **T3** | Phân tích, viết báo cáo | — |
| **T4** | Demo offline tất định, tập trả lời phản biện | — |

---

## 11. Hai câu để agent nhớ khi không biết làm gì tiếp

> **"Nếu app không tự dẫn người dùng tới đây được, thì đây không phải flow."**

> **"AI đề xuất. Máy chấm phán. Không có máy chấm thì không làm."**

---

*Cập nhật: 2026-07-27. Mọi thay đổi định hướng sửa trực tiếp vào file này, kèm ngày.*
