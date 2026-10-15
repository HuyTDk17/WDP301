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
}

export default function StatusBadge({ status, dot = true }) {
  const cfg = STATUS_MAP[status] || { label: status, cls: 'inactive' }
  return <span className={`${styles.badge} ${styles[cfg.cls]}`}>{dot && <span className={styles.dot} />}{cfg.label}</span>
}
