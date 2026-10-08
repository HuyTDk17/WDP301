import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CheckCircle2 } from 'lucide-react'
import PageHeader from '@/components/dashboard/PageHeader/PageHeader'
import DataTable from '@/components/dashboard/DataTable/DataTable'
import StatusBadge from '@/components/dashboard/StatusBadge/StatusBadge'
import Spinner from '@/components/ui/Spinner/Spinner'
import Button from '@/components/ui/Button/Button'
import Modal from '@/components/ui/Modal/Modal'
import { userService, openOwnerDocument } from '@/services/notificationService'
import { useToast } from '@/contexts/ToastContext'
import styles from './OwnerManagement.module.css'

export default function OwnerManagement() {
  const { toast } = useToast()
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  // TRƯỚC ĐÂY: có thể duyệt hồ sơ ngay từ nút trên dòng bảng, không bắt buộc
  // mở xem chi tiết/giấy tờ trước — một cú click là xong. Giờ nút "Duyệt hồ sơ"
  // chỉ nằm trong modal chi tiết VÀ chỉ bật lên sau khi admin tự tick xác nhận
  // đã xem giấy tờ, để tránh duyệt nhầm/duyệt ẩu.
  const [hasReviewedDocs, setHasReviewedDocs] = useState(false)

  const loadOwners = useCallback(() => {
    setLoading(true)
    userService.getOwners()
      .then((res) => setOwners(res.owners || []))
      .catch(() => toast.error('Không thể tải danh sách chủ sân'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadOwners() }, [loadOwners])

  const openDetail = (row) => {
    setSelected(row)
    setRejectReason(row.ownerApplicationRejectionReason || '')
    setHasReviewedDocs(false)
  }

  const approve = async (id) => {
    try { await userService.updateUserStatus(id, 'verified'); toast.success('Đã duyệt chủ sân'); setSelected(null); loadOwners() }
    catch (err) { toast.error(err?.message || 'Không thể duyệt') }
  }
  const reject = async (id) => {
    try { await userService.updateUserStatus(id, 'rejected', rejectReason); toast.success('Đã từ chối chủ sân'); setSelected(null); setRejectReason(''); loadOwners() }
    catch (err) { toast.error(err?.message || 'Không thể từ chối') }
  }
  const viewDocument = (doc) => openOwnerDocument(doc.url).catch((err) => toast.error(err?.message || 'Không thể mở tài liệu'))
  // Hồ sơ nộp TRƯỚC bản vá bắt buộc đính kèm giấy tờ (xem authController.submitOwnerApplication)
  // có thể vẫn còn 0 giấy tờ — không cho duyệt các hồ sơ này, chỉ có thể từ chối.
  const hasDocs = (selected?.ownerApplicationDocuments?.length || 0) > 0

  const columns = [
    { header: 'Chủ sân', accessor: 'name', render: (val, row) => <div className={styles.ownerCell}><div className={styles.avatar}>{val?.[0] || '?'}</div><div><p className={styles.name}>{val}</p><p className={styles.business}>{row.businessName || 'Chưa có tên doanh nghiệp'}</p></div></div> },
    { header: 'Email', accessor: 'email' },
    { header: 'Hồ sơ', accessor: 'ownerApplicationStatus', render: v => <StatusBadge status={v || 'none'} /> },
    { header: 'Trạng thái TK', accessor: 'status', render: v => <StatusBadge status={v} /> },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Quản lý chủ sân" subtitle={`${owners.length} chủ sân đã đăng ký`} />
      {loading ? <div className={styles.loadingState}><Spinner size="lg" /></div> : (
        <DataTable columns={columns} data={owners} searchPlaceholder="Tìm theo tên..." emptyText="Chưa có hồ sơ chủ sân nào" actions={(row) => (
          <div className={styles.actions}>
            {row.role === 'owner' && <Link to={`/admin/owners/${row._id}`}><Button size="xs" variant="ghost" title="Xem hồ sơ hoạt động" icon={<BarChart3 size={13} />}>Hồ sơ</Button></Link>}
            <Button size="xs" variant="outline" onClick={() => openDetail(row)}>Chi tiết</Button>
          </div>
        )} />
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Chi tiết hồ sơ chủ sân" size="lg" footer={selected && (
        <div className={styles.modalActions}>
          {selected.ownerApplicationStatus === 'pending' && (
            <>
              <Button variant="success" disabled={!hasDocs || !hasReviewedDocs}
                title={!hasDocs ? 'Hồ sơ chưa có giấy tờ đính kèm, không thể duyệt' : (hasReviewedDocs ? '' : 'Cần xác nhận đã xem giấy tờ ở trên trước khi duyệt')}
                onClick={() => approve(selected._id)}>Duyệt hồ sơ</Button>
              <Button variant="danger" onClick={() => reject(selected._id)}>Từ chối</Button>
            </>
          )}
          <Button variant="outline" onClick={() => setSelected(null)}>Đóng</Button>
        </div>
      )}>
        {selected && (
          <div className={styles.detail}>
            <div className={styles.detailGrid}>
              <div><span>Người đăng ký</span><strong>{selected.name}</strong></div>
              <div><span>Email</span><strong>{selected.email}</strong></div>
              <div><span>Điện thoại</span><strong>{selected.phone || 'Chưa có'}</strong></div>
              <div><span>Doanh nghiệp</span><strong>{selected.businessName || 'Chưa có'}</strong></div>
              <div><span>Mã số thuế</span><strong>{selected.taxId || 'Chưa có'}</strong></div>
              <div><span>Số giấy phép</span><strong>{selected.licenseNumber || 'Chưa có'}</strong></div>
              <div><span>Người đại diện</span><strong>{selected.legalRepresentative || 'Chưa có'}</strong></div>
              <div><span>Địa chỉ kinh doanh</span><strong>{selected.businessAddress || 'Chưa có'}</strong></div>
            </div>
            {selected.ownerApplicationNote && <div className={styles.note}><span>Ghi chú</span><p>{selected.ownerApplicationNote}</p></div>}
            <div className={styles.docs}>
              <span>Giấy tờ pháp lý</span>
              {hasDocs ? selected.ownerApplicationDocuments.map((doc) => (
                <button key={doc.url} type="button" className={styles.docLink} onClick={() => viewDocument(doc)}>{doc.name || doc.url}</button>
              )) : <p>Chưa có giấy tờ</p>}
            </div>
            {selected.ownerApplicationStatus === 'pending' ? (
              <>
                {!hasDocs && (
                  <p className={styles.docsMissingWarning}>Hồ sơ này chưa có giấy tờ đính kèm (nộp trước khi hệ thống bắt buộc đính kèm) — không thể duyệt cho đến khi chủ sân bổ sung. Hãy từ chối và nêu rõ lý do bên dưới.</p>
                )}
                {hasDocs && (
                  <label className={styles.confirmBox}>
                    <input type="checkbox" checked={hasReviewedDocs} onChange={(e) => setHasReviewedDocs(e.target.checked)} />
                    <span>Tôi đã xem giấy tờ và đối chiếu thông tin ở trên trước khi duyệt hồ sơ này</span>
                  </label>
                )}
                <label className={styles.rejectBox}>
                  <span>Lý do từ chối nếu không duyệt</span>
                  <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Nhập lý do để người đăng ký biết cần bổ sung gì..." />
                </label>
              </>
            ) : selected.ownerApplicationReviewedAt && (
              <div className={styles.note}>
                <span>{selected.ownerApplicationStatus === 'approved' ? 'Đã duyệt' : 'Đã xử lý'} lúc</span>
                <p className={styles.reviewedMeta}>
                  <CheckCircle2 size={14} />
                  {new Date(selected.ownerApplicationReviewedAt).toLocaleString('vi-VN')}
                  {selected.ownerApplicationReviewedBy?.name && ` — bởi ${selected.ownerApplicationReviewedBy.name}`}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
