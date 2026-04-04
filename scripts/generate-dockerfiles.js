#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Generate Dockerfiles for all services
 */

const ROOT_DIR = path.join(__dirname, '..');

const SERVICES = [
    { name: 'auth-service', port: 3001 },
    { name: 'subscription-service', port: 3003 },
    { name: 'payment-service', port: 3004 },
    { name: 'notification-service', port: 3008 },
    { name: 'analytics-service', port: 3009 },
    { name: 'support-service', port: 3010 },
    { name: 'media-service', port: 3011 },
    { name: 'chat-service', port: 3012 },
    { name: 'api-gateway', port: 8000 }
];

/**
 * Generate Dockerfile content for a service
 */
function generateDockerfile(serviceName, port) {
    return `# Multi-stage Dockerfile for ${serviceName}

# ===================================================
# Base Stage
# ===================================================
FROM node:20-alpine AS base
WORKDIR /app

# Copy shared utilities
COPY shared/ ./shared/

# ===================================================
# Development Stage
# ===================================================
FROM base AS development

# Copy package files
COPY services/${serviceName}/package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install

# Copy service source
COPY services/${serviceName}/ .

# Expose port
EXPOSE ${port}

# Start with nodemon for hot reload
CMD ["npm", "run", "dev"]

# ===================================================
# Production Dependencies Stage
# ===================================================
FROM base AS dependencies

# Copy package files
COPY services/${serviceName}/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# ===================================================
# Production Stage
# ===================================================
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user FIRST (before copying files)
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001

# Copy files with correct ownership from the start
COPY --from=base --chown=nodejs:nodejs /app/shared ./shared
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs services/${serviceName}/package*.json ./
COPY --chown=nodejs:nodejs services/${serviceName}/src ./src

# Create logs directory with correct ownership
RUN mkdir -p logs && chown nodejs:nodejs logs

# Use non-root user
USER nodejs

# Expose port
EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:${port}/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });"

# Start application
CMD ["npm", "start"]
`;
}

/**
 * Generate .dockerignore content for a service
 */
function generateDockerignore() {
    return `node_modules
npm-debug.log
.env
.env.*
.git
.gitignore
README.md
*.md
logs
*.log
coverage
.nyc_output
dist
build
.vscode
.idea
*.swp
*.swo
*~
.DS_Store
Thumbs.db
`;
}

/**
 * Main execution
 */
function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🐳 MICROSERVICE - DOCKERFILE GENERATOR');
    console.log('='.repeat(60) + '\n');

    try {
        let successCount = 0;

        SERVICES.forEach(({ name, port }) => {
            const serviceDir = path.join(ROOT_DIR, 'services', name);

            // Create Dockerfile
            const dockerfilePath = path.join(serviceDir, 'Dockerfile');
            const dockerfileContent = generateDockerfile(name, port);
            fs.writeFileSync(dockerfilePath, dockerfileContent);
            console.log(`✓ Generated Dockerfile for ${name}`);

            // Create .dockerignore
            const dockerignorePath = path.join(serviceDir, '.dockerignore');
            const dockerignoreContent = generateDockerignore();
            fs.writeFileSync(dockerignorePath, dockerignoreContent);
            console.log(`✓ Generated .dockerignore for ${name}`);

            successCount++;
        });

        console.log('\n' + '='.repeat(60));
        console.log(`✅ Generated ${successCount * 2} Docker files for ${successCount} services`);
        console.log('='.repeat(60));

        console.log('\n📝 Next steps:');
        console.log('  1. Review Dockerfiles in services/*/Dockerfile');
        console.log('  2. Build images: docker-compose build');
        console.log('  3. Start services: docker-compose up -d\n');

    } catch (error) {
        console.error('\n❌ Error generating Dockerfiles:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, generateDockerfile, generateDockerignore };
