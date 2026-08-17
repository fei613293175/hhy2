FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run build

FROM nginx:1.27-alpine
COPY --from=build /src/dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
