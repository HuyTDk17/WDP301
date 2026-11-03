import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Newspaper } from 'lucide-react'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { contentService } from '@/services/contentService'
import { formatDate, getImageUrl } from '@/utils'
import styles from './News.module.css'

export default function NewsDetail() {
  const { slug } = useParams()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setLoading(true)
    setMissing(false)
    contentService.getNewsBySlug(slug)
      .then((res) => setArticle(res.article))
      .catch(() => setMissing(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <div className={styles.page}><div className={styles.center}><Spinner size="lg" /></div></div>

  if (missing || !article) {
    return (
      <div className={styles.page}>
        <div className="container">
          <Link to="/news" className={styles.back}><ArrowLeft size={15} /> Tất cả tin tức</Link>
          <EmptyState icon={<Newspaper size={48} />} title="Không tìm thấy bài viết" description="Bài viết có thể đã bị gỡ hoặc đường dẫn không đúng." />
        </div>
      </div>
    )
  }

  // Nội dung là văn bản thuần: tách đoạn theo dòng trống, hiển thị bằng text (không dùng HTML thô) nên không có XSS.
  const paragraphs = article.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  return (
    <div className={styles.page}>
      <div className="container">
        <article className={styles.article}>
          <Link to="/news" className={styles.back}><ArrowLeft size={15} /> Tất cả tin tức</Link>
          <time className={styles.date}>{formatDate(article.publishedAt)}</time>
          <h1 className={styles.articleTitle}>{article.title}</h1>
          {article.summary && <p className={styles.lead}>{article.summary}</p>}
          {article.coverImage && <img className={styles.articleCover} src={getImageUrl(article.coverImage)} alt="" />}
          <div className={styles.body}>
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </article>
      </div>
    </div>
  )
}
