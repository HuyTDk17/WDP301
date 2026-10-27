# ESport360 — Hướng dẫn triển khai thật

Tài liệu này dành cho lần đưa hệ thống lên chạy cho người dùng thật đầu tiên.
Thứ tự các bước là bắt buộc: bước 4 không làm được nếu chưa xong bước 1.

**Tin tốt so với việc dùng VNPay/MoMo:** thanh toán ở đây là chuyển khoản ngân
hàng trực tiếp — không cần đăng ký merchant, không cần chờ duyệt hồ sơ doanh
nghiệp. Chỉ cần một tài khoản ngân hàng bất kỳ là chạy được ngay. Đánh đổi:
mặc định phải có người đối chiếu sao kê thủ công để xác nhận giao dịch (mục 1
bên dưới nói rõ cách nâng cấp lên xác nhận tự động nếu muốn).

---

## 0. Chép các file đã sửa vào dự án

Giải nén gói này rồi chép đè lên dự án gốc, giữ nguyên cấu trúc thư mục — toàn
bộ nội dung trong gói đã là bản đầy đủ, ghép sẵn.

Sau đó cài thư viện và chạy kiểm thử:

```bash
cd backend && npm install && npm test
# Mong đợi: 11 đạt (transferPricing) + 16 đạt (creditAndPolicy), 0 lỗi

cd ../e360sport && npm install && npm run build
# Mong đợi: build thành công, không lỗi
```

---

## 1. Chuẩn bị tài khoản ngân hàng

Đây là toàn bộ "đăng ký merchant" cần làm — không có bước duyệt hồ sơ nào cả:

1. Có sẵn một tài khoản ngân hàng (cá nhân hoặc doanh nghiệp) dùng để nhận
   tiền từ khách.
2. Tra **mã BIN** ngân hàng theo chuẩn Napas tại
   `https://api.vietqr.io/v2/banks` (ví dụ: ACB = `970416`,
   Vietcombank = `970436`, MB Bank = `970422`, Techcombank = `970407`).
3. Ghi lại: mã BIN, số tài khoản, tên chủ tài khoản (không dấu), tên ngân hàng
   hiển thị.

Bốn giá trị này điền vào trang **Cài đặt → Tài khoản nhận thanh toán** sau khi
đăng nhập admin (bước 6), hoặc điền trước vào `.env` (`BANK_BIN`,
`BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `BANK_NAME`) để hệ thống tự nạp vào
cơ sở dữ liệu ở lần khởi động đầu tiên.

### Ai xác nhận giao dịch?

Khách chuyển khoản **thẳng vào tài khoản của chủ sân** (đặt sân, tiền bù và phí
chuyển sân), bấm "Tôi đã chuyển khoản", rồi **chủ sân** đối chiếu sao kê và bấm
xác nhận trong mục *Xác nhận chuyển khoản*. Hoàn tiền cũng do chủ sân thực hiện.
Quản trị viên không xác nhận hay hoàn tiền; nền tảng chỉ thu hoa hồng qua hoá đơn
đối soát gửi cho chủ sân. Tài khoản ngân hàng khai ở đây là tài khoản NỀN TẢNG để
chủ sân nộp hoa hồng.

---

## 2. Máy chủ và tên miền

Cấu hình tối thiểu: **2 vCPU, 4 GB RAM, 40 GB SSD**, Ubuntu 22.04 hoặc 24.04.

Trỏ DNS về IP máy chủ:

| Bản ghi | Tên | Giá trị |
|---|---|---|
| A | `esport360.vn` | IP máy chủ |
| A | `www` | IP máy chủ |
| A | `api` | IP máy chủ |

Chờ DNS lan truyền (thường 5–30 phút) rồi mới sang bước chứng chỉ.

Cài đặt trên máy chủ:

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # đăng xuất rồi đăng nhập lại cho có hiệu lực
```

Mở tường lửa đúng ba cổng, **không mở 27017 và 9999**:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

> MongoDB trong cấu hình này không đặt mật khẩu vì nó chỉ nghe trong mạng nội bộ
> của Docker. Mở 27017 ra Internet là mất sạch dữ liệu trong vài giờ.

---

## 3. Chứng chỉ HTTPS

```bash
sudo mkdir -p /var/www/certbot
sudo certbot certonly --nginx -d esport360.vn -d www.esport360.vn
sudo certbot certonly --nginx -d api.esport360.vn
```

> HTTPS ở đây không còn là yêu cầu bắt buộc từ phía cổng thanh toán (khác
> VNPay/MoMo trước đây) — nhưng vẫn bắt buộc để bảo vệ token đăng nhập và
> thông tin cá nhân của người dùng khi truyền qua mạng, và bắt buộc nếu bạn
> dùng webhook tự xác nhận phí dịch vụ (mục dưới).

### Tự động xác nhận chủ sân đã nộp phí dịch vụ (tuỳ chọn)

Mỗi tháng hệ thống lập hoá đơn (mã `HH…`) để chủ sân chuyển khoản vào **tài khoản nền tảng**. Để hoá đơn tự đóng và
popup nhắc tự tắt khi tiền về:

1. Đăng ký một dịch vụ đọc sao kê (SePay `sepay.vn` hoặc Casso `casso.vn`) và liên kết tài khoản nền tảng.
2. Đặt trong `.env`: `BANK_WEBHOOK_SECRET=<chuỗi ngẫu nhiên ≥ 24 ký tự>`.
3. Cấu hình webhook ở dịch vụ trên: URL `https://api.<tên-miền>/api/webhooks/bank`, xác thực API Key = đúng giá trị trên
   (SePay gửi `Authorization: Apikey …`, Casso gửi `secure-token`).

Hệ thống khớp theo **mã hoá đơn trong nội dung chuyển khoản** + đúng tài khoản nhận; chuyển thiếu thì cộng dồn, chuyển dư vẫn
đóng hoá đơn, cùng một giao dịch bắn lại nhiều lần chỉ tính một lần. Không cấu hình thì admin vẫn xác nhận tay ở trang Đối soát.

Certbot tự gia hạn qua systemd timer:

```bash
sudo certbot renew --dry-run
```

---

## 4. Biến môi trường

```bash
cd backend
cp .env.example .env
nano .env
```

Giá trị **bắt buộc phải tự sinh, không được dùng lại của ai**:

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> Khoá mẫu `your_secret_key` từng nằm trong bản đóng gói dự án ban đầu. Nếu
> bạn từng dùng file `.env` đó, coi như khoá đã lộ — bất kỳ ai có nó đều tự ký
> được token quản trị viên. Phải đổi.

Điền tiếp: `MONGO_URI` (giữ nguyên nếu dùng docker-compose), `CLIENT_URL`,
`SERVER_URL`, `BANK_*` (mục 1), SMTP, và `ADMIN_*` cho lần seed đầu.

Kiểm tra trước khi chạy:

```bash
npm run check-config
```

Lệnh này liệt kê mọi thứ còn thiếu. Ở production, thiếu `JWT_SECRET` hợp lệ
hoặc thiếu replica set MongoDB làm máy chủ **không khởi động** — cố ý như vậy,
vì đây là những sai sót không làm ứng dụng sập mà chỉ làm nó sai âm thầm.
Thiếu tài khoản ngân hàng chỉ **cảnh báo** (không chặn khởi động), vì bạn có
thể điền qua trang Cài đặt sau khi hệ thống đã chạy.

---

## 5. Khởi chạy

```bash
# Từ thư mục gốc dự án (nơi có docker-compose.yml)
docker compose up -d --build

# Khởi tạo replica set (chỉ lần đầu)
docker compose exec mongo mongosh --quiet /scripts/init-rs.js

# Tạo tài khoản quản trị + dữ liệu mẫu
docker compose exec api node seed.js

# Dựng khoá khung giờ cho đơn cũ — BẮT BUỘC nếu bạn có dữ liệu từ trước
docker compose exec api npm run migrate
```

Đặt nginx ngoài cùng:

```bash
sudo cp deploy/nginx/esport360.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/esport360.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Kiểm tra:

```bash
curl https://api.esport360.vn/api/health
```

Kết quả mong đợi — chú ý `transactions` và `bankAccount` phải là `true`:

```json
{"status":"ok","db":"connected","transactions":true,
 "bankAccount":true,"email":true}
```

Nếu `transactions` là `false`, replica set chưa hoạt động — xem lại lệnh
`init-rs.js` và `docker compose logs mongo`. Nếu `bankAccount` là `false`, vào
trang Cài đặt (Admin) điền tài khoản ngân hàng, hoặc kiểm tra lại `.env`.

---

## 6. Đổi mật khẩu quản trị, điền tài khoản ngân hàng, dọn dấu vết

1. Đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Đổi mật khẩu ngay trong trang Hồ sơ.
3. Vào **Cài đặt → Tài khoản nhận thanh toán**, kiểm tra lại thông tin ngân
   hàng đã đúng (nếu chưa điền qua `.env` ở bước 4, điền ở đây).
4. **Xoá bốn dòng `ADMIN_*` khỏi `.env`** rồi `docker compose restart api`.
5. Kiểm tra `.env` **không** nằm trong git: `git check-ignore backend/.env`
   phải in ra đường dẫn. Nếu nó đã từng được commit, đổi lại toàn bộ khoá.

---

## 7. Kiểm thử trước khi mở cho người dùng thật

Đã có sẵn bộ kiểm thử tích hợp trong `backend/tests/integration/` — chạy thẳng
được, không cần bạn tự viết lại. Đây là những kịch bản kiểm thử đơn vị không
bao giờ phát hiện được vì cần một MongoDB thật xử lý các request đồng thời.

**Cách chạy** (cần một MongoDB có replica set — dùng một container dùng một
lần, xoá sạch sau khi xong, không đụng gì tới dữ liệu thật của bạn):

```bash
cd backend

docker run -d --name sv-test-mongo -p 27018:27017 mongo:7 \
    mongod --replSet rs0 --bind_ip_all
sleep 3
docker exec sv-test-mongo mongosh --quiet --eval \
    "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"

TEST_MONGO_URI="mongodb://localhost:27018/esport360_test?replicaSet=rs0&directConnection=true" \
    npm run test:integration

docker rm -f sv-test-mongo   # dọn dẹp khi xong
```

Bộ test kiểm tra 4 nhóm:

| File | Kiểm tra gì |
|---|---|
| `booking-race.integration.test.js` | Hai/mười request cùng giành một khung giờ — đúng một bên thắng (IT-06) |
| `booking-expiry.integration.test.js` | Đơn quá hạn tự huỷ đúng lúc; **không** tự huỷ nhầm đơn khách đã báo "đã chuyển khoản" đang chờ admin xác nhận |
| `credit-concurrency.integration.test.js` | Số dư khuyến mãi không bị tiêu hai lần khi nhiều request cùng lúc |
| `loyaltyPoints.test.js` *(ở `tests/`, không cần CSDL)* | Quy đổi điểm ↔ VNĐ, tách hoàn 3 chiều (tiền mặt/số dư/điểm) |
| `transfer-flow.integration.test.js` | Luồng chuyển sân T4 đầy đủ (báo giá → chuyển khoản → admin xác nhận → giao dịch nguyên tử) và T2 (hoàn tiền, chạy ngay) — bao gồm đúng chỗ vừa được vá: hạn giữ chỗ khung giờ đích phải khớp với hạn chuyển khoản |

> ⚠️ Bộ test này được viết cẩn thận, bám sát các hàm thật trong code (không
> viết lại logic song song để so sánh), và đã qua kiểm tra cú pháp — nhưng môi
> trường tạo ra nó không có MongoDB nên **chưa từng được chạy thử thật sự**.
> Rất có thể lần chạy đầu tiên trên máy bạn sẽ lộ ra một vài lỗi nhỏ (lệch tên
> trường, thứ tự await...). Đây vẫn là điểm khởi đầu tốt hơn nhiều so với
> không có gì — chạy thử, và nếu có lỗi, gửi lại thông báo lỗi để sửa tiếp.

Sau khi các test này xanh, vẫn nên tự tay thử thêm trên giao diện thật những
gì code không kiểm tra được — cảm giác dùng, tốc độ, mã QR quét bằng app ngân
hàng thật:

| Kịch bản | Tiêu chí đạt |
|---|---|
| Đặt sân, chuyển khoản, quản trị viên xác nhận | Khách nhận thông báo, giao diện cập nhật đúng lúc |
| Quét mã QR bằng app ngân hàng thật | App tự điền đúng số tiền + nội dung |
| Chuyển khoản với nội dung bị ngân hàng cắt bớt/thêm tiền tố | Vẫn đối chiếu được thủ công |
| Quên mật khẩu → đặt lại | Nhận được email, liên kết dùng một lần |

Kiểm thử múi giờ đáng làm riêng: tạo một đơn cho **19:00 tối nay**, gọi
`GET /api/bookings/:id/transfer/eligibility` và xem `leadTimeHours` có đúng
bằng số giờ còn lại thật không. Lệch 7 tiếng nghĩa là `APP_TZ_OFFSET_MINUTES`
sai, và hậu quả là thu sai tiền chuyển sân của khách.

---

## 8. Vận hành hằng ngày

**Sao lưu** — quan trọng hơn mọi thứ khác trong tài liệu này:

```bash
0 2 * * * docker compose -f /duong/dan/docker-compose.yml exec -T mongo \
  mongodump --archive --gzip --db=esport360 > /backup/sv-$(date +\%F).gz
```

Nhớ **thử khôi phục thử một lần**. Một bản sao lưu chưa từng được khôi phục
thì chưa phải là bản sao lưu.

Ảnh upload nằm trong Docker volume `uploads_data`, phải sao lưu riêng:

```bash
docker run --rm -v esport360_uploads_data:/data -v /backup:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

**Xem log:**

```bash
docker compose logs -f api
docker compose logs --tail=200 mongo
```

**Xem giao dịch chờ xác nhận mỗi ngày:** trang **Admin → Xác nhận chuyển
khoản**. Đây là công việc vận hành thường xuyên nhất khi chưa bật đối soát tự
động — nên kiểm tra ít nhất vài lần mỗi ngày trong giờ hành chính để khách
không phải chờ lâu.

**Cập nhật bản mới:**

```bash
git pull
docker compose up -d --build
```

Backend đã có cơ chế tắt an toàn: nhận SIGTERM thì ngừng nhận request mới, chờ
request đang dở xong rồi mới thoát.

**Khi cần scale nhiều tiến trình API:** đặt `RUN_JOBS=false` ở tất cả trừ đúng
một instance. Tác vụ nền chạy bằng `setInterval` trong tiến trình, nên hai
instance cùng chạy sẽ cùng huỷ một đơn và trả lại số dư hai lần.

---

## 9. Những việc còn lại, không chặn việc chạy thật

Xếp theo mức độ nên làm sớm:

1. **Đặt SLA xác nhận chuyển khoản.** Nếu không bật đối soát tự động, cam kết
   nội bộ một mốc thời gian xác nhận (ví dụ trong 15–30 phút giờ hành chính) và
   theo dõi xem có đạt được không — khách chờ quá lâu sẽ nghi ngờ hệ thống.
2. **Chuyển ảnh upload sang object storage** (S3, Cloudflare R2, DigitalOcean
   Spaces). Hiện ảnh nằm trên đĩa máy chủ.
3. **Gom công nợ chủ sân về một nguồn duy nhất** trong `payoutController` khi
   dữ liệu cũ đã đi qua hết một kỳ (xem chú thích trong file).
4. **Hàng đợi thử lại cho EX-05** (thanh toán thành công nhưng thực thi
   chuyển sân lỗi) — hiện huỷ ngay lần đầu và hoàn 100%, an toàn nhưng kém
   trải nghiệm.
5. **Giám sát.** Tối thiểu là một dịch vụ ping `/api/health` mỗi phút và báo
   khi `status`, `transactions` hoặc `bankAccount` khác giá trị mong đợi.
6. **Pháp lý.** Nền tảng giữ tiền của bên thứ ba rồi chi hộ cho chủ sân. Trước
   khi mở cho chủ sân ngoài, nên hỏi ý kiến về điều kiện hoạt động trung gian
   thanh toán, và chuẩn bị hợp đồng mẫu với chủ sân nêu rõ kỳ đối soát, tỉ lệ
   hoa hồng, chính sách huỷ và bồi thường chuyển sân.
