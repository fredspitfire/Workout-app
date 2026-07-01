# Home Assistant add-on image for the Training Coach app.
# Builds the SvelteKit app from source (the add-on folder is the build context,
# which doesn't contain the app source — so we clone it), then runs the
# adapter-node server. Persistent data lives on /share, never in the image.

FROM node:24-alpine AS builder
RUN apk add --no-cache git
WORKDIR /src
# Pin to a branch or tag; rebuild the add-on to pull newer code.
ARG REPO=https://github.com/fredspitfire/Workout-app
ARG REF=main
RUN git clone --depth 1 --branch "$REF" "$REPO" . \
	&& npm ci \
	&& npm run build \
	&& npm prune --omit=dev

FROM node:24-alpine
RUN apk add --no-cache jq
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /src/build ./build
COPY --from=builder /src/node_modules ./node_modules
COPY --from=builder /src/package.json ./package.json
COPY run.sh /run.sh
RUN chmod +x /run.sh
EXPOSE 3000
CMD ["/run.sh"]
