import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { contentService } from '@/services/contentService'
import { getImageUrl } from '@/utils'
import styles from './BannerCarousel.module.css'

const AUTOPLAY_MS = 6000

/** Banner trang chủ do Admin quản lý. Không có banner nào đang hiển thị thì không vẽ gì (không để lại khoảng trống). */
export default function BannerCarousel() {
  const [banners, setBanners] = useState([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    contentService.getBanners().then((res) => setBanners(res.banners || [])).catch(() => {})
  }, [])

  // Tự chuyển slide; tôn trọng người dùng bật "giảm chuyển động" và dừng khi đang rê chuột/focus.
  useEffect(() => {
    clearInterval(timer.current)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (banners.length < 2 || paused || reduce) return undefined
    timer.current = setInterval(() => setIndex((i) => (i + 1) % banners.length), AUTOPLAY_MS)
    return () => clearInterval(timer.current)
  }, [banners.length, paused])

  if (banners.length === 0) return null

  const go = (delta) => setIndex((i) => (i + delta + banners.length) % banners.length)
  const isInternal = (url) => url.startsWith('/')

  return (
    <section className={styles.wrap} aria-label="Banner nổi bật">
      <div className="container">
        <div
          className={styles.carousel}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
            {banners.map((b, i) => {
              const inner = (
                <>
                  <img src={getImageUrl(b.imageUrl)} alt="" className={styles.img} loading={i === 0 ? 'eager' : 'lazy'} />
                  <div className={styles.caption}>
                    <h3>{b.title}</h3>
                    {b.subtitle && <p>{b.subtitle}</p>}
                  </div>
                </>
              )
              const hidden = i !== index
              if (!b.linkUrl) return <div key={b._id || i} className={styles.slide} aria-hidden={hidden}>{inner}</div>
              return isInternal(b.linkUrl)
                ? <Link key={b._id || i} to={b.linkUrl} className={styles.slide} aria-hidden={hidden} tabIndex={hidden ? -1 : 0}>{inner}</Link>
                : <a key={b._id || i} href={b.linkUrl} target="_blank" rel="noopener noreferrer" className={styles.slide} aria-hidden={hidden} tabIndex={hidden ? -1 : 0}>{inner}</a>
            })}
          </div>

          {banners.length > 1 && (
            <>
              <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => go(-1)} aria-label="Banner trước"><ChevronLeft size={20} /></button>
              <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => go(1)} aria-label="Banner sau"><ChevronRight size={20} /></button>
              <div className={styles.dots}>
                {banners.map((b, i) => (
                  <button key={b._id || i} type="button" className={`${styles.dot} ${i === index ? styles.dotActive : ''}`} onClick={() => setIndex(i)} aria-label={`Banner ${i + 1}`} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
