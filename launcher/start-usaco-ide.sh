#!/usr/bin/env bash
# start-usaco-ide.sh — USACO IDE 2.0 launcher (macOS / Linux)
# Usage:  bash launcher/start-usaco-ide.sh    (or chmod +x and double-click/run it)
set -u

PORT="${USACO_IDE_PORT:-5050}"
URL="http://127.0.0.1:${PORT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/../backend"

echo "=================================================="
echo "   USACO IDE 2.0  -  Launcher"
echo "=================================================="

open_browser() {
  if command -v open >/dev/null 2>&1; then open "$URL"        # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"  # Linux
  else echo "[OPEN]  Mở thủ công: $URL"; fi
}

# 1. Node.js present and recent enough?
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Không tìm thấy Node.js. Cài Node.js LTS từ https://nodejs.org rồi chạy lại."
  exit 1
fi
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[ERROR] Node.js quá cũ (cần >= 18, đang có: $NODE_MAJOR)."
  exit 1
fi

cd "$BACKEND_DIR" || exit 1

# 2. Our backend already running? Just open the browser.
if curl -s --max-time 2 "$URL/api/health" 2>/dev/null | grep -q "USACO IDE"; then
  echo "[OK]    Backend đã chạy sẵn trên cổng $PORT. Chỉ mở trình duyệt."
  open_browser
  exit 0
fi

# 3. Port held by something else? Bail out clearly.
if curl -s --max-time 2 -o /dev/null "$URL" 2>/dev/null; then
  echo "[ERROR] Cổng $PORT đang bị một ứng dụng KHÁC chiếm dụng."
  echo "        Đổi cổng rồi chạy lại:  USACO_IDE_PORT=5051 bash $0"
  exit 1
fi

# 4. First run -> install dependencies.
if [ ! -d node_modules ]; then
  echo "[SETUP] Cài dependencies lần đầu (npm install)..."
  npm install || { echo "[ERROR] npm install thất bại. Kiểm tra kết nối mạng."; exit 1; }
fi

# 5. Start the backend.
echo "[START] Khởi động backend trên cổng $PORT ..."
USACO_IDE_PORT="$PORT" node server.js &
BACKEND_PID=$!

# 6. Wait until the server answers, then open the browser.
echo "[WAIT]  Chờ backend sẵn sàng..."
for _ in $(seq 1 40); do
  if curl -s --max-time 2 -o /dev/null "$URL/api/health" 2>/dev/null; then
    echo "[OPEN]  Mở trình duyệt: $URL"
    open_browser
    echo
    echo "Backend (PID $BACKEND_PID) đang chạy ở terminal này. Ctrl+C để tắt server."
    wait $BACKEND_PID
    exit 0
  fi
  sleep 1
done

echo "[ERROR] Backend không phản hồi sau 40 giây."
kill $BACKEND_PID 2>/dev/null
exit 1
