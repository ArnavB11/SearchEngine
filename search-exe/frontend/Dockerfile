# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the static files.
#
# This stage needs Node, npm and the whole dependency tree - none of which are
# needed to *serve* the result.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Manifests first, so the dependency layer stays cached across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: serve them.
#
# This is what a multi-stage build buys. Only /app/dist is copied forward; Node,
# the source, and roughly 200MB of node_modules stay behind in stage 1 and never
# ship. The final image is nginx plus a few hundred kilobytes of assets.
#
# nginx-unprivileged rather than plain nginx: it already runs as a non-root user
# and listens on 8080, because a non-root process cannot bind a port below 1024.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine

# Anything in /etc/nginx/templates has ${VARIABLES} substituted from the
# environment at container start, which is how one image serves every
# environment instead of baking the backend address in at build time.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Where to forward /api. Overridden per environment: compose points it at the
# "backend" service, Kubernetes at the backend Service's DNS name.
ENV BACKEND_URL=http://backend:5000

EXPOSE 8080

# The base image's own entrypoint renders the template and starts nginx in the
# foreground, so there is no CMD to write here.
