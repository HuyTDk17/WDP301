# E360Sport — Nhật ký thay đổi

Tài liệu này ghi lại toàn bộ thay đổi so với phiên bản gốc, kèm lý do. Đọc kèm
`E360Sport_Phan_tich_va_Dac_ta_He_thong.docx` để hiểu phần thiết kế.

---

## Lọc sân theo bản đồ

- **Trang tìm sân:** thêm chế độ xem **Bản đồ** (nút thứ 3 cạnh Lưới/Danh sách). Mỗi sân là một ghim giá (sân Premium viền vàng), bấm ghim xem nhanh rồi vào trang sân. Kéo/phóng to bản đồ sẽ hiện nút **"Tìm trong khu vực này"** để lọc theo khung nhìn. Mục **Vị trí** ở bộ lọc có **"Tìm sân gần tôi"** (1/3/5/10/20 km) và sắp xếp **"Gần tôi nhất"**; thẻ sân hiện khoảng cách. Vẫn kết hợp được với môn, giá, đánh giá…
- **Chủ sân:** form đăng/sửa địa điểm có ô **chọn vị trí trên bản đồ** (bấm, kéo ghim, "Tìm theo địa chỉ", "Vị trí của tôi"). Vị trí không bắt buộc; sân chưa có vị trí vẫn hoạt động nhưng không hiện ở chế độ bản đồ. Trang chi tiết sân có link "Xem trên bản đồ".
- **Backend:** `Venue.location {lat,lng}`; `GET /venues` nhận `swLat,swLng,neLat,neLng` (khung nhìn) hoặc `lat,lng,radiusKm` (gần tôi, trả `distanceKm`), `hasLocation=1`; `utils/geo.js`; tạo/sửa venue nhận `lat`,`lng` (kiểm tra nằm trong Việt Nam; gửi rỗng để xoá). Test `tests/venueMap.test.js`.
- **Sửa lỗi:** form địa điểm trước đây gửi `street/district/city` rời trong khi backend đọc `address` nên địa chỉ có thể không được lưu; nay form gửi `address[...]` và backend cũng chấp nhận dạng rời.
- Bản đồ dùng Leaflet (tải từ unpkg), nền OpenStreetMap, tìm địa chỉ bằng Nominatim — miễn phí, không cần API key. Nginx CSP đã cho phép các domain này.
- Sửa ô "Hạn chủ sân phản hồi" ở Cài đặt admin: `step` 5 làm giá trị như 30 bị coi là không hợp lệ.

---

## Ghép bản bổ sung vào WDP301 (từ `code_bo_sung_tong_hop`)

Các mục bên dưới được ghép từ bản bổ sung; **lọc sân theo bản đồ** của WDP301 được giữ nguyên.

**Đã gỡ chức năng Gói Premium** (Venue Premium / Premium Player): bỏ các trang mua/quản lý gói, API `/api/premium` và `/api/admin/premium/*`, nhận diện chuyển khoản `PRM…` ở webhook, nhắc hết hạn, ưu đãi phí dịch vụ / giữ chỗ lâu hơn / miễn phí đổi lịch, ưu tiên hiển thị sân và ưu tiên khiếu nại. Phí dịch vụ, thời gian giữ chỗ và phí chuyển sân nay áp dụng chung cho mọi người dùng.
- Pickleball được giữ trong danh mục môn mặc định (backend `utils/sportCategories.js`, frontend `utils/index.js`); danh mục đã nạp từ trước mà đã có sân Pickleball sẽ được tự bổ sung.
- `StatusBadge` có thêm prop `labels` để trang Mạng lưới đổi nhãn "Chưa tham gia" mà không làm đổi nhãn "Chưa gửi" ở nơi khác.
- Nối route còn thiếu: `/api/banners|news|policies|sports`, `/api/events`, `/api/players`, `/api/admin/{banners,news,policies,sport-categories,network,users/:id/role}`, `/api/owner/{events,network,cancellation-policy}`.

---

## Chủ sân xử lý yêu cầu đổi lịch (#33)

- **Tab "Đổi lịch"** ở `/owner/transfers` (mở thẳng bằng `?tab=reschedule` từ thông báo): hiện yêu cầu đổi giờ/đổi sân tại địa điểm của chủ sân với "Lịch hiện tại → Lịch mới", phí đổi lịch, hạn phản hồi, nút **Chấp thuận / Từ chối** (kèm lý do). Đổi lịch **không còn lẫn** vào "Chuyển đến/Chuyển đi" (trước đây vì cùng một chủ sân nên hiện ở cả hai tab); số yêu cầu chờ duyệt đếm riêng (`pendingRescheduleCount`).
- **Cài đặt duyệt đổi lịch riêng cho từng địa điểm** (`Venue.rescheduleRequiresApproval`, ở trang Địa điểm): *theo cài đặt chuyển sân* (mặc định, `null` — chủ sân đã bật duyệt thủ công vẫn giữ đúng hành vi cũ) / *luôn chờ tôi duyệt* / *tự chấp nhận ngay*. Quy tắc nằm ở `requiresOwnerApproval` (`utils/transferPolicy.js`); chỉ áp dụng cho T1/T2, các loại chuyển khác không đổi.
- **Thông báo đúng lời lẽ** (`utils/transferMessages.js`, hàm thuần): xin duyệt ("Khách xin đổi lịch" nêu cả lịch cũ và mới), hoàn tất ("Đã đổi lịch thành công" / "Khách đã đổi lịch"), thất bại ("lịch đặt ban đầu VẪN CÒN HIỆU LỰC"). Chủ sân chỉ nhận **một** thông báo khi đổi lịch (trước đây nhận hai: "chuyển đi" và "chuyển đến"). Nội dung T3/T4 giữ nguyên. Trang kết quả của khách cũng dùng lời lẽ "đổi lịch".
- **Sửa lỗi có sẵn:** `PATCH /owner/venues/:id/transfer-policy` trước đây đặt `transferRequiresApproval = false` nếu body không có trường đó; nay chỉ cập nhật trường được gửi.
- **Hủy đặt** (nửa còn lại của #33): khách hủy được ngay theo chính sách hủy; chủ sân nhận thông báo, xử lý hoàn tiền ở `/owner/refunds` (đã có từ trước).
- Test: `tests/rescheduleApproval.test.js` (RA-01…09), đã thêm vào `npm test`.
- **#66 (OCR giấy phép kinh doanh) đã được nhóm quyết định không làm**: Admin tiếp tục xem giấy tờ và duyệt hồ sơ chủ sân thủ công.

---

## Chính sách hủy do chủ sân đặt (#58) · hạn mức tháng & chia phí chuyển sân (#61)

- **Chính sách hủy riêng của chủ sân (#58):** tab "Chính sách hủy" ở Cài đặt chủ sân — tự đặt biểu hoàn tiền theo số giờ báo trước (tối đa 8 bậc, phải có bậc 0 giờ, báo càng sớm hoàn càng nhiều), có xem trước "khách sẽ thấy" và kiểm tra tức thời.
  **Sàn bảo vệ khách:** Admin đặt mức hoàn TỐI THIỂU (`cancellationFloorTiers`, mặc định ≥100% khi báo trước ≥48h, ≥50% khi ≥24h) — ở mọi thời điểm biểu của chủ sân phải ≥ sàn (được tử tế hơn, không được khắt khe hơn). Admin có công tắc cho phép/không cho phép chủ sân tự đặt (`ownerCancellationPolicyAllowed`).
  Biểu riêng được **chụp vào từng lượt đặt lúc tạo đơn** (`Booking.cancellationTiers`) nên đổi chính sách sau đó không ảnh hưởng khách đã đặt; chủ sân chưa cấu hình/đang tắt thì **hành vi cũ giữ nguyên** (dùng biểu chung hiện hành của nền tảng lúc hủy). Đơn tạo qua chuyển sân dùng chính sách của chủ sân ĐÍCH. Admin nâng sàn sau đó → biểu cũ không đạt tự quay về biểu chung và chủ sân thấy cảnh báo.
  Trang địa điểm hiển thị mục "Chính sách hủy sân" cho khách (`GET /api/venues/:id` trả thêm `cancellationPolicy`). Xem trước hủy (`/bookings/:id/cancel-preview`) trả thêm `policySource`.
- **Hạn mức theo tháng (#61):** `maxTransfersPerMonth` (mỗi khách, tính đổi lịch + chuyển sân, không tính sang tên, theo tháng dương lịch giờ Việt Nam; **0 = không giới hạn, mặc định**). Kiểm tra ở bước báo giá (trước khi giữ chỗ) và báo sớm ở bước kiểm tra điều kiện; trang chuyển sân hiện "đã dùng x/y lượt".
- **Chia phí chuyển sân (#61):** `transferFeeOriginSharePct` — chỉ khi chuyển sang CHỦ SÂN KHÁC (T4), chủ sân gốc nhận thêm tỉ lệ này của phí chuyển (ngoài khoản bồi thường theo bậc), phần còn lại thuộc chủ sân đích như hiện nay (**0 = giữ nguyên, mặc định**). Tỉ lệ được chụp lúc báo giá (`TransferRequest.feeOriginSharePct`); ghi `transferFeeShareIn` (đơn gốc) / `transferFeeShareOut` (đơn mới) và `settlementMath` cộng/trừ tương ứng — **tổng quyền lợi của hai chủ sân không đổi**, chỉ chuyển giữa họ. Số chia làm tròn xuống, không vượt phí.
- Cài đặt Admin (**Cài đặt → Chuyển sân / Huỷ đơn**): thêm hạn mức tháng, tỉ lệ chia phí, công tắc + bảng sàn hoàn tiền.
- Backend: `utils/cancellationPolicy.js`, `utils/transferLimits.js`, `utils/transferSplit.js`, `services/cancellationPolicyService.js`, `controllers/cancellationPolicyController.js` (`GET|PUT /api/owner/cancellation-policy`). Test: `tests/cancellationPolicy.test.js` (CP-01…09, gồm đối chiếu frontend/backend trên 3000 biểu ngẫu nhiên), `tests/transferLimitsAndSplit.test.js` (LS-01…07, gồm kiểm tra bảo toàn tiền); đã thêm vào `npm test`.

---

## Mạng lưới chuyển sân (Admin duyệt chủ sân)

- **Chủ sân:** thẻ "Mạng lưới chuyển sân" ở đầu trang `/owner/transfers` hiện trạng thái (chưa tham gia / chờ duyệt / thành viên / bị từ chối / đã gỡ) và nút **xin tham gia** (`GET /api/owner/network`, `POST /api/owner/network/request`). Admin được báo khi có yêu cầu mới; hai lần bấm cùng lúc chỉ tạo một yêu cầu.
- **Admin:** trang `/admin/network` (mục "Mạng lưới chuyển sân"): lọc theo trạng thái, tìm theo tên/email, **Duyệt** (cả khi chủ sân chưa xin, hoặc xem xét lại người bị từ chối/bị gỡ), **Từ chối** và **Gỡ** (bắt buộc nêu lý do, gửi kèm thông báo), **Duyệt tất cả đang chờ**. Công tắc bật/tắt nằm ở **Cài đặt → Chuyển sân** (`transferNetworkRequired`).
- **Quy tắc:** mặc định **TẮT** → mọi chủ sân tự động tham gia, hành vi cũ không đổi (không cần di chuyển dữ liệu; chủ sân cũ chưa có trường `transferNetwork` được tính là "chưa tham gia"). Khi BẬT, **chỉ chuyển sang chủ sân khác (loại T4)** cần CẢ HAI chủ sân là thành viên; đổi giờ/đổi sân/chuyển giữa các địa điểm cùng chủ sân (T1–T3) và sang tên (T5) không bị ảnh hưởng.
  Kiểm tra ở 3 điểm trong `transferService`: lúc báo giá (trước khi tính giá/giữ chỗ), lúc xác nhận, và sau khi chủ sân đích duyệt (trước khi thu tiền). Lượt đã sang bước thanh toán không bị hủy giữa chừng khi một chủ sân bị gỡ.
  Trang chuyển sân của khách báo sớm nếu chủ sân hiện tại chưa là thành viên (`GET /bookings/:id/transfer/eligibility` trả thêm `network`).
- Backend: `utils/transferNetwork.js`, `controllers/networkController.js`, trường `User.transferNetwork`, `PlatformSetting.transferNetworkRequired`. Test: `tests/transferNetwork.test.js` (NW-01…10), đã thêm vào `npm test`. `checkEligibility` giữ nguyên chữ ký (đang có test không cần CSDL).

---

## Tìm người chơi chung (kèm nút Zalo)

- **Luồng:** khách có lượt đặt đã xác nhận, chưa diễn ra bấm **"Tìm thêm người"** ở lịch sử đặt sân → đăng bài (số người cần, trình độ, ghi chú). Khách khác vào **`/players`** lọc theo môn/ngày/trình độ và **xin tham gia** kèm lời nhắn. Chủ nhóm **nhận / từ chối** ở **`/players/mine`**; đủ người thì bài tự chuyển "đã đủ người".
- **Liên lạc bằng số điện thoại + Zalo:** SAU KHI được nhận, hai bên mới thấy số điện thoại của nhau, kèm nút **Gọi**, **Sao chép** và **Nhắn Zalo** (`https://zalo.me/<số>`, xem `utils/zalo.js`). Danh sách công khai chỉ có tên + ảnh đại diện, **không bao giờ** có SĐT/email; yêu cầu bị từ chối/chờ cũng không lộ SĐT. Nhóm đóng thì hết hiển thị liên lạc.
  Lưu ý: nhắn Zalo được hay không còn tùy cài đặt Zalo của người nhận (cho phép tìm bằng số điện thoại).
- **Quy tắc:** chỉ đăng cho lượt đặt CỦA MÌNH, đã xác nhận, chưa bắt đầu; mỗi lượt đặt một bài (chỉ mục duy nhất một phần); tối đa 5 bài chưa diễn ra/người; mỗi người tối đa 10 yêu cầu đang chờ; không xin vào nhóm của mình, không xin trùng, bị từ chối thì không xin lại (rút lui thì xin lại được).
  **Chấp nhận là giữ chỗ nguyên tử** — hai lần chấp nhận cùng lúc cho chỗ cuối chỉ một thành công. Người đã được nhận rút lui thì bài mở lại và chủ nhóm được báo. Cả hai bên phải có số điện thoại trong hồ sơ.
- **Đóng bài tự động** khi lượt đặt mất hiệu lực: khách hủy, chủ sân hủy/không đến, hoặc chuyển sân (3 hook gọi `services/playerService.closeForBooking`, luôn nuốt lỗi để không làm hỏng luồng hủy/chuyển). Danh sách cũng tự ẩn bài có lượt đặt không còn "đã xác nhận" phòng khi hook lỗi. Bài hết hạn không cần job: quá giờ bắt đầu thì không còn được liệt kê hay nhận yêu cầu.
- Backend: `models/PlayerPost.js`, `models/JoinRequest.js`, `controllers/playerController.js`, `services/playerService.js`, `routes/playerRoutes.js` (`/api/players`, chỉ khách hàng). Test: `tests/playerMatching.test.js` (PM-01…12), đã thêm vào `npm test`.

---

## Sự kiện của chủ sân (giải đấu / khuyến mãi)

- **Chủ sân:** trang `/owner/events` — tạo, sửa, **hủy** sự kiện tại địa điểm của mình (tên, loại, mô tả, dòng nổi bật, thời gian, phí tham gia chỉ để thông tin, ảnh). Hủy cần nêu lý do.
  Chỉ tạo ở địa điểm CỦA MÌNH; bắt đầu phải ở tương lai (≤ 1 năm), kéo dài ≤ 90 ngày, tối đa 20 sự kiện chưa kết thúc / chủ sân. Sự kiện đã hủy hoặc đã kết thúc không sửa/hủy lại được; sự kiện đang diễn ra vẫn sửa được nội dung.
- **Khách:** trang công khai `/events` (lọc theo loại) và `/events/:id`; mục "Sự kiện sắp tới tại đây" ở trang địa điểm; link "Sự kiện" ở thanh menu. Link đã chia sẻ của sự kiện đã hủy/đã kết thúc vẫn mở được và báo đúng tình trạng.
- **Hiển thị công khai** bám theo địa điểm (đã duyệt, đang bật, chủ sân không bị khóa phí dịch vụ) — địa điểm bị ẩn thì sự kiện cũng ẩn. Không lộ lý do hủy ra công khai.
- Trạng thái "sắp diễn ra / đang diễn ra / đã kết thúc" được **suy ra từ thời gian** (`eventController.phaseOf`), không cần job cập nhật. Hệ thống KHÔNG nhận đăng ký tham gia hay thu phí sự kiện.
- Backend: `models/Event.js`, `controllers/eventController.js`, `routes/eventRoutes.js` (+ nhóm `/api/owner/events` trong `ownerRoutes.js`). Test: `tests/events.test.js` (EV-01…11), đã thêm vào `npm test`.
- Tách `form.module.css` dùng chung sang `components/dashboard/` (trước đây nằm trong `pages/admin/`).

---

## Admin: đổi vai trò · banner · tin tức · chính sách · danh mục môn

- **Đổi vai trò (#13):** `PATCH /api/admin/users/:id/role` + nút "Đổi vai trò" ở Quản lý người dùng. Chỉ khách hàng ↔ chủ sân, **bắt buộc nêu lý do** (gửi kèm thông báo).
  Chặn: tự đổi mình, đổi tài khoản admin, đổi tài khoản đang bị khóa. Hạ chủ sân xuống khách bị chặn khi còn lượt đặt chưa diễn ra; khi được phép thì ẩn địa điểm (cờ `suspendedByOwnerBan`), cấp lại quyền sẽ bật lại đúng những địa điểm đó.
  Lưu `roleChangedAt/roleChangedBy` trên User.
- **Banner (#14):** `/admin/banners`; công khai `GET /api/banners` → carousel ở trang chủ (tự chuyển, dừng khi rê chuột, tôn trọng "giảm chuyển động"). Hẹn giờ bắt đầu/kết thúc, thứ tự, bật/tắt.
  Liên kết chỉ nhận đường dẫn nội bộ `/...` hoặc `http(s)://` (chặn `javascript:` và `//host`). Ảnh cũ bị xóa khi thay/xóa banner.
- **Tin tức (#15):** `/admin/news` (nháp/đăng, ảnh bìa); công khai `/news`, `/news/:slug`. Slug tiếng Việt không dấu, cố định sau khi tạo. Nội dung là **văn bản thuần** (không HTML) nên không có XSS. Bản nháp không lộ ra công khai.
- **Chính sách (#16):** `/admin/policies`; công khai `/policies/:key`. Trang `privacy`/`terms` (đường dẫn cũ `/privacy-policy`, `/terms-of-service`) dùng nội dung mặc định cho tới khi Admin tùy chỉnh; "Về mặc định" xóa bản tùy chỉnh. Nội dung mặc định chuyển sang `pages/legal/builtinPolicies.js`.
- **Danh mục môn (#17):** `/admin/sport-categories`; công khai `GET /api/sports`. Tự nạp 8 môn mặc định khi bảng còn trống. Mã môn cố định; xóa bị chặn khi còn địa điểm/sân dùng (dùng "Tắt"); môn đã tắt không nhận sân mới nhưng sân cũ vẫn sửa được.
  `courtController` kiểm tra môn theo danh mục động thay cho danh sách cứng. Frontend nạp danh mục trong `main.jsx` (tối đa 1,2 giây, lỗi thì dùng mặc định); `SPORTS` chỉ gồm môn đang bật, `getSport()` tra cả môn đã tắt.
- Test: `tests/adminContent.test.js` (AC-01…18); đã thêm vào `npm test`.

---

---

## Đổi lịch · Hóa đơn cho khách

- **Đổi lịch (mới):** `/bookings/:bookingId/reschedule`, nút "Đổi lịch" ở lịch sử đặt sân. Là một chế độ của trang chuyển sân: cố định địa điểm hiện tại, **giữ nguyên độ dài lượt đặt**,
  chỉ đổi ngày/giờ (hoặc sân trong cùng địa điểm). Dùng lại toàn bộ engine chuyển sân (báo giá có hạn, giữ chỗ, thu/hoàn chênh lệch, loại T1/T2 → bậc phí "cùng địa điểm", thường miễn phí khi còn ≥ 12 giờ).
  Lượt đặt đang đổi **không tự chặn chính nó** (vd. đặt 18–20h có thể dời thành 17–19h). Đổi lịch tính vào giới hạn `maxTransfersPerBooking` của lượt đặt (mặc định 1 lần).
  `GET /bookings/:id/transfer/eligibility` trả thêm `venueId`, `courtId`. Logic khung giờ: `e360sport/src/utils/rescheduleSlots.js` (hàm thuần, có test).
- **Hóa đơn (mới):** `GET /api/bookings/:id/invoice` + trang `/bookings/:bookingId/invoice` (nút "Hóa đơn" cho lượt đặt đã xác nhận/hoàn tất). Chỉ chủ đơn xem được; không lộ hoa hồng chủ sân hay dữ liệu cổng thanh toán.
  "In / Lưu PDF" dùng hộp thoại in của trình duyệt (giữ đúng tiếng Việt có dấu, không cần thư viện PDF). Đây là chứng từ điện tử, **không thay thế hóa đơn GTGT**.
- Test: `tests/reschedule.test.js` (RS-00…08), `tests/invoice.test.js` (INV-01…09); đã thêm vào `npm test`.

---

## Khiếu nại của khách · đánh giá: trả lời / sửa / xóa · form viết đánh giá

- **Khiếu nại (mới):** khách gửi khiếu nại về một lượt đặt kèm tối đa 5 ảnh bằng chứng (`/complaints`, nút "Khiếu nại" ở lịch sử đặt sân). Admin có trang `/admin/complaints`:
  xem danh sách theo trạng thái, **nhận xử lý**, **nhắn khách / nhắn chủ sân** (chủ sân không thấy danh tính khách), **giải quyết hoặc từ chối kèm phản hồi** gửi lại cho khách bằng thông báo.
  Luồng trạng thái `open → investigating → resolved | rejected`. Mỗi lượt đặt chỉ có một khiếu nại đang xử lý (chỉ mục duy nhất một phần), mỗi khách tối đa 5 khiếu nại chưa xong.
  Backend: `models/Complaint.js`, `controllers/complaintController.js`, `routes/complaintRoutes.js` (+ nhóm `/api/admin/complaints*` trong `adminRoutes.js`), `middleware/uploadEvidence.js`.
- **Đánh giá:** chủ sân **trả lời công khai** đánh giá của khách (`/owner/reviews`, `POST|DELETE /api/owner/reviews/:id/reply`); khách **sửa / xóa đánh giá của chính mình**
  (`PUT|DELETE /api/venues/:id/reviews/:reviewId`), điểm trung bình tính lại sau mỗi thay đổi.
- **Sửa lỗi thiếu giao diện:** trước đây API `POST /venues/:id/reviews` có nhưng KHÔNG có form viết đánh giá, nút "Đánh giá" ở lịch sử đặt sân không làm gì.
  Nay có `ReviewForm` ở trang địa điểm (cũng dùng để sửa) và nút "Đánh giá" dẫn tới đúng form.
- `middleware/errorHandler.js`: thông báo lỗi ảnh không còn ghi cứng "tối đa 2MB" (ảnh sân/bằng chứng cho phép 5MB).
- Test: `tests/complaintFlow.test.js` (CP-01…14), `tests/reviewFeatures.test.js` (RV-01…10); đã thêm vào `npm test`.

---

## [Hosting miễn phí] — ảnh trên Cloudinary, giấy tờ trong MongoDB, email qua Brevo

- **Ảnh sân / avatar**: nếu có `CLOUDINARY_URL` thì tải thẳng lên Cloudinary (tự thu nhỏ ≤1600px), DB lưu URL https đầy đủ; không có thì ghi vào `uploads/` như cũ. Ảnh cũ bị thay/xoá được dọn khỏi Cloudinary. (`utils/uploads.js`, `middleware/storageEngines.js`)
- **Giấy tờ chủ sân**: mặc định lưu trong MongoDB (`models/PrivateFile.js`), vẫn chỉ phục vụ qua route có kiểm tra quyền; file cũ trên đĩa vẫn đọc được. Hồ sơ bị từ chối thì file vừa tải lên được dọn.
- **Email**: thêm gửi qua Brevo HTTP API (`BREVO_API_KEY` + `MAIL_FROM`), ưu tiên hơn SMTP. SMTP vẫn hoạt động như trước.
- `middleware/upload.js` không còn nhận PDF (chỉ dùng cho ảnh sân).
- `/api/health` thêm trường `imageStorage`; kiểm tra cấu hình cảnh báo khi production thiếu Cloudinary/email.
- Thêm `tests/uploadsAndMail.test.js` (15 kiểm tra) và `deploy/FREE-HOSTING.md`.

## Phí dịch vụ theo đơn · popup QR ngày 1 · khoá sau 10 ngày · tự xác nhận · bỏ khuyến mãi của admin

- **Đổi từ ngữ phía chủ sân:** "hoa hồng" → "phí dịch vụ". Chủ sân không còn thấy chữ "nền tảng nợ bạn / hoàn lại": số cần nộp
  chỉ hiện khi dương, âm thì hiện 0đ; khoản điều chỉnh hiếm gặp (khách dùng số dư tín dụng) gọi là "điều chỉnh đối soát".
- **Phí theo từng đơn** ở trang Doanh thu (`GET /api/owner/commission/orders?month=`): ngày, địa điểm/sân, giá sân, phí dịch vụ
  (= phần khách chịu + phần chủ sân chịu); bảng doanh thu theo tháng có thêm dòng phí. Đơn thu tại quầy / đã chuyển / huỷ không tính phí.
- **Ngày 1 hằng tháng** hệ thống lập hoá đơn; chủ sân vào khu quản lý sẽ thấy **popup** số tiền + mã QR + hạn nộp + cảnh báo khoá,
  nút dẫn tới trang **Phí dịch vụ** (`/owner/commission`, trang nộp có QR). Bấm "Để sau" thì hôm đó không hiện lại.
- **Hạn 7 ngày + ân hạn 3 ngày = 10 ngày**: quá hạn ân hạn mà chưa nộp thì địa điểm bị **khoá** — ẩn khỏi danh sách/trang chi tiết
  công khai và không nhận đặt mới (đơn đã đặt giữ nguyên). Nhắc hạn 3 bậc qua thông báo (sắp đến hạn / quá hạn / đã khoá), mỗi bậc một lần.
  Cấu hình cũ còn ân hạn 7 ngày được `npm run migrate` đưa về 3.
- **Tự động xác nhận**: `POST /api/webhooks/bank` (SePay/Casso, khoá `BANK_WEBHOOK_SECRET`) khớp mã hoá đơn trong nội dung chuyển khoản,
  đúng tài khoản nhận, cộng dồn nếu chuyển thiếu, không cộng trùng khi bắn lại. Đủ tiền → hoá đơn `paid`, popup/trang tự tắt (client hỏi lại mỗi 20–60 giây).
  Không đặt khoá thì tắt, admin vẫn xác nhận tay. Đây là webhook CHỈ cho phí dịch vụ — luồng khách ↔ chủ sân vẫn không có admin.
- **Bỏ khuyến mãi phía admin**: xoá trang/menu/route quản lý mã, route `validate-promo` và ô nhập mã khi đặt sân (mã giảm giá do
  chủ sân tự quản lý, nền tảng không hỗ trợ). Đơn cũ có mã vẫn được tính lại đúng khi chuyển sân.
- Test: `tests/settlementFlow.test.js` thêm SF-24 … SF-38.

---

## Sân quyết định MÔN của lượt đặt

**Lỗi:** sân nào cũng chọn được mọi môn khi tạo đơn (khách đặt online lẫn chủ sân tạo thủ công).
**Nay:** môn của lượt đặt luôn là `Court.type` do chủ sân khai khi tạo sân; máy chủ tự lấy từ sân (`utils/courtRules.js`) khi tạo đơn, chuyển sân và
đơn thủ công, bỏ qua `sport` client gửi lên. Form chỉ hiển thị môn, không cho chọn. **Bỏ hẳn việc chọn/hiển thị số người chơi** (tiền sân cố định theo giờ, người chơi tự chia nhau); trường `Booking.players` giữ lại cho đơn cũ.
Thêm: tạo/sửa sân chỉ nhận các trường cho phép (không ghi đè `venueId`/`status` qua body), đơn thủ công kiểm tra sân thuộc đúng địa điểm.
Sửa lệch ngày theo múi giờ (`toISOString` → `toLocalISODate`) ở lịch chủ sân, ô chọn ngày và chuyển sân.
Test: `tests/courtRules.test.js`.

---

## Admin chỉ vận hành hệ thống & thu hoa hồng · bỏ tích điểm · chọn avatar

### 1. Admin không còn trong luồng khách ↔ chủ sân
Đặt sân, thanh toán, hoàn tiền, bù tiền/phí chuyển sân đều chỉ có **người chơi và chủ sân**.
- **Bù tiền + phí chuyển sân** (và phí sang tên T5) khách chuyển **thẳng vào tài khoản chủ sân** của
  địa điểm nhận (`Payment.receiver`), chủ sân xác nhận ở `/owner/payments/pending`. Phí chuyển sân thuộc về
  chủ sân (cộng vào `entitlement`, không tính hoa hồng).
- **Hoàn tiền** do chủ sân đã giữ tiền thực hiện: huỷ đơn → chủ sân của đơn; chênh lệch chuyển sân → chủ sân cũ;
  chuyển sân thất bại → chủ sân đã nhận khoản bù. Khoản chủ sân hoàn được trừ vào số dư đối soát.
- **Đã xoá** khỏi admin: `/admin/bookings`, `/admin/transfers*`, `/admin/payments/*`, `/admin/reports/transfers`,
  webhook `/payments/bank/webhook`, cài đặt `bankAutoConfirmEnabled`/`BANK_WEBHOOK_SECRET`, 4 trang admin tương ứng.
  `getPaymentStatus`/`requestRefund`/`getTransferById` không còn nhánh cho admin.
- **Admin còn:** người dùng, địa điểm, chủ sân, đánh giá, khuyến mãi, cài đặt, **đối soát hoa hồng** và trang mới
  **Hoa hồng theo đơn** (`GET /api/admin/commissions`, chỉ đọc, không hiện thông tin khách).
- Sổ đối soát (`settlementMath`/`settlementService`) tính thêm tiền bù chuyển sân, mọi loại khoản hoàn và phí chuyển sân.
- Test: `ownerPaymentFlow` OP-06..OP-13 (kể cả test chặn route admin quay lại), `settlementFlow` SF-19..22, `settlementMath` ST-18..20.

### 2. Bỏ tính năng tích điểm
Xoá `utils/loyaltyPoints.js`, `utils/refundAllocation.js`, trường `loyaltyPoints`/`pointsUsed`/`pointsApplied`/`refundPoints*`,
cài đặt `pointsPerAmount`/`pointValueVnd`/`pointsRedeemMaxRatio`, bút toán `loyalty_*`, UI điểm ở Hồ sơ/Thanh toán/Lịch sử/Cài đặt admin.
**Số dư khuyến mãi (credit) là tính năng riêng và được giữ nguyên.**

### 3. Chọn avatar trong Hồ sơ
- 12 avatar dựng sẵn (`e360sport/public/avatars`) + tải ảnh riêng (JPG/PNG/WEBP ≤ 2MB, ảnh cũ tự bị xoá) + về mặc định.
- `PUT /api/auth/avatar { avatar: 'preset:avatar-03' | null }`, `POST /api/auth/avatar` (middleware `uploadAvatar` chỉ nhận ảnh).
- Chủ sân/admin vào Hồ sơ bằng cách bấm ảnh đại diện ở thanh bên/thanh trên.
- Test: `tests/avatars.test.js`.

### Cần làm khi nâng cấp
`npm run migrate` (gắn tài khoản chủ sân cho giao dịch mở cũ, giao khoản hoàn cũ cho chủ sân, gỡ dữ liệu tích điểm).
Giao dịch cũ đã hoàn tất nhận bằng tài khoản nền tảng giữ nguyên: sổ đối soát coi nền tảng đang nợ chủ sân khoản đó.

---

## Thanh toán đặt sân: tiền vào tài khoản chủ sân, chủ sân xác nhận

**Trước:** khách chuyển khoản vào tài khoản của admin/nền tảng, admin bấm xác nhận.
**Nay:** khách chuyển thẳng vào tài khoản **chủ sân** của địa điểm đang đặt, **chủ sân**
đối chiếu sao kê và bấm xác nhận/từ chối. Quản trị viên chỉ vận hành hệ thống, không
thấy và không xử lý được các giao dịch này (backend trả 403).

- `Payment.receiver` — bản chụp tài khoản chủ sân tại thời điểm khách thanh toán
  (chủ sân đổi tài khoản sau này không làm sai lịch sử/tranh chấp).
- `User.bankBin`, `User.bankAccountName` — bổ sung để sinh mã QR VietQR. Chủ sân nhập
  ở **Cài đặt → Thông tin nhận tiền** (chọn ngân hàng từ danh sách hoặc nhập BIN tay).
- API chủ sân: `GET /api/owner/payments/pending-bank`,
  `POST /api/owner/payments/:id/{confirm,reject}-bank-transfer`. Trang: `/owner/payments/pending`.
- Chủ sân chưa điền tài khoản → khách đặt sân đó nhận lỗi 409 (không có "tài khoản
  dự phòng" của nền tảng), số dư/điểm đã giữ chỗ được trả lại.
- Webhook đối soát tự động chỉ khớp giao dịch nhận bằng tài khoản nền tảng.
- **Không đổi:** khoản bù khi chuyển sân và giao dịch cũ (không có `receiver`) vẫn nhận
  bằng tài khoản nền tảng và do admin xác nhận — menu admin đổi tên thành "Thu phí chuyển sân".
- **Chưa đổi (cần quyết định riêng):** hoàn tiền, sổ cái/hoa hồng, chi trả chủ sân — xem
  `backend/utils/ledger.js`, `services/refundService.js`, `controllers/payoutController.js`.
- Test: `backend/tests/ownerPaymentFlow.test.js` (chạy trong `npm test`, không cần MongoDB).

---

## Sửa: chi tiết lượt đặt sân của người chơi hiện trống

**Lỗi:** ở `/bookings`, bấm "Chi tiết" một đơn không có ghi chú và không chuyển/hủy được
(điển hình là đơn **Chờ thanh toán** hoặc **Đã hủy**) thì phần mở rộng hoàn toàn trống —
code cũ chỉ vẽ ghi chú và các nút thao tác. Thẻ đơn còn là `flex` ngang nên phần mở rộng
bị xếp cạnh thay vì nằm dưới.

- `BookingHistory.jsx`: phần chi tiết nay luôn có mã đơn, môn, số người, thời lượng, giờ
  đặt, tách giá (tiền sân, phí, giảm giá, số dư, điểm, tổng), phương thức thanh toán, và
  thông tin hoàn/huỷ với đơn đã hủy.
- Đơn **Chờ thanh toán**: có nút **Thanh toán** (nối lại thanh toán) và dòng trạng thái.
  Nếu khách đã báo chuyển khoản thì hiện "chủ sân đang xác nhận" và ẩn nút (tránh sinh
  thêm một giao dịch thứ hai cho cùng đơn).
- Tổng tiền ở thẻ nay trừ cả giảm giá (trước đây chỉ cộng tiền sân + phí, lệch với trang
  Thanh toán).
- `Payment.jsx`: mở `/payment?bookingId=...` cho đơn đang chờ thanh toán giờ dựng được
  trang từ dữ liệu máy chủ (trước đây phụ thuộc state của luồng đặt sân nên tải lại trang
  là mất). Số dư/điểm đã giữ chỗ từ lần trước được hiển thị đúng, không tính lại.

---

## Sửa: một đơn có 2 giao dịch trong "Xác nhận chuyển khoản", khách chuyển tiền hai lần

**Nguyên nhân:** `checkout` tạo một Payment MỚI ở mỗi lần gọi (bấm đúp, mở lại từ Lịch sử,
tải lại trang). Chủ sân thấy hai dòng cho một đơn; từ chối dòng này, xác nhận dòng kia thì
đơn vẫn thành công.

- `checkout` nay idempotent: đơn đã có giao dịch đang mở thì trả lại CHÍNH giao dịch đó
  (cùng mã, cùng QR). Có `alreadyReported` để giao diện ẩn QR khi khách đã báo chuyển.
- `Payment.openKey` + unique partial index `one_open_payment_per_booking`: hai yêu cầu đồng
  thời cũng không thể tạo giao dịch thứ hai.
- `markTransferred` và `confirmPayment` chuyển trạng thái nguyên tử → chủ sân chỉ nhận
  MỘT thông báo, bấm xác nhận hai lần không ghi sổ cái/điểm/mã giảm giá hai lần.
- Danh sách của chủ sân chỉ gồm giao dịch khách ĐÃ báo chuyển, mỗi đơn đúng một dòng.
- Từ chối một giao dịch = đóng mọi giao dịch của đơn. Xác nhận một giao dịch = đóng các giao
  dịch trùng còn lại. Đơn đã huỷ/hết hạn thì không xác nhận được (409).
- Khách đã báo chuyển khoản thì không huỷ được đơn (409). Huỷ đơn chưa thanh toán hoặc đơn
  hết hạn (tác vụ nền) sẽ đóng giao dịch pending còn treo.
- Giao diện: sau khi báo chuyển, trang Thanh toán chuyển sang màn hình "chờ chủ sân xác nhận"
  (không còn QR); Lịch sử đặt sân có nút Huỷ cho đơn chưa thanh toán; ảnh sân hiện đúng khi
  nối lại thanh toán.
- **Cần chạy `npm run migrate`** trước khi chạy bản mới: bước `dedupeOpenPayments` đóng các
  giao dịch trùng đã có sẵn rồi mới dựng unique index (nếu không, dựng index sẽ lỗi).

## Đổi: hoa hồng chủ sân chịu (mặc định), có thể chia với khách

**Trước:** hoa hồng (`serviceFee`) cộng thêm vào giá, KHÁCH trả (200.000đ → khách trả 210.000đ).
**Nay (mặc định):** khách trả đúng giá niêm yết; hoa hồng trừ vào tiền chủ sân.
Giá 200.000đ, hoa hồng 10% → khách trả 200.000đ, chủ sân nhận 180.000đ, nền tảng 20.000đ.

- Cài đặt mới `commissionCustomerSharePct` (Admin → Cài đặt): % hoa hồng khách chịu.
  0 = chủ sân chịu hết (mặc định) · 50 = chia đôi · 100 = khách chịu hết (như cũ).
- `Booking.ownerCommission` (phần chủ sân chịu) và `Booking.commissionRate` (tỉ lệ đã chốt).
  `serviceFee` giờ chỉ là phần khách chịu. Đơn cũ không có hai trường này → tính như cũ.
- Công thức ở `backend/utils/commission.js`; áp dụng cho đặt sân, báo giá chuyển sân, sổ cái
  (`owner_earning` = giá sân − ownerCommission; `booking_commission` = serviceFee + ownerCommission),
  doanh thu chủ sân, công nợ chi trả, báo cáo doanh thu admin.
- Khuyến mãi (nền tảng tài trợ) nay bị chặn trần bởi TỔNG hoa hồng của đơn, không phải riêng phần
  khách chịu — nếu không, khi khách chịu 0đ thì mọi mã giảm giá đều thành 0đ.
- Giao diện: khách không thấy dòng "Phí dịch vụ" khi bằng 0; chủ sân thấy "Bạn thực nhận".
- Test: `backend/tests/commission.test.js`; `ownerPaymentFlow.test.js` thêm OP-14…OP-25.

---

## Thu hoa hồng khi khách chuyển tiền THẲNG cho chủ sân (đối soát theo hoá đơn)

**Vấn đề:** tiền đặt sân nằm ở chủ sân nên nền tảng không có gì để "khấu trừ" 10%. Toàn bộ
code cũ (công nợ chi trả, hoàn tiền, sổ cái) lại giả định NỀN TẢNG giữ tiền rồi trả chủ sân —
admin có thể "chi trả" cho chủ sân khoản họ đã nhận trực tiếp.

**Cách làm:** số dư cộng dồn của từng chủ sân → hoá đơn đối soát → chủ sân nộp qua chuyển khoản.

    số dư = tiền khách chuyển vào TK chủ sân − tiền chủ sân đã hoàn khách
            − tiền chủ sân được hưởng (giá sân − hoa hồng chủ sân chịu)
            − đã nộp nền tảng + nền tảng đã chuyển cho chủ sân
    số dư > 0 → chủ sân nợ nền tảng (hoa hồng)   |   số dư < 0 → nền tảng nợ chủ sân

Ví dụ giá 200.000đ, hoa hồng 10%: khách chuyển 200.000đ, chủ sân được hưởng 180.000đ → nợ 20.000đ.
Khách dùng số dư/điểm/khuyến mãi (nền tảng tài trợ) thì chủ sân nhận ít tiền mặt hơn → số dư giảm
hoặc đảo chiều thành "nền tảng nợ chủ sân". Huỷ đơn, chuyển sân, hoàn tiền đều tự khớp (công thức
cộng dồn, không cắt kỳ). Hàm thuần ở `backend/utils/settlementMath.js`.

- Model `OwnerSettlement` (hoá đơn): `issued → reported → paid` (hoặc `cancelled`). Mỗi chủ sân tối đa
  MỘT hoá đơn đang mở (unique partial index `one_open_settlement_per_owner`).
- Tự lập hoá đơn trong 3 ngày đầu tháng (tác vụ nền, mỗi chủ sân một hoá đơn/tháng); admin lập tay
  được bất kỳ lúc nào (Đối soát hoa hồng → Số dư các chủ sân, hoặc trang chi tiết chủ sân).
- Chủ sân: **Hoa hồng nền tảng** (`/owner/commission`) — số dư, mã QR nộp vào TÀI KHOẢN NỀN TẢNG
  (nội dung = mã hoá đơn), nút "Tôi đã chuyển khoản". Admin: **Đối soát hoa hồng**
  (`/admin/settlements`) — Xác nhận / Từ chối. Hoá đơn `platform_pays`: admin chuyển cho chủ sân rồi xác nhận.
- Chủ sân quá hạn + ân hạn (mặc định 7 + 7 ngày) mà chưa nộp → địa điểm tạm ngưng nhận đặt MỚI
  (`holdSlot`, `createBooking`, chuyển sân tới địa điểm đó). Đơn đã đặt giữ nguyên. Đã báo chuyển
  (chờ admin đối chiếu) thì không bị chặn. Tắt/chỉnh trong Admin → Cài đặt.
- Cài đặt mới: `commissionDueDays`, `commissionAutoIssueEnabled`, `commissionBlockEnabled`, `commissionGraceDays`.
- Tài khoản ngân hàng trong Admin → Cài đặt nay là "tài khoản nền tảng" để chủ sân NỘP hoa hồng
  (vẫn không hiện cho khách khi đặt sân).

**Hoàn tiền:** khoản hoàn của đơn khách chuyển thẳng cho chủ sân giao cho CHỦ SÂN (`Payment.refundOwnerId`),
trang **Hoàn tiền cho khách** (`/owner/refunds`); admin bị chặn (403) và không thấy các khoản này.
Khoản hoàn của chuyển sân và giao dịch cũ vẫn do nền tảng hoàn. Khoản chủ sân hoàn không ghi sổ cái nền tảng.

**Đã gỡ / đổi:** `payoutController` và API `/admin/owners/:id/payouts`, `/owner/payouts` (thay bằng đối soát);
phiếu chi cũ (`Payout`) vẫn được tính vào số dư. Đơn chủ sân tự tạo (thu tại quầy, `paymentMethod: manual`)
không còn bị ghi là "nền tảng nợ chủ sân" và không tính vào đối soát.

**Giới hạn đã biết:** (1) khoản chủ sân giữ lại khi khách huỷ sát giờ chỉ bị trừ hoa hồng theo tỉ lệ phần
giữ; (2) bồi thường chuyển sân giữa hai chủ sân vẫn cần admin chuyển tay theo hoá đơn `platform_pays`;
(3) số dư tính trên TOÀN BỘ lịch sử — nếu DB cũ có phiếu chi chưa khớp doanh thu, số dư sẽ lệch đúng bằng
khoản chênh đó (kiểm tra ở "Số dư các chủ sân" trước khi lập hoá đơn đầu tiên).
- Test: `tests/settlementMath.test.js` (17), `tests/settlementFlow.test.js` (23); chạy trong `npm test`.
- **Chạy lại `npm run migrate`** để dựng index hoá đơn.

---

## PHẢI ĐỌC TRƯỚC KHI CHẠY

### 1. Chạy migrate một lần

```bash
cd backend
npm install
npm run migrate
```

Script dựng khoá khung giờ (`SlotLock`) cho các đơn cũ. Bỏ qua bước này thì
ràng buộc chống đặt trùng chỉ bảo vệ được đơn mới.

Script cũng sẽ **cảnh báo** nếu phát hiện đơn cũ có khung giờ dài hơn một tiếng
— những đơn đó đã bị thu thiếu tiền theo công thức cũ. Số tiền **không được sửa
tự động**: đó là dữ liệu lịch sử đã đối soát, sửa đè sẽ làm lệch sổ sách. Bạn
cần tự quyết chính sách bù trừ.

### 2. Môi trường chạy thật cần MongoDB replica set

Chuyển sân đụng tới tiền của ba bên nên không được phép thực thi nửa vời, mà
giao dịch của MongoDB chỉ hoạt động trên replica set:

```
MONGO_URI=mongodb://host1:27017,host2:27017/e360sport?replicaSet=rs0
```

Máy phát triển chạy MongoDB đơn lẻ vẫn được — `utils/withTransaction.js` tự
phát hiện và chạy ở chế độ không giao dịch kèm cảnh báo ra console.

### 3. Chạy kiểm thử

```bash
npm test
```

11 kiểm thử, không cần cơ sở dữ liệu. Bốn trong số đó tái hiện đúng bốn ví dụ
số trong tài liệu đặc tả; một kiểm thử chạy 2.000 tổ hợp ngẫu nhiên để xác minh
đẳng thức cân đối không bao giờ lệch dù một đồng.

### 4. Phần chưa được kiểm chứng

Toàn bộ code đã qua: kiểm thử đơn vị cho công thức, kiểm tra nạp module, và
build frontend sạch. **Chưa chạy thử với MongoDB thật** — các phần tương tác cơ
sở dữ liệu (giao dịch, ràng buộc duy nhất, luồng IPN, API hoàn tiền của cổng)
cần bạn kiểm thử trong môi trường của mình trước khi đưa vào sử dụng.

---

## A. CHỨC NĂNG MỚI: CHUYỂN SÂN

### A.1. Năm loại chuyển

| Mã | Mô tả | Chủ sân cũ có mất doanh thu? |
|---|---|---|
| T1 | Đổi khung giờ, cùng sân | Không |
| T2 | Đổi sân, cùng địa điểm | Không |
| T3 | Đổi địa điểm, cùng chủ sân | Không |
| T4 | Chuyển sang chủ sân khác | **Có** — phát sinh bồi thường |
| T5 | Sang tên cho người khác | Không |

### A.2. Công thức

```
S = P₂ + F_tr + C_A − P₁

  P₁   = A₁ + F₁ − D₁      đã trả cho đơn gốc
  P₂   = A₂ + F₂ − D₂      phải trả cho đơn mới
  F_tr = clamp(round(A₁ × k), phí tối thiểu, phí tối đa)
  C_A  = round(A₁ × c)     chỉ khác 0 với loại T4

  S > 0 → bù thêm · S = 0 → chuyển ngay · S < 0 → được hoàn
```

Khách trả tiền hàng mới, trả phí đổi hàng, đền cho người bán cũ bị lỡ hàng, và
được trừ đi số đã trả trước đó.

Biểu phí `k` và biểu bồi thường `c` là bậc thang theo thời gian còn lại, chỉnh
được trong **Quản trị → Cài đặt** mà không phải sửa mã nguồn.

### A.3. Hai nguyên tắc bất biến

Mọi thay đổi về sau phải giữ được hai điều này:

1. **Đẳng thức cân đối luôn đúng tuyệt đối.** Tổng tiền khách bỏ ra phải bằng
   đúng tổng tiền các bên nhận về. Hàm `verifyBalance()` kiểm tra điều này
   trước khi ghi sổ cái; lệch dù một đồng thì giao dịch bị huỷ chứ không ghi sổ
   sai.
2. **Mọi nhánh thất bại đều kết thúc với đơn gốc còn nguyên hiệu lực.** Khung
   giờ gốc chỉ được giải phóng ở bước cuối cùng bên trong giao dịch. Khách
   không bao giờ rơi vào cảnh mất cả hai khung giờ.

### A.4. Chống lạm dụng

| Rủi ro | Cách chặn |
|---|---|
| Đặt sân đắt rồi chuyển sang sân rẻ để rút tiền | Trần hoàn tiền mặt 50%; phần vượt vào số dư khuyến mãi, không rút được |
| Dùng chuyển sân như công cụ giữ chỗ trôi nổi | Mỗi đơn chỉ chuyển tối đa 1 lần, kế thừa qua cả chuỗi |
| Chuyển sát giờ làm chủ sân mất trắng khung giờ | Bồi thường bậc thang tới 40%; dưới 2 tiếng thì cấm chuyển |
| Mã khuyến mãi "đơn tối thiểu 300k" dùng cho đơn 150k sau khi chuyển | Mã được kiểm tra lại từ đầu trên giá đơn mới |

### A.5. Tệp mới — backend

```
models/       TransferRequest · LedgerEntry · SlotLock · CreditTransaction
utils/        timeSlots · transferPolicy · transferPricing · ledger
              slotLock · withTransaction
services/     transferService · assignmentService · refundService
controllers/  transferController
routes/       transferRoutes
jobs/         index.js (đóng đơn quá hạn, hết hạn yêu cầu chuyển)
scripts/      migrate.js
tests/        transferPricing.test.js
```

### A.6. Tệp mới — frontend

```
services/                  transferService · refundService
pages/customer/            TransferBooking (3 bước) · TransferDetail · ClaimBooking
pages/owner/               TransferRequests
pages/admin/               TransferManagement · RefundManagement
components/booking/        AssignBookingModal
```

---

## B. MÔ HÌNH DOANH THU

### B.1. Sổ cái giao dịch

Trước đây mọi số liệu tài chính được suy ra bằng cách cộng dồn `amount` và
`serviceFee` trên `Booking`. Cách đó chỉ đúng khi mỗi đơn sinh ra đúng một dòng
tiền. Chuyển sân phá vỡ giả định: một đơn gốc sinh ra đồng thời tiền cho chủ
sân mới, bồi thường cho chủ sân cũ và phí chuyển cho nền tảng.

`LedgerEntry` ghi từng dòng tiền riêng với 14 loại bút toán. Mọi báo cáo trở
thành phép cộng trên một nguồn duy nhất.

### B.2. Các khoản chi trước đây bị bỏ qua

Doanh thu báo cáo cũ cao hơn thực tế vì không trừ:

- **Phí cổng thanh toán** (~1,5% giá trị giao dịch) — nay lưu vào
  `Payment.gatewayFee`
- **Chi phí điểm tích luỹ** — mỗi điểm phát hành là một khoản nợ tiềm tàng, nay
  ghi nhận theo `pointValueVnd`
- **Chi phí khuyến mãi** — `discountAmount` nay được trừ khỏi doanh thu

Với hoa hồng 5%, biên lợi nhuận thực chỉ khoảng **2,4%** giá trị đơn. Một mã
giảm giá kịch trần đủ biến đơn đó thành lỗ.

### B.3. Chính sách huỷ có thu phí

Trước đây huỷ hoàn toàn miễn phí và không kích hoạt hoàn tiền. Nay có biểu bậc
thang, và khách xem trước được mất bao nhiêu **trước khi** bấm huỷ.

Biểu huỷ cố ý đặt kém hấp dẫn hơn biểu chuyển sân: khi khách bận đột xuất,
chuyển sân luôn rẻ hơn huỷ, nên giao dịch được giữ lại cho cả ba bên.

### B.4. Hoàn tiền tự động

Hệ thống **thử** gọi API hoàn tiền của VNPay/MoMo trước. Chỉ khi không gọi
được (chưa cấu hình merchant, thiếu mã giao dịch gốc, cổng từ chối) mới rơi về
quy trình thủ công ở **Quản trị → Hoàn tiền**, nơi có nút thử lại và nút đánh
dấu đã chuyển khoản tay.

Nguyên tắc: một khoản hoàn không bao giờ bị mất dấu. Dù đi đường nào, luôn tồn
tại một bản ghi `Payment` ở trạng thái `refunded` hoặc `refund_requested`.

---

## C. LỖI ĐÃ SỬA

### C.1. Bảo mật

| Vị trí | Vấn đề |
|---|---|
| `bookingController.getBookingById` | Không kiểm tra quyền sở hữu — bất kỳ ai đăng nhập cũng đọc được đơn của người khác nếu biết mã định danh (IDOR) |
| `paymentController.requestRefund` | Tương tự, và cho phép yêu cầu hoàn với giao dịch chưa thanh toán |
| `paymentController.getPaymentStatus` | Tra được trạng thái đơn của người khác |
| `venueController.updateVenue` | `Object.assign(venue, req.body)` — gửi kèm `{ status, rating, ownerId }` là ghi đè được hết. Nay chỉ nhận danh sách trường được phép |
| `bookingController.updateBookingStatus` | Chủ sân đặt được bất kỳ giá trị nào, kể cả nhảy thẳng sang `completed` để làm phồng công nợ. Nay có máy trạng thái |
| `venueController.addReview` | Ai cũng đánh giá được, spam bao nhiêu lần cũng được. Nay phải có ít nhất một đơn đã hoàn tất, mỗi người một lần |

### C.2. Đúng đắn nghiệp vụ

**Giá không nhân số giờ.** `amount = court.pricePerHour` — mọi khung giờ dài hơn
một tiếng đều bị thu thiếu tiền. Nay dùng `calculateAmount()` nhân đúng số giờ.
Đây là lỗi tài chính nghiêm trọng nhất của phiên bản cũ.

**Đơn chờ thanh toán không bao giờ hết hạn.** Kiểm tra trùng lịch chỉ loại trừ
`cancelled`, nên đơn bỏ dở chiếm khung giờ vĩnh viễn. Nay có tác vụ nền đóng
sau 15 phút, và truy vấn cũng loại trừ đơn quá hạn.

**Báo cáo doanh thu tính lại theo tỉ lệ hiện hành.** `revenue += round(b.amount
* commissionRate)` — hạ hoa hồng từ 5% xuống 3% là toàn bộ số liệu các tháng đã
đối soát bị tính lại theo 3%. Nay đọc `serviceFee` đã chốt trên từng đơn.

**Tranh chấp khung giờ.** Kiểm tra trùng theo kiểu đọc-rồi-mới-ghi có khoảng
trống cho hai yêu cầu đồng thời cùng lọt. Nay dùng `SlotLock` với ràng buộc duy
nhất ở cấp cơ sở dữ liệu — cách này đồng thời bắt được cả khung giờ chồng lấn
một phần (19:00–20:30 với 20:00–21:00) mà index theo `startTime` bỏ sót.

**Giữ chỗ chỉ so khớp `startTime` chính xác.** Cùng nguyên nhân với trên, nay so
sánh chồng lấn.

**Lượt mã khuyến mãi bị đốt oan.** `usedCount` tăng ngay khi tạo đơn nhưng không
hoàn khi khách bỏ dở — mã giới hạn 100 lượt có thể cạn mà không tạo ra đồng
doanh thu nào. Nay chỉ trừ khi thanh toán thành công.

**Công nợ chủ sân bỏ sót bồi thường.** Nay gồm cả đơn ở trạng thái
`transferred`, nhưng chỉ tính `compensationAmount` — tuyệt đối không tính
`amount`, nếu không chủ sân được trả tiền cho khung giờ họ không hề phục vụ.

### C.3. Kiến trúc

- Thêm tầng `services/` cho logic cần phối hợp nhiều mô hình trong một giao dịch
- Thêm `jobs/` — trước đây chỉ có TTL index của MongoDB, đủ dọn bản ghi giữ chỗ
  nhưng không đủ đóng đơn hết hạn
- Tách công thức tính tiền thành hàm thuần để kiểm thử được không cần cơ sở dữ liệu
- `api.js` phía frontend nay trả kèm mã HTTP để nơi gọi phân biệt được loại lỗi

---

## D. CÒN THIẾU

| Hạng mục | Ghi chú |
|---|---|
| Kiểm thử tích hợp với cơ sở dữ liệu | Chưa viết. Các kịch bản cần phủ đã liệt kê ở Chương 11 tài liệu đặc tả (IT-01 đến IT-10) |
| Quy tắc bán lại | Nếu khung giờ gốc được khách khác đặt lại trước giờ đá, chủ sân cũ không còn thiệt — có thể hoàn `C_A` cho khách. Đã đặc tả ở mục 9.8.3 nhưng chưa hiện thực |
| Dùng số dư khuyến mãi để đặt sân | `creditBalance` mới chỉ cộng vào, chưa trừ ra được khi đặt đơn mới |
| Đổi điểm tích luỹ | Điểm vẫn chỉ cộng, chưa tiêu được |
| Email thông báo | Hiện chỉ có thông báo trong ứng dụng |
| Đối soát theo ngày sử dụng sân | Công nợ vẫn tính theo `createdAt`, nên đơn đặt trước ba tháng đã được tính ngay |

---

## E. THAY LOGO THƯƠNG HIỆU

Thay logo chữ + icon tia sét (`Zap` của lucide) bằng logo ảnh E360Sport. Chỉ đổi
phần hiển thị, không đụng tới logic, route hay API.

- **Tệp mới:** `src/assets/logo-e360sport.png` (chữ E + 360SPORT, nền trong suốt),
  `src/assets/logo-e360sport-mark.png` (chỉ chữ E), `src/components/common/Logo/Logo.jsx`
  (component dùng chung), `public/` (favicon, apple-touch-icon, icon 192/512, `manifest.webmanifest`)
- **Nơi dùng logo:** Navbar, Footer, AuthLayout, OwnerLayout, AdminLayout
- **Navbar (nền trắng):** logo đặt trong khối nền đen bo góc, vì chữ "SPORT" màu trắng
  sẽ biến mất trên nền trắng. Các nơi còn lại nền tối nên dùng logo trong suốt trực tiếp
- **Sidebar Owner/Admin:** mở rộng hiện logo đầy đủ, thu gọn hiện riêng chữ E; header
  khi thu gọn xếp dọc (logo trên, nút thu gọn dưới) vì sidebar chỉ rộng 72px
- **`index.html`:** favicon cũ trỏ tới `/vite.svg` (không tồn tại) nay dùng bộ icon mới
- Bỏ hiệu ứng `pulse` của icon cũ trên Navbar
- Logo được import qua Vite nên có hash trong tên file, khớp cấu hình cache của nginx

---

## F. SỬA LỖI ẢNH VỠ LAYOUT Ở TRANG CHI TIẾT ĐỊA ĐIỂM

`VenueDetail.module.css` — ảnh bìa và ảnh nhỏ (gallery) dùng `height: 100%` bên
trong một lưới CSS Grid không có chiều cao XÁC ĐỊNH cho từng ô. Với ảnh có tỷ lệ
bất thường (ảnh dọc chụp điện thoại, ảnh panorama rất dẹt — rất phổ biến khi chủ
sân tự chụp và tải lên), trình duyệt không co ảnh về đúng khung 420px như thiết
kế mà để nguyên kích thước tự nhiên, đẩy khối ảnh cao hơn hẳn (đã đo thực tế:
có trường hợp cao tới hơn 11.000px thay vì 420px), đè lên toàn bộ nội dung bên
dưới.

- Đổi sang dùng `aspect-ratio` cho `.galleryMain` và `.thumb` (đúng cách
  `VenueCard.module.css` đã làm cho danh sách địa điểm), và khai báo
  `grid-template-rows: 100%` cho `.gallery` ở desktop để hàng lưới có chiều cao
  xác định thay vì tự co theo nội dung
  ảnh và bo góc; layout không còn phụ thuộc tỷ lệ khung hình của ảnh chủ sân tải lên
- Đã kiểm chứng bằng ảnh dọc 400×3000, ảnh ngang 3000×500, trên cả desktop và
  mobile, dựng lại đúng trang bằng bản build thật — chiều cao trang không đổi
  dù đổi ảnh, không còn tràn ra ngoài khung 420px

---

## G. VÁ LỖI BỎ QUA ĐIỀU KIỆN "PHẢI ĐẶT TRƯỚC N GIỜ"

`utils/timeSlots.js` — `date`/`startTime`/`endTime` trước đây chỉ được kiểm tra
lỏng lẻo (khác rỗng, end > start). Một giá trị sai định dạng (vd. `date: "abc"`)
khiến `toDateTime()` trả về `Invalid Date`, kéo theo `leadTimeHours()` trả về
`NaN`. Mọi so sánh kiểu `NaN <= 0` hay `NaN < minLead` đều là **false** — tức
điều kiện "không được đặt vào quá khứ" và "phải đặt trước ít nhất N giờ" bị bỏ
qua thay vì chặn lại, dù code nhìn qua tưởng đã chặn đúng bằng `<=`.

- Thêm `isValidDateString()` / `isValidTimeString()` — kiểm tra đúng định dạng
  bằng regex, VÀ dựng lại ngày để bắt các ngày không tồn tại trên lịch (như
  30/2, 31/4) mà `Date.UTC()` âm thầm "cuộn" sang ngày khác thay vì báo lỗi
- Áp dụng ở 3 nơi nhận thẳng date/time từ client: `bookingController.holdSlot`,
  `bookingController.createManualBooking`, `transferService.createQuote` —
  chặn ngay từ đầu bằng lỗi 400 rõ ràng, trước khi giá trị rác có cơ hội đi vào
  bất kỳ phép tính tiền hay tính thời gian nào
- Đã kiểm bằng 14 trường hợp biên (ngày/giờ không tồn tại, thiếu số 0, giờ giả
  25:99, năm nhuận...) và fuzz 5.000 chuỗi ngẫu nhiên — không còn ca nào để lọt
  `NaN` xuống `leadTimeHours()`

---

## H. VÁ 6 LỖ HỔNG TRONG LUỒNG DUYỆT HỒ SƠ CHỦ SÂN

**1) Khóa/thu hồi quyền chủ sân không ẩn địa điểm của họ.** Thêm
`Venue.suspendedByOwnerBan` để phân biệt "tự động ẩn do chủ bị khóa" với
"admin tạm ngưng riêng vì lý do khác". `userController.updateUserStatus` giờ
tự ẩn các địa điểm đang hoạt động khi khóa hoặc thu hồi quyền chủ sân, và khi
mở khóa chỉ khôi phục đúng những địa điểm mà chính việc khóa đã ẩn đi.
`deleteUser` giờ chặn xóa nếu chủ sân còn đứng tên địa điểm, tránh để lại
"địa điểm mồ côi" mà khách vẫn đặt/chuyển tiền được.

**2) Duyệt hồ sơ một cú bấm, không bắt xem giấy tờ.** `OwnerManagement.jsx` bỏ
nút "Duyệt" nhanh ở dòng bảng — giờ chỉ duyệt được qua modal "Chi tiết", và nút
"Duyệt hồ sơ" trong modal bị khóa cho tới khi admin tick "Tôi đã xem giấy tờ và
đối chiếu thông tin". Hồ sơ không có giấy tờ đính kèm (nộp từ trước khi hệ
thống bắt buộc đính kèm — xem mục 4) thì không thể duyệt, chỉ có thể từ chối.
`authController.submitOwnerApplication` giờ bắt buộc đính kèm ít nhất 1 giấy tờ
khi nộp hồ sơ, để việc "bắt xem giấy tờ trước khi duyệt" không bị vô hiệu hóa
bởi những hồ sơ không có gì để xem.

**3) Đổi tài khoản ngân hàng sau khi đã duyệt mà không ai biết.** Thêm
`bankInfoPendingReview`/`bankInfoChangedAt`/`bankInfoConfirmedAt`/`bankInfoConfirmedBy`
vào `User`. Khi chủ sân đã duyệt tự đổi `bankName`/`bankAccount` qua trang hồ
sơ, hệ thống đánh dấu "chờ xác minh" và báo cho toàn bộ admin.
`payoutController.createPayoutAdmin` từ chối ghi nhận thanh toán cho tới khi
admin xác nhận qua `PATCH /admin/owners/:id/confirm-bank-info` — `OwnerDetail.jsx`
hiển thị banner cảnh báo kèm nút "Xác nhận đã kiểm tra" và số tài khoản (che
bớt, chỉ hiện 4 số cuối).

**4) Giấy tờ pháp lý public không cần đăng nhập.** Thêm `middleware/uploadPrivate.js`
lưu giấy tờ vào `backend/private-uploads/` (KHÔNG nằm trong `UPLOAD_DIR` nên
không bị `express.static` phục vụ công khai), và route
`GET /api/owner-documents/:filename` (`controllers/documentController.js`) yêu
cầu đăng nhập, chỉ admin hoặc chính chủ hồ sơ mới xem được, chặn path traversal,
ép `X-Content-Type-Options: nosniff`. `scripts/migrate.js` thêm bước
`migrateOwnerDocsToPrivate()` để chuyển giấy tờ đã tồn tại từ trước sang chỗ
mới — an toàn chạy lại nhiều lần. Frontend không dùng thẻ `<a href>` thường được
nữa (trình duyệt không tự đính kèm token khi điều hướng) — thêm
`services/notificationService.js#openOwnerDocument()` tự fetch kèm token rồi
mở bằng object URL tạm, dùng ở cả `OwnerApplication.jsx` (khách tự xem hồ sơ
mình) và `OwnerManagement.jsx` (admin xét duyệt). Nhân tiện vá luôn
`services/api.js`: khi dùng `responseType: 'blob'`, lỗi từ server cũng bị axios
ép thành Blob thay vì JSON, làm mất `error.message` — interceptor giờ tự đọc
lại nội dung thật.

**5) Không ghi ai đã duyệt hồ sơ.** Thêm `User.ownerApplicationReviewedBy`,
ghi trong `updateUserStatus`, populate ở `getOwners`/`getOwnerDetail` để hiển
thị tên admin đã xử lý thay vì một ObjectId trơ — `OwnerManagement.jsx` hiển
thị "Đã duyệt lúc [thời gian] — bởi [tên admin]".
*Xác minh email/SĐT người nộp hồ sơ CHƯA làm trong đợt này* — cần quyết định
thêm về nhà cung cấp SMS (hệ thống hiện chưa tích hợp dịch vụ nào).

**6) `createVenue` nhận nguyên `req.body`.** Đổi sang whitelist đúng như
`updateVenue` đang làm (chỉ nhận `name/description/sports/amenities/rules/openHours/address/transferRequiresApproval`),
chặn được việc tự gán `rating`, `status`, `ownerId`.

*Phát hiện thêm, CHƯA vá vì nằm ngoài phạm vi 6 lỗi trên:* `venueController.getVenueById`
(trang chi tiết công khai) không lọc theo `isActive`/`status`, nên ai có link
trực tiếp vẫn xem được địa điểm đã bị ẩn — bước đặt sân thật (`holdSlot`) vẫn
chặn đúng nên không có rủi ro tiền bạc, nhưng đây là lỗ hổng hiển thị cần xử lý
riêng.

---

## I. VÁ NỐT CÁC LỖ HỔNG BẢO MẬT VÀ LỖI GIAO DIỆN CÒN LẠI

**Bảo mật**

- `venueController.getVenueById`/`getAvailableSlots` giờ ẩn địa điểm đã bị
  khóa/chưa duyệt khỏi người xem công khai — trước đây ai có link trực tiếp
  vẫn xem được đầy đủ thông tin (không ảnh hưởng tiền vì bước giữ chỗ đã chặn
  đúng từ trước, nhưng đây vẫn là lỗ hổng hiển thị thật). Thêm middleware
  `optionalAuth` để chủ sân/admin vẫn xem được chính địa điểm của mình khi nó
  đang ẩn (trang sửa địa điểm của chủ sân dùng chung endpoint này)
- Nâng `react-router-dom` lên `6.30.6` — vá lỗ hổng XSS/open-redirect qua
  backslash (CVE đã có bản vá ở nhánh 6.x). Hai lỗ hổng mức trung bình còn lại
  chỉ ảnh hưởng luồng SSR hydration (project này không dùng SSR) và cần nâng
  lên major version 7 — đã rà toàn bộ `navigate()`/`Link` trong app, không có
  chỗ nào dùng input người dùng làm đích điều hướng, nên chưa nâng vì rủi ro
  breaking change không tương xứng với lợi ích thực tế
- Thêm Content-Security-Policy và các header bảo mật khác (`X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`) vào nginx cho frontend —
  `server.js` từ trước đã tắt CSP của helmet với ghi chú "CSP thật đặt ở tầng
  nginx" nhưng chưa ai thêm. Đã kiểm bằng Chromium thật: chặn được script từ
  domain lạ, không chặn nhầm ảnh/font hợp lệ (Google Fonts, VietQR, avatar...)
- Sửa `client_max_body_size` trong nginx từ 10M lên 45M — giới hạn cũ thấp hơn
  giới hạn thật của multer (8 ảnh × 5MB = 40MB khi tạo địa điểm), khiến chủ sân
  tải vài ảnh điện thoại là dính lỗi 413 dù chưa chạm giới hạn ứng dụng
- Xóa `deploy/nginx/sportvenue.conf` — file cấu hình rác còn sót lại từ tên
  thương hiệu cũ trước khi đổi sang E360Sport, không được tài liệu nào tham
  chiếu, dễ gây nhầm lẫn khi triển khai

**Giao diện**

- `Profile.module.css`: tên hoặc email quá dài (không có khoảng trắng để tự
  xuống dòng) đẩy toàn bộ layout tràn ra ngoài màn hình — đã tái hiện bằng tên
  dài giả lập, tràn tới 451px trên mobile. Thêm `overflow-wrap: anywhere`
- `globals.css`: sidebar mobile của Admin/Owner ẩn bằng
  `transform: translateX(-100%)` — cách làm này vẫn tính vào `scrollWidth` của
  trang dù không nhìn thấy được, khiến mọi trang admin/owner có thể vuốt ngang
  lộ ra khoảng trắng trên điện thoại (đã đo thực tế: vuốt được 44px, xác nhận
  bằng cách thực sự cuộn và chụp ảnh, không chỉ đo số liệu suông). Thêm
  `overflow-x: hidden` ở `html`/`body`, không ảnh hưởng cuộn ngang riêng của
  bảng dữ liệu (`DataTable.module.css` dùng ngữ cảnh cuộn khác, độc lập)
- Đã quét toàn bộ ứng dụng (mọi trang, 4 vai trò, 2 kích thước màn hình, dữ
  liệu cực đoan) bằng script tự động — 62 lượt kiểm tra, 0 lỗi tràn ngang,
  0 lỗi JS sau khi vá hai lỗi trên
- `Footer.jsx`: 9 liên kết `href="#"` (Về chúng tôi, Tuyển dụng, Bài viết,
  Liên hệ, Trung tâm hỗ trợ, 4 mạng xã hội) trước đây bấm vào giật cuộn lên
  đầu trang mà không đi đâu — chưa có trang/tài khoản thật để trỏ tới nên đổi
  thành phần tử không click được thay vì trỏ tới chỗ không tồn tại

**Số liệu quảng cáo bịa trên trang chủ** — xem mục J bên dưới (làm cùng lúc
với đổi thương hiệu vì cùng một file `Home.jsx`).

## J. ĐỔI THƯƠNG HIỆU: E360SPORT → ESPORT360

Đổi logo và tên hiển thị theo bộ nhận diện mới do khách hàng cung cấp (logo
wordmark + ảnh bìa có khẩu hiệu "PLAY · CONNECT · MOVE").

- **Logo:** thay toàn bộ `logo-e360sport*.png` bằng `logo-esport360*.png` (wordmark
  đầy đủ + biểu tượng chữ E riêng cho sidebar thu gọn), dựng lại bộ favicon/PWA
  icon từ logo mới. `Logo.jsx` cập nhật đúng tỉ lệ khung hình mới (720×157 / 480×240)
- **Ảnh bìa:** thêm `public/images/cover-og.jpg` (crop chuẩn 1200×630 từ ảnh bìa
  gốc, không méo hình) dùng làm ảnh xem trước khi chia sẻ link — `index.html`
  thêm đầy đủ thẻ `og:image`/`twitter:image` (trước đây chưa có thẻ Open Graph
  nào). URL ảnh và `og:url` dùng domain minh họa `esport360.vn` — **cần đổi
  đúng domain thật khi triển khai chính thức**, mạng xã hội yêu cầu URL ảnh
  tuyệt đối chứ không nhận đường dẫn tương đối
- **Đổi tên hiển thị** "E360Sport"/"E360SPORT" → "ESport360"/"ESPORT360" ở toàn
  bộ giao diện, tiêu đề trang, `manifest.webmanifest`, nội dung email (mailer.js),
  trang Chính sách/Điều khoản, README backend/frontend, và trường `description`/
  `name` trong `package.json` hai phía (đã xác nhận `npm ci` vẫn chạy đúng sau đổi)
- **Đồng bộ tài liệu triển khai:** đổi domain minh họa trong `docker-compose.yml`,
  `deploy/DEPLOY.md`, và đổi tên file `deploy/nginx/e360sport.conf` →
  `esport360.conf` — **riêng đường dẫn thư mục thật `e360sport/` (chứa mã nguồn
  frontend) KHÔNG đổi**, vì đó là tên thư mục thật trong repo chứ không phải
  thương hiệu hiển thị; đổi sẽ vỡ toàn bộ đường dẫn tương đối trong project
- CHANGELOG lịch sử (các mục A–H phía trên) giữ nguyên tên cũ vì đó là ghi chép
  đúng thời điểm thực hiện, không chỉnh sửa lại lịch sử

**Nhân tiện vá luôn số liệu quảng cáo bịa ở trang chủ VÀ trang đăng nhập/đăng
ký** (`Home.jsx`, `AuthLayout.jsx`), vì cùng lúc phải sửa các đoạn text nhắc
tên thương hiệu trong các file này:

- Thêm `GET /api/stats/public` (`settingsController.getPublicStats`) — tính
  THẬT số địa điểm đã duyệt, số thành phố, số khách đã hoàn tất ít nhất 1 đơn,
  điểm đánh giá trung bình (loại trừ địa điểm chưa có đánh giá để không bị pha
  loãng). Trang chủ giờ hiển thị số liệu này thay vì 4 con số viết cứng
  ("2.500+ sân", "180K+ người chơi", "50+ thành phố", đánh giá "4.8" cố định)
  — số liệu ban đầu có thể nhỏ hoặc bằng 0, tăng dần đúng thực tế
- Bỏ các tuyên bố phóng đại không kiểm chứng được: "Nền tảng đặt sân thể thao
  số 1 Việt Nam" (đổi thành khẩu hiệu đúng với logo mới "Chơi · Kết nối · Vận
  động"), "hàng nghìn sân thể thao", "hàng nghìn chủ sân"
- Khối mời gọi chủ sân: "+47% Tăng doanh thu" (bịa, không có dữ liệu nào để
  tính) và "0% Hoa hồng tháng đầu" (backend không có cơ chế miễn hoa hồng
  tháng đầu — hứa suông với chủ sân thật) đổi thành thông tin THẬT: "Miễn phí"
  cho thiết lập tài khoản (đúng — không có phí khởi tạo nào trong hệ thống) và
  % hoa hồng thật lấy từ cài đặt nền tảng. Cũng bỏ luôn cụm "nhận tiền ngay" vì
  chi trả cho chủ sân là chuyển khoản thủ công theo đợt, không phải tức thời
- `AuthLayout.jsx` (khung bên trái trang đăng nhập/đăng ký/quên mật khẩu):
  "2.500+ Sân thể thao", "180K+ Lượt đặt sân", "50+ Thành phố" viết cứng — cũng
  đổi sang gọi `/api/stats/public`, dùng chung `formatStatNumber()` (tách ra
  `utils/index.js` để hai nơi không lặp lại cùng một công thức làm tròn khác
  nhau). Backend thêm field `bookings` (tổng số đơn đã hoàn tất) cho đúng ý
  nghĩa "lượt đặt sân" — khác với `players` (số khách khác nhau) đã dùng ở
  trang chủ, một khách có thể có nhiều lượt đặt

---

## K. XÁC MINH EMAIL + ĐĂNG NHẬP/ĐĂNG KÝ BẰNG GOOGLE

**Xác minh email** — tiếp tục phần còn thiếu ở mục H (không xác minh email/SĐT
người nộp hồ sơ chủ sân). Phần SĐT vẫn chưa làm — cần chọn nhà cung cấp SMS,
hệ thống hiện chưa tích hợp dịch vụ nào.

- `User`: thêm `emailVerified`, `emailVerificationTokenHash` (chỉ lưu BẢN BĂM,
  giống hệt cơ chế `resetPasswordTokenHash` có sẵn), `emailVerificationExpires`
- Đăng ký xong gửi email xác minh NGAY nhưng KHÔNG chặn tạo tài khoản nếu gửi
  thất bại (SMTP chưa cấu hình...) — tài khoản vẫn dùng bình thường, chỉ riêng
  việc nộp hồ sơ chủ sân bị chặn cho tới khi xác minh (403 `EMAIL_NOT_VERIFIED`)
- `POST /api/auth/verify-email/:token` (không cần đăng nhập — bản thân mã đã
  xác định tài khoản), `POST /api/auth/resend-verification` (yêu cầu đăng nhập,
  để không lộ qua email nào đã đăng ký, khác `forgot-password`)
- Trang mới `/verify-email/:token` — **không bọc `GuestRoute`**: đăng ký xong
  đã đăng nhập ngay, nên người dùng bấm link xác minh trong email rất có thể
  đang ở trạng thái đã đăng nhập, `GuestRoute` sẽ đá họ ra trước khi kịp gọi API
- `OwnerApplication.jsx`: banner cảnh báo + nút "Gửi lại email xác minh" khi
  chưa xác minh, khoá nút "Gửi hồ sơ" — chặn cả ở JS lẫn để backend chặn lần
  nữa (phòng trường hợp gọi thẳng API)

**Đăng nhập/Đăng ký bằng Google** — dùng Google Identity Services (ID token),
không cần Client Secret.

- Cài `google-auth-library` (thư viện chính thức của Google) — 0 lỗ hổng
- `utils/googleAuth.js`: xác minh chữ ký + `audience` (chặn token cấp cho ứng
  dụng khác) + bắt buộc `email_verified === true` từ phía Google
- `POST /api/auth/google` — gộp đăng nhập và đăng ký trong một endpoint:
  - Email chưa từng đăng ký → tạo tài khoản mới, `emailVerified: true` ngay
    (Google đã xác minh hộ), `role: customer`, mật khẩu ngẫu nhiên không ai
    biết (tài khoản Google không cần mật khẩu, có thể đặt sau bằng "Quên mật khẩu")
  - Email đã đăng ký bằng mật khẩu trước đó → LIÊN KẾT Google vào, không tạo
    tài khoản trùng
  - **Chống chiếm tài khoản (pre-hijacking):** nếu tài khoản email đó CHƯA xác
    minh (nghĩa là chưa chứng minh được chủ thật — có thể do kẻ khác lỡ đăng
    ký sẵn bằng email của nạn nhân), khi liên kết Google thành công thì đổi
    mật khẩu cũ sang giá trị ngẫu nhiên, vô hiệu hoá quyền truy cập của bất kỳ
    ai biết mật khẩu cũ đó
  - Tài khoản bị khoá hoặc admin: chặn TRƯỚC khi đụng vào bất kỳ trường nào
    của tài khoản (không đăng nhập được nhưng cũng không bị đổi mật khẩu/đánh
    dấu xác minh oan uổng)
  - Email đã gắn với một tài khoản Google KHÁC → 409, không tự gộp (email
    trùng không đủ chứng minh là cùng một người, vd. địa chỉ được cấp lại)
  - Đã viết 27 kiểm tra riêng (`tests/googleAuth.test.js`, chạy cùng `npm test`,
    hoàn toàn offline — giả lập cả Google lẫn MongoDB) cho toàn bộ các nhánh trên
- `GoogleSignInButton.jsx` — nút chính thức do Google vẽ (đúng nhận diện
  thương hiệu). Chưa cấu hình `VITE_GOOGLE_CLIENT_ID` → tự ẩn hoàn toàn, không
  lỗi, không ảnh hưởng đăng nhập bằng mật khẩu. Đã kiểm bằng Chromium thật ở cả
  hai trạng thái (chưa cấu hình / đã cấu hình với script Google giả lập)
- Sửa 2 liên kết chết (`href="#"`) ở trang Đăng ký ("Điều khoản dịch vụ",
  "Chính sách bảo mật") sang đúng trang thật đã có sẵn (`/terms-of-service`,
  `/privacy-policy`) — phát hiện khi thêm nút Google vào cùng khu vực
- CSP nginx: thêm `accounts.google.com` vào `script-src`/`connect-src`/
  `frame-src`, thêm `lh3.googleusercontent.com` vào `img-src` (ảnh đại diện
  Google)
- **Cần bạn tự tạo:** OAuth 2.0 Client ID (loại Web application) tại Google
  Cloud Console, thêm domain frontend vào "Authorized JavaScript origins", rồi
  đặt `GOOGLE_CLIENT_ID` (backend) và `VITE_GOOGLE_CLIENT_ID` (frontend, cùng
  giá trị) — xem chú thích trong `backend/.env.example`

**Nhân tiện dọn nốt các chỗ sót tên thương hiệu cũ** phát hiện khi rà lại toàn
bộ project: `start.bat`, `backend/.env.example` (đã đổi domain minh hoạ) —
riêng các đường dẫn thư mục thật (`e360sport\`) vẫn giữ nguyên như mục J đã
giải thích.

