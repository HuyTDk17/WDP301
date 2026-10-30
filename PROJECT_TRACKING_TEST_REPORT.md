# PROJECT TRACKING TEST REPORT

File Excel dùng để đối chiếu: **WDP301_G4_Project_Tracking.xlsx**, sheet **Project** (76 hạng mục). Các sheet Iter1–Iter4 chỉ là mẫu trống/ví dụ nên không dùng.

> **Giới hạn quan trọng:** môi trường kiểm thử không cài được thư viện (`npm install` bị chặn mạng), không có MongoDB và không có trình duyệt chạy ứng dụng. Vì vậy **không có chức năng nào được chạy thực tế end-to-end** (frontend + backend + database). Kiểm tra gồm: (1) chạy các test tự động không cần thư viện, (2) kiểm tra cú pháp toàn bộ JS backend (`node --check`), (3) quét tự động đấu nối: mọi route → handler tồn tại, mọi import tồn tại, mọi lời gọi API của frontend khớp một route backend, (4) đọc code từng chức năng. Không ghi PASS cho chức năng chỉ vì có code.

## 1. Cách khởi chạy project

1. Cài MongoDB (hoặc dùng Atlas), Node.js ≥ 20.
2. Chạy `start.bat` ở thư mục gốc (Windows): tự cài thư viện, tạo `backend/.env` nếu chưa có, seed tài khoản admin, chạy migrate, mở cửa sổ BACKEND (`npm run dev`, cổng 9999) và FRONTEND (`npm run dev`, cổng 5173) rồi mở trình duyệt.
3. Chạy tay: `cd backend && npm install && npm run seed && npm run migrate && npm run dev`; `cd e360sport && npm install && npm run dev`. `VITE_API_URL` mặc định `http://localhost:9999/api` — khớp cổng backend.
4. Kiểm thử: `cd backend && npm test`.
5. Chuyển sân thật cần MongoDB replica set (giao dịch); máy phát triển standalone vẫn chạy với cảnh báo.

## 2. Kết quả kiểm tra

| Phần | Kết quả |
|---|---|
| Backend – cú pháp | Toàn bộ file `.js` qua `node --check`: không lỗi |
| Backend – đấu nối | 162 route, mọi handler tồn tại trong controller; không thiếu `require` trong code chạy thật |
| Frontend – đấu nối | 171 lời gọi API; tất cả khớp route backend, trừ `services/premiumService.js` và `services/promotionService.js` (code của tính năng đã gỡ, không còn trang nào nối vào — xem mục 9). `/settings/public`, `/stats/public`, `/webhooks/bank` được khai báo trực tiếp trong `server.js` nên hợp lệ |
| Frontend – build/chạy | **NOT TESTED**: không cài được thư viện, không chạy được `vite build`. Mới chỉ kiểm tra import tương đối/`@/` đều trỏ tới file tồn tại |
| Database | **NOT TESTED**: không có MongoDB |
| Test tự động | Xem mục 8 |

## 3. Đối chiếu Excel với thực tế

Chú giải: **PASS (test tự động)** = có test tự động chạy đạt cho logic chính; **NOT TESTED (runtime) — đã đối chiếu code** = có route/handler/trang nối đúng nhưng chưa chạy thực tế; PARTIAL / NOT IMPLEMENTED / FAIL như yêu cầu.

| # | Chức năng (Excel) | Actor | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|---|---|
| 1 | Design System Database Schema (ERD) |  | N/A | Tài liệu thiết kế, không có trong source. ERD nhắc entity Event và Voucher: Event đã gỡ theo yêu cầu của bạn; Voucher = mã khuyến mãi (chỉ còn hàm kiểm tra mã trong promotionController, không có trang/route quản lý). |
| 2 | Design System Context Diagram & Use Case Diagram |  | N/A | Tài liệu thiết kế; file mô tả hệ thống E360Sport_Phan_tich_va_Dac_ta_He_thong.docx có trong zip |
| 3 | Home page | guest | NOT TESTED (runtime) — đã đối chiếu code | pages/customer/Home |
| 4 | User Registration | user | NOT TESTED (runtime) — đã đối chiếu code | authRoutes (register/login/forgot/reset) + pages/auth/* |
| 5 | User Login (JWT Authentication) | user | NOT TESTED (runtime) — đã đối chiếu code | authRoutes (register/login/forgot/reset) + pages/auth/* |
| 6 | Google Sign-In | user | NOT TESTED (runtime) — đã đối chiếu code | POST /auth/google + GoogleSignInButton; googleAuth.test cần thư viện nên chưa chạy |
| 7 | Forgot / Reset Password | user | NOT TESTED (runtime) — đã đối chiếu code | authRoutes (register/login/forgot/reset) + pages/auth/* |
| 8 | View Profile Information | user | NOT TESTED (runtime) — đã đối chiếu code | GET /auth/me + pages/customer/Profile |
| 9 | Update Profile Information | user | PASS một phần (test avatar) | PUT /auth/profile, /auth/avatar; AV-01..05 đạt; phần đổi tên/SĐT chưa test |
| 10 | Change Password (Authenticated) | user | NOT TESTED (runtime) — đã đối chiếu code | PUT /auth/change-password + Profile |
| 11 | View Notification List | user | NOT TESTED (runtime) — đã đối chiếu code | GET /notifications + pages/customer/Notifications |
| 12 | Mark Notifications as Read | user | FAIL → đã sửa | Số trên chuông không giảm sau khi đọc (hook chỉ poll 25s, trang Thông báo không báo cho chuông). Sửa: phát sự kiện notifications:changed. Chưa test runtime |
| 13 | View & Search User Accounts | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes /users, /users/:id/status, /users/:id/role + UserManagement |
| 14 | Lock / Unlock User Account | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes /users, /users/:id/status, /users/:id/role + UserManagement |
| 15 | Assign / Change User Role | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes /users, /users/:id/status, /users/:id/role + UserManagement |
| 16 | Manage Homepage Banners | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes banners/news/policies/sport-categories + các trang Management tương ứng |
| 17 | Manage News Posts | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes banners/news/policies/sport-categories + các trang Management tương ứng |
| 18 | Manage Site Policies | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes banners/news/policies/sport-categories + các trang Management tương ứng |
| 19 | Manage Sport Field Categories | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes banners/news/policies/sport-categories + các trang Management tương ứng |
| 20 | View System Dashboard & Statistics | Admin | NOT TESTED (runtime) — đã đối chiếu code | GET /admin/stats + AdminDashboard |
| 21 | View Owner Application List | Admin | NOT TESTED (runtime) — đã đối chiếu code | Danh sách/duyệt/từ chối hồ sơ qua GET /admin/owners + PATCH /admin/users/:id/status (verified/rejected) + OwnerManagement. Không có route riêng "owner-applications" nhưng đủ chức năng |
| 22 | Approve Owner Application (Role Upgrade) | Admin | NOT TESTED (runtime) — đã đối chiếu code | Danh sách/duyệt/từ chối hồ sơ qua GET /admin/owners + PATCH /admin/users/:id/status (verified/rejected) + OwnerManagement. Không có route riêng "owner-applications" nhưng đủ chức năng |
| 23 | Reject Owner Application | Admin | NOT TESTED (runtime) — đã đối chiếu code | Danh sách/duyệt/từ chối hồ sơ qua GET /admin/owners + PATCH /admin/users/:id/status (verified/rejected) + OwnerManagement. Không có route riêng "owner-applications" nhưng đủ chức năng |
| 24 | View Owner Detail & Confirm Payout Bank Info | Admin | NOT TESTED (runtime) — đã đối chiếu code | GET /admin/owners/:id, PATCH …/confirm-bank-info + OwnerDetail |
| 25 | View Complaint List | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes complaints (start/contact/resolve) + ComplaintManagement; complaintFlow.test cần thư viện nên chưa chạy |
| 26 | Resolve Complaint & Send Response | Admin | NOT TESTED (runtime) — đã đối chiếu code | adminRoutes complaints (start/contact/resolve) + ComplaintManagement; complaintFlow.test cần thư viện nên chưa chạy |
| 27 | Manage Venue Listings (Suspend / Warn / Delete) | Admin | NOT TESTED (runtime) — đã đối chiếu code | PATCH /admin/venues/:id/status, POST …/warn, DELETE + VenueManagement |
| 28 | Moderate Customer Reviews | Admin | NOT TESTED (runtime) — đã đối chiếu code | DELETE /admin/reviews/:id + ReviewModeration |
| 29 | Issue & Reconcile Owner Service-Fee Invoices | Admin | PASS (test tự động) | SF-01..38 đạt (lập hóa đơn, báo chuyển, xác nhận/từ chối, webhook) |
| 30 | View Revenue & Commission Reports | Admin | NOT TESTED (runtime) — đã đối chiếu code | GET /admin/commissions, /admin/revenue + CommissionReport, RevenueReports; công thức ST-01..13, CM-01..06 đạt |
| 31 | Submit Owner Registration Application | User | NOT TESTED (runtime) — đã đối chiếu code | POST /auth/owner-application (đính kèm giấy tờ) + OwnerApplication |
| 32 | Create New Field Listing | Owner | NOT TESTED (runtime) — đã đối chiếu code | ownerRoutes /venues (POST/PUT/PATCH status/DELETE) + AddVenue/EditVenue/ManageVenues |
| 33 | Edit Field Information | Owner | NOT TESTED (runtime) — đã đối chiếu code | ownerRoutes /venues (POST/PUT/PATCH status/DELETE) + AddVenue/EditVenue/ManageVenues |
| 34 | Toggle Field Visibility (Show/Hide) | Owner | NOT TESTED (runtime) — đã đối chiếu code | ownerRoutes /venues (POST/PUT/PATCH status/DELETE) + AddVenue/EditVenue/ManageVenues |
| 35 | Delete Field Listing | Owner | NOT TESTED (runtime) — đã đối chiếu code | ownerRoutes /venues (POST/PUT/PATCH status/DELETE) + AddVenue/EditVenue/ManageVenues |
| 36 | Manage Courts (Sub-fields) | Owner | NOT TESTED (runtime) — đã đối chiếu code | ownerRoutes /venues/:id/courts + CourtManagement; courtRules CR-01..03 đạt |
| 37 | View Booking List / Calendar | Owner | NOT TESTED (runtime) — đã đối chiếu code | GET /owner/bookings + BookingCalendar, ManageBookings |
| 38 | Create Manual Booking (Walk-in / Phone) | Owner | NOT TESTED (runtime) — đã đối chiếu code | POST /owner/bookings/manual + BookingCalendar |
| 39 | Confirm / Reject Booking Request | Owner | PARTIAL | PATCH /owner/bookings/:id/status có pending→confirmed/cancelled, nhưng không đoạn code nào tạo đơn ở trạng thái "pending" (đơn mới luôn là awaiting_payment; chủ sân chỉ xác nhận qua thanh toán). Chưa có thiết lập "yêu cầu chủ sân xác nhận thủ công" — cần bạn xác nhận nghiệp vụ |
| 40 | Confirm / Reject Bank-Transfer Payment | Owner | PASS (test tự động) | OP-01..25 đạt (xác nhận/từ chối chuyển khoản, chống bấm đúp) |
| 41 | Process Customer Refund Requests | Owner | PASS (test tự động) | SF-18..23 đạt (khoản hoàn do chủ sân xử lý) |
| 42 | Process Booking Cancellation/Change Request | Owner | NOT TESTED (runtime) — đã đối chiếu code | GET /owner/transfers + TransferRequests (tab Đổi lịch); khách hủy theo chính sách (xem #55); rescheduleApproval.test cần thư viện nên chưa chạy |
| 43 | Configure Payout Bank Account | Owner | NOT TESTED (runtime) — đã đối chiếu code | OwnerSettings (bank*) qua PUT /auth/profile |
| 44 | View Revenue Report & Statistics | Owner | NOT TESTED (runtime) — đã đối chiếu code | GET /owner/revenue, /owner/stats + Revenue |
| 45 | View Customer List | Owner | NOT TESTED (runtime) — đã đối chiếu code | Trang Customers gom từ GET /owner/bookings ở frontend (không có API riêng) |
| 46 | View & Pay Platform Service Fee | Owner | PASS (test tự động) | SF-24..27 đạt (phí dịch vụ cho chủ sân) + trang Commission |
| 47 | Reply to Customer Review | Owner | PASS (test tự động) | RV-05..10 đạt |
| 48 | Search & Filter Fields | Customer | NOT TESTED (runtime) — đã đối chiếu code | GET /venues (lọc) + VenueListing; venueMap.test 6 đạt cho phần lọc bản đồ |
| 49 | View Field Details | Customer | NOT TESTED (runtime) — đã đối chiếu code | GET /venues/:id + VenueDetail (đã gỡ khối "Sự kiện sắp tới") |
| 50 | Manage Favorite Fields | Customer | NOT TESTED (runtime) — đã đối chiếu code | favoriteRoutes + FavoriteVenues |
| 51 | Select Time Slot & Add to Booking | Customer | NOT TESTED (runtime) — đã đối chiếu code | POST /bookings/hold, /bookings + pages/customer/Booking |
| 52 | Confirm Booking | Customer | NOT TESTED (runtime) — đã đối chiếu code | POST /bookings/hold, /bookings + pages/customer/Booking |
| 53 | Online Payment Integration | Customer | NOT TESTED (runtime) — đã đối chiếu code | POST /payments/checkout + Payment (chuyển khoản trực tiếp tới chủ sân; OP-01..25 đạt). Excel nhắc "e-wallet/bank gateway": VNPay/MoMo đã được thay bằng chuyển khoản; "pay-at-venue" chỉ có ở đơn thủ công của chủ sân |
| 54 | Auto-confirm Bank Transfers (Webhook) | Common | PARTIAL | Webhook /api/webhooks/bank chỉ tự xác nhận HÓA ĐƠN PHÍ DỊCH VỤ (SF-27..34 đạt). Thanh toán ĐẶT SÂN (tiền vào tài khoản chủ sân) không tự xác nhận — chủ sân xác nhận tay (OP-13 khẳng định là cố ý). Excel ghi cả hai → cần bạn quyết định |
| 55 | Cancel Booking | Customer | PASS một phần | OP-23, OP-24, OP-24b đạt (không hủy khi đã báo chuyển / đã qua giờ). Bảng hoàn tiền theo chính sách: cancellationPolicy.test cần thư viện nên chưa chạy. Đã sửa lỗi: chặn hủy sau giờ bắt đầu + tự hoàn thành đơn quên bấm |
| 56 | Reschedule Booking | Customer | PASS (test tự động) | RS-00..10, UT-01..11 đạt (dựng khung giờ, giữ độ dài, phí). Luồng API chưa chạy runtime. Đã sửa: chuyển sân chọn được nhiều giờ |
| 57 | Hand Over Booking to Another Customer | Customer | NOT IMPLEMENTED (gỡ theo yêu cầu của bạn) | "Sang tên"/"Nhận suất" đã bị xóa theo yêu cầu. Excel vẫn ghi Done → mâu thuẫn, cần bạn quyết định giữ nguyên gỡ hay khôi phục (bản gốc còn trong file zip bạn gửi lúc đầu) |
| 58 | Claim Handed-over Booking | Customer | NOT IMPLEMENTED (gỡ theo yêu cầu của bạn) | "Sang tên"/"Nhận suất" đã bị xóa theo yêu cầu. Excel vẫn ghi Done → mâu thuẫn, cần bạn quyết định giữ nguyên gỡ hay khôi phục (bản gốc còn trong file zip bạn gửi lúc đầu) |
| 59 | match players | Customer | NOT TESTED (runtime) — đã đối chiếu code | playerRoutes + pages/players; playerMatching.test cần thư viện nên chưa chạy. Đã sửa lỗi treo migrate do trùng tên hàm ensureIndexes |
| 60 | Submit Field Review | Customer | PASS (test tự động) | RV-01..04 đạt |
| 61 | Edit / Delete Own Review | Customer | PASS (test tự động) | RV-01..04 đạt |
| 62 | Submit Complaint to Admin | Customer | NOT TESTED (runtime) — đã đối chiếu code | complaintRoutes + pages/customer/Complaints; complaintFlow.test cần thư viện nên chưa chạy |
| 63 | Track Complaint Status | Customer | NOT TESTED (runtime) — đã đối chiếu code | complaintRoutes + pages/customer/Complaints; complaintFlow.test cần thư viện nên chưa chạy |
| 64 | View Booking History | Customer | NOT TESTED (runtime) — đã đối chiếu code | GET /bookings/my + BookingHistory |
| 65 | View / Download Invoice | Customer | PASS (test tự động) | INV-01..09 đạt |
| 66 | View News & Announcements | Guest | NOT TESTED (runtime) — đã đối chiếu code | GET /news, /policies + NewsList/NewsDetail/LegalPage |
| 67 | View Site Policy Pages | Guest | NOT TESTED (runtime) — đã đối chiếu code | GET /news, /policies + NewsList/NewsDetail/LegalPage |
| 68 | Build Field-Matching Service for Transfer Requests | Common | FIXED (NOT IMPLEMENTED → đã thêm); logic thuần PASS | Trước đây không có dịch vụ gợi ý sân thay thế. Đã thêm GET /bookings/:id/transfer/suggestions (cùng môn, cùng ngày, ±2 giờ, cùng độ dài, chỉ chủ sân/mạng lưới hợp lệ) + khối gợi ý ở trang chuyển sân. TS-01..06 đạt; phần truy vấn DB chưa chạy được |
| 69 | Implement Slot Hold/Lock Mechanism | Common | NOT TESTED (runtime) — đã đối chiếu code | Hold + SlotLock trong transferService/utils/slotLock; integration test (booking-race, booking-expiry) cần MongoDB nên chưa chạy |
| 70 | Implement Transfer Fee & Price-Difference Calculation | Common | PASS (test tự động) | UT-01..11 + LS-01..07 đạt |
| 71 | Configure Cancellation Policy (Time-based Refund Rules) | Owner | NOT TESTED (runtime) — đã đối chiếu code | GET/PUT /owner/cancellation-policy + OwnerSettings; cancellationPolicy.test cần thư viện nên chưa chạy |
| 72 | Approve / Reject Incoming Transfer Request | Owner | NOT TESTED (runtime) — đã đối chiếu code | POST /owner/transfers/:id/approve|reject + TransferRequests; rescheduleApproval.test cần thư viện nên chưa chạy |
| 73 | Request to Join Transfer Network | Owner | NOT TESTED (runtime) — đã đối chiếu code | owner/network + admin/network + NetworkManagement; transferNetwork.test cần thư viện nên chưa chạy |
| 74 | Approve Owner Network Membership | Admin | NOT TESTED (runtime) — đã đối chiếu code | owner/network + admin/network + NetworkManagement; transferNetwork.test cần thư viện nên chưa chạy |
| 75 | View Transfer Fee Estimate | Customer | PASS (test tự động) | UT-02..06 (công thức) + bước 3 trang chuyển sân hiển thị bảng chi phí do máy chủ tính |
| 76 | Track Transfer Request Status | Customer | PARTIAL → đã sửa | Trước đây chỉ có /transfers/:id (sau khi tạo), không có danh sách. Đã thêm trang /transfers "Yêu cầu đổi/chuyển" + nút ở Lịch sử đặt sân |

## 4. Lỗi phát hiện, nguyên nhân, cách sửa

| # | Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|---|
| 1 | `npm run migrate` / `start.bat` treo, không mở được backend/frontend (cũng chiếm CPU khi backend chạy) | `PlayerPost.ensureIndexes` ghi đè hàm cùng tên của Mongoose; `createIndexes()` gọi lại chính nó → đệ quy vô hạn | Đổi tên thành `rebuildIndexes` (model, migrate, server, test) |
| 2 | Số thông báo trên chuông không giảm sau khi đọc (#12) | Trang Thông báo không báo cho chuông; chuông chỉ poll 25 giây | `notificationService` phát sự kiện `notifications:changed`, hook `useUnreadNotifications` lắng nghe và tải lại ngay |
| 3 | Khách hủy được đơn nhiều ngày sau giờ chơi khi chủ sân quên bấm "Hoàn thành" (#55) | `cancelBooking` và nút hủy không kiểm tra giờ bắt đầu | Backend trả 409 nếu đã qua giờ bắt đầu; ẩn nút ở frontend; thêm tác vụ nền tự chuyển đơn `confirmed` đã qua giờ kết thúc 24 giờ (`AUTO_COMPLETE_GRACE_HOURS`) sang `completed` |
| 4 | Chuyển sân chỉ cho chọn 1 giờ (#56) | Trang dùng khung cố định 60 phút, `maxSlots=1` | Chuyển sân chọn được nhiều giờ liền nhau; đổi lịch vẫn giữ độ dài cũ |
| 5 | Thiếu dịch vụ gợi ý sân thay thế (#68) | Chưa có code | Thêm `GET /bookings/:id/transfer/suggestions`, `utils/transferSuggestions.js`, khối gợi ý ở trang chuyển sân, test TS-01..06 |
| 6 | Không có nơi theo dõi các yêu cầu chuyển sân (#76) | Chỉ có `/transfers/:id` | Thêm trang `/transfers` + nút ở Lịch sử đặt sân |
| 7 | `start.bat`: cấu hình `.env` mẫu còn VNPay/MoMo đã gỡ; cách mở cửa sổ dễ lỗi | Lỗi thời; `start ... /D` | Thay bằng cấu hình chuyển khoản/múi giờ; mở bằng `cmd /k "cd /d ... && npm run dev"` |
| 8 | Test `OP-24` thất bại sau thay đổi #3 | Dữ liệu test dùng ngày cố định đã qua | Dùng ngày tương lai tính động; thêm `OP-24b` |

Thay đổi theo yêu cầu của bạn (không phải lỗi): gỡ chức năng **Sự kiện**, gỡ **Sang tên/Nhận suất**, đổi câu thông báo "chỉ chuyển/đổi lịch được khi…" cho dễ hiểu.

## 5. Chức năng đã kiểm thử lại sau khi sửa

Chạy lại các test tự động không cần thư viện sau mỗi nhóm sửa (xem mục 8): đổi lịch/chuyển sân (RS-00..10, UT-01..11, LS-01..07), thanh toán chủ sân và hủy đơn (OP-01..25, OP-24b), đối soát/hóa đơn/webhook (SF-01..38, ST, CM), hóa đơn khách (INV), đánh giá (RV), gợi ý sân (TS). **Không** kiểm thử lại được trên giao diện thật.

## 6. Còn thiếu hoặc chưa thể kiểm thử

- **Chưa chạy thực tế được:** toàn bộ frontend, mọi API qua HTTP, mọi thao tác với MongoDB, đăng nhập Google, email, upload ảnh, tải Leaflet/bản đồ.
- **Test cần thư viện nên chưa chạy:** adminContent, cancellationPolicy, complaintFlow, creditAndPolicy, googleAuth, loyaltyPoints, playerMatching, rescheduleApproval, transferNetwork, uploadsAndMail, và 4 test integration (cần MongoDB). Bạn chạy `npm install && npm test` để chạy hết.
- **Cần bạn quyết định (mâu thuẫn/mơ hồ trong Excel):**
  1. #57–#58 Hand Over / Claim: Excel ghi Done nhưng bạn yêu cầu gỡ. Giữ nguyên gỡ (nên cập nhật Excel) hay khôi phục?
  2. #54 Webhook tự xác nhận: Excel gồm cả thanh toán đặt sân, code chỉ làm cho phí dịch vụ (cố ý, vì tiền đặt sân vào tài khoản chủ sân). Giữ nguyên hay mở rộng?
  3. #39 Xác nhận/từ chối yêu cầu đặt sân thủ công: chưa có đường nào tạo đơn `pending`. Có cần thiết lập "chủ sân duyệt từng đơn" không?
  4. Ô J34 của sheet Project chứa công thức AI chưa điền (`=AI("Điền giá trị phù hợp…")`), và ERD ở #1 nhắc Event/Voucher trong khi không có hạng mục tương ứng.

## 7. File đã thay đổi so với bản zip ban đầu

- SỬA CHANGELOG.md
- SỬA backend/controllers/bookingController.js
- SỬA backend/controllers/transferController.js
- SỬA backend/jobs/index.js
- SỬA backend/models/PlayerPost.js
- SỬA backend/package.json
- SỬA backend/routes/bookingRoutes.js
- SỬA backend/routes/ownerRoutes.js
- SỬA backend/routes/transferRoutes.js
- SỬA backend/scripts/migrate.js
- SỬA backend/server.js
- SỬA backend/services/transferService.js
- SỬA backend/tests/ownerPaymentFlow.test.js
- SỬA backend/tests/playerMatching.test.js
- SỬA backend/tests/reschedule.test.js
- SỬA backend/tests/transferPricing.test.js
- SỬA e360sport/src/components/common/Navbar/Navbar.jsx
- SỬA e360sport/src/components/dashboard/StatusBadge/StatusBadge.jsx
- SỬA e360sport/src/hooks/useUnreadNotifications.js
- SỬA e360sport/src/layouts/OwnerLayout/OwnerLayout.jsx
- SỬA e360sport/src/pages/admin/AdminSettings/AdminSettings.jsx
- SỬA e360sport/src/pages/customer/BookingHistory/BookingHistory.jsx
- SỬA e360sport/src/pages/customer/TransferBooking/TransferBooking.jsx
- SỬA e360sport/src/pages/customer/VenueDetail/VenueDetail.jsx
- SỬA e360sport/src/pages/owner/PendingBankPayments/PendingBankPayments.jsx
- SỬA e360sport/src/routes/AppRoutes.jsx
- SỬA e360sport/src/services/notificationService.js
- SỬA e360sport/src/services/transferService.js
- SỬA start.bat
- THÊM /backend/tests/transferSuggestions.test.js
- THÊM /backend/utils/transferSuggestions.js
- THÊM /e360sport/src/pages/customer/MyTransfers
- XÓA /backend/controllers/eventController.js
- XÓA /backend/models/Event.js
- XÓA /backend/routes/eventRoutes.js
- XÓA /backend/services/assignmentService.js
- XÓA /backend/tests/events.test.js
- XÓA /e360sport/src/components/booking/AssignBookingModal
- XÓA /e360sport/src/components/venue/VenueEvents
- XÓA /e360sport/src/pages/customer/ClaimBooking
- XÓA /e360sport/src/pages/events
- XÓA /e360sport/src/pages/owner/Events
- XÓA /e360sport/src/services/eventService.js

## 8. Kết quả build, test

- Build frontend: **không chạy được** (thiếu thư viện).
- `node --check` toàn bộ backend: đạt.
- Test tự động chạy được (đều đạt, 0 lỗi): avatars 5, commission 6, courtRules 3, invoice 9, ownerPaymentFlow 26, premium 20, reschedule 11, reviewFeatures 10, settlementFlow 38, settlementMath 20, transferLimitsAndSplit 7, transferPricing 10, transferSuggestions 6, venueMap 6.
- Không chạy được vì thiếu thư viện/MongoDB: danh sách ở mục 6.

## 9. Vấn đề còn tồn tại

- **Code thừa (có bằng chứng nhưng chưa xóa, chờ bạn đồng ý):** tính năng Premium đã gỡ khỏi route nhưng còn `backend/controllers/premiumController.js`, `routes/premiumRoutes.js` (không được mount), `services/premiumService.js`, `models/PremiumOrder.js`, `utils/premium.js`, `tests/premium.test.js` và ở frontend `pages/customer/Premium`, `pages/admin/PremiumManagement`, `services/premiumService.js`, `components/common/PremiumBadge`; mã khuyến mãi còn `pages/admin/PromotionManagement` + `services/promotionService.js` không có trang/route; `utils/vnpay.js`, `utils/momo.js`, `controllers/payoutController.js` không được dùng; các trang admin chưa có route: TransferManagement, BookingManagement, VenueApproval, RefundManagement, PendingBankPayments.
- `PlatformSetting.transferFixedFeeT5`, `TransferRequest.type 'T5'`, `transferCode` còn trong model/tính phí (giữ để không hỏng dữ liệu cũ).
- Mọi thay đổi mới (gợi ý sân thay thế, trang `/transfers`, chọn nhiều giờ, sự kiện thông báo) chưa được chạy trên giao diện thật — cần thử tay theo mục 6.
