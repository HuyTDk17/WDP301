const crypto = require('crypto');
const axios = require('axios');

/**
 * Tích hợp Momo (kênh "captureWallet") theo tài liệu chính thức:
 * https://developers.momo.vn/v3/docs/payment/api/wallet/onetime
 *
 * Cần 3 biến môi trường (lấy từ Momo Business sau khi đăng ký merchant):
 *   MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY
 */

function sign(rawSignature, secretKey) {
    return crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
}

async function createPaymentUrl({ orderRef, amount, orderInfo, redirectUrl, ipnUrl }) {
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const accessKey = process.env.MOMO_ACCESS_KEY;
    const secretKey = process.env.MOMO_SECRET_KEY;
    const endpoint = process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create';

    if (!partnerCode || !accessKey || !secretKey) {
        throw new Error('Chưa cấu hình MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY trong .env — cần đăng ký merchant Momo trước');
    }

    const requestId = `${orderRef}-${Date.now()}`;
    const requestType = 'captureWallet';
    const extraData = '';

    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${amount}` +
        `&extraData=${extraData}` +
        `&ipnUrl=${ipnUrl}` +
        `&orderId=${orderRef}` +
        `&orderInfo=${orderInfo}` +
        `&partnerCode=${partnerCode}` +
        `&redirectUrl=${redirectUrl}` +
        `&requestId=${requestId}` +
        `&requestType=${requestType}`;

    const signature = sign(rawSignature, secretKey);

    const body = {
        partnerCode, accessKey, requestId,
        amount: String(Math.round(amount)),
        orderId: orderRef, orderInfo, redirectUrl, ipnUrl,
        extraData, requestType, signature,
        lang: 'vi',
    };

    const { data } = await axios.post(endpoint, body, { headers: { 'Content-Type': 'application/json' } });

    if (data.resultCode !== 0) {
        throw new Error(data.message || 'Momo từ chối khởi tạo giao dịch');
    }

    return data.payUrl;
}

function verifySignature(body) {
    const secretKey = process.env.MOMO_SECRET_KEY;
    const accessKey = process.env.MOMO_ACCESS_KEY;

    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${body.amount}` +
        `&extraData=${body.extraData}` +
        `&message=${body.message}` +
        `&orderId=${body.orderId}` +
        `&orderInfo=${body.orderInfo}` +
        `&orderType=${body.orderType}` +
        `&partnerCode=${body.partnerCode}` +
        `&payType=${body.payType}` +
        `&requestId=${body.requestId}` +
        `&responseTime=${body.responseTime}` +
        `&resultCode=${body.resultCode}` +
        `&transId=${body.transId}`;

    const computedSignature = sign(rawSignature, secretKey);
    return computedSignature === body.signature;
}

const isSuccessCode = (resultCode) => Number(resultCode) === 0;

const canRefund = () => !!(process.env.MOMO_PARTNER_CODE && process.env.MOMO_ACCESS_KEY && process.env.MOMO_SECRET_KEY);

/**
 * Hoàn tiền qua API của MoMo.
 * https://developers.momo.vn/v3/docs/payment/api/wallet/refund
 *
 * MoMo yêu cầu transId — mã giao dịch MoMo trả về lúc thanh toán thành công,
 * chính là Payment.transactionRef mà hệ thống đã lưu từ IPN.
 */
async function refund({ orderRef, amount, transId, description = 'Hoan tien SportVenue' }) {
    const partnerCode = process.env.MOMO_PARTNER_CODE;
    const accessKey = process.env.MOMO_ACCESS_KEY;
    const secretKey = process.env.MOMO_SECRET_KEY;
    const endpoint = process.env.MOMO_REFUND_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/refund';

    if (!canRefund()) throw new Error('Chưa cấu hình thông tin merchant MoMo');
    if (!transId) throw new Error('Thiếu mã giao dịch MoMo của lần thanh toán gốc');

    const requestId = `RF${orderRef}-${Date.now()}`;
    const roundedAmount = Math.round(amount);

    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${roundedAmount}` +
        `&description=${description}` +
        `&orderId=${requestId}` +
        `&partnerCode=${partnerCode}` +
        `&requestId=${requestId}` +
        `&transId=${transId}`;

    const signature = sign(rawSignature, secretKey);

    const { data } = await axios.post(endpoint, {
        partnerCode, orderId: requestId, requestId,
        amount: roundedAmount, transId: Number(transId),
        lang: 'vi', description, signature,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });

    if (!isSuccessCode(data?.resultCode)) {
        throw new Error(data?.message || `MoMo từ chối hoàn tiền (mã ${data?.resultCode})`);
    }
    return { transactionRef: String(data.transId), raw: data };
}

module.exports = { createPaymentUrl, verifySignature, isSuccessCode, refund, canRefund };
