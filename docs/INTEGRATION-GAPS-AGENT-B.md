# Integration gaps — Agent B (Frontend/Flow Owner, Verified Artifact Loop)

> Ngày: 2026-07-15. Người ghi: Agent B. Người nhận: Agent A (Backend/Contract Owner).
> Frontend ĐÃ ship consumer cho mọi field/API dưới đây (compatibility-read, fallback
> trung thực khi thiếu). Agent A ship backend là mọi thứ tự sáng lên — không cần đổi FE,
> trừ mục G3 cần đối chiếu shape lần cuối.

## G1 — docs/VERIFIED-ARTIFACT-API.md không tồn tại

Brief giao cho Agent B ghi "đọc docs/VERIFIED-ARTIFACT-API.md do Agent A cung cấp" —
file chưa có trong repo. Mọi shape dưới đây là ĐỀ XUẤT của FE; Agent A chốt lại trong
file đó.

## G2 — P1 REGRESSION: moment-diagnose chết (`ai.chat is not a function`)

- `backend/src/routes/moment.js:227` gọi `ai.chat({...})`.
- `backend/src/ai.js` (bản viết lại ở phiên practice-unify) **không còn export `chat`**
  (README-AUTOPILOT §2 ghi rõ export này từng tồn tại: "ai.js diff đúng 1 dòng: export chat").
- Hậu quả: TOÀN BỘ auto-diagnosis WA/RE/TLE fail; UI hiện fallback "Hỏi Coach".
- Fix gợi ý: re-export engine `chat` từ ai.js (hoặc trỏ moment.js sang engine mới tương đương).
- FE đã chịu lỗi này êm (không crash, có fallback CTA) — nhưng đây là mạch Feedback chính.

## G3 — Thiếu API trace deterministic (Phase 3)

FE đã ship `frontend/src/features/analysis.js` ("Phân tích code này" — secondary chip
trên mọi judge verdict). Hiện tại nó feature-detect và render fallback trung thực.
Contract FE đang chờ:

```
POST /api/problems/:id/analysis/trace
body    { code: string, input: string }
404/501 → FE coi là "chưa hỗ trợ" (fallback, không lỗi)
200     → { ok: true, kind: "bfs", steps: [
            { step: number, line?: number,   // dòng CODE đang thực thi (1-based)
              queue: (number|string)[],       // trạng thái hàng đợi sau bước này
              visited: (number|string)[],     // các đỉnh đã thăm
              note?: string }                 // "pop 3", "push 5 (d=2)"…
          ], truncated?: boolean }
```

Yêu cầu bắt buộc (README-VERIFIED-ARTIFACT-LOOP §8 + ROADMAP Phase 3):
- Deterministic: cùng (code, input) → cùng steps. Chạy code THẬT của học sinh
  (instrument/simulate), không LLM.
- `line` phải là dòng code thật để FE jump editor (đã wire: click step → `app.jumpToLine`).
- Không hỗ trợ code/bài đó → trả 200 `{ok:false, reason}` hoặc 501 — FE fallback êm.

## G4 — Thiếu derived-artifact flow (Phase 4 GridPathfinder) — BLOCKED

Không có API nào để tạo derived artifact giữ lineage. FE đã ship sẵn consumer:
- Library: chip `⑂ dẫn xuất` / `⑂ có module`, badge `Module`, filter track
  "Thuật toán & ứng dụng" (đọc `activityKind === "algorithm-module"`).
- Statement hero: dòng "⑂ Phát triển từ: <title>" — click mở bài gốc
  (`data-open-problem`, delegated trong statement.js).

Đề xuất API (additive, không đổi id, không đụng solution gốc):

```
POST /api/problems/:id/derive
body { title?: string, kind: "algorithm-module" }
→ { problem: {...} }  // folder mới, meta có:
   activityKind: "algorithm-module"
   derivedFrom: { id: "<gốc>", title: "<title gốc>", runAt: "<ISO của run AC>" }
   origin: "derived"
   // code khởi tạo = snapshot solution ĐÃ PASS của bài gốc (copy, không move)
```

Requirement change = user sửa statement + thêm test fail trong bài derived → vòng
Verify mới bằng judge sẵn có. Không cần API riêng cho việc đó.

## G5 — meta.json strip field additive (điều kiện tiên quyết của G4)

`backend/src/problemStore.js`:
- `defaultMeta()` (dòng ~24) shape cứng — bỏ mọi field lạ khi create.
- `META_PATCHABLE` (dòng ~140) không có field mới — PUT không patch được.

Cần thêm (additive, backward-compatible — README-VERIFIED-ARTIFACT-LOOP §4/§9):
`provider`, `collection`, `origin`, `activityKind`, `derivedFrom`, `derivedStatus`.
FE đã đọc tất cả các field này với fallback (source cũ vẫn hiển thị bình thường).

## G6 — List summary thiếu rating + field contract

`GET /api/problems` summary hiện trả: id/title/source/topic/difficulty/status/tags/
lastVerdict/updatedAt/createdAt. FE cần thêm (đã có consumer trong problems.js):
- `cfRating` (từ `analysis.cfRating`) + `ratingConfirmed` — hàng bài hiện đang rơi về
  nhãn độ khó vì thiếu số;
- `activityKind`, `derivedFrom` (id là đủ), `derivedStatus`, `provider`, `collection`, `origin`.

## Ghi chú data-hygiene (cho Phúc, không phải Agent A)

- 1 title bẩn từ chat lọt vào Library: bài `bai-108...` = "Ok, sang bài 108 — Mê cung
  ít bước nhất BFS." — nên sửa tay qua "Sửa thông tin" (Agent B không tự đổi data user).
