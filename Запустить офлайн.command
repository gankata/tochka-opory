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

NODE_VERSION="22.23.4"
NODE_BIN=""

node_is_supported() {
  candidate="$1"
  [ -n "$candidate" ] && [ -x "$candidate" ] || return 1
  version="$("$candidate" --version 2>/dev/null || true)"
  major="${version#v}"
  major="${major%%.*}"
  case "$major" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$major" -ge 22 ]
}

if [ "${TOCHKA_FORCE_PORTABLE_NODE:-}" != "1" ]; then
  for candidate in \
    "$(command -v node 2>/dev/null || true)" \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node" \
    "/Applications/Kimi.app/Contents/Resources/resources/runtime/tool-node/bin/node"
  do
    if node_is_supported "$candidate"; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

install_portable_node() {
  case "$(uname -m)" in
    arm64)
      NODE_PLATFORM="darwin-arm64"
      NODE_SHA256="c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428"
      ;;
    x86_64)
      NODE_PLATFORM="darwin-x64"
      NODE_SHA256="efcc2b0db6f94bf53eddb038fe2b370277a042bd29e4f19b8f8e23598795b819"
      ;;
    *)
      printf '\n  Эта архитектура Mac не поддерживается автоматическим запуском: %s\n' "$(uname -m)"
      return 1
      ;;
  esac

  NODE_DIST="node-v$NODE_VERSION-$NODE_PLATFORM"
  RUNTIME_DIR="$PWD/.toolchain/$NODE_DIST"
  if node_is_supported "$RUNTIME_DIR/bin/node"; then
    NODE_BIN="$RUNTIME_DIR/bin/node"
    return 0
  fi

  printf '\n  Совместимый Node.js не найден.\n'
  printf '  Скачиваю официальный Node.js %s в папку приложения…\n' "$NODE_VERSION"
  printf '  Установка в систему и права администратора не нужны.\n'
  if ! command -v curl >/dev/null 2>&1 || ! command -v shasum >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
    printf '\n  Для загрузки нужны стандартные curl, shasum и tar. Проверьте macOS.\n'
    return 1
  fi

  mkdir -p ".toolchain" || return 1
  TEMP_DIR="$(mktemp -d "$PWD/.toolchain/.node-download.XXXXXX")" || return 1
  ARCHIVE="$TEMP_DIR/$NODE_DIST.tar.gz"
  URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIST.tar.gz"
  if ! curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --output "$ARCHIVE" "$URL"; then
    printf '\n  Не удалось скачать Node.js. Проверьте интернет и повторите запуск.\n'
    rm -rf "$TEMP_DIR"
    return 1
  fi

  ACTUAL_SHA256="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
  if [ "$ACTUAL_SHA256" != "$NODE_SHA256" ]; then
    printf '\n  Контрольная сумма Node.js не совпала. Загрузка отклонена.\n'
    rm -rf "$TEMP_DIR"
    return 1
  fi
  if ! tar -xzf "$ARCHIVE" -C "$TEMP_DIR" || ! node_is_supported "$TEMP_DIR/$NODE_DIST/bin/node"; then
    printf '\n  Не удалось распаковать или проверить Node.js.\n'
    rm -rf "$TEMP_DIR"
    return 1
  fi

  rm -rf "$RUNTIME_DIR"
  if ! mv "$TEMP_DIR/$NODE_DIST" "$RUNTIME_DIR"; then
    printf '\n  Не удалось сохранить Node.js в .toolchain. Проверьте доступ к папке.\n'
    rm -rf "$TEMP_DIR"
    return 1
  fi
  rm -rf "$TEMP_DIR"
  NODE_BIN="$RUNTIME_DIR/bin/node"
  printf '  Node.js установлен локально и готов к автономным запускам.\n'
}

if [ -z "$NODE_BIN" ]; then
  if ! install_portable_node; then
    read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
    exit 1
  fi
fi

NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
if [ -x "$NODE_DIR/npm" ]; then
  NPM_BIN="$NODE_DIR/npm"
else
  NPM_BIN="$(command -v npm 2>/dev/null || true)"
fi
if [ -z "$NPM_BIN" ]; then
  printf '\n  npm не найден рядом с Node.js. Повторите запуск или переустановите приложение.\n'
  read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
  exit 1
fi
export PATH="$NODE_DIR:$PATH"

MODULES_STAMP="node_modules/.package-lock.json"
if [ ! -f "$MODULES_STAMP" ] || [ "package-lock.json" -nt "$MODULES_STAMP" ]; then
  printf '\n  Устанавливаю зависимости. Это нужно после установки или обновления…\n'
  if ! "$NPM_BIN" ci; then
    printf '\n  Не удалось установить зависимости. Проверьте интернет и сообщения выше.\n'
    read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
    exit 1
  fi
fi

NEEDS_BUILD=""
if [ ! -f "dist/boot.js" ]; then
  NEEDS_BUILD="1"
else
  for config in package.json package-lock.json vite.config.ts tsconfig.server.json; do
    if [ "$config" -nt "dist/boot.js" ]; then NEEDS_BUILD="1"; fi
  done
  if [ -n "$(find src api db contracts -type f -newer dist/boot.js -print -quit 2>/dev/null)" ]; then
    NEEDS_BUILD="1"
  fi
fi
if [ -n "$NEEDS_BUILD" ]; then
  printf '\n  Собираю приложение. Это нужно только после установки или обновления…\n'
  if ! "$NPM_BIN" run build; then
    printf '\n  Не удалось собрать приложение. Проверьте сообщения выше.\n'
    read -r -p '  Нажмите Enter, чтобы закрыть окно…' _
    exit 1
  fi
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
