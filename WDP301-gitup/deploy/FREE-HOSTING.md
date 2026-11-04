# ESport360 — Triển khai MIỄN PHÍ

Bộ dịch vụ: **MongoDB Atlas M0** (database) + **Render** (backend) + **Cloudflare Pages** (frontend)
+ **Cloudinary** (ảnh) + **Brevo** (email) + **UptimeRobot** (giữ server thức).
Tất cả đều có gói miễn phí không cần thẻ (trừ khi dịch vụ đó yêu cầu thay đổi chính sách — hãy kiểm tra lại khi đăng ký).

> Code đã được sửa để chạy trên hosting có ổ đĩa tạm: ảnh → Cloudinary, giấy tờ chủ sân → MongoDB, email → Brevo API.

## 0. Bảo mật trước khi đưa lên mạng
- Sinh `JWT_SECRET` mới: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- Mật khẩu admin phải mạnh. **Không commit file `.env`** (kiểm tra `git status` trước khi push).

## 1. MongoDB Atlas (database)
1. mongodb.com/atlas → tạo cluster **M0 Free**, region Singapore.
2. Database Access: tạo user + mật khẩu (nên chỉ dùng chữ và số).
3. Network Access: thêm `0.0.0.0/0` (Render free không có IP cố định).
4. Connect → Drivers → chọn **Node.js 2.2.12 or later** để lấy chuỗi `mongodb://…?replicaSet=atlas-…`
   (backend bắt buộc chuỗi có `replicaSet=`). Thêm tên DB: `…mongodb.net:27017/esport360?replicaSet=…`
   Atlas M0 là replica set nên giao dịch (transaction) hoạt động bình thường.

## 2. Cloudinary (ảnh sân + avatar)
1. cloudinary.com → đăng ký miễn phí.
2. Dashboard → copy **API Environment variable**, dạng `cloudinary://<key>:<secret>@<cloud_name>`.
3. Dán vào biến `CLOUDINARY_URL` ở Render (bước 4). Ảnh sẽ nằm trong thư mục `esport360/venues` và `esport360/avatars`.

## 3. Brevo (email quên mật khẩu / xác minh email)
1. brevo.com → đăng ký miễn phí (300 email/ngày).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: nhập email của bạn, bấm link xác minh trong hộp thư.
3. **SMTP & API → API Keys → Generate a new API key** → copy.
4. Ở Render đặt `BREVO_API_KEY=<key>` và `MAIL_FROM=ESport360 <email-đã-xác-minh>`.
   Lưu ý: gửi từ địa chỉ Gmail/Yahoo cá nhân dễ vào hộp thư rác; về lâu dài nên dùng tên miền riêng và xác thực domain trong Brevo.

## 4. Render (backend)
New → Web Service → chọn repo GitHub.
- Root Directory `backend` · Build `npm ci` · Start `node server.js` · Instance **Free** · Health Check Path `/api/health`
- Biến môi trường:
```
NODE_ENV=production
APP_TZ_OFFSET_MINUTES=420
MONGO_URI=<chuỗi Atlas ở bước 1>
JWT_SECRET=<chuỗi vừa sinh>
TRUST_PROXY_HOPS=1
RUN_JOBS=true
CLIENT_URL=https://<tên>.pages.dev
SERVER_URL=https://<tên-service>.onrender.com
CLOUDINARY_URL=cloudinary://…
BREVO_API_KEY=…
MAIL_FROM=ESport360 <email-đã-xác-minh>
```
Mở `https://<tên-service>.onrender.com/api/health` — kết quả mong đợi: `"status":"ok"`, `"transactions":true`,
`"email":true`, `"imageStorage":"cloudinary"`.

### Tạo tài khoản admin (chạy 1 lần từ máy bạn)
```bash
cd backend && npm install
# tạo file .env tạm chỉ có: MONGO_URI (Atlas), ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE, JWT_SECRET
npm run seed
```
Rồi xoá file `.env` tạm đó.

## 5. Cloudflare Pages (frontend)
Workers & Pages → Create → Pages → Connect to Git.
- Root directory `e360sport` · Build `npm run build` · Output `dist`
- Biến: `VITE_API_URL=https://<tên-service>.onrender.com/api` (và `VITE_GOOGLE_CLIENT_ID` nếu dùng Google)
- Deploy xong, quay lại Render sửa `CLIENT_URL` đúng bằng link `pages.dev` (không có `/` cuối).

## 6. UptimeRobot (giữ server không ngủ)
Render free ngủ sau 15 phút không có truy cập, và tác vụ nền (huỷ đơn quá hạn, hết hạn giữ chỗ) chỉ chạy khi server thức.
uptimerobot.com → Add monitor → HTTP(s) → URL `https://<tên-service>.onrender.com/api/health` → mỗi 5 phút.

## Giới hạn cần biết
- Server vẫn có thể được Render khởi động lại bất cứ lúc nào (mất vài chục giây); dữ liệu không mất vì nằm ở Atlas/Cloudinary.
- Atlas M0 chỉ 512 MB: giấy tờ chủ sân (≤5 MB/file) chiếm chỗ — chỉ phù hợp quy mô nhỏ.
- Muốn không bị ngủ, không giới hạn: chuyển sang VPS theo `deploy/DEPLOY.md` (có thể đặt `PRIVATE_STORAGE=disk`).
