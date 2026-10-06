import api from './api'

// ============================================================
// bookingService + paymentService — gọi API thật.
//
// NGHIỆP VỤ ĐẶT SÂN:
//   1. Khách chọn sân + khung giờ → holdSlot() giữ chỗ tạm 10 phút, chống hai
//      khách đặt trùng giờ trong lúc một người đang điền thông tin.
//   2. Khách xác nhận thông tin → createBooking() tạo đơn ở trạng thái
//      'awaiting_payment'. Phản hồi kèm creditBalance để trang thanh toán biết
//      số dư khuyến mãi khả dụng mà không phải gọi thêm API.
//   3. Khách thanh toán → paymentService.checkout().
//      • Nếu số dư khuyến mãi đủ trả toàn bộ, backend trả { paid: true } và
//        đơn được xác nhận ngay, KHÔNG cần chuyển khoản.
//      • Ngược lại trả { bankTransfer: {...}, paymentId, payable } — hiển thị
//        số tài khoản + mã QR để khách tự chuyển khoản bằng app ngân hàng.
//   4. Khách chuyển khoản xong → paymentService.markTransferred(paymentId).
//      Tài khoản hiển thị là của CHỦ SÂN — khách chuyển thẳng cho chủ sân.
//   5. CHỦ SÂN đối chiếu sao kê và xác nhận (trang /owner/payments/pending) —
//      đó mới là lúc đơn thật sự chuyển 'confirmed'. Quản trị viên không dính vào.
// ============================================================

export const bookingService = {
  /** Giữ chỗ tạm thời trước khi khách điền thông tin/thanh toán. */
  holdSlot: (data) => api.post('/bookings/hold', data),

  /** Tạo đơn thật từ một lượt giữ chỗ hợp lệ. Đơn ở trạng thái chờ thanh toán. */
  createBooking: (data) => api.post('/bookings', data),

  getMyBookings: (params = {}) => api.get('/bookings/my', { params }),
  getBookingById: (id) => api.get(`/bookings/${id}`),
  /** Xem trước số tiền được hoàn / bị mất TRƯỚC khi thực sự huỷ. */
  previewCancellation: (id) => api.get(`/bookings/${id}/cancel-preview`),
  cancelBooking: (id, reason) => api.patch(`/bookings/${id}/cancel`, { reason }),

  // ── Chủ sân ──
  getOwnerBookings: (params = {}) => api.get('/owner/bookings', { params }),
  updateBookingStatus: (id, status) => api.patch(`/owner/bookings/${id}/status`, { status }),
  createManualBooking: (data) => api.post('/owner/bookings/manual', data),

  // ── Quản trị viên ──
  /** Báo cáo CHỈ ĐỌC hoa hồng nền tảng thu được trên từng lượt đặt. */
  getCommissionReport: (params = {}) => api.get('/admin/commissions', { params }),
}

export const paymentService = {
  /**
   * Khởi tạo giao dịch.
   *
   * @param {string}  bookingId
   * @param {boolean} useCredit  có trừ số dư khuyến mãi vào đơn này không
   * @returns {Promise<{paid?: boolean, paymentId?: string, payable?: number,
   *                     bankTransfer?: {configured, bankName, accountNumber,
   *                     accountName, amount, content, qrUrl, windowMinutes}}>}
   *
   * Khi `paid === true`, đơn đã được xác nhận bằng số dư khuyến mãi — không có
   * `bankTransfer` và không cần làm gì thêm.
   */
  checkout: (bookingId, useCredit = true) =>
    api.post('/payments/checkout', { bookingId, useCredit }),

  /** Khách bấm "Tôi đã chuyển khoản" sau khi thao tác xong trên app ngân hàng. */
  markTransferred: (paymentId) => api.post(`/payments/${paymentId}/mark-transferred`),

  /** Gọi định kỳ để biết chủ sân đã xác nhận hay chưa. */
  getPaymentStatus: (bookingId) => api.get(`/payments/${bookingId}/status`),

  requestRefund: (paymentId, reason) => api.post(`/payments/${paymentId}/refund`, { reason }),

  // ── Chủ sân — xác nhận chuyển khoản đặt sân khách chuyển thẳng vào tài khoản của mình ──
  getOwnerPendingBankPayments: () => api.get('/owner/payments/pending-bank'),
  ownerConfirmBankTransfer: (paymentId) => api.post(`/owner/payments/${paymentId}/confirm-bank-transfer`),
  ownerRejectBankTransfer: (paymentId, reason) => api.post(`/owner/payments/${paymentId}/reject-bank-transfer`, { reason }),

}
