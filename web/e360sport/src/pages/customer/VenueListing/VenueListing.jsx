import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, ChevronDown, SlidersHorizontal, X, ChevronLeft, ChevronRight, AlertTriangle, LandPlot } from 'lucide-react'
import VenueCard from '@/components/venue/VenueCard/VenueCard'
import VenueFilters from '@/components/venue/VenueFilters/VenueFilters'
import SearchBar from '@/components/common/SearchBar/SearchBar'
import EmptyState from '@/components/ui/EmptyState/EmptyState'
import Badge from '@/components/ui/Badge/Badge'
import Skeleton from '@/components/ui/Skeleton/Skeleton'
import { venueService } from '@/services/venueService'
import { useDebounce } from '@/hooks'
import styles from './VenueListing.module.css'

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Phù hợp nhất' },
  { value: 'rating', label: 'Đánh giá cao nhất' },
  { value: 'price_asc', label: 'Giá: Thấp đến cao' },
  { value: 'price_desc', label: 'Giá: Cao đến thấp' },
]

const PAGE_SIZE = 12

// Sinh dãy số trang kiểu "1 … 4 5 6 … 12" thay vì luôn cắt 5 trang đầu
function getPaginationRange(current, total) {
  const delta = 1
  const range = []
  const withDots = []
  let last

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i)
  }
  range.forEach((i) => {
    if (last) {
      if (i - last === 2) withDots.push(last + 1)
      else if (i - last > 2) withDots.push('...')
    }
    withDots.push(i)
    last = i
  })
  return withDots
}

export default function VenueListing() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [venues, setVenues] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('relevance')
  const [layout, setLayout] = useState('grid')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [filters, setFilters] = useState({
    sports: searchParams.get('sport') ? [searchParams.get('sport')] : [],
    priceRange: '',
    minRating: null,
    amenities: [],
    availableToday: false,
  })

  const query = searchParams.get('q') || ''
  const debouncedQuery = useDebounce(query, 400)

  const fetchVenues = useCallback(() => {
    setLoading(true)
    setError(null)

    const params = { page, limit: PAGE_SIZE, sort }
    if (debouncedQuery) params.search = debouncedQuery
    if (filters.sports.length) params.sport = filters.sports[0]
    if (filters.minRating) params.minRating = filters.minRating
    if (filters.priceRange) {
      const [min, max] = filters.priceRange.split('-')
      params.minPrice = min
      params.maxPrice = max
    }

    venueService.getVenues(params)
      .then((res) => {
        setVenues(res.venues || [])
        setTotal(res.total || 0)
      })
      .catch((err) => setError(err?.message || 'Không thể tải danh sách sân thể thao'))
      .finally(() => setLoading(false))
  }, [page, sort, debouncedQuery, filters])

  useEffect(() => { fetchVenues() }, [fetchVenues])

  // Khóa cuộn trang khi mở drawer bộ lọc trên mobile
  useEffect(() => {
    document.body.style.overflow = filtersOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [filtersOpen])

  // Reset về trang 1 mỗi khi filter/search/sort thay đổi
  useEffect(() => { setPage(1) }, [debouncedQuery, filters, sort])

  const handleFiltersReset = () => setFilters({ sports: [], priceRange: '', minRating: null, amenities: [], availableToday: false })
  const activeFilterCount = [filters.sports?.length > 0, !!filters.priceRange, !!filters.minRating, filters.amenities?.length > 0, filters.availableToday].filter(Boolean).length

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className={styles.page}>
      <div className={styles.searchSection}><div className="container"><SearchBar /></div></div>
      <div className="container">
        <div className={styles.layout}>
          <div className={styles.sidebar}>
            <VenueFilters filters={filters} onChange={setFilters} onReset={handleFiltersReset} />
          </div>

          {/* Drawer bộ lọc cho mobile */}
          {filtersOpen && (
            <div className={styles.drawerOverlay} onClick={() => setFiltersOpen(false)}>
              <div className={styles.drawer} onClick={e => e.stopPropagation()}>
                <div className={styles.drawerHeader}>
                  <h3>Bộ lọc</h3>
                  <button className={styles.drawerClose} onClick={() => setFiltersOpen(false)} aria-label="Đóng"><X size={20} /></button>
                </div>
                <div className={styles.drawerBody}>
                  <VenueFilters filters={filters} onChange={setFilters} onReset={handleFiltersReset} />
                </div>
                <div className={styles.drawerFooter}>
                  <button className={styles.drawerApply} onClick={() => setFiltersOpen(false)}>
                    Xem {loading ? '...' : total} sân
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className={styles.results}>
            <div className={styles.resultsHeader}>
              <div className={styles.resultsInfo}>
                <h1 className={styles.resultsTitle}>{query ? `Kết quả cho "${query}"` : 'Tất cả sân thể thao'}</h1>
                <p className={styles.resultsCount}>{loading ? 'Đang tìm kiếm...' : `Tìm thấy ${total} sân`}</p>
              </div>
              <div className={styles.controls}>
                <button className={styles.mobileFilterBtn} onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal size={16} strokeWidth={2.25} />
                  <span>Bộ lọc</span>
                  {activeFilterCount > 0 && <span className={styles.filterCountDot}>{activeFilterCount}</span>}
                </button>
                {activeFilterCount > 0 && <Badge variant="primary" className={styles.filterBadgeDesktop}>{activeFilterCount} bộ lọc</Badge>}
                <div className={styles.selectWrap}>
                  <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value)}>
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={15} strokeWidth={2.25} className={styles.selectChevron} />
                </div>
                <div className={styles.layoutToggle}>
                  <button className={`${styles.layoutBtn} ${layout === 'grid' ? styles.layoutBtnActive : ''}`} onClick={() => setLayout('grid')} title="Xem dạng lưới" aria-label="Xem dạng lưới"><LayoutGrid size={16} strokeWidth={2.25} /></button>
                  <button className={`${styles.layoutBtn} ${layout === 'list' ? styles.layoutBtnActive : ''}`} onClick={() => setLayout('list')} title="Xem dạng danh sách" aria-label="Xem dạng danh sách"><List size={16} strokeWidth={2.25} /></button>
                </div>
              </div>
            </div>

            {error ? (
              <EmptyState icon={<AlertTriangle size={40} strokeWidth={1.75} />} title="Có lỗi xảy ra" description={error} action={fetchVenues} actionLabel="Thử lại" />
            ) : loading ? (
              <div className={layout === 'grid' ? styles.grid : styles.list}>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className={styles.skeletonCard}>
                    <Skeleton height={layout === 'grid' ? '200px' : '180px'} />
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Skeleton height="18px" width="65%" />
                      <Skeleton height="13px" width="45%" />
                    </div>
                  </div>
                ))}
              </div>
            ) : venues.length === 0 ? (
              <EmptyState
                icon={<LandPlot size={48} />}
                title="Không tìm thấy sân nào"
                description="Hãy thử điều chỉnh tìm kiếm hoặc bộ lọc để xem thêm kết quả."
                action={handleFiltersReset}
                actionLabel="Đặt lại bộ lọc"
              />
            ) : (
              <div className={layout === 'grid' ? styles.grid : styles.list}>
                {venues.map(venue => <VenueCard key={venue._id} venue={venue} layout={layout} />)}
              </div>
            )}

            {!loading && !error && venues.length > 0 && totalPages > 1 && (
              <div className={styles.pagination}>
                <button className={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label="Trang trước"><ChevronLeft size={16} strokeWidth={2.25} /></button>
                {getPaginationRange(page, totalPages).map((p, i) => p === '...' ? (
                  <span key={`dots-${i}`} className={styles.pageDots}>…</span>
                ) : (
                  <button key={p} className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)} aria-label="Trang sau"><ChevronRight size={16} strokeWidth={2.25} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
