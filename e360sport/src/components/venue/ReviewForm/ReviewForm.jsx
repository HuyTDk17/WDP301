import { useState } from 'react'
import Rating from '@/components/ui/Rating/Rating'
import Button from '@/components/ui/Button/Button'
import styles from './ReviewForm.module.css'

const MAX_LEN = 1000

// Form dùng chung cho VIẾT mới và SỬA đánh giá. `initial` có giá trị = đang sửa.
export default function ReviewForm({ initial, onSubmit, onCancel, submitting = false }) {
  const [rating, setRating] = useState(initial?.rating || 0)
  const [comment, setComment] = useState(initial?.comment || '')
  const isEdit = !!initial

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!rating || submitting) return
    onSubmit({ rating, comment: comment.trim() })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.title}>{isEdit ? 'Chỉnh sửa đánh giá của bạn' : 'Chia sẻ trải nghiệm của bạn'}</p>
      <div className={styles.starRow}>
        <Rating value={rating} size="lg" interactive onChange={setRating} />
        <span className={styles.starHint}>{rating ? `${rating}/5 sao` : 'Chọn số sao'}</span>
      </div>
      <textarea
        className={styles.textarea}
        rows={4}
        maxLength={MAX_LEN}
        placeholder="Sân, mặt sân, ánh sáng, thái độ phục vụ... có gì đáng nhớ? (không bắt buộc)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className={styles.footer}>
        <span className={styles.counter}>{comment.length}/{MAX_LEN}</span>
        <div className={styles.actions}>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>Hủy</Button>
          <Button type="submit" size="sm" loading={submitting} disabled={!rating}>{isEdit ? 'Lưu thay đổi' : 'Gửi đánh giá'}</Button>
        </div>
      </div>
    </form>
  )
}
