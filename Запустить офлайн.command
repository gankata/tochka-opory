#!/bin/bash

set -u
cd "$(dirname "$0")" || exit 1

clear
printf '\n  Точка опоры — автономный запуск\n'
printf '  ───────────────────────────────\n\n'

if [ -n "${TOCHKA_MODE:-}" ]; then
  MODE="$TOCHKA_MODE"
else
  printf '  1 — только этот MacBook\n'
  printf '  2 — MacBook и iPhone в одной локальной сети\n\n'
  read -r -p '  Выберите режим [1]: ' MODE
  MODE="${MODE:-1}"
fi

if [ "$MODE" != "1" ] && [ "$MODE" != "2" ]; then
  printf '\n  Неизвестный режим. Запустите файл снова и выберите 1 или 2.\n'
  exit 1
fi

NODE_BIN=""
for candidate in \
  "$(command -v node 2>/dev/null || true)" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "/Applications/Kimi.app/Contents/Resources/resources/runtime/tool-node/bin/node"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  printf '\n  Node.js не найден. Пока есть интернет, установите его командой:\n'
  printf '  /opt/homebrew/bin/brew install node\n\n'
  read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
  exit 1
fi

if [ ! -f "dist/boot.js" ] || [ ! -d "node_modules" ]; then
  printf '\n  Приложение ещё не собрано. Выполните в этой папке:\n'
  printf '  npm ci && npm run build\n\n'
  read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
  exit 1
fi

PORT="${TOCHKA_PORT:-7100}"
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 7199 ]; then
    printf '\n  Не удалось найти свободный порт между 7100 и 7199.\n'
    exit 1
  fi
done

if [ "$MODE" = "1" ]; then
  HOST="127.0.0.1"
else
  HOST="0.0.0.0"
fi

printf '\n  Запускаю локальный сервер…\n'
caffeinate -dims &
CAFFEINE_PID=$!
HOST="$HOST" PORT="$PORT" "$NODE_BIN" scripts/start.mjs &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill -TERM "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if kill -0 "$CAFFEINE_PID" >/dev/null 2>&1; then
    kill -TERM "$CAFFEINE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

READY=""
for _ in {1..60}; do
  if curl --silent --fail --max-time 1 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    READY="1"
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then break; fi
  sleep 0.25
done

if [ -z "$READY" ]; then
  printf '\n  Сервер не запустился. Проверьте сообщения выше.\n'
  read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
  exit 1
fi

printf '\n  Готово. Данные находятся на этом MacBook.\n'
printf '  На MacBook: http://localhost:%s\n' "$PORT"

if [ "$MODE" = "2" ]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [ -z "$LAN_IP" ]; then LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"; fi
  printf '\n  Режим MacBook + iPhone включён.\n'
  if [ -n "$LAN_IP" ]; then
    printf '  На iPhone откройте: http://%s:%s\n' "$LAN_IP" "$PORT"
  else
    printf '  Локальный IP не найден. Подключите оба устройства к одной сети,\n'
    printf '  затем выполните: ipconfig getifaddr en0\n'
  fi
  printf '\n  Без интернета: включите на iPhone «Режим модема» и подключите\n'
  printf '  MacBook к его Wi-Fi. Оба устройства используют одну базу.\n'
  printf '  Если macOS спросит про сетевые подключения Node.js — разрешите.\n'
fi

printf '\n  Не закрывайте это окно и не давайте MacBook уснуть.\n'
printf '  Для остановки нажмите Ctrl+C.\n\n'

if [ "${TOCHKA_NO_OPEN:-}" != "1" ]; then
  open "http://127.0.0.1:$PORT" >/dev/null 2>&1 || true
fi

wait "$SERVER_PID"
