import styles from './StatusBadge.module.css'

const STATUS_MAP = {
  confirmed:   { label: 'Đã xác nhận', cls: 'confirmed'  },
  awaiting_payment: { label: 'Chờ thanh toán', cls: 'pending' },
  pending:     { label: 'Chờ xác nhận', cls: 'pending'    },
  completed:   { label: 'Hoàn tất',    cls: 'completed'  },
  cancelled:   { label: 'Đã hủy',      cls: 'cancelled'  },
  no_show:     { label: 'Không đến',   cls: 'noshow'     },
  active:      { label: 'Hoạt động',   cls: 'active'     },
  inactive:    { label: 'Tạm dừng',    cls: 'inactive'   },
  maintenance: { label: 'Bảo trì',     cls: 'maintenance'},
  approved:    { label: 'Đã duyệt',    cls: 'approved'   },
  rejected:    { label: 'Bị từ chối',  cls: 'rejected'   },
  verified:    { label: 'Đã xác minh', cls: 'verified'   },
  banned:      { label: 'Bị khóa',     cls: 'banned'     },
  none:        { label: 'Chưa gửi',     cls: 'inactive'   },
  expired:     { label: 'Đã hết hạn',   cls: 'cancelled'  },
  // Mạng lưới chuyển sân ('none' dùng chung nhãn "Chưa gửi" ở trên; trang mạng lưới tự đổi nhãn bằng prop `labels`)
  revoked:     { label: 'Đã gỡ',         cls: 'cancelled' },
  // Bài tìm người chơi đã qua giờ
  ended:       { label: 'Đã kết thúc',  cls: 'inactive'   },
  // Khiếu nại
  open:          { label: 'Chờ xử lý',     cls: 'pending'   },
  investigating: { label: 'Đang xử lý',    cls: 'completed' },
  resolved:      { label: 'Đã giải quyết', cls: 'confirmed' },
}

// `labels`: đổi nhãn riêng cho một nơi dùng (vd. { none: 'Chưa tham gia' }) mà không ảnh hưởng nơi khác.
export default function StatusBadge({ status, dot = true, labels }) {
  const cfg = STATUS_MAP[status] || { label: status, cls: 'inactive' }
  const label = (labels && labels[status]) || cfg.label
  return <span className={`${styles.badge} ${styles[cfg.cls]}`}>{dot && <span className={styles.dot} />}{label}</span>
}
