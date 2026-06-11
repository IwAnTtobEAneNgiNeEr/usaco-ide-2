# USACO IDE 2.0 — Desktop (Electron wrapper)

A thin Electron shell around the existing Express backend. **No app rewrite** —
it just starts `../backend/server.js` and shows it in a native window (no browser
tab, no localhost URL).

## Mở app như một ứng dụng desktop

1. Double-click **`USACO-IDE-2.bat`**.
   - Lần đầu sẽ tự `npm install` (cài Electron) — chỉ một lần.
   - Các lần sau mở thẳng cửa sổ app.

## Tạo icon + shortcut ngoài Desktop (mở như Code::Blocks)

```powershell
# trong thư mục desktop/
powershell -ExecutionPolicy Bypass -File Create-Desktop-Shortcut.ps1
```

→ Tạo **"USACO IDE 2.0"** trên Desktop với icon riêng. Double-click để mở.

## Đóng gói thành .exe / installer (tùy chọn, experimental)

```bash
cd desktop
npm install
npm run dist        # tạo dist/USACO IDE 2.0 Setup.exe + bản portable
```

`electron-builder` đóng gói kèm `backend/` và `frontend/` vào `resources/`.
`main.js` tự dò `app.isPackaged` để tìm backend. Lưu ý: thư mục `workspace/`
(các bài) khi đóng gói nằm trong `resources/` — bản portable chạy từ thư mục
ghi được sẽ ổn; nếu cần cài đặt cố định, dùng bản `.bat` ở trên cho chắc.

## Tài sản

- `main.js` — Electron main (fork backend → chờ /api/health → mở BrowserWindow).
- `scripts/make-icon.js` — sinh `build/icon.ico` + `icon.png` (zero-dependency).
- `USACO-IDE-2.bat` — launcher double-click.
- `Create-Desktop-Shortcut.ps1` — tạo shortcut Desktop có icon.
