# syntax=docker/dockerfile:1

# The search API. Alpine keeps the image small; the digest-pinned tag would be
# better still in production, but a version tag is enough here - what matters is
# that it is not `latest`, which silently changes under you.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Copy the manifests on their own, before the source.
#
# Docker caches every instruction as a layer and reuses it as long as its inputs
# are unchanged. Installing dependencies before copying the source means editing
# search.js reuses the cached npm layer instead of reinstalling everything - the
# difference between a two second rebuild and a two minute one.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what the lockfile says, unlike `npm install` which
# may resolve newer versions. Reproducible builds need the former.
RUN npm ci --omit=dev

# Now the application code, which changes far more often than the dependencies.
COPY . .

# Build the inverted index at image build time. The running container then needs
# no writable storage and can serve searches the moment it starts.
RUN node ingest.js

# node:alpine ships an unprivileged `node` user (uid 1000). Containers run as
# root unless told otherwise, which means a container escape starts as root on
# the host. There is no reason for this process to have that.
USER node

EXPOSE 5000

# Docker restarts an unhealthy container; compose can also gate other services
# on it. This asks the liveness endpoint, not readiness - see server.js for why
# those are different questions.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Exec form (a JSON array), not shell form. Shell form wraps the process in
# /bin/sh, which does not forward SIGTERM, so the container would ignore
# `docker stop` and be killed after the grace period instead of shutting down.
CMD ["node", "server.js"]
