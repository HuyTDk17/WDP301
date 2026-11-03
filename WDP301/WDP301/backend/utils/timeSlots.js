/**
 * Tiện ích xử lý khung giờ. Tách riêng để MỌI nơi tính tiền và kiểm tra trùng
 * lịch đều dùng chung một cách hiểu về "khung giờ", thay vì mỗi controller tự
 * suy diễn một kiểu.
 *
 * ============ VỀ MÚI GIỜ (quan trọng) ============
 *
 * Ngày giờ của một lượt đặt sân được lưu dưới dạng chuỗi theo GIỜ ĐỊA PHƯƠNG
 * của sân ('2026-09-20', '19:00'), không kèm múi giờ. Trước đây hàm toDateTime
 * dựng Date bằng `new Date(y, m, d, h, mi)` — tức là diễn giải theo múi giờ của
 * MÁY CHỦ. Trên máy lập trình viên (UTC+7) thì đúng, nhưng container và VPS
 * mặc định chạy UTC: cùng một đơn sẽ bị hiểu lệch 7 tiếng.
 *
 * Hậu quả không phải là hiển thị sai giờ mà là SAI TIỀN: lead time L quyết định
 * bậc phí chuyển sân (0/2/5% … 5/8/15%) và bậc bồi thường chủ sân (0/10/20/40%).
 * Lệch 7 tiếng là nhảy bậc, thu thừa hoặc thu thiếu của khách, và sai âm thầm
 * vì không có gì báo lỗi.
 *
 * Cách sửa: neo cứng vào offset của sân (Việt Nam = UTC+7 = 420 phút), đọc từ
 * APP_TZ_OFFSET_MINUTES. Không phụ thuộc vào TZ của hệ điều hành nữa.
 */

const TZ_OFFSET_MINUTES = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 420);
const SAFE_OFFSET = Number.isNaN(TZ_OFFSET_MINUTES) ? 420 : TZ_OFFSET_MINUTES;

/** 'HH:mm' -> số phút kể từ 00:00 */
function toMinutes(time) {
    const [h, m] = String(time).split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
    return h * 60 + m;
}

/**
 * Kiểm tra định dạng CHẶT trước khi cho bất kỳ giá trị date/time nào đi vào
 * các phép tính bên dưới.
 *
 * TRƯỚC ĐÂY: date/startTime/endTime chỉ được validate lỏng lẻo (khác rỗng,
 * end > start), nên một giá trị như date="abc" khiến toDateTime() trả về
 * `new Date(NaN)`, và leadTimeHours() theo đó trả về NaN. Mọi so sánh dạng
 * `NaN <= 0` hay `NaN < minLead` đều là FALSE — tức là điều kiện "phải đặt
 * trước ít nhất N giờ" và "không được đặt vào quá khứ" bị BỎ QUA thay vì
 * chặn lại, dù được viết đúng cú pháp `<=` tưởng chừng an toàn. Đây không
 * phải giả thuyết — đã tái hiện bằng: durationHours("abc","xyz") = 0 (bị chặn
 * đúng) nhưng leadTimeHours("abc","19:00") = NaN (KHÔNG bị chặn).
 *
 * Chặn ngay từ đầu bằng regex là cách duy nhất xử lý dứt điểm, vì bản thân
 * NaN không thể so sánh lớn/bé một cách an toàn ở bất kỳ đâu dùng nó sau này.
 *
 * Riêng regex chưa đủ: "2026-02-30" (ngày 30 tháng 2, không tồn tại) khớp
 * đúng định dạng \d{4}-\d{2}-\d{2}, nhưng Date.UTC() âm thầm "cuộn" nó thành
 * ngày 2/3/2026 thay vì báo lỗi — nên phải dựng lại chuỗi ngày từ kết quả và
 * so khớp NGƯỢC LẠI với đầu vào để bắt được các ngày không có thật.
 */
function isValidDateString(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return false;
    const instant = toDateTime(date, '00:00');
    if (Number.isNaN(instant.getTime())) return false;
    return toLocalDateString(instant) === date;
}

function isValidTimeString(time) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return false;
    return !Number.isNaN(toMinutes(time));
}

/** Số GIỜ của khung giờ, dạng thập phân (19:00–20:30 -> 1.5) */
function durationHours(startTime, endTime) {
    const d = toMinutes(endTime) - toMinutes(startTime);
    return d > 0 ? d / 60 : 0;
}

/**
 * Giá của một khung giờ = đơn giá theo giờ × số giờ.
 *
 * TRƯỚC ĐÂY: amount = court.pricePerHour, KHÔNG nhân số giờ — nên mọi khung giờ
 * dài hơn 1 tiếng đều bị tính thiếu tiền.
 */
function calculateAmount(pricePerHour, startTime, endTime) {
    const hours = durationHours(startTime, endTime);
    return Math.round((Number(pricePerHour) || 0) * hours);
}

/**
 * Chẻ khung giờ thành danh sách ô 30 phút (0..47) để khoá ở cấp DB.
 * 19:00–20:30 -> [38, 39, 40]
 */
function slotIndices(startTime, endTime) {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (!(end > start)) return [];
    const indices = [];
    for (let m = Math.floor(start / 30) * 30; m < end; m += 30) {
        indices.push(Math.floor(m / 30));
    }
    return indices;
}

/**
 * Ghép date 'YYYY-MM-DD' + time 'HH:mm' thành một mốc thời gian TUYỆT ĐỐI,
 * diễn giải chuỗi đầu vào theo múi giờ của sân chứ không theo múi giờ máy chủ.
 */
function toDateTime(date, time) {
    const [y, mo, d] = String(date).split('-').map(Number);
    const [h, mi] = String(time).split(':').map(Number);
    if ([y, mo, d].some(Number.isNaN)) return new Date(NaN);
    // Dựng theo UTC rồi trừ đi offset của sân: 19:00 giờ VN = 12:00 UTC.
    const utcMs = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0);
    return new Date(utcMs - SAFE_OFFSET * 60 * 1000);
}

/** Ngược lại: mốc thời gian tuyệt đối -> 'YYYY-MM-DD' theo giờ của sân. */
function toLocalDateString(instant = new Date()) {
    const shifted = new Date(instant.getTime() + SAFE_OFFSET * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
}

/** Và -> 'HH:mm' theo giờ của sân. */
function toLocalTimeString(instant = new Date()) {
    const shifted = new Date(instant.getTime() + SAFE_OFFSET * 60 * 1000);
    return shifted.toISOString().slice(11, 16);
}

/**
 * Lead time: số GIỜ còn lại từ bây giờ tới lúc khung giờ bắt đầu.
 * Âm nghĩa là khung giờ đã trôi qua.
 */
function leadTimeHours(date, startTime, from = new Date()) {
    return (toDateTime(date, startTime).getTime() - from.getTime()) / 3600000;
}

/** Hai khung giờ trong cùng một ngày có chồng lấn nhau không */
function overlaps(startA, endA, startB, endB) {
    return toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
}

module.exports = {
    toMinutes, durationHours, calculateAmount,
    slotIndices, toDateTime, leadTimeHours, overlaps,
    toLocalDateString, toLocalTimeString,
    isValidDateString, isValidTimeString,
    TZ_OFFSET_MINUTES: SAFE_OFFSET,
};
