#!/bin/bash

# Устанавливаем путь скрипта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Переходим в корень репозитория
cd "$SCRIPT_DIR/../" || exit 1

# Параметры подключения
REMOTE_HOST="root@77.222.52.134"
REMOTE_PATH="/root/meet"

# Имя Docker образа и сервиса
IMAGE_NAME="meet-backend"
IMAGE_TAG="latest"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
ARCHIVE_NAME="meet-backend-image.tar"

echo "Сборка Docker образа для платформы linux/amd64..."

docker buildx build \
  --platform linux/amd64 \
  -t "$FULL_IMAGE_NAME" \
  -f ./apps/node-p2p/Dockerfile \
  --load \
  ./apps/node-p2p

if [ $? -ne 0 ]; then
  echo "✗ Ошибка при сборке Docker образа"
  exit 1
fi

echo "✓ Docker образ успешно собран"

echo "Сохранение образа в архив $ARCHIVE_NAME..."
docker save -o "$ARCHIVE_NAME" "$FULL_IMAGE_NAME"

if [ $? -ne 0 ]; then
  echo "✗ Ошибка при сохранении образа в архив"
  exit 1
fi

echo "✓ Образ сохранен в $ARCHIVE_NAME"

echo "Создание каталога на сервере (если нет)..."
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_PATH"

echo "Отправка архива на сервер $REMOTE_HOST:$REMOTE_PATH..."
scp "$ARCHIVE_NAME" "$REMOTE_HOST:$REMOTE_PATH/"

if [ $? -ne 0 ]; then
  echo "✗ Ошибка при отправке архива"
  rm -f "$ARCHIVE_NAME"
  exit 1
fi

echo "✓ Архив успешно отправлен"

echo "Загрузка образа на сервере..."
ssh "$REMOTE_HOST" "cd $REMOTE_PATH && docker load -i $ARCHIVE_NAME"

if [ $? -ne 0 ]; then
  echo "✗ Ошибка при загрузке образа на сервере"
  rm -f "$ARCHIVE_NAME"
  exit 1
fi

echo "✓ Образ успешно загружен на сервере"

rm -f "$ARCHIVE_NAME"
echo "✓ Локальный архив удален"

ssh "$REMOTE_HOST" "cd $REMOTE_PATH && rm -f $ARCHIVE_NAME"

echo "Перезапуск контейнера meet-backend..."
ssh "$REMOTE_HOST" "cd $REMOTE_PATH && docker compose up -d meet-backend"

if [ $? -ne 0 ]; then
  echo "✗ Ошибка при перезапуске контейнера"
  exit 1
fi

echo "✓ Контейнер meet-backend успешно перезапущен"
echo "Готово! Docker образ $FULL_IMAGE_NAME загружен на сервер и контейнер перезапущен"
