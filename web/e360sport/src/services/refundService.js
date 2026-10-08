// Nhãn loại khoản hoàn hiển thị cho CHỦ SÂN (trang "Hoàn tiền" của chủ sân).
//
// Khách chuyển khoản thẳng cho chủ sân nên mọi khoản hoàn đều do chủ sân chuyển lại
// (xem các hàm trong settlementService: getOwnerRefunds / ownerMarkRefunded). Quản trị
// viên không tham gia hoàn tiền.
export const REFUND_PURPOSE_LABEL = {
  transfer_refund: 'Chênh lệch chuyển sân',
  cancellation_refund: 'Huỷ lượt đặt',
  booking: 'Đặt sân',
  transfer_topup: 'Bù tiền chuyển sân',
}
