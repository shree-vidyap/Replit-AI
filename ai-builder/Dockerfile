# Web app image (production)
FROM node:20-alpine AS build
WORKDIR /app

# Copy package.json and lockfile from current context (ai-builder)
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies
RUN npm ci   # or npm install if no lockfile

# Copy the rest of the app
COPY . .

# Build the app
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
