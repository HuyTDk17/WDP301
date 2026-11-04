/**
 * KHỞI TẠO REPLICA SET MỘT NÚT.
 *
 * Chạy:
 *     docker compose exec mongo mongosh --quiet /scripts/init-rs.js
 *
 * ============ VÌ SAO CẦN REPLICA SET ============
 *
 * MongoDB chỉ hỗ trợ giao dịch (transaction) trên replica set, kể cả khi chỉ có
 * đúng một nút. Nghiệp vụ chuyển sân đụng tới tiền của ba bên — khách, chủ sân
 * cũ, chủ sân mới — và phải làm sáu việc trong cùng một lần: tạo đơn mới, giành
 * khung giờ đích, chuyển đơn gốc sang 'transferred', giải phóng khung giờ gốc,
 * ghi bốn bút toán sổ cái, chốt trạng thái yêu cầu.
 *
 * Không có giao dịch thì một lỗi ở bước thứ tư sẽ để lại trạng thái nửa vời:
 * khách mất khung giờ cũ mà không có khung giờ mới, hoặc sổ cái thiếu bút toán
 * và công nợ chủ sân sai vĩnh viễn. Vì vậy backend TỪ CHỐI khởi động ở
 * production nếu MONGO_URI không có tham số replicaSet.
 *
 * Một nút không cho bạn khả năng dự phòng khi máy chủ chết — nhưng nó cho bạn
 * tính đúng đắn của dữ liệu, và đó mới là thứ bắt buộc phải có. Khi có điều
 * kiện, thêm nút thứ hai và một arbiter để có cả hai.
 *
 * Script này chạy ĐƯỢC NHIỀU LẦN: đã khởi tạo rồi thì nó chỉ báo và thoát.
 */

const CONFIG = {
    _id: 'rs0',
    members: [
        // Tên host phải khớp với tên service trong docker-compose.yml. Dùng
        // 'localhost' ở đây sẽ khiến các container khác không kết nối được, vì
        // replica set quảng bá đúng chuỗi này cho client.
        { _id: 0, host: 'mongo:27017' },
    ],
};

try {
    const status = rs.status();
    print(`✅ Replica set "${status.set}" đã hoạt động, trạng thái nút: ${status.members[0].stateStr}`);
} catch (err) {
    // Mã 94 = NotYetInitialized. Bất kỳ lỗi nào khác đều là chuyện thật sự sai
    // và không nên bị nuốt mất bằng cách khởi tạo đè lên.
    if (err.code !== 94 && !/no replset config/i.test(err.message)) {
        print(`❌ Không kiểm tra được trạng thái replica set: ${err.message}`);
        quit(1);
    }

    print('⏳ Chưa khởi tạo — đang khởi tạo replica set rs0...');
    const result = rs.initiate(CONFIG);
    if (!result.ok) {
        print(`❌ Khởi tạo thất bại: ${JSON.stringify(result)}`);
        quit(1);
    }

    // Nút cần vài giây để tự bầu mình làm PRIMARY. Ghi dữ liệu trước thời điểm
    // đó sẽ bị từ chối với lỗi "not primary", nên phải chờ.
    print('⏳ Đang chờ nút trở thành PRIMARY...');
    for (let i = 0; i < 30; i += 1) {
        try {
            if (db.hello().isWritablePrimary) {
                print('✅ Replica set rs0 đã sẵn sàng nhận ghi.');
                quit(0);
            }
        } catch (e) { /* chưa sẵn sàng, thử lại */ }
        sleep(1000);
    }
    print('⚠️  Quá 30 giây mà nút vẫn chưa thành PRIMARY. Kiểm tra log của container mongo.');
    quit(1);
}
