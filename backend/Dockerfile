FROM node:18-alpine

WORKDIR /app

# Copy package files and prisma schema
COPY backend/package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --omit=dev

# Generate Prisma client
RUN npx prisma generate --schema=prisma/schema.prisma

# Copy backend source
COPY backend/ ./

# Expose API port
EXPOSE 3002

CMD ["node", "server.js"]
