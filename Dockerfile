FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY frontend ./frontend
RUN npm run build

FROM node:24-bookworm-slim AS frontend
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY frontend/server.js ./frontend/
COPY backend/shared/static.js ./backend/shared/
COPY --from=build /app/frontend/dist ./frontend/dist
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
