# Сборка всего приложения в один контейнер: API + бот + экраны Mini App.
# Используется хостингом (Northflank), локально Docker не обязателен.

# ---------- 1. Сборка ----------
FROM node:24-alpine AS build
WORKDIR /app

# Сначала только манифесты — так слой с зависимостями кэшируется между сборками.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build -w apps/web && npm run build -w apps/server

# ---------- 2. Запуск ----------
FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Только то, что нужно для работы сервера, без инструментов сборки.
RUN npm ci --omit=dev --workspace apps/server --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist

USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
