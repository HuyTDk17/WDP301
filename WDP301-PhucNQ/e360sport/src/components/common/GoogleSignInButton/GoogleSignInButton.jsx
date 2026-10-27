import { useEffect, useRef, useState } from 'react'
import styles from './GoogleSignInButton.module.css'

/**
 * Nút "Tiếp tục với Google" — dùng Google Identity Services (GIS), nút chính thức
 * do Google vẽ (đúng nhận diện thương hiệu, tự đổi ngôn ngữ).
 *
 * Luồng: người dùng bấm → chọn tài khoản Google → GIS gọi callback với `credential`
 * (ID token) → ta chuyển credential cho `onCredential` → backend xác minh chữ ký
 * (POST /api/auth/google, xem backend/utils/googleAuth.js).
 *
 * Cấu hình: VITE_GOOGLE_CLIENT_ID (cùng giá trị với GOOGLE_CLIENT_ID ở backend).
 * Chưa cấu hình, hoặc script Google bị chặn (adblock, mạng chặn) → component
 * KHÔNG hiển thị gì và không làm hỏng trang đăng nhập bằng email/mật khẩu.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GIS_SRC = 'https://accounts.google.com/gsi/client'

// Nạp script đúng MỘT lần cho cả ứng dụng (Login và Register cùng dùng nút này,
// chuyển qua lại giữa hai trang không được nạp lại).
let scriptPromise = null
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GIS_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('Không tải được script Google')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export const isGoogleSignInConfigured = Boolean(CLIENT_ID)

export default function GoogleSignInButton({ onCredential, disabled = false }) {
  const holder = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Giữ callback mới nhất trong ref: initialize() của Google chỉ nhận callback
  // MỘT lần, nếu không dùng ref thì callback cũ (state cũ) sẽ bị gọi.
  const cb = useRef(onCredential)
  cb.current = onCredential

  useEffect(() => {
    if (!CLIENT_ID) return undefined
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => { if (resp?.credential) cb.current?.(resp.credential) },
          // Không tự bật One Tap: chỉ đăng nhập khi người dùng chủ động bấm nút.
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        // GIS chỉ nhận chiều rộng bằng pixel (tối đa 400).
        const width = Math.min(400, Math.max(200, Math.round(holder.current.getBoundingClientRect().width) || 320))
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard', theme: 'outline', size: 'large',
          text: 'continue_with', shape: 'pill', locale: 'vi', width,
        })
        setReady(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  if (!CLIENT_ID || failed) return null

  // Vạch "hoặc" nằm CÙNG component với nút để cả hai cùng ẩn khi Google không dùng
  // được — nếu tách riêng sẽ còn lại một vạch "hoặc" lơ lửng chẳng dẫn tới đâu.
  return (
    <div className={styles.section}>
      <div className={styles.divider} role="separator"><span>hoặc</span></div>
      <div className={`${styles.wrap} ${disabled ? styles.disabled : ''}`} aria-busy={!ready}>
        {/* Không cần aria-label: iframe của Google có nhãn truy cập riêng. */}
        <div ref={holder} className={styles.holder} />
        {!ready && <div className={styles.placeholder}>Đang tải đăng nhập Google…</div>}
      </div>
    </div>
  )
}
