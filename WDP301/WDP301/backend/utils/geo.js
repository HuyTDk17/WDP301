// Tiện ích địa lý cho tìm sân theo bản đồ (không phụ thuộc mongoose để dễ test).

const VN = { minLat: 8, maxLat: 24, minLng: 102, maxLng: 110.5 };
const EARTH_KM = 6371;

const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));

/** Toạ độ hợp lệ và nằm trong lãnh thổ Việt Nam (chặn nhập nhầm lat/lng hoặc 0,0). */
function validLocation(lat, lng) {
    const a = num(lat);
    const b = num(lng);
    return Number.isFinite(a) && Number.isFinite(b) && a >= VN.minLat && a <= VN.maxLat && b >= VN.minLng && b <= VN.maxLng;
}

/** Đọc khung nhìn bản đồ: swLat,swLng,neLat,neLng. Trả null nếu thiếu/sai. */
function parseBounds(q = {}) {
    const swLat = num(q.swLat), swLng = num(q.swLng), neLat = num(q.neLat), neLng = num(q.neLng);
    if (![swLat, swLng, neLat, neLng].every(Number.isFinite)) return null;
    if (swLat >= neLat || swLng >= neLng) return null;
    if (swLat < -90 || neLat > 90 || swLng < -180 || neLng > 180) return null;
    return { swLat, swLng, neLat, neLng };
}

/** Đọc "gần tôi": lat,lng,radiusKm (mặc định 5km, giới hạn 0.5–50). */
function parseNear(q = {}) {
    const lat = num(q.lat), lng = num(q.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    let radiusKm = num(q.radiusKm);
    if (!Number.isFinite(radiusKm)) radiusKm = 5;
    radiusKm = Math.min(50, Math.max(0.5, radiusKm));
    return { lat, lng, radiusKm };
}

const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Các stage Mongo để lọc theo khung bản đồ hoặc bán kính. Venue chưa có toạ độ bị loại. */
function geoStages({ bounds, near }) {
    const stages = [];
    if (bounds) {
        stages.push({
            $match: {
                'location.lat': { $gte: bounds.swLat, $lte: bounds.neLat },
                'location.lng': { $gte: bounds.swLng, $lte: bounds.neLng },
            },
        });
    } else if (near) {
        const dLat = near.radiusKm / 111;
        const dLng = near.radiusKm / (111 * Math.max(0.01, Math.cos(toRad(near.lat))));
        stages.push({
            $match: {
                'location.lat': { $gte: near.lat - dLat, $lte: near.lat + dLat },
                'location.lng': { $gte: near.lng - dLng, $lte: near.lng + dLng },
            },
        });
        const R = (x) => ({ $degreesToRadians: x });
        stages.push({
            $addFields: {
                distanceKm: {
                    $multiply: [
                        2 * EARTH_KM,
                        {
                            $asin: {
                                $sqrt: {
                                    $add: [
                                        { $pow: [{ $sin: { $divide: [R({ $subtract: ['$location.lat', near.lat] }), 2] } }, 2] },
                                        {
                                            $multiply: [
                                                { $cos: R(near.lat) },
                                                { $cos: R('$location.lat') },
                                                { $pow: [{ $sin: { $divide: [R({ $subtract: ['$location.lng', near.lng] }), 2] } }, 2] },
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            },
        });
        stages.push({ $match: { distanceKm: { $lte: near.radiusKm } } });
    }
    return stages;
}

/** Đọc lat/lng từ body tạo/sửa venue. Trả {clear:true} | {location} | {error}. */
function parseLocationBody(body = {}) {
    const hasLat = body.lat !== undefined, hasLng = body.lng !== undefined;
    if (!hasLat && !hasLng) return {};
    if ((body.lat === '' || body.lat === null) && (body.lng === '' || body.lng === null)) return { clear: true };
    if (!validLocation(body.lat, body.lng)) return { error: 'Vị trí trên bản đồ không hợp lệ (phải nằm trong lãnh thổ Việt Nam)' };
    return { location: { lat: Number(body.lat), lng: Number(body.lng) } };
}

module.exports = { VN, validLocation, parseBounds, parseNear, haversineKm, geoStages, parseLocationBody };
