const crypto = require('crypto');
const qs = require('qs');

/**
 * Tích hợp VNPay theo tài liệu chính thức:
 * https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 *
 * Cần 2 biến môi trường (lấy từ VNPay sau khi đăng ký merchant):
 *   VNP_TMN_CODE    — mã website do VNPay cấp
 *   VNP_HASH_SECRET — chuỗi bí mật dùng để ký (KHÔNG được lộ ra frontend)
 */

function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    keys.forEach((key) => { sorted[key] = obj[key]; });
    return sorted;
}

function createPaymentUrl({ orderRef, amount, orderInfo, ipAddr, returnUrl }) {
    const tmnCode = process.env.VNP_TMN_CODE;
    const secretKey = process.env.VNP_HASH_SECRET;
    const vnpUrl = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

    if (!tmnCode || !secretKey) {
        throw new Error('Chưa cấu hình VNP_TMN_CODE / VNP_HASH_SECRET trong .env — cần đăng ký merchant VNPay trước');
    }

    const now = new Date();
    const createDate = formatDate(now);

    let vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: tmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderRef,
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: 'other',
        vnp_Amount: Math.round(amount) * 100,
        vnp_ReturnUrl: returnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
    };

    vnpParams = sortObject(vnpParams);
    const signData = qs.stringify(vnpParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    vnpParams.vnp_SecureHash = signed;

    return `${vnpUrl}?${qs.stringify(vnpParams, { encode: false })}`;
}

function verifySignature(query) {
    const secretKey = process.env.VNP_HASH_SECRET;
    const receivedHash = query.vnp_SecureHash;

    const params = { ...query };
    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    const sorted = sortObject(params);
    const signData = qs.stringify(sorted, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const computedHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return computedHash === receivedHash;
}

function formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const isSuccessCode = (responseCode) => responseCode === '00';

/** Đã đủ thông tin để gọi API hoàn tiền chưa. */
const canRefund = () => !!(process.env.VNP_TMN_CODE && process.env.VNP_HASH_SECRET);

/**
 * Hoàn tiền qua API của VNPay (vnp_Command = 'refund').
 * https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr&refund.html
 *
 * Khác với khi tạo URL thanh toán, chữ ký ở đây KHÔNG sắp xếp tham số mà nối
 * chuỗi theo đúng thứ tự VNPay quy định, ngăn bằng dấu |. Sai thứ tự là hỏng
 * chữ ký, nên tuyệt đối không đổi vị trí các dòng bên dưới.
 *
 * @param {'02'|'03'} transactionType  02 = hoàn toàn phần, 03 = hoàn một phần
 */
async function refund({ orderRef, amount, transactionNo, transactionDate, orderInfo, ipAddr, createdBy, transactionType = '03' }) {
    const axios = require('axios');
    const tmnCode = process.env.VNP_TMN_CODE;
    const secretKey = process.env.VNP_HASH_SECRET;
    const apiUrl = process.env.VNP_API_URL || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

    if (!canRefund()) throw new Error('Chưa cấu hình VNP_TMN_CODE / VNP_HASH_SECRET');

    const requestId = `${Date.now()}`;
    const createDate = formatDate(new Date());
    const vnpAmount = Math.round(amount) * 100;

    const raw = [
        requestId, '2.1.0', 'refund', tmnCode, transactionType, orderRef,
        vnpAmount, transactionNo || '', transactionDate, createdBy || 'system',
        createDate, ipAddr || '127.0.0.1', orderInfo,
    ].join('|');

    const secureHash = crypto.createHmac('sha512', secretKey)
        .update(Buffer.from(raw, 'utf-8')).digest('hex');

    const { data } = await axios.post(apiUrl, {
        vnp_RequestId: requestId,
        vnp_Version: '2.1.0',
        vnp_Command: 'refund',
        vnp_TmnCode: tmnCode,
        vnp_TransactionType: transactionType,
        vnp_TxnRef: orderRef,
        vnp_Amount: vnpAmount,
        vnp_TransactionNo: transactionNo || '',
        vnp_TransactionDate: transactionDate,
        vnp_CreateBy: createdBy || 'system',
        vnp_CreateDate: createDate,
        vnp_IpAddr: ipAddr || '127.0.0.1',
        vnp_OrderInfo: orderInfo,
        vnp_SecureHash: secureHash,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });

    if (!isSuccessCode(data?.vnp_ResponseCode)) {
        throw new Error(data?.vnp_Message || `VNPay từ chối hoàn tiền (mã ${data?.vnp_ResponseCode})`);
    }
    return { transactionRef: data.vnp_TransactionNo, raw: data };
}

module.exports = { createPaymentUrl, verifySignature, isSuccessCode, refund, canRefund, formatDate };
