import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import Spinner from '@/components/ui/Spinner/Spinner'
import { contentService } from '@/services/contentService'
import { formatDate } from '@/utils'
import { BUILTIN_POLICIES } from './builtinPolicies'
import styles from './LegalPage.module.css'

// Chuyển bản ghi do Admin soạn về cùng hình dạng với nội dung mặc định để dùng chung phần hiển thị.
const fromApi = (policy) => ({
  eyebrow: 'Chính sách',
  title: policy.title,
  updatedAt: `Cập nhật lần cuối: ${formatDate(policy.updatedAt)}`,
  intro: policy.intro,
  sections: policy.sections || [],
})

/**
 * Trang chính sách. Ưu tiên bản do Admin soạn (GET /policies/:key); chưa có (hoặc lỗi mạng) thì dùng nội dung
 * mặc định cho 'privacy' / 'terms'. `type` dành cho hai đường dẫn cũ (/privacy-policy, /terms-of-service),
 * còn /policies/:key lấy mã từ URL.
 */
export default function LegalPage({ type }) {
  const params = useParams()
  const key = type || params.key
  const [state, setState] = useState({ loading: true, content: null })

  useEffect(() => {
    let alive = true
    setState({ loading: true, content: null })
    contentService.getPolicy(key)
      .then((res) => { if (alive) setState({ loading: false, content: fromApi(res.policy) }) })
      .catch(() => { if (alive) setState({ loading: false, content: BUILTIN_POLICIES[key] || null }) })
    return () => { alive = false }
  }, [key])

  if (state.loading) return <div className={styles.page}><div className="container" style={{ padding: '96px 0', textAlign: 'center' }}><Spinner size="lg" /></div></div>

  const content = state.content
  if (!content) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className="container">
            <Link to="/" className={styles.backLink}>Về trang chủ</Link>
            <h1 className={styles.title}>Không tìm thấy trang này</h1>
            <p className={styles.intro}>Trang chính sách bạn tìm không tồn tại hoặc chưa được đăng.</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <Link to="/" className={styles.backLink}>Về trang chủ</Link>
          <p className={styles.eyebrow}>{content.eyebrow}</p>
          <h1 className={styles.title}>{content.title}</h1>
          <p className={styles.updatedAt}>{content.updatedAt}</p>
          <p className={styles.intro}>{content.intro}</p>
        </div>
      </section>

      <section className={styles.contentSection}>
        <div className={`container ${styles.contentWrap}`}>
          <div className={styles.content}>
            {content.sections.map((section) => (
              <article key={section.title} className={styles.section}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </article>
            ))}
          </div>

          <aside className={styles.notice} aria-label="Thông tin lưu ý">
            <h2>Cần hỗ trợ?</h2>
            <p>
              Nếu bạn có câu hỏi về nội dung này, hãy liên hệ bộ phận hỗ trợ
              của ESport360 để được hướng dẫn thêm.
            </p>
            <Link to="/venues" className={styles.ctaLink}>Tiếp tục tìm sân</Link>
          </aside>
        </div>
      </section>
    </div>
  )
}
