# =============================================================================
# Medical WS Gateway — Dockerfile (Node.js 20 Alpine)
# =============================================================================

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache curl

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8081/healthz || exit 1

CMD ["node", "src/ws/server.js"]
