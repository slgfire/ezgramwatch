# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app

# Build tools required for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runner ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# tini: proper PID 1 for signal forwarding and zombie reaping
RUN apk add --no-cache tini \
 && mkdir -p /data && chown node:node /data

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Run as the built-in non-root node user (uid=1000)
USER node

VOLUME ["/data"]

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/index.js"]
