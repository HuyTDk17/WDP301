import api from './api'

// Chính sách hủy riêng của chủ sân (biểu hoàn tiền theo giờ báo trước).
//   GET /owner/cancellation-policy → { allowed, enabled, tiers, platformTiers, floorTiers, effective:{source,tiers}, floorWarning }
//   PUT /owner/cancellation-policy   { enabled, tiers:[{minLeadHours, refundRate}] }
// Chỉ áp dụng cho lượt đặt MỚI sau khi lưu; biểu phải ≥ "sàn" do Admin đặt ở mọi thời điểm.
export const cancellationPolicyService = {
  get: () => api.get('/owner/cancellation-policy'),
  save: (enabled, tiers) => api.put('/owner/cancellation-policy', { enabled, tiers }),
}
