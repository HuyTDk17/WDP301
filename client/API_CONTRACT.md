# API_CONTRACT (giả định của frontend)

Nhãn: **[DOC]** = có trong SRS/SDS · **[GIẢ ĐỊNH]** = frontend tự đặt, cần đối chiếu với backend thật.
Chỉ liệt kê những gì đã được dùng trong code. Sẽ bổ sung theo từng phase.

## Quy ước chung
- Base URL: `VITE_API_BASE_URL` (mặc định `http://localhost:9999/api`). **[DOC]** SDS: backend Express + JWT.
- Header: `Authorization: Bearer <accessToken>`. **[DOC]** SRS FR 1.2.
- Thành công: `{ "data": ..., "message"?: string }`. **[GIẢ ĐỊNH]** — `axiosClient` trả thẳng body này.
- Lỗi: HTTP status + `{ "message": string, "code"?: "MSG-XXX-NN", "errors"?: { "<field>": "<msg>" } }`. **[GIẢ ĐỊNH]**
  Nếu có `code` khớp mã trong `constants/messages.js` thì FE hiển thị bản tiếng Việt của mã đó.
- 401 khi đang có token → FE đăng xuất và chuyển về `/login`.

## Xác thực & hồ sơ (FR 1.1–1.8)
| Method + path | Trạng thái | Body / Response |
|---|---|---|
| `POST /auth/register` | **[DOC]** SDS 1.2 | `{fullName,email,password,confirmPassword}` → 201; sai dữ liệu → 400 |
| `POST /auth/verify-email` | [GIẢ ĐỊNH] | `{token}` |
| `POST /auth/login` | [GIẢ ĐỊNH] path | `{email,password}` → `{data:{accessToken,user}}`; tài khoản `pending_verification`/`locked` → lỗi `MSG-AUTH-05` |
| `POST /auth/forgot-password` | [GIẢ ĐỊNH] | `{email}` |
| `POST /auth/reset-password` | [GIẢ ĐỊNH] | `{token,newPassword,confirmPassword}`; token hết hạn/đã dùng → `MSG-AUTH-07` |
| `PUT /auth/change-password` | [GIẢ ĐỊNH] | `{currentPassword,newPassword}`; sai mật khẩu cũ → `MSG-PROFILE-01` |
| `GET /users/me` | [GIẢ ĐỊNH] | `{data:{_id,fullName,email,phone,avatarUrl,role,status,ownerProfile}}` (theo SDS 3.2) |
| `PUT /users/me` | [GIẢ ĐỊNH] | `{fullName,phone,avatarUrl}` — không sửa email/role (FR 1.5) |
| `GET /notifications` | [GIẢ ĐỊNH] | `{data:[{_id,type,title,content,isRead,relatedEntity:{type,id},createdAt}]}` (SDS 3.17) |
| `PATCH /notifications/:id/read` | [GIẢ ĐỊNH] | — |
| `PATCH /notifications/read-all` | [GIẢ ĐỊNH] | FR 1.8 nói "mark as read", chưa rõ có "đọc tất cả" — cần xác nhận |

## Điểm cần backend xác nhận sớm
1. Quy tắc mật khẩu (SRS chỉ ghi "minimum length/complexity"). FE tạm dùng ≥ 8 ký tự, có chữ và số.
2. Luồng giữ chỗ (SDS 4.2): chọn slot → API tạo `slotReservation(held)` **riêng** → xác nhận booking + phương thức thanh toán
   → booking `pending_confirmation` → cổng thanh toán → thành công thì `slot=booked`, `booking=confirmed`. FE cần API trả `holdExpiresAt`.
3. Booking thanh toán tại sân (`pay_at_venue`): ai chuyển `pending_confirmation → confirmed` (Owner theo FR 3.7?).
4. Định dạng phân trang cho tìm kiếm sân (FR 5.1).
5. Token: hiện lưu `localStorage`. Nếu backend dùng cookie httpOnly thì đổi `tokenStorage` + bỏ header Authorization.
