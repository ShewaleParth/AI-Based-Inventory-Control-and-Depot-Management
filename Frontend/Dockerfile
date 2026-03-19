# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies needed by some node-gyp packages if any (optional, but safe)
RUN apk add --no-cache python3 make g++

# Copy package info and install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Serve Stage
FROM nginx:alpine

# Copy built assets to Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Replace default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 5173 (parities with dev server)
EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
