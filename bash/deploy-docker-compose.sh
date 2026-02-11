#!/bin/bash

# Отправка docker-compose и образов meet на сервер с последующим поднятием сервисов

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../" || exit 1

REMOTE_HOST="root@77.222.52.134"
REMOTE_PATH="/root/meet"
COMPOSE_FILE="docker-compose.yml"

echo "=== Отправка docker-compose на сервер ==="
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "✗ Файл $COMPOSE_FILE не найден"
  exit 1
fi

ssh "$REMOTE_HOST" "mkdir -p $REMOTE_PATH"
scp "$COMPOSE_FILE" "$REMOTE_HOST:$REMOTE_PATH/"

if [ $? -ne 0 ]; then
  echo "✗ Ошибка при отправке docker-compose"
  exit 1
fi
echo "✓ docker-compose.yml отправлен в $REMOTE_HOST:$REMOTE_PATH/"
echo ""

echo "=== Сборка и отправка meet-backend ==="
"$SCRIPT_DIR/build-and-push-backend.sh" || exit 1
echo ""

echo "=== Сборка и отправка meet-frontend ==="
"$SCRIPT_DIR/build-and-push-frontend.sh" || exit 1
echo ""

echo "=== Все сервисы meet развёрнуты ==="
echo "Готово! docker-compose и образы загружены, контейнеры перезапущены."
