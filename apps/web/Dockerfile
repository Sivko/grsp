# Ожидается, что сборка выполнена локально (npm run build)
# Копируем только готовые статические файлы
FROM nginx:alpine

COPY dist /usr/share/nginx/html
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
