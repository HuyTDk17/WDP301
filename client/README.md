# Sport Field Booking & Management System — Frontend

React 18 + Vite + React Router + Redux Toolkit + Axios + MUI. Giao diện chỉ tiếng Việt.

```bash
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

- Sidebar và route của Customer/Owner/Admin sinh từ `src/constants/roleMenus.jsx`. Trang chưa làm dùng `ComingSoon`;
  khi hiện thực trang thật, thêm `element` vào mục menu tương ứng.
- Trạng thái (booking, payment, field, ...) định nghĩa một chỗ ở `src/constants/status.js`, hiển thị qua `<StatusChip type status />`.
- Thông báo hệ thống tiếng Việt: `src/constants/messages.js` (mã MSG-* của SRS).
- Giả định API: xem `API_CONTRACT.md`.
