# ESport360 Backend

REST API cho nền tảng đặt sân thể thao ESport360 — Node.js + Express + MongoDB.

Backend này được thiết kế cho **dữ liệu thật**, không có tài khoản demo hoặc dữ liệu mẫu
(venue/court/booking). Mọi tài khoản, địa điểm, sân và lượt đặt đều do người dùng thật
tạo ra qua giao diện.

## Cài đặt

```bash
npm install
```

## Cấu hình `.env`

```
PORT=9999
MONGO_URI=mongodb://127.0.0.1:27017/ABC
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:9999
UPLOAD_DIR=uploads
NODE_ENV=development

ADMIN_NAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_PHONE=

# VNPay — điền sau khi đăng ký merchant tại vnpay.vn hoặc *3388
VNP_TMN_CODE=
VNP_HASH_SECRET=
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html

# Momo — điền sau khi đăng ký merchant tại business.momo.vn
MOMO_PARTNER_CODE=
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create
```

Đảm bảo MongoDB đang chạy ở địa chỉ trong `MONGO_URI`.

**Về VNP_TMN_CODE / VNP_HASH_SECRET / MOMO_*:** để trống thì server vẫn chạy
bình thường, nhưng bước thanh toán (`POST /payments/create-url`) sẽ báo lỗi rõ
ràng "chưa cấu hình merchant". Chỉ cần điền các giá trị này (lấy từ VNPay/Momo
sau khi đăng ký merchant) là hoạt động ngay, không cần sửa code.

## Tạo tài khoản quản trị đầu tiên

```bash
npm run seed
```

Script này chỉ tạo tài khoản `admin` từ các biến `ADMIN_*` trong `.env`, không tạo
tài khoản demo, venue/court mẫu hoặc booking mẫu.

## Chạy server

```bash
npm run dev    # nodemon, tự reload khi sửa code
npm start      # chạy thường
```

Kiểm tra còn sống: `GET http://localhost:9999/api/health`

---

## Nghiệp vụ đặt sân — luồng "Giữ chỗ → Thanh toán"

Đây là điểm khác biệt lớn nhất so với backend CRUD thông thường:

```
1. Khách chọn sân + khung giờ
      → POST /bookings/hold
      → Backend kiểm tra khung giờ chưa bị đặt/giữ bởi ai khác
      → Tạo Hold (TTL 10 phút, MongoDB tự xóa khi hết hạn)

2. Khách xác nhận thông tin (môn thể thao, số người, ghi chú)
      → POST /bookings { holdId, sport, players, notes }
      → Backend xác thực hold còn hạn, tạo Booking status='awaiting_payment'

3. Khách chọn VNPay hoặc Momo
      → POST /payments/create-url { bookingId, method }
      → Backend tạo Payment (orderRef duy nhất), gọi VNPay/Momo lấy URL thật
      → Frontend redirect khách sang cổng thanh toán

4. Khách thanh toán xong trên VNPay/Momo
      → Cổng thanh toán gọi NGẦM (server-to-server) vào:
          GET  /api/payments/vnpay/ipn   (VNPay)
          POST /api/payments/momo/ipn    (Momo)
      → Backend xác thực chữ ký, cập nhật Payment + Booking status='confirmed'
      → Đây là nguồn DUY NHẤT đáng tin cậy để xác nhận thanh toán

5. Khách được cổng thanh toán redirect trình duyệt về:
      CLIENT_URL/payment?bookingId=xxx
      → Frontend gọi GET /payments/:bookingId/status để lấy trạng thái
        THẬT (đã được bước 4 cập nhật), không tin query string redirect.
```

**Vì sao tách IPN riêng khỏi return URL?** Khách có thể đóng trình duyệt
ngay sau khi thanh toán xong trên VNPay/Momo, trước khi kịp redirect về web.
IPN là request server-to-server, không phụ thuộc trình duyệt khách còn mở
hay không — nên đây mới là nguồn xác nhận đáng tin cậy.

### Cấu hình IPN URL trên Merchant Admin

Sau khi có tài khoản merchant thật, vào trang quản trị VNPay/Momo và khai báo:
- VNPay IPN URL: `https://<domain-backend-that>/api/payments/vnpay/ipn`
- Momo IPN URL: được gửi tự động trong mỗi request tạo giao dịch (field `ipnUrl`), không cần khai báo thủ công trên admin.

⚠️ Khi chạy local (`localhost`), cổng thanh toán **không gọi được** vào máy
bạn. Cần dùng công cụ như `ngrok` để có URL public trỏ về máy local khi test
thật với sandbox VNPay/Momo:
```bash
ngrok http 9999
# rồi dùng URL ngrok trả về thay cho SERVER_URL trong .env
```

---

## Cấu trúc dự án

```
backend/
├── config/db.js
├── models/
│   ├── User.js, Venue.js, Court.js, Review.js, Favorite.js, Notification.js
│   ├── Booking.js       — có status 'awaiting_payment', hỗ trợ guestName/guestPhone
│   ├── Payment.js        — có orderRef (mã gửi cổng TT), gatewayResponse (log thô)
│   └── Hold.js            — giữ chỗ tạm, TTL index tự xóa khi hết hạn
├── controllers/
├── routes/
├── middleware/            — auth (JWT + role-guard), errorHandler, upload (multer)
├── utils/
│   ├── generateToken.js, asyncHandler.js
│   ├── vnpay.js            — build URL có chữ ký + xác thực IPN VNPay
│   └── momo.js              — gọi API tạo giao dịch + xác thực IPN Momo
├── uploads/
├── seed.js                 — tạo tài khoản quản trị đầu tiên, KHÔNG tạo dữ liệu mẫu
└── server.js
```

## Danh sách API

### Auth (`/api/auth`)
| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| POST | `/register` | Public | Đăng ký |
| POST | `/login` | Public | Đăng nhập |
| GET | `/me` | Private | Thông tin user hiện tại |
| POST | `/forgot-password` | Public | Quên mật khẩu (chưa nối email thật) |
| PUT | `/profile` | Private | Cập nhật hồ sơ |
| PUT | `/change-password` | Private | Đổi mật khẩu |
| POST | `/avatar` | Private | Upload ảnh đại diện |

### Venues (`/api/venues`) — công khai
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/` | Danh sách venue (filter + `minPricePerHour` tính từ courts, pagination) |
| GET | `/featured` | Venue nổi bật |
| GET | `/:id` | Chi tiết venue + courts |
| GET | `/:id/slots?courtId=&date=` | Khung giờ đã đặt trong ngày |
| GET | `/:id/reviews` / POST `/:id/reviews` | Đánh giá |

### Bookings (`/api/bookings`) — khách hàng
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/hold` | **Giữ chỗ tạm 10 phút** trước khi thanh toán |
| POST | `/` | Tạo booking thật từ `holdId` (status `awaiting_payment`) |
| GET | `/my`, `/:id` | Xem lượt đặt |
| PATCH | `/:id/cancel` | Hủy |

### Payments (`/api/payments`)
| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/create-url` | Tạo URL thanh toán VNPay/Momo thật |
| GET | `/vnpay/ipn` | Webhook VNPay (server-to-server) |
| POST | `/momo/ipn` | Webhook Momo (server-to-server) |
| GET | `/:bookingId/status` | FE poll khi khách quay lại từ cổng TT |
| GET | `/history`, POST `/:id/refund` | Lịch sử & hoàn tiền |

### Owner (`/api/owner/*`) — role `owner`
Venues, Courts CRUD; `GET /bookings`; `POST /bookings/manual` (đặt hộ khách
gọi điện/vãng lai, bỏ qua bước hold+thanh toán online); `GET /stats`, `/revenue`.

### Admin (`/api/admin/*`) — role `admin`
Users, Owners, duyệt/từ chối Venue, xem tất cả Bookings, `GET /stats`.

---

## Kết nối Frontend

Trong `frontend/.env`:
```
VITE_API_URL=http://localhost:9999/api
```

Frontend gọi API thật qua `src/services/*.js` — không cần sửa gì thêm phía
frontend, mọi endpoint đã khớp sẵn với các service này.

## Việc cần làm tiếp

- Đăng ký merchant VNPay + Momo thật (xem hướng dẫn `*3388` cho VNPay hoặc business.momo.vn)
- Gửi email thật cho `forgot-password` (Nodemailer)
- `GET /owner/customers` riêng (hiện frontend tự gộp nhóm từ `/owner/bookings`)
- Model `PlatformSetting` cho trang cấu hình hệ thống của admin
- Rate-limiting cho `/auth/login` chống brute-force
- Test tự động (Jest + Supertest) cho luồng hold → booking → payment
