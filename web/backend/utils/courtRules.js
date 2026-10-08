/**
 * Quy tắc "một sân = một môn" áp lên lượt đặt.
 *
 * Môn thể thao của lượt đặt luôn là môn của sân (Court.type, chủ sân khai khi tạo sân) — khách/chủ sân
 * không được chọn môn khác; server bỏ qua `sport` client gửi lên. Hệ thống KHÔNG hỏi số người chơi:
 * tiền sân cố định theo giờ, người chơi tự chia nhau.
 */
const SPORT_IDS = ['football', 'basketball', 'badminton', 'tennis', 'volleyball', 'swimming', 'gym', 'yoga'];

/** Môn của lượt đặt = môn của sân. */
function sportOf(court) {
    return court?.type || '';
}

module.exports = { SPORT_IDS, sportOf };
