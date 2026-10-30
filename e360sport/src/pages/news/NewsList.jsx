import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Newspaper, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button/Button'
import Spinner from '@/components/ui/Spinner/Spinner'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import { contentService } from '@/services/contentService'
import { formatDate, getImageUrl } from '@/utils'
import styles from './News.module.css'

const PAGE_SIZE = 9

export default function NewsList() {
  const [data, setData] = useState({ news: [], totalPages: 1 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    contentService.getNews({ page, limit: PAGE_SIZE })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.head}>
          <p className={styles.eyebrow}>Tin tức</p>
          <h1 className={styles.title}>Tin tức &amp; thông báo ESport360</h1>
          <p className={styles.sub}>Cập nhật tính năng mới, ưu đãi và những câu chuyện từ cộng đồng thể thao.</p>
        </header>

        {loading ? (
          <div className={styles.center}><Spinner size="lg" /></div>
        ) : error ? (
          <EmptyState icon={<Newspaper size={48} />} title="Không tải được tin tức" description="Vui lòng thử lại sau ít phút." />
        ) : data.news.length === 0 ? (
          <EmptyState icon={<Newspaper size={48} />} title="Chưa có bài viết nào" description="Chúng tôi sẽ sớm đăng tin mới. Hãy quay lại sau nhé!" />
        ) : (
          <>
            <div className={styles.grid}>
              {data.news.map((n) => (
                <Link key={n._id} to={`/news/${n.slug}`} className={styles.card}>
                  <div className={styles.cover}>
                    {n.coverImage ? <img src={getImageUrl(n.coverImage)} alt="" loading="lazy" /> : <Newspaper size={36} />}
                  </div>
                  <div className={styles.cardBody}>
                    <time className={styles.date}>{formatDate(n.publishedAt)}</time>
                    <h2 className={styles.cardTitle}>{n.title}</h2>
                    {n.summary && <p className={styles.summary}>{n.summary}</p>}
                    <span className={styles.more}>Đọc tiếp <ArrowRight size={14} /></span>
                  </div>
                </Link>
              ))}
            </div>
            {data.totalPages > 1 && (
              <div className={styles.pager}>
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trang trước</Button>
                <span>Trang {page}/{data.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
