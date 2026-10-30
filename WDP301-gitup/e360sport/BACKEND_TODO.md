# Backend cần bổ sung — khớp với Frontend đã viết lại (nghiệp vụ thật)

Tài liệu này liệt kê chính xác những gì **backend cũ (đã xây trước đó) cần bổ sung
hoặc thay đổi** để khớp với frontend vừa được viết lại cho nghiệp vụ đặt sân thật.
Không dùng dữ liệu mẫu nữa — mọi thứ dưới đây là API thật mà frontend sẽ gọi.

---

## 1. Nghiệp vụ mới: Giữ chỗ tạm thời (Hold) trước khi thanh toán

Đây là thay đổi lớn nhất. Trước đây `POST /bookings` tạo booking trực tiếp.
Giờ luồng đặt sân có 2 bước tách biệt:

### Bước 1 — Giữ chỗ tạm
```
POST /api/bookings/hold
Body: { venueId, courtId, date, startTime, endTime }
Trả về: { hold: { holdId, expiresAt } }
```
- Backend cần **kiểm tra khung giờ chưa bị đặt/giữ chỗ bởi ai khác**, rồi tạo
  một bản ghi tạm (có thể collection riêng `Hold` hoặc field trên `Booking`
  với status `on_hold`).
- `expiresAt` nên là **thời điểm hiện tại + 10 phút**.
- Cần có cơ chế tự động dọn dẹp hold hết hạn (cron job, hoặc TTL index của
  MongoDB nếu dùng collection riêng — khuyến nghị dùng TTL index, đơn giản
  và không cần cron: `db.holds.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })`).
- Nếu khung giờ đã bị giữ/đặt bởi người khác → trả lỗi 409 với message rõ ràng.

### Bước 2 — Tạo booking thật từ hold
```
POST /api/bookings
Body: { holdId, sport, players, notes }
Trả về: { booking }
```
- Backend xác thực `holdId` còn hợp lệ (chưa hết hạn, thuộc đúng user).
- Tạo `Booking` thật với `status: 'awaiting_payment'`.
- Xóa/đánh dấu hold đã dùng.

**Model `Booking` cần thêm status mới:** `awaiting_payment` (trước khi thanh
toán xong) — bên cạnh các status cũ (`pending`, `confirmed`, `completed`,
`cancelled`, `no_show`).

---

## 2. Nghiệp vụ mới: Thanh toán qua cổng thật (VNPay/Momo)

Trước đây `paymentController.confirmPayment` tự chuyển trạng thái ngay khi
gọi API. Giờ cần luồng redirect thật:

```
POST /api/payments/create-url
Body: { bookingId, method }   // method: 'vnpay' | 'momo'
Trả về: { paymentUrl }
```
- Backend dùng **merchant code + secret key thật** (từ VNPay/Momo sau khi
  đăng ký) để tạo URL thanh toán hợp lệ, có chữ ký (signature).
- Frontend chỉ redirect `window.location.href = paymentUrl` — không cần sửa
  gì thêm ở phía frontend khi có merchant key thật.
- Tham khảo tài liệu tích hợp:
  - VNPay: cần `vnp_TmnCode`, `vnp_HashSecret`, dùng thư viện `vnpay` (npm)
    hoặc tự build theo tài liệu VNPay.
  - Momo: cần `partnerCode`, `accessKey`, `secretKey`.

```
GET /api/payments/:bookingId/status
Trả về: { status }   // dùng khi user quay lại /payment?bookingId=... để hiển thị kết quả
```

**Quan trọng — IPN/Webhook (callback từ cổng thanh toán):**
Cần thêm 1 route riêng (không có trong danh sách cũ) để VNPay/Momo **gọi
thẳng vào backend** báo kết quả giao dịch, KHÔNG thông qua trình duyệt của
khách (vì khách có thể tắt trình duyệt giữa chừng):
```
POST /api/payments/vnpay/ipn     ← VNPay gọi vào đây
POST /api/payments/momo/ipn      ← Momo gọi vào đây
```
Route này xác thực chữ ký từ cổng thanh toán, rồi cập nhật
`booking.status = 'confirmed'` và `payment.status = 'completed'`. Đây là nơi
duy nhất đáng tin cậy để xác nhận thanh toán thành công — không tin dữ liệu
trả về qua query string khi redirect trình duyệt.

---

## 3. Field mới cần thêm vào response của Venue

Frontend giờ hiển thị "giá từ X" thay vì 1 giá cố định (vì mỗi venue có
nhiều court với giá khác nhau). Khi trả về danh sách venues
(`GET /venues`, `GET /venues/featured`), backend nên tính thêm field:

```js
minPricePerHour: Math.min(...courts.map(c => c.pricePerHour))
```

Có thể tính bằng MongoDB aggregation ($lookup + $min) hoặc tính ở tầng
controller sau khi query Court riêng.

---

## 4. Endpoint mới: Owner tạo booking thủ công

Chủ sân cần tạo booking hộ khách gọi điện/đến trực tiếp đặt, bỏ qua bước
giữ chỗ + thanh toán online:

```
POST /api/owner/bookings/manual
Body: { venueId, courtId, date, startTime, endTime, customerName, phone, sport, players }
Trả về: { booking }
```
- Backend cần **tự tạo hoặc tìm user tạm** cho khách vãng lai (không có tài
  khoản), hoặc thêm field `guestName`/`guestPhone` trực tiếp trên `Booking`
  thay vì bắt buộc `customerId` phải trỏ tới User thật.
- Booking tạo ra có `status: 'confirmed'` ngay, `paymentMethod: 'manual'`.
- Vẫn cần kiểm tra trùng giờ như logic `createBooking` thông thường.

---

## 5. Field mới cần thêm vào response của Booking (khi populate)

Frontend hiện dùng `booking.customerId.name`, `booking.customerId.phone` —
đảm bảo các endpoint sau **populate đủ trường này**:
- `GET /owner/bookings` — đã populate `customerId` với `name phone avatar` (✓ đã có)
- `GET /admin/bookings` — cần populate cả `customerId` (`name`) và `venueId` (`name`)

---

## 6. Chưa cần làm ngay (đã ghi chú rõ trong code frontend)

- **`GET /owner/customers`**: chưa có endpoint riêng. Frontend hiện tự suy ra
  danh sách khách hàng bằng cách gộp nhóm `/owner/bookings` ở phía client.
  Khi dữ liệu lớn, nên chuyển sang MongoDB aggregation ở backend
  (`$group` theo `customerId`) để tránh tải toàn bộ bookings mỗi lần xem trang.

- **Cấu hình nền tảng (Platform Settings)**: trang `AdminSettings` hiện chỉ
  hiển thị thông tin tĩnh, chưa lưu được. Cần model mới (`PlatformSetting`)
  và route `GET/PUT /api/admin/settings` nếu muốn tính năng này hoạt động.

---

## 7. Danh sách models cần cập nhật

### `Booking` model — thêm:
```js
status: { type: String, enum: ['awaiting_payment', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'], default: 'awaiting_payment' }
guestName: { type: String, default: '' },   // cho booking thủ công không có tài khoản
guestPhone: { type: String, default: '' },
```

### Model mới `Hold` (khuyến nghị) — hoặc field trên Booking:
```js
const holdSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  venueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
  date: String, startTime: String, endTime: String,
  expiresAt: { type: Date, required: true },
}, { timestamps: true })

holdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL — Mongo tự xóa khi hết hạn
```

---

## Tóm tắt việc cần làm khi bắt tay vào backend

1. Thêm model `Hold` + TTL index
2. Route `POST /bookings/hold` — kiểm tra trùng giờ, tạo hold
3. Sửa `POST /bookings` — nhận `holdId` thay vì tạo thẳng từ venueId/courtId
4. Đăng ký merchant VNPay/Momo thật → điền vào `.env`
5. Route `POST /payments/create-url` — build URL thanh toán có chữ ký thật
6. Route `POST /payments/vnpay/ipn` + `POST /payments/momo/ipn` — webhook xác nhận
7. Route `GET /payments/:bookingId/status` — FE poll khi quay lại
8. Route `POST /owner/bookings/manual` — booking thủ công
9. Thêm `minPricePerHour` vào response GET /venues
