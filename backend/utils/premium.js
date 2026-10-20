/**
 * TIỆN ÍCH PREMIUM — logic thuần, không đụng CSDL.
 *
 * Gói gắn trên User.premium = { plan, since, until }. Còn hiệu lực khi `until` ở tương lai.
 *   • venue_premium  — dành cho CHỦ SÂN (mua một lần, áp cho mọi địa điểm của chủ sân đó)
 *   • player_premium — dành cho NGƯỜI CHƠI
 */
const PLAN_BY_ROLE = { owner: 'venue_premium', customer: 'player_premium' };
const AUDIENCE_BY_PLAN = { venue_premium: 'owner', player_premium: 'player' };

function isActive(user, now = Date.now()) {
    const until = user?.premium?.until;
    return !!until && new Date(until).getTime() > now;
}
/** Người dùng đang có ĐÚNG gói `plan` còn hiệu lực. */
function hasPlan(user, plan, now = Date.now()) {
    return isActive(user, now) && user.premium.plan === plan;
}
function daysLeft(user, now = Date.now()) {
    if (!isActive(user, now)) return 0;
    return Math.ceil((new Date(user.premium.until).getTime() - now) / 86400000);
}

/** Giá, thời hạn và quyền lợi của hai gói, lấy từ Cài đặt (admin chỉnh được). */
function catalog(settings = {}) {
    const days = settings.premiumDurationDays ?? 30;
    const ownerRate = settings.premiumVenueCommissionRate ?? 7;
    const baseRate = settings.commissionRate ?? 10;
    const holdMin = settings.premiumPlayerHoldMinutes ?? 20;
    return {
        enabled: settings.premiumEnabled !== false,
        durationDays: days,
        plans: [
            {
                id: 'venue_premium', audience: 'owner', name: 'Venue Premium', price: settings.premiumVenuePrice ?? 149000, durationDays: days,
                tagline: 'Đưa sân của bạn lên đầu, giữ lại nhiều doanh thu hơn',
                perks: [
                    { icon: '🚀', title: 'Ưu tiên hiển thị', text: 'Địa điểm của bạn xếp trên cùng ở trang danh sách và mục Sân nổi bật.' },
                    { icon: '👑', title: 'Huy hiệu Premium', text: 'Huy hiệu nổi bật trên thẻ sân và trang chi tiết, tăng độ tin cậy với khách.' },
                    { icon: '💸', title: `Phí dịch vụ giảm còn ${ownerRate}%`, text: `Mỗi đơn mới chỉ tính ${ownerRate}% thay vì ${baseRate}% giá sân — càng nhiều đơn càng tiết kiệm.` },
                    { icon: '🛟', title: 'Hỗ trợ ưu tiên', text: 'Khiếu nại liên quan đến sân của bạn được admin xử lý trước.' },
                ],
            },
            {
                id: 'player_premium', audience: 'player', name: 'Premium Player', price: settings.premiumPlayerPrice ?? 29000, durationDays: days,
                tagline: 'Đặt sân thoải mái hơn, đổi lịch không tốn phí',
                perks: [
                    { icon: '🔄', title: 'Đổi lịch miễn phí', text: 'Không mất phí chuyển sân khi đổi lịch hoặc chuyển sang sân khác.' },
                    { icon: '⏱️', title: `Giữ chỗ ${holdMin} phút`, text: `Thời gian giữ chỗ khi đặt sân tăng gấp đôi (${holdMin} phút thay vì 10 phút).` },
                    { icon: '🎟️', title: 'Miễn phí dịch vụ', text: 'Không phải trả phí dịch vụ nền tảng cộng thêm vào đơn đặt sân.' },
                    { icon: '👑', title: 'Huy hiệu Premium', text: 'Huy hiệu Premium bên cạnh tên của bạn.' },
                    { icon: '🛟', title: 'Khiếu nại ưu tiên', text: 'Khiếu nại của bạn được admin xử lý trước.' },
                ],
            },
        ],
    };
}

/**
 * Phí dịch vụ của một đơn có tính đến Premium (logic thuần để kiểm thử):
 *   • chủ sân Venue Premium → tỉ lệ ưu đãi (chỉ áp khi thấp hơn mức chung);
 *   • người chơi Premium Player → miễn phần phí dịch vụ cộng thêm vào giá (nền tảng chịu,
 *     phần chủ sân chịu `ownerCommission` giữ nguyên, không bị đẩy sang ai).
 */
function priceFee({ amount, ratePct, customerSharePct = 0, owner, customer, settings = {}, now = Date.now() }) {
    const { splitCommission } = require('./commission');
    let rate = ratePct;
    if (hasPlan(owner, 'venue_premium', now)) rate = Math.min(rate, settings.premiumVenueCommissionRate ?? rate);
    const fee = splitCommission({ amount, ratePct: rate, customerSharePct });
    const waived = hasPlan(customer, 'player_premium', now);
    return { ratePct: rate, fee, serviceFee: waived ? 0 : fee.serviceFee, serviceFeeWaived: waived };
}

module.exports = { priceFee, PLAN_BY_ROLE, AUDIENCE_BY_PLAN, isActive, hasPlan, daysLeft, catalog };
