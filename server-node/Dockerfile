FROM node:20-alpine
RUN apk add --no-cache python3 make g++ sqlite
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
ENV DB_PATH=/data/scores.db
EXPOSE 8080
CMD ["node", "index.js"]
