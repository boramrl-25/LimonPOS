FROM node:18-alpine

WORKDIR /app

# Copy package files and prisma schema
COPY backend/package*.json ./
COPY prisma ./prisma/

# Install dependencies (skip postinstall - schema path differs in Docker)
RUN npm ci --omit=dev --ignore-scripts

# Generate Prisma client (schema at ./prisma in build context)
RUN npx prisma generate --schema=prisma/schema.prisma

# Copy backend source
COPY backend/ ./

# Expose API port
EXPOSE 3002

CMD ["node", "server.js"]
