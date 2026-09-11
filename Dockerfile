# ===== 阶段 1：构建 React + TypeScript 静态产物 =====
FROM node:20-alpine AS builder
WORKDIR /app

# 优先复制依赖描述，利用构建缓存
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# ===== 阶段 2：Nginx 运行（非 root + HEALTHCHECK） =====
FROM nginx:1.27-alpine

# 非 root 用户：nginx 镜像内置 uid=101 的 nginx 用户
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /var/log/nginx /etc/nginx/conf.d && \
    rm -f /etc/nginx/conf.d/default.conf

COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=8s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
