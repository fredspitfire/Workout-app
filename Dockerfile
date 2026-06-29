# Build the SvelteKit app, then run it as a self-contained Node server.
# Runs as its own container on the Home Assistant mini PC (not a Lovelace dashboard).

FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# adapter-node listens on PORT (default 3000) and HOST 0.0.0.0
ENV PORT=3000
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "build"]
