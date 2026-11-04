# API monitoring dashboard (Next.js BFF). No standalone output — plain build+start.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p /app/data
EXPOSE 3000
CMD ["sh", "-c", "mkdir -p /app/data && npm start"]
