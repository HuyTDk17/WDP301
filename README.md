# E360Sport — Backend API

Backend cho hệ thống **đặt sân thể thao E360Sport** (đặt sân, tìm sân, đánh giá, yêu thích, thông báo).

> **Stack:** Express + TypeScript + **MongoDB (Mongoose)** + Zod.
> Đây là bản viết lại hoàn toàn mới, dùng **MongoDB** (không dùng PostgreSQL/Prisma).

---

## 1. Cấu trúc dữ liệu (MongoDB)

10 collection khớp bộ dữ liệu mẫu `database-moi`:

| Collection | Mô tả |
|---|---|
| `users` | 250 người dùng (40 chủ sân + 210 người chơi), mật khẩu `12345678` |
| `venues` | 75 địa điểm sân (69 đã duyệt, 5 chờ duyệt, 1 bị từ chối) |
| `courts` | 213 sân con (giá theo giờ, loại sân, kích thước, mặt sân) |
| `bookings` | 1372 lượt đặt (kèm trường chuyển sân `transferredTo/FromBookingId`, `compensationAmount`…) |
| `payments` | 1289 thanh toán / hoàn tiền |
| `slotlocks` | 3259 bản khoá khung giờ (chống double-booking) |
| `reviews` | 205 đánh giá |
| `favorites` | 234 yêu thích |
| `notifications` | 426 thông báo |
| `platformsettings` | 1 bản cấu hình nền tảng (phí hoa hồng 10%, tier phí chuyển sân…) |

> **Không có admin** trong dataset → tạo admin bằng script seed (mục 4).

---

## 2. Chuẩn bị môi trường

Yêu cầu: **Docker Desktop** (chạy MongoDB) và **Node.js 18+**.

### 2.1. Khởi động MongoDB (replica set)

Booking dùng **transaction** để chống double-booking → MongoDB phải chạy ở chế độ **replica set 1 node**.

```bash
cd backend
docker compose up -d          # chạy MongoDB 7 với --replSet rs0
sh scripts/init-replicaset.sh  # khởi tạo replica set (chạy 1 lần)
```

> Nếu không dùng Docker Compose, chạy tay:
> ```bash
> docker run -d --name e360sport-mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
> docker exec e360sport-mongo mongosh --eval 'rs.initiate({_id:"rs0", members:[{_id:0, host:"localhost:27017"}]})'
> ```

### 2.2. Import dữ liệu mẫu

```bash
sh scripts/import-data.sh "/c/Users/<TEN>/Downloads/database-moi (1)/database"
```

Script này `docker cp` các file JSON vào container rồi `mongoimport --jsonArray` vào database `datsan247`.

---

## 3. Cài đặt & chạy backend

```bash
cd backend
npm install
cp .env.example .env          # chỉnh MONGODB_URI nếu cần
npm run dev                   # http://localhost:3000
```

Kiểm tra server: `curl http://localhost:3000/health`

Các script:

| Lệnh | Mô tả |
|---|---|
| `npm run dev` | Chạy dev (ts-node-dev, hot-reload) |
| `npm run build` | Build ra `dist/` |
| `npm run start` | Chạy bản build |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run seed:admin` | Tạo tài khoản admin |

---

## 4. Tạo tài khoản admin

Dataset không có admin. Tạo bằng biến môi trường `ADMIN_*` trong `.env` rồi chạy:

```bash
npm run seed:admin
```

Mặc định tạo: `admin@e360sport.vn` / `Admin@123456` (đổi trong `.env` nếu cần).

---

## 5. Tài khoản mẫu (dataset)

Mật khẩu **tất cả**: `12345678` (đăng nhập bằng **email**).

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Chủ sân (owner) | `nguyenan@gmail.com` | `12345678` |
| Người chơi (customer) | `phamha@gmail.com` | `12345678` |
| Admin (tạo thêm) | `admin@e360sport.vn` | `Admin@123456` |

Danh sách đầy đủ 250 tài khoản: xem file `TAI_KHOAN.csv` trong thư mục dữ liệu.

---

## 6. API

Auth: gửi header `Authorization: Bearer <accessToken>` cho các route cần đăng nhập.

### Auth
| Method | Path | Mô tả | Body |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Đăng ký | `{ name, email, phone, password, role? }` |
| POST | `/api/v1/auth/login` | Đăng nhập | `{ email, password }` |
| GET | `/api/v1/auth/me` | Thông tin tôi (cần auth) | — |
| GET | `/api/v1/auth/profile` | Hồ sơ đầy đủ + thống kê (số lượt đặt, đã chi, yêu thích, đánh giá) | — |

### Sân (venues) — công khai
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/venues` | Danh sách sân (query: `q`, `sport`, `city`, `district`, `minPrice`, `maxPrice`, `date` + `startTime` + `endTime`, `page`, `pageSize`) |
| GET | `/api/v1/venues/:id` | Chi tiết sân + danh sách sân con + `cancellationPolicy` |
| GET | `/api/v1/venues/:id/courts` | Sân con (query: `type`, `date`, `startTime`, `endTime`) |
| GET | `/api/v1/venues/:id/courts/:courtId/availability?date=YYYY-MM-DD` | Khung giờ trống trong ngày |

### Đặt sân (bookings) — cần auth
| Method | Path | Mô tả | Body |
|---|---|---|---|
| POST | `/api/v1/bookings` | Tạo booking (giữ slot, chống trùng) | `{ courtId, date, startTime, endTime, notes? }` |
| GET | `/api/v1/bookings` | Danh sách booking của tôi (query: `status`, `page`, `pageSize`) | — |
| GET | `/api/v1/bookings/:id` | Chi tiết booking | — |
| GET | `/api/v1/bookings/:id/cancellation-quote` | Xem trước tiền hoàn / phí huỷ nếu huỷ ngay | — |
| POST | `/api/v1/bookings/:id/cancel` | Huỷ booking theo chính sách (nhả slot, ghi tiền hoàn) | `{ reason? }` |

`POST /bookings` nhận thêm `holdId?` để chốt một lượt giữ chỗ tạm thành booking.

### Giữ chỗ tạm (slot hold) — cần auth
| Method | Path | Mô tả | Body |
|---|---|---|---|
| POST | `/api/v1/slot-holds` | Giữ slot tạm thời (mặc định 10 phút) | `{ courtId, date, startTime, endTime, purpose?: 'booking' \| 'transfer', ttlMinutes? }` |
| GET | `/api/v1/slot-holds/:holdId` | Xem hold còn bao lâu | — |
| DELETE | `/api/v1/slot-holds/:holdId` | Nhả hold | — |

### Đánh giá / yêu thích / thông báo
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/venues/:id/reviews` | Danh sách đánh giá sân |
| POST | `/api/v1/reviews` | Tạo đánh giá (auth) `{ venueId, rating, comment? }` |
| GET | `/api/v1/favorites` | Danh sách yêu thích (auth) |
| POST | `/api/v1/favorites` | Thêm yêu thích (auth) `{ venueId }` |
| DELETE | `/api/v1/favorites/:id` | Bỏ yêu thích (auth) |
| GET | `/api/v1/notifications` | Danh sách thông báo (auth) |
| POST | `/api/v1/notifications/read` | Đánh dấu đã đọc (auth) `{ ids?, all? }` |

---

## 7. Logic nghiệp vụ chính

- **Chống double-booking**: tạo booking chạy trong **MongoDB transaction**; slot được khoá trong collection `slotlocks` (index unique `courtId + date + slotIndex`). Khung giờ 30 phút = 1 `slotIndex` (`17:00 → 34`).
- **Giá**: `amount = pricePerHour × duration`; `ownerCommission = amount × commissionRate%` (commissionRate đọc từ `platformsettings`).
- **Tìm kiếm không dấu**: `q=an phat` vẫn khớp "Sân bóng đá An Phát" (regex mở rộng dấu tiếng Việt).
- **Huỷ booking**: chỉ huỷ được trước giờ bắt đầu. Tiền hoàn tính theo số giờ báo trước, đọc từ `platformsettings.cancellationTiers` (≥24h: 100%, ≥12h: 70%, ≥6h: 50%, ≥2h: 20%, còn lại: 0%). Khi huỷ: đổi trạng thái `cancelled`, lưu `refundAmount` + `cancellationFee`, tạo bản ghi `payments` loại `cancellation_refund`, gửi thông báo, xoá `slotlocks` để nhả khung giờ.
- **Giữ chỗ tạm**: `slotlocks` có thêm `holdId`, `heldBy`, `purpose`, `expiresAt`. Hold chặn người khác đặt/giữ slot đó cho tới khi hết hạn (index TTL tự xoá; các truy vấn cũng tự bỏ qua hold đã quá hạn). Thời hạn mặc định lấy từ `platformsettings.quoteTtlMinutes`. Luồng dùng: tạo hold → xử lý yêu cầu → `POST /bookings` kèm `holdId` để chốt, hoặc `DELETE` để nhả.
- **Lọc sân**: lọc giá theo `pricePerHour` của sân con; lọc giờ trống trả về venue còn ít nhất một sân con không bị khoá trong khung giờ đó và khung giờ nằm trong giờ mở cửa. Mỗi venue trả thêm `matchingCourts`.
- **Đặt sân**: từ chối khung giờ đã qua hoặc ngoài giờ mở cửa.

---

## 8. Frontend (React + Vite)

Giao diện web nằm ở `frontend/` (React 19 + Vite + TypeScript + Tailwind CSS v4). Cần backend đang chạy ở cổng 3000 — Vite tự proxy `/api` sang đó.

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Các trang: trang chủ, tìm sân (lọc môn / thành phố / quận / giá / giờ trống, tìm không dấu), chi tiết sân + đặt lịch theo slot 30 phút + chính sách huỷ, đánh giá, đăng nhập / đăng ký, hồ sơ, lịch đặt của tôi (xem chi tiết, huỷ có xem trước tiền hoàn), hoá đơn (in / lưu PDF), sân yêu thích, thông báo. Có giao diện sáng / tối.

Kiểm thử nhanh API (cần backend đang chạy): `node backend/scripts/e2e-check.cjs`. Script tạo 2 tài khoản thử `e2e.*@example.com` và in ID ra để dọn.

---

## 9. Cấu trúc thư mục

```
backend/
├── docker-compose.yml        # MongoDB replica set
├── scripts/
│   ├── init-replicaset.sh    # khởi tạo replica set
│   ├── import-data.sh        # import dữ liệu mẫu
│   ├── seed-admin.cjs        # tạo admin
│   └── e2e-check.cjs         # kiểm thử nhanh API
└── src/
    ├── config/               # env, db (mongoose)
    ├── models/               # User, Venue, Court, Booking, Payment, SlotLock, ...
    ├── middlewares/          # authenticate, errorHandler
    ├── services/             # auth, venue, booking, slotHold, interaction, session
    ├── controllers/
    ├── routes/               # auth, venue, booking, slotHold, interaction, index
    ├── validations/          # zod schema
    └── utils/                # ApiError, catchAsync, parse, slots
```

---

## 10. Tiến độ & việc còn lại

Số `#` là số thứ tự trong bảng **Total Project Tracking**. Bảng đó đang đánh trùng số 50 nên ở đây ghi là `50a` (match players) và `50b` (sửa / xoá đánh giá); số 48 không tồn tại.

**Tổng quan:** 14 chức năng đã xong · 50 chức năng chưa làm · 2 mục tài liệu (#1, #2). Phân công chi tiết cho 50 việc còn lại ở mục 10.2.

### 10.1. Đã xong (14)

| # | Chức năng | Phụ trách | Ghi chú |
|---|---|---|---|
| 3 | Đăng ký | Trung | |
| 4 | Đăng nhập JWT | Trung | |
| 6 | Xem hồ sơ | Trung | Trang `/profile`, API `GET /auth/profile` |
| 9 | Danh sách thông báo | Trung | |
| 10 | Đánh dấu đã đọc | Trung | |
| 40 | Tìm & lọc sân | Gia Huy | Khu vực, môn, giá, giờ trống |
| 41 | Chi tiết sân | Gia Huy | Ảnh, tiện ích, nội quy, chính sách huỷ, đánh giá |
| 42 | Chọn khung giờ | Gia Huy | |
| 44 | Xác nhận đặt sân | Gia Huy | |
| 46 | Huỷ đặt sân | Gia Huy | Theo chính sách hoàn tiền chung của nền tảng |
| 49 | Gửi đánh giá | Gia Huy | Chưa kiểm tra "đã từng chơi ở sân" |
| 53 | Lịch sử đặt sân | Gia Huy | |
| 54 | Xem / tải hoá đơn | Gia Huy | Trang `/bookings/:id/invoice`, tải bằng in → lưu PDF |
| 56 | Giữ / khoá slot | Minh | API `/slot-holds`, dùng được ngay cho chuyển sân |

### 10.2. Phân công việc còn lại (50 chức năng)

**Cách chia.** Mỗi việc được chấm điểm khối lượng: **S = 1** (vài giờ), **M = 2** (khoảng 1 ngày), **L = 3** (2–3 ngày). Chia theo tổng điểm chứ không theo số đầu mục, và gom các việc cùng một luồng về một người để không phải chờ nhau. Điểm là ước lượng, nhóm có thể chỉnh lại.

| Thành viên | Mảng phụ trách | Số việc | Điểm | Theo bảng tracking cũ |
|---|---|---|---|---|
| Trung | Tài khoản, quản lý người dùng, hồ sơ chủ sân | 11 + 3 việc nền | 22 | 3 việc / 5 điểm |
| Đ.Huy | Nội dung, duyệt sân, dashboard, khiếu nại | 11 + 1 việc nền | 22 | 15 việc / 24 điểm |
| Quang Phúc | Chủ sân: quản lý sân, lịch đặt, sự kiện, báo cáo | 10 | 19 | 17 việc / 33 điểm |
| Gia Huy | Voucher, thanh toán, đổi lịch, ghép người chơi | 9 | 19 | 7 việc / 15 điểm |
| Minh | Chuyển sân liên chủ sân (trọn luồng) | 9 | 21 | 8 việc / 19 điểm |

**Những việc đổi người so với bảng tracking** (nhớ cập nhật cột *In Charge*):

| # | Chức năng | Cũ → Mới | Lý do |
|---|---|---|---|
| 11, 12, 13 | Quản lý tài khoản, khoá, đổi vai trò | Đ.Huy → Trung | Cùng mảng tài khoản với #5–#8 |
| 19, 20, 21 | Xem / duyệt / từ chối hồ sơ chủ sân | Đ.Huy → Trung | Gom với #26 thành một luồng nộp → duyệt |
| 26, 66 | Nộp hồ sơ chủ sân, OCR giấy phép | Quang Phúc → Trung | Cùng luồng hồ sơ chủ sân, dùng chung phần upload file |
| 51, 52 | Gửi và theo dõi khiếu nại | Gia Huy → Đ.Huy | Gom với #23–#25 thành một luồng khiếu nại |
| 34, 35 | Tạo, sửa, tắt voucher | Quang Phúc → Gia Huy | Gom với #43 (áp mã) thành một luồng voucher |
| 33, 58 | Xử lý yêu cầu huỷ / đổi lịch, cấu hình chính sách huỷ | Quang Phúc → Gia Huy | Gom với #47 (đổi lịch) và phần huỷ đã làm (#46) |
| 59 | Duyệt yêu cầu chuyển sân đến | Quang Phúc → Minh | Gom trọn luồng chuyển sân |

Quy ước chung cho mọi việc: API đặt dưới `/api/v1`, validate bằng Zod trong `validations/`, logic trong `services/`, trả về `{ success, data }`; giao diện gọi qua `frontend/src/lib/api.ts`.

---

#### Trung — Tài khoản, quản lý người dùng, hồ sơ chủ sân (22 điểm)

Làm 3 việc nền trước vì các bạn khác phụ thuộc vào:

| Việc nền | Điểm | Nội dung | Ai cần |
|---|---|---|---|
| Phân quyền | S | Gắn `requireRoles('admin')` / `requireRoles('owner')` (đã có trong `middlewares/authenticate.ts`) vào nhóm route `/admin/*` và `/owner/*`; thêm component `RequireRole` ở frontend | Đ.Huy, Quang Phúc, Minh |
| Upload file | M | `POST /uploads` nhận ảnh / PDF (multer), giới hạn dung lượng và loại file, trả về URL | #7, #26, #27, #51 |
| Gửi email | M | Dịch vụ gửi mail (nodemailer), cấu hình SMTP trong `.env` | #5 |

| # | Chức năng | Điểm | Backend | Frontend |
|---|---|---|---|---|
| 5 | Quên / đặt lại mật khẩu | M | `POST /auth/forgot-password` tạo OTP có hạn và gửi mail; `POST /auth/reset-password` kiểm OTP, đổi mật khẩu | Trang `/forgot-password` và `/reset-password`; link từ trang đăng nhập |
| 7 | Cập nhật hồ sơ | M | `PATCH /auth/profile` (tên, SĐT, thành phố, bio, avatar) | Form sửa trên trang `/profile`, đổi avatar qua upload |
| 8 | Đổi mật khẩu | S | `POST /auth/change-password` (mật khẩu cũ + mới) | Form trên trang `/profile` |
| 11 | Xem & tìm tài khoản | M | `GET /admin/users` (tìm theo tên / email, lọc vai trò và trạng thái, phân trang) | Trang `/admin/users` dạng bảng |
| 12 | Khoá / mở khoá | S | `PATCH /admin/users/:id/status` (`active` / `locked` / `banned`, lưu `banReason`) | Nút khoá kèm ô nhập lý do |
| 13 | Đổi vai trò | S | `PATCH /admin/users/:id/role` | Ô chọn vai trò trong bảng |
| 26 | Nộp hồ sơ làm chủ sân | M | `POST /owner-applications` lưu các trường `ownerApplication*` và thông tin doanh nghiệp (đã có trong model User), trạng thái `pending` | Trang `/become-owner`: form + upload giấy phép; hiện trạng thái hồ sơ |
| 19 | Danh sách hồ sơ chủ sân | S | `GET /admin/owner-applications` (lọc theo trạng thái) | Trang `/admin/owner-applications` |
| 20 | Duyệt hồ sơ | S | `POST /admin/owner-applications/:id/approve`: đổi trạng thái, nâng `role` lên `owner`, gửi thông báo | Nút duyệt trong trang chi tiết hồ sơ |
| 21 | Từ chối hồ sơ | S | `POST /admin/owner-applications/:id/reject` lưu `ownerApplicationRejectionReason`, gửi thông báo | Nút từ chối kèm lý do |
| 66 | AI OCR giấy phép | L | Gọi dịch vụ OCR đọc giấy phép đã upload, so khớp tên doanh nghiệp / mã số thuế với thông tin khai trong hồ sơ, lưu kết quả | Hiện kết quả so khớp cho admin khi duyệt (#20) |

Thứ tự gợi ý: phân quyền → upload → #26 → #19–#21 → #11–#13 → #7, #8 → email → #5 → #66.

---

#### Đ.Huy — Nội dung, duyệt sân, dashboard, khiếu nại (22 điểm)

| Việc nền | Điểm | Nội dung | Ai cần |
|---|---|---|---|
| Khung giao diện quản trị | M | Layout riêng có menu bên cho `/admin/*` và `/owner/*`, dùng chung component bảng, form, hộp thoại xác nhận | Trung, Quang Phúc, Minh |

| # | Chức năng | Điểm | Backend | Frontend |
|---|---|---|---|---|
| 14 | Quản lý banner | M | Model `Banner` (ảnh, tiêu đề, link, thứ tự, bật / tắt); CRUD `/admin/banners`; `GET /banners` công khai | Trang `/admin/banners`; hiển thị banner ở trang chủ |
| 15 | Quản lý tin tức | M | Model `News`; CRUD `/admin/news`; `GET /news`, `GET /news/:id` | Trang `/admin/news`; trang `/news` và chi tiết bài viết |
| 16 | Quản lý chính sách | M | Model `Policy` (slug, tiêu đề, nội dung); CRUD `/admin/policies`; `GET /policies/:slug` | Trang `/admin/policies`; trang `/policies/:slug`, gắn link ở footer |
| 17 | Quản lý danh mục môn | M | Model `SportCategory` (key, tên, biểu tượng); CRUD `/admin/sports`; `GET /sports` | Trang `/admin/sports`; thay danh sách ghi cứng trong `frontend/src/lib/constants.ts` bằng dữ liệu từ API |
| 18 | Dashboard thống kê | M | `GET /admin/stats`: tổng user, sân, lượt đặt, doanh thu, hoa hồng theo tháng | Trang `/admin` có thẻ số liệu và biểu đồ |
| 22 | Sân chờ duyệt | M | `GET /admin/venues?status=pending`; `POST /admin/venues/:id/approve` và `/reject` (lưu `rejectionReason`), gửi thông báo cho chủ sân | Trang `/admin/venues` xem chi tiết rồi duyệt / từ chối |
| 51 | Gửi khiếu nại | M | Model `Complaint` (người gửi, booking / sân liên quan, nội dung, bằng chứng, trạng thái); `POST /complaints` | Nút "Khiếu nại" trong chi tiết lịch đặt, form + upload bằng chứng |
| 52 | Theo dõi khiếu nại | S | `GET /complaints` (của tôi), `GET /complaints/:id` | Trang `/complaints` hiện trạng thái và kết quả |
| 23 | Danh sách khiếu nại | S | `GET /admin/complaints` (lọc trạng thái) | Trang `/admin/complaints` |
| 24 | Điều tra khiếu nại | M | `PATCH /admin/complaints/:id` chuyển sang "đang xử lý", thêm ghi chú nội bộ | Trang chi tiết: xem bằng chứng, thông tin hai bên, ghi chú |
| 25 | Giải quyết & phản hồi | M | `POST /admin/complaints/:id/resolve` lưu kết luận, gửi thông báo cho khách | Form kết luận trong trang chi tiết |

Kèm tài liệu **#1 ERD**: bổ sung các entity mới (Banner, News, Policy, SportCategory, Complaint, Voucher, Event, TransferRequest).

Thứ tự gợi ý: khung giao diện → #22 → #18 → #51, #52 → #23–#25 → #14–#17.

---

#### Quang Phúc — Chủ sân: quản lý sân, lịch đặt, sự kiện, báo cáo (19 điểm)

Mọi API ở đây chỉ trả về dữ liệu của sân thuộc chủ sân đang đăng nhập (`venues.ownerId`).

| # | Chức năng | Điểm | Backend | Frontend |
|---|---|---|---|---|
| 27 | Tạo sân mới | L | `POST /owner/venues` (tên, môn, địa chỉ, ảnh, tiện ích, giờ mở cửa, nội quy) kèm danh sách sân con và giá; trạng thái `pending` | Trang `/owner/venues/new`: form nhiều bước, upload ảnh |
| 28 | Sửa thông tin sân | M | `PATCH /owner/venues/:id`; CRUD sân con `/owner/venues/:id/courts` | Trang sửa dùng lại form của #27 |
| 29 | Ẩn / hiện sân | S | `PATCH /owner/venues/:id/visibility` đổi `isActive` | Công tắc trong danh sách sân của tôi |
| 30 | Xoá sân | S | `DELETE /owner/venues/:id`, từ chối nếu còn booking sắp tới | Nút xoá có xác nhận |
| 31 | Danh sách / lịch đặt | L | `GET /owner/bookings` (lọc theo sân, ngày, trạng thái) | Trang `/owner/bookings`: bảng và lịch theo ngày từng sân con |
| 32 | Xác nhận / từ chối đặt sân | M | Thêm tuỳ chọn "duyệt thủ công" cho venue; booking vào trạng thái chờ; `POST /owner/bookings/:id/confirm` và `/reject` (nhả slot) | Nút xác nhận / từ chối trong #31 |
| 36 | Tạo sự kiện / khuyến mãi | M | Model `Event` (sân, tiêu đề, mô tả, thời gian, ảnh); `POST /owner/events`; `GET /events` công khai | Trang `/owner/events`; hiển thị sự kiện ở trang chi tiết sân |
| 37 | Sửa / huỷ sự kiện | S | `PATCH /owner/events/:id`, `POST /owner/events/:id/cancel` | Trong trang `/owner/events` |
| 38 | Báo cáo doanh thu | L | `GET /owner/reports`: doanh thu theo ngày / tháng, tỉ lệ lấp đầy, sân được đặt nhiều nhất | Trang `/owner/reports` có biểu đồ và bộ chọn khoảng thời gian |
| 39 | Trả lời đánh giá | S | Thêm `ownerReply`, `ownerRepliedAt` vào Review; `POST /owner/reviews/:id/reply` | Ô trả lời cho chủ sân; hiện phản hồi dưới đánh giá ở trang chi tiết sân |

Lưu ý **#32**: hiện đặt xong là `confirmed` ngay. Cần cả nhóm chốt: mặc định tự xác nhận và chỉ sân bật "duyệt thủ công" mới phải chờ (cách ít ảnh hưởng nhất đến phần đã làm).

Thứ tự gợi ý: #27 → #28 → #29, #30 → #31 → #32 → #38 → #39 → #36, #37.

---

#### Gia Huy — Voucher, thanh toán, đổi lịch, ghép người chơi (19 điểm)

| # | Chức năng | Điểm | Backend | Frontend |
|---|---|---|---|---|
| 34 | Tạo voucher | M | Model `Voucher` (mã, giảm % hoặc số tiền cố định, giới hạn lượt, hạn dùng, sân áp dụng); `POST /owner/vouchers` | Trang `/owner/vouchers` |
| 35 | Sửa / tắt voucher | S | `PATCH /owner/vouchers/:id`, `POST /owner/vouchers/:id/deactivate` | Trong trang `/owner/vouchers` |
| 43 | Áp mã voucher | M | `POST /vouchers/validate` trả về số tiền giảm; `POST /bookings` nhận `promoCode`, lưu `discountAmount` (hai trường đã có trong model Booking) | Ô nhập mã trong khung đặt sân (`BookingPanel.tsx`), hiện giá sau giảm |
| 45 | Thanh toán online | L | Tạo booking ở trạng thái `awaiting_payment` và giữ slot có hạn; tích hợp cổng thanh toán (hoặc chọn trả tại sân); webhook xác nhận → `confirmed`; quá hạn thì tự huỷ | Bước chọn phương thức thanh toán sau khi đặt; trang kết quả thanh toán |
| 47 | Đổi lịch | L | `POST /bookings/:id/reschedule`: kiểm tra slot mới còn trống, đổi khoá slot trong một transaction, tính chênh lệch giá | Nút "Đổi lịch" trong chi tiết lịch đặt, chọn ngày / giờ mới |
| 33 | Xử lý yêu cầu huỷ / đổi lịch | M | Với sân bật duyệt thủ công: yêu cầu huỷ / đổi lịch vào hàng chờ; `POST /owner/booking-requests/:id/approve` và `/reject` | Danh sách yêu cầu cho chủ sân |
| 58 | Cấu hình chính sách huỷ | M | Cho venue lưu `cancellationTiers` riêng; sửa `getCancellationTiers` trong `booking.service.ts` để ưu tiên chính sách của sân, không có thì dùng của nền tảng | Form sửa các mức hoàn tiền trong trang quản lý sân |
| 50a | Ghép người chơi | L | Model `MatchPost` (môn, khu vực, thời gian, trình độ, số người cần); CRUD + `POST /match-posts/:id/join` | Trang `/match`: danh sách có lọc, đăng tin, xin tham gia |
| 50b | Sửa / xoá đánh giá của mình | S | `PATCH` và `DELETE /reviews/:id`, tính lại điểm trung bình của sân | Nút sửa / xoá trên đánh giá của chính mình |

Lưu ý: **#45** làm thay đổi luồng đặt sân hiện tại nên cần báo cả nhóm trước khi gộp code. Phần giữ slot có hạn dùng được ngay API `/slot-holds` (đã xong).

Thứ tự gợi ý: #50b → #34, #35 → #43 → #58 → #47 → #33 → #45 → #50a.

---

#### Minh — Chuyển sân liên chủ sân, trọn luồng (21 điểm)

Nền đã có sẵn: Booking có `transferredToBookingId`, `transferredFromBookingId`, `rootBookingId`, `transferCount`, `compensationAmount`, `transferFeeAmount`; `platformsettings` có `transferFeeTiers`, `compensationTiers`, `transferMinLeadTimeHours`, `maxTransfersPerBooking`, `ownerApprovalTimeoutMinutes`; API giữ slot `/slot-holds` (#56).

| # | Chức năng | Điểm | Backend | Frontend |
|---|---|---|---|---|
| 60 | Duyệt chủ sân vào mạng lưới | M | Thêm trạng thái thành viên mạng lưới cho chủ sân; `POST /owner/network/join`; `POST /admin/network/:ownerId/approve` và `/reject` | Nút xin tham gia cho chủ sân; trang `/admin/network` |
| 61 | Cấu hình chính sách mạng lưới | M | `GET` và `PATCH /admin/transfer-policy` sửa các trường transfer trong `platformsettings` | Trang `/admin/transfer-policy` |
| 55 | Dịch vụ tìm sân thay thế | L | `GET /bookings/:id/transfer-options`: sân cùng môn, khung giờ tương tự, thuộc mạng lưới, còn trống (tái dùng bộ lọc giờ trống trong `listVenues`) | Danh sách sân thay thế để chọn |
| 57 | Tính phí chuyển & chênh lệch giá | L | Hàm tính theo `transferFeeTiers` (cùng sân / cùng chủ / khác chủ), `compensationTiers`, chênh lệch giá, chặn trên dưới theo `transferFeeMin` / `transferFeeMax` | — |
| 64 | Xem ước tính phí | S | `GET /bookings/:id/transfer-quote?courtId=&date=&startTime=` | Bảng phí hiện trước khi xác nhận |
| 63 | Gửi yêu cầu chuyển sân | L | Model `TransferRequest`; `POST /transfers`: kiểm tra điều kiện, gọi `/slot-holds` với `purpose: 'transfer'` giữ slot đích; sân không cần duyệt thì chuyển ngay | Nút "Chuyển sân" trong chi tiết lịch đặt, đi qua các bước chọn sân → xem phí → xác nhận |
| 59 | Duyệt / từ chối yêu cầu đến | M | `GET /owner/transfers`; `POST /owner/transfers/:id/approve` (tạo booking mới từ hold, huỷ booking cũ) và `/reject` (nhả hold); quá `ownerApprovalTimeoutMinutes` thì tự hết hạn | Trang `/owner/transfers` |
| 65 | Theo dõi trạng thái yêu cầu | M | `GET /transfers`, `GET /transfers/:id` | Trang `/transfers`: chờ duyệt / đã duyệt / từ chối / hết hạn |
| 62 | Giám sát & xử lý tranh chấp | L | `GET /admin/transfers`; `POST /admin/transfers/:id/resolve` (hoàn tiền, huỷ chuyển, ghi kết luận) | Trang `/admin/transfers` |

Thứ tự gợi ý: #57 → #55 → #64 → #63 → #59 → #65 → #60, #61 → #62.

---

#### Cả nhóm

| # | Mục | Ghi chú |
|---|---|---|
| 2 | Context diagram & Use case diagram | Mỗi người vẽ phần use case của mảng mình, Đ.Huy gộp lại |

### 10.3. Thứ tự phụ thuộc giữa các thành viên

- **Tuần đầu, làm trước hết:** Trung làm phân quyền và upload file; Đ.Huy làm khung giao diện quản trị. Ba việc này chặn Quang Phúc, Minh và phần admin.
- **Gia Huy** và **Minh** bắt đầu ngay được với phần không phụ thuộc: #50b, #34, #57, #55.
- **Quang Phúc** cần upload file cho #27; trong lúc chờ có thể làm #31, #38 (chỉ đọc dữ liệu có sẵn).
- **#32 và #45** đổi luồng đặt sân hiện tại, hai bạn Quang Phúc và Gia Huy cần thống nhất trạng thái booking với nhau trước khi làm.
- **Thuật ngữ:** bảng tracking gọi là "Field", code tách thành `Venue` (địa điểm) và `Court` (sân con).
