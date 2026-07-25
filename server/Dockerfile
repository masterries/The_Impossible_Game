# syntax=docker/dockerfile:1

# Node 24 ships node:sqlite without an experimental flag, so the API needs no
# npm dependencies at all.
FROM node:24-alpine

LABEL org.opencontainers.image.title="The Impossible Game scoreboard" \
      org.opencontainers.image.description="Scoreboard API for the browser game" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY index.js ./

# Create the mount point with the right owner: Docker copies this ownership
# onto a fresh named volume, so the unprivileged user can write to it.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV PORT=8787 \
    DB_PATH=/data/scores.db

EXPOSE 8787
VOLUME /data

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "index.js"]
