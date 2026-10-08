FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY client/package*.json client/
RUN npm install && npm --prefix client install

COPY . .
RUN npm --prefix client run build

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "server.js"]