FROM node:24-alpine

WORKDIR /app

# Install production dependencies from the repository lockfile
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy mock HCM service
COPY src/integrations/hcm-mock/main.js ./main.js

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# Start service
CMD ["node", "main.js"]
