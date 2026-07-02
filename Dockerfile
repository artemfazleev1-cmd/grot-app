# ---- Сборка фронтенда ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Бэкенд + раздача собранного фронта ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# опционально web-push для реальных пушей (если задан VAPID)
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev && npm install web-push
COPY backend/ ./backend/
COPY --from=web /web/dist ./frontend/dist
# каталог для персистентного состояния (примонтируйте volume в проде)
RUN mkdir -p /app/backend/data
EXPOSE 4000
WORKDIR /app/backend
CMD ["node", "server.js"]
