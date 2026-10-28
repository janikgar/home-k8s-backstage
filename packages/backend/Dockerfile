# Stage 1 - Create yarn install skeleton layer
FROM dhi.io/node:24-debian-dev@sha256:0fbf99f9c6874344b8c9a2bc80ea63c9f0058f01814f1ea23bf7ddad1b130a95 AS packages

WORKDIR /app
COPY backstage.json package.json yarn.lock ./
COPY .yarn ./.yarn
COPY .yarnrc.yml ./

COPY packages packages

# Comment this out if you don't have any internal plugins
# COPY plugins plugins

RUN find packages \! -name "package.json" -mindepth 2 -maxdepth 2 -exec rm -rf {} \+

# Stage 2 - Install dependencies and build packages
FROM dhi.io/node:24-debian-dev@sha256:0fbf99f9c6874344b8c9a2bc80ea63c9f0058f01814f1ea23bf7ddad1b130a95 AS build

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_NO_DEV=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV PYTHON=/usr/bin/python3

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential gzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN chown -R node:node /app

USER node
COPY uv.lock pyproject.toml .python-version /app/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv python install

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

COPY --from=packages --chown=node:node /app .

RUN yarn install

COPY --chown=node:node . .

RUN yarn tsc
RUN yarn --cwd packages/backend build

RUN mkdir packages/backend/dist/skeleton packages/backend/dist/bundle \
    && tar xzf packages/backend/dist/skeleton.tar.gz -C packages/backend/dist/skeleton \
    && tar xzf packages/backend/dist/bundle.tar.gz -C packages/backend/dist/bundle

# Stage 3 - Build the actual backend image and install production dependencies
#FROM dhi.io/node:24@sha256:5eb921faefd07559999aad0571d9c26eccfc1c7aef8d386dc66481ed8f989cac
FROM dhi.io/node:24-debian-dev@sha256:0fbf99f9c6874344b8c9a2bc80ea63c9f0058f01814f1ea23bf7ddad1b130a95

# Install sqlite3 dependencies. You can skip this if you don't use sqlite3 in the image,
# in which case you should also move better-sqlite3 to "devDependencies" in package.json.
#RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
#    --mount=type=cache,target=/var/lib/apt,sharing=locked \
#    apt-get update && \
#    apt-get install -y --no-install-recommends libsqlite3-dev && \
#    rm -rf /var/lib/apt/lists/*

# From here on we use the least-privileged `node` user to run the backend.
USER node

# This should create the app dir as `node`.
# If it is instead created as `root` then the `tar` command below will
# fail: `can't create directory 'packages/': Permission denied`.
# If this occurs, then ensure BuildKit is enabled (`DOCKER_BUILDKIT=1`)
# so the app dir is correctly created as `node`.
WORKDIR /app

# Copy the install dependencies from the build stage and context
COPY --from=build --chown=node:node /app/.yarn ./.yarn
COPY --from=build --chown=node:node /app/.yarnrc.yml  ./
COPY --from=build --chown=node:node /app/backstage.json ./
COPY --from=build --chown=node:node /app/yarn.lock /app/package.json /app/packages/backend/dist/skeleton/ ./

# Note: The skeleton bundle only includes package.json files -- if your app has
# plugins that define a `bin` export, the bin files need to be copied as well to
# be linked in node_modules/.bin during yarn install.

USER root
RUN chown -R node:node /app

USER node
RUN yarn workspaces focus --all --production && rm -rf "$(yarn cache clean)"

# Copy the built packages from the build stage
COPY --from=build --chown=node:node /app/packages/backend/dist/bundle/ ./

# Copy any other files that we need at runtime
COPY --chown=node:node app-config*.yaml ./

# This switches many Node.js dependencies to production mode.
ENV NODE_ENV=production

CMD ["node", "packages/backend", "--config", "app-config.yaml"]
