# Multi-stage Dockerfile for api-gateway

# ===================================================
# Base Stage
# ===================================================
FROM node:18-alpine AS base
WORKDIR /app

# Copy shared utilities
COPY shared/ ./shared/

# ===================================================
# Development Stage
# ===================================================
FROM base AS development

# Copy package files
COPY services/api-gateway/package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install

# Copy service source
COPY services/api-gateway/ .

# Expose port
EXPOSE 8000

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]

# ===================================================
# Production Dependencies Stage
# ===================================================
FROM base AS dependencies

# Copy package files
COPY services/api-gateway/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# ===================================================
# Production Stage
# ===================================================
FROM node:18-alpine AS production

WORKDIR /app

# Create non-root user FIRST (before copying files)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy files with correct ownership from the start
COPY --from=base --chown=nodejs:nodejs /app/shared ./shared
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs services/api-gateway/package*.json ./
COPY --chown=nodejs:nodejs services/api-gateway/src ./src

# Create logs directory with correct ownership
RUN mkdir -p logs && chown nodejs:nodejs logs

# Use non-root user
USER nodejs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"

# Start application
CMD ["npm", "start"]
