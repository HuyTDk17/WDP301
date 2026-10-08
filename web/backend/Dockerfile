# syntax=docker/dockerfile:1

FROM node:20-alpine

# ⚠️ MÚI GIỜ: container Node mặc định chạy UTC. Ứng dụng đã neo cứng offset qua
# APP_TZ_OFFSET_MINUTES nên không phụ thuộc biến này, nhưng đặt TZ giúp mọi dòng
# log hiện đúng giờ Việt Nam — khi đối soát với cổng thanh toán thì đó là khác
# biệt giữa "tra được giao dịch trong 30 giây" và "dò mò cả buổi".
ENV TZ=Asia/Ho_Chi_Minh
RUN apk add --no-cache tzdata curl

WORKDIR /app

# Chép package trước rồi mới chép mã nguồn: Docker chỉ cài lại thư viện khi
# package*.json đổi, nên những lần build sau nhanh hơn hẳn.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Không chạy bằng root. Nếu có lỗ hổng cho phép thực thi lệnh, thiệt hại bị giới
# hạn trong phạm vi một người dùng thường.
RUN mkdir -p uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 9999

# Healthcheck gọi đúng endpoint đã kiểm tra cả kết nối cơ sở dữ liệu, nên một
# tiến trình còn sống nhưng mất kết nối DB sẽ bị đánh dấu unhealthy thay vì tiếp
# tục nhận request.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:9999/api/health || exit 1

# Dùng trực tiếp `node` chứ không qua `npm start`: npm không chuyển tiếp tín
# hiệu SIGTERM xuống tiến trình con, nên cơ chế tắt máy an toàn trong server.js
# sẽ không bao giờ chạy và request đang dở bị cắt ngang.
CMD ["node", "server.js"]
