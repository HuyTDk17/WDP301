// Avatar dựng sẵn — file SVG nằm ở public/avatars/<id>.svg.
// DANH SÁCH NÀY PHẢI KHỚP với backend/utils/avatars.js (backend/tests/avatars.test.js kiểm tra).
export const AVATAR_PRESETS = [
  { id: 'avatar-01', label: 'Bạn nam áo xanh' },
  { id: 'avatar-02', label: 'Bạn nữ tóc dài' },
  { id: 'avatar-03', label: 'Bạn nữ búi tóc' },
  { id: 'avatar-04', label: 'Bạn nam đội mũ' },
  { id: 'avatar-05', label: 'Bạn tóc xoăn' },
  { id: 'avatar-06', label: 'Bạn băng đô' },
  { id: 'avatar-07', label: 'Bóng đá' },
  { id: 'avatar-08', label: 'Bóng rổ' },
  { id: 'avatar-09', label: 'Tennis' },
  { id: 'avatar-10', label: 'Cầu lông' },
  { id: 'avatar-11', label: 'Bóng chuyền' },
  { id: 'avatar-12', label: 'Cúp vô địch' },
]

export const PRESET_PREFIX = 'preset:'
export const MAX_AVATAR_MB = 2
