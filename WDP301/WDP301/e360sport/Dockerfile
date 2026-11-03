# syntax=docker/dockerfile:1

# ============================================================
# GIAI ĐOẠN 1 — BUILD
# ============================================================
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# ⚠️ Vite nhúng biến VITE_* vào bundle NGAY LÚC BUILD, không đọc lúc chạy. Nghĩa
# là không thể build một image rồi đổi địa chỉ API bằng biến môi trường khi khởi
# động container — phải truyền vào từ lúc build:
#     docker build --build-arg VITE_API_URL=https://api.esport360.vn/api .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# ============================================================
# GIAI ĐOẠN 2 — PHỤC VỤ TĨNH
# ============================================================
# Ảnh cuối chỉ chứa file tĩnh và nginx: không có Node, không có node_modules,
# nên vừa nhẹ vừa ít bề mặt tấn công hơn nhiều so với việc chạy `vite preview`.
FROM nginx:1.27-alpine

ENV TZ=Asia/Ho_Chi_Minh
RUN apk add --no-cache tzdata

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
