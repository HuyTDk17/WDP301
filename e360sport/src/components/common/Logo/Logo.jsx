import logoFull from '@/assets/logo-esport360.png'
import logoMark from '@/assets/logo-esport360-mark.png'

// Logo thương hiệu ESport360 — dùng chung cho Navbar, Footer, trang đăng nhập
// và sidebar Owner/Admin. Kích thước do CSS của nơi dùng quyết định (className).
//   variant="full" : chữ E + "SPORT360" (mặc định)
//   variant="mark" : chỉ biểu tượng chữ E (dùng khi sidebar thu gọn)
// Ảnh nền trong suốt, chữ "SPORT" màu trắng → chỉ đặt trực tiếp lên nền TỐI.
// Trên nền sáng (Navbar) phải bọc trong một khối nền đen.
const SOURCES = {
  full: { src: logoFull, width: 720, height: 157 },
  mark: { src: logoMark, width: 480, height: 240 },
}

export default function Logo({ variant = 'full', className = '', ...rest }) {
  const { src, width, height } = SOURCES[variant] || SOURCES.full
  return <img src={src} width={width} height={height} alt="ESport360" className={className} draggable={false} {...rest} />
}
