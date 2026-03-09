FROM node:22-slim

WORKDIR /app

COPY package*.json ./

# Install build dependencies for native modules (sqlite3, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/app/data/vouchers.db

CMD ["npm", "start"]