FROM node:18-slim

# Install system dependencies needed for Node and any native modules
RUN apt-get update && apt-get install -y \
    libaio1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --production

# Copy server code
COPY . .

# Environment defaults
ENV PORT=3005
ENV ORACLE_THIN_MODE=true

EXPOSE 3005

CMD ["node", "index.js"]
