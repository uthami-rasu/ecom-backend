# Multi-stage Dockerfile for NestJS backend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY seed-assets ./seed-assets

# Create uploads directory
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
