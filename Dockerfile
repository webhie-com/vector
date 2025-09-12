# Multi-stage build for Vector API Framework
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies stage
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run tests during build (optional - can be disabled for faster builds)
ARG RUN_TESTS=false
RUN if [ "$RUN_TESTS" = "true" ]; then bun test; fi

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]

# Development stage
FROM base AS development
ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

# Watch mode for development
CMD ["bun", "run", "--watch", "src/server.ts"]

# Test stage - for running tests in CI/CD
FROM base AS test
ENV NODE_ENV=test

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Default to running all tests
CMD ["bun", "test"]

# E2E test stage - for running E2E tests
FROM base AS e2e-test
ENV NODE_ENV=test

# Install additional tools for E2E testing
RUN apk add --no-cache curl jq

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Run E2E tests
CMD ["bun", "run", "test:e2e"]

# Load test stage
FROM base AS load-test
ENV NODE_ENV=test

COPY --from=deps /app/node_modules ./node_modules
COPY . .

CMD ["bun", "run", "test:load"]

# Benchmark stage
FROM base AS benchmark
ENV NODE_ENV=test

COPY --from=deps /app/node_modules ./node_modules
COPY . .

CMD ["bun", "run", "test:benchmark"]