/**
 * KIỂM THỬ #58 — CHÍNH SÁCH HỦY DO CHỦ SÂN ĐẶT (biểu hoàn tiền theo giờ báo trước, phải đạt "sàn" của nền tảng).
 * Phần lõi là hàm thuần; phần controller/dịch vụ dùng model THẬT nhưng ghi đè các hàm truy vấn (không cần MongoDB).
 * Khoá chặt: chủ sân được tử tế hơn sàn nhưng không được khắt khe hơn; Admin nâng sàn thì biểu cũ tự quay về biểu chung;
 * chính sách được CHỤP vào lượt đặt (đổi sau không ảnh hưởng khách đã đặt); không có chính sách riêng thì hành vi cũ giữ nguyên.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const resolve = (rel) => require.resolve(path.join(__dirname, '..', rel));
function fake(rel, exports) { const f = resolve(rel); require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] }; }
const oid = (n) => Number(n).toString(16).padStart(24, '0');

// ── cài đặt nền tảng giả ──
const DEFAULT_PLATFORM = [{ minLeadHours: 24, refundRate: 1 }, { minLeadHours: 12, refundRate: 0.7 }, { minLeadHours: 6, refundRate: 0.5 }, { minLeadHours: 2, refundRate: 0.2 }, { minLeadHours: 0, refundRate: 0 }];
const DEFAULT_FLOOR = [{ minLeadHours: 48, refundRate: 1 }, { minLeadHours: 24, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }];
let settings;
const resetSettings = () => { settings = { cancellationTiers: DEFAULT_PLATFORM, cancellationFloorTiers: DEFAULT_FLOOR, ownerCancellationPolicyAllowed: true, maxRefundRatio: 0.5 }; };
resetSettings();
fake('utils/platformSettings.js', { getSettings: async () => settings, getCommissionRate: async () => 5, getCommissionConfig: async () => ({ ratePct: 5, customerSharePct: 0 }) });

const { normalizeTiers, meetsFloor, effectiveCancellationTiers } = require('../utils/cancellationPolicy');
const User = require('../models/User');
const Booking = require('../models/Booking');
const owners = new Map();
const thenable = (get) => { const self = { then: (a, b) => Promise.resolve(get()).then(a, b), catch: (b) => Promise.resolve(get()).catch(b), select: () => self }; return self; };
User.findById = (id) => thenable(() => owners.get(String(id)) || null);
User.findOneAndUpdate = async (f, update) => {
    const o = owners.get(String(f._id)); if (!o || (f.role && o.role !== f.role)) return null;
    for (const [k, v] of Object.entries(update)) { const [a, b] = k.split('.'); if (b) { o[a] = o[a] || {}; o[a][b] = v; } else o[a] = v; }
    return o;
};
const svc = require('../services/cancellationPolicyService');
const policyCtrl = require('../controllers/cancellationPolicyController');
const bookingCtrl = require('../controllers/bookingController');

const call = (handler, req) => new Promise((ok, bad) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; ok(this); return this; } };
    handler({ body: {}, params: {}, query: {}, ...req }, res, (e) => bad(e));
});
const OWNER = { _id: oid(1), role: 'owner' };
const resetOwner = (policy) => { owners.clear(); owners.set(OWNER._id, { _id: OWNER._id, role: 'owner', cancellationPolicy: policy }); };
const generous = [{ minLeadHours: 48, refundRate: 1 }, { minLeadHours: 24, refundRate: 1 }, { minLeadHours: 12, refundRate: 0.8 }, { minLeadHours: 0, refundRate: 0.3 }];
const strictOk = [{ minLeadHours: 48, refundRate: 1 }, { minLeadHours: 24, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }];   // đúng bằng sàn

console.log('\n=== CHÍNH SÁCH HỦY CỦA CHỦ SÂN (#58) ===\n');
test('CP-01 · chuẩn hóa biểu: đầu vào sai bị chặn rõ lý do; hợp lệ thì sắp giảm dần theo giờ', async () => {
    const bad = {
        'không phải mảng': 'abc', 'rỗng': [], 'quá 8 bậc': Array.from({ length: 9 }, (_, i) => ({ minLeadHours: i, refundRate: 0 })),
        'giờ lẻ': [{ minLeadHours: 1.5, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }], 'giờ âm': [{ minLeadHours: -1, refundRate: 0 }, { minLeadHours: 0, refundRate: 0 }],
        'giờ quá 720': [{ minLeadHours: 721, refundRate: 1 }, { minLeadHours: 0, refundRate: 0 }],
        'tỉ lệ >1': [{ minLeadHours: 0, refundRate: 1.2 }], 'tỉ lệ âm': [{ minLeadHours: 0, refundRate: -0.1 }],
        'quá 2 chữ số thập phân': [{ minLeadHours: 0, refundRate: 0.123 }], 'không phải số': [{ minLeadHours: 'x', refundRate: 0 }],
        'trùng mốc': [{ minLeadHours: 24, refundRate: 1 }, { minLeadHours: 24, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }],
        'thiếu bậc 0': [{ minLeadHours: 24, refundRate: 1 }, { minLeadHours: 2, refundRate: 0 }],
        'báo sớm lại hoàn ít hơn': [{ minLeadHours: 24, refundRate: 0.3 }, { minLeadHours: 0, refundRate: 0.6 }],
    };
    for (const [name, raw] of Object.entries(bad)) assert.ok(normalizeTiers(raw).error, name);
    const ok = normalizeTiers([{ minLeadHours: 0, refundRate: 0 }, { minLeadHours: '24', refundRate: '1' }, { minLeadHours: 6, refundRate: 0.5 }]);
    assert.deepStrictEqual(ok.tiers, [{ minLeadHours: 24, refundRate: 1 }, { minLeadHours: 6, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }]);
});
test('CP-02 · sàn: bằng sàn hoặc tử tế hơn → đạt; khắt khe hơn ở BẤT KỲ mốc nào (kể cả mốc chỉ nằm trong sàn) → lỗi nêu đúng giờ và %', async () => {
    assert.strictEqual(meetsFloor(normalizeTiers(strictOk).tiers, DEFAULT_FLOOR), null);
    assert.strictEqual(meetsFloor(normalizeTiers(generous).tiers, DEFAULT_FLOOR), null);
    const harsh = normalizeTiers([{ minLeadHours: 72, refundRate: 1 }, { minLeadHours: 0, refundRate: 0 }]).tiers;   // báo trước 48–72h mới hoàn 100%
    assert.match(meetsFloor(harsh, DEFAULT_FLOOR), /trước 48 giờ.*100%.*0%/);
    const lateStrict = normalizeTiers([{ minLeadHours: 48, refundRate: 1 }, { minLeadHours: 36, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }]).tiers;
    assert.match(meetsFloor(lateStrict, DEFAULT_FLOOR), /trước 24 giờ.*50%.*0%/, 'bậc 24h của sàn rơi vào giữa bậc 36h và 0h của chủ sân');
    assert.strictEqual(meetsFloor(harsh, []), null, 'không có sàn thì không ràng buộc');
    assert.strictEqual(meetsFloor(harsh, undefined), null);
});
test('CP-03 · biểu đang áp dụng: chỉ dùng biểu riêng khi được phép + bật + hợp lệ + còn đạt sàn; còn lại quay về biểu chung', async () => {
    const own = { enabled: true, tiers: generous };
    assert.deepStrictEqual(effectiveCancellationTiers({ ownerPolicy: own, settings }).source, 'owner');
    assert.deepStrictEqual(effectiveCancellationTiers({ ownerPolicy: own, settings }).tiers[0], { minLeadHours: 48, refundRate: 1 });
    for (const [name, opts] of Object.entries({
        'chưa cấu hình': { ownerPolicy: undefined, settings }, 'đang tắt': { ownerPolicy: { enabled: false, tiers: generous }, settings },
        'biểu rỗng': { ownerPolicy: { enabled: true, tiers: [] }, settings },
        'Admin tắt tính năng': { ownerPolicy: own, settings: { ...settings, ownerCancellationPolicyAllowed: false } },
        'biểu hỏng': { ownerPolicy: { enabled: true, tiers: [{ minLeadHours: 5, refundRate: 1 }] }, settings },
        'Admin nâng sàn sau đó': { ownerPolicy: { enabled: true, tiers: strictOk }, settings: { ...settings, cancellationFloorTiers: [{ minLeadHours: 24, refundRate: 1 }, { minLeadHours: 0, refundRate: 0.5 }] } },
    })) {
        const eff = effectiveCancellationTiers(opts);
        assert.deepStrictEqual([name, eff.source, eff.tiers], [name, 'platform', opts.settings.cancellationTiers]);
    }
    assert.strictEqual(effectiveCancellationTiers({ ownerPolicy: own, settings: { cancellationTiers: DEFAULT_PLATFORM } }).source, 'owner', 'cài đặt cũ chưa có sàn vẫn chạy');
});
test('CP-04 · chủ sân xem/lưu: bị Admin tắt → 403; thiếu cờ bật/tắt → 400; vi phạm sàn → 400 kèm lý do; lưu hợp lệ được chuẩn hóa', async () => {
    resetSettings(); resetOwner();
    const put = (body) => call(policyCtrl.updatePolicy, { user: OWNER, body });
    settings.ownerCancellationPolicyAllowed = false;
    assert.strictEqual((await put({ enabled: true, tiers: generous })).code, 403);
    resetSettings();
    assert.strictEqual((await put({ tiers: generous })).code, 400);
    assert.strictEqual((await put({ enabled: true })).code, 400, 'bật mà không có biểu');
    const harsh = await put({ enabled: true, tiers: [{ minLeadHours: 72, refundRate: 1 }, { minLeadHours: 0, refundRate: 0 }] });
    assert.deepStrictEqual([harsh.code, /nền tảng yêu cầu hoàn tối thiểu/.test(harsh.body.message)], [400, true]);
    assert.strictEqual(owners.get(OWNER._id).cancellationPolicy, undefined, 'lỗi thì không lưu gì');
    const ok = await put({ enabled: true, tiers: [{ minLeadHours: 0, refundRate: 0.3 }, { minLeadHours: 48, refundRate: 1 }, { minLeadHours: 12, refundRate: 0.8 }] });
    assert.strictEqual(ok.code, 200);
    assert.deepStrictEqual(ok.body.tiers.map((t) => t.minLeadHours), [48, 12, 0]);
    assert.deepStrictEqual([ok.body.enabled, ok.body.effective.source, ok.body.floorTiers.length, ok.body.platformTiers.length], [true, 'owner', 3, 5]);
    // tắt: lưu nháp được dù chưa đạt sàn; không còn áp dụng
    const draft = await put({ enabled: false, tiers: [{ minLeadHours: 72, refundRate: 1 }, { minLeadHours: 0, refundRate: 0 }] });
    assert.deepStrictEqual([draft.code, draft.body.enabled, draft.body.effective.source], [200, false, 'platform']);
    const off = await put({ enabled: false });
    assert.deepStrictEqual([off.code, off.body.tiers.length], [200, 2], 'tắt không cần gửi lại biểu, giữ nguyên bản nháp');
});
test('CP-05 · Admin nâng sàn sau khi chủ sân đã lưu: biểu cũ không đạt → đang dùng biểu chung và chủ sân thấy cảnh báo', async () => {
    resetSettings(); resetOwner({ enabled: true, tiers: strictOk });
    assert.strictEqual((await call(policyCtrl.getPolicy, { user: OWNER })).body.effective.source, 'owner');
    settings.cancellationFloorTiers = [{ minLeadHours: 24, refundRate: 1 }, { minLeadHours: 0, refundRate: 0.5 }];
    const v = (await call(policyCtrl.getPolicy, { user: OWNER })).body;
    assert.strictEqual(v.effective.source, 'platform');
    assert.match(v.floorWarning, /nền tảng yêu cầu hoàn tối thiểu/);
});
test('CP-06 · chụp vào lượt đặt: chủ sân dùng biểu riêng → {cancellationTiers, nguồn}; còn lại → {} (hành vi cũ)', async () => {
    resetSettings(); resetOwner({ enabled: true, tiers: generous });
    const snap = await svc.snapshotFor(OWNER._id);
    assert.deepStrictEqual([snap.cancellationPolicySource, snap.cancellationTiers.length], ['owner', 4]);
    resetOwner(undefined);
    assert.deepStrictEqual(await svc.snapshotFor(OWNER._id), {});
    assert.deepStrictEqual(await svc.snapshotFor(undefined), {});
    resetOwner({ enabled: true, tiers: generous }); settings.ownerCancellationPolicyAllowed = false;
    assert.deepStrictEqual(await svc.snapshotFor(OWNER._id), {});
    resetSettings(); resetOwner({ enabled: true, tiers: generous });
    const pub = await svc.publicPolicyFor(OWNER._id);
    assert.deepStrictEqual([pub.source, pub.tiers.length], ['owner', 4]);
});
// Thời điểm bắt đầu cách hiện tại ~30 giờ (theo giờ Việt Nam) để rơi vào khoảng 24–48h
const startIn30h = () => { const t = new Date(Date.now() + 31 * 3600000); t.setUTCMinutes(0, 0, 0); const vn = new Date(t.getTime() + 7 * 3600000).toISOString(); return { date: vn.slice(0, 10), startTime: vn.slice(11, 16) }; };
test('CP-07 · hủy đặt dùng ĐÚNG biểu đã chụp: cùng giờ báo trước, đơn có biểu riêng và đơn không có cho ra mức hoàn khác nhau', async () => {
    const when = startIn30h();
    const make = (extra) => ({ _id: oid(9), customerId: OWNER._id, status: 'confirmed', amount: 200000, serviceFee: 0, discountAmount: 0, creditApplied: 0, ...when, ...extra });
    Booking.findById = async () => make({});
    const preview = (b) => { Booking.findById = async () => b; return call(bookingCtrl.previewCancellation, { user: { _id: OWNER._id }, params: { id: b._id } }); };
    resetSettings();
    const platformRes = await preview(make({}));
    assert.deepStrictEqual([platformRes.body.policySource, platformRes.body.refundRate, platformRes.body.refundAmount], ['platform', 1, 200000], 'biểu chung: ≥24h hoàn 100%');
    const snap = [{ minLeadHours: 48, refundRate: 1 }, { minLeadHours: 0, refundRate: 0.6 }];
    const ownerRes = await preview(make({ cancellationTiers: snap, cancellationPolicySource: 'owner' }));
    assert.deepStrictEqual([ownerRes.body.policySource, ownerRes.body.refundRate, ownerRes.body.refundAmount, ownerRes.body.ownerKeeps], ['owner', 0.6, 120000, 80000]);
    settings.cancellationTiers = [{ minLeadHours: 0, refundRate: 0 }];     // Admin đổi biểu chung sau đó: đơn có biểu riêng KHÔNG đổi, đơn không có thì theo biểu mới
    assert.strictEqual((await preview(make({ cancellationTiers: snap }))).body.refundRate, 0.6);
    assert.strictEqual((await preview(make({}))).body.refundRate, 0);
});
test('CP-08 · đã gắn đủ: chụp ở đặt sân + chuyển sân (theo chủ sân ĐÍCH); hiển thị ở trang địa điểm; route & cài đặt (sàn, bật/tắt)', async () => {
    const root = path.join(__dirname, '..');
    const bc = fs.readFileSync(path.join(root, 'controllers', 'bookingController.js'), 'utf8');
    assert.ok(bc.includes('snapshotFor(venue.ownerId)') && bc.includes('booking.cancellationTiers'));
    assert.ok(fs.readFileSync(path.join(root, 'services', 'transferService.js'), 'utf8').includes('snapshotFor(toVenue.ownerId)'));
    assert.ok(fs.readFileSync(path.join(root, 'controllers', 'venueController.js'), 'utf8').includes('publicPolicyFor(venue.ownerId)'));
    const or = fs.readFileSync(path.join(root, 'routes', 'ownerRoutes.js'), 'utf8');
    assert.ok(or.indexOf("router.use(protect, authorize('owner'))") < or.indexOf("router.get('/cancellation-policy'") && or.includes("'/cancellation-policy', writeLimiter"));
    const st = fs.readFileSync(path.join(root, 'controllers', 'settingsController.js'), 'utf8');
    assert.ok(st.includes('cancellationFloorTiers') && st.includes('ownerCancellationPolicyAllowed') && st.includes('normalizeTiers'));
    const ps = fs.readFileSync(path.join(root, 'models', 'PlatformSetting.js'), 'utf8');
    assert.ok(ps.includes('ownerCancellationPolicyAllowed: { type: Boolean, default: true }') && ps.includes('cancellationFloorTiers'));
    assert.ok(fs.readFileSync(path.join(root, 'models', 'Booking.js'), 'utf8').includes('cancellationPolicySource'));
});
test('CP-09 · bản kiểm tra sàn ở frontend KHỚP backend trên hàng nghìn biểu ngẫu nhiên (cùng kết luận đạt/không đạt); mô tả bậc dễ đọc', async () => {
    const fe = await import(path.join(__dirname, '..', '..', 'e360sport', 'src', 'utils', 'cancellationPolicy.js'));
    let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let compared = 0; let violations = 0;
    for (let i = 0; i < 3000; i += 1) {
        const n = 1 + Math.floor(rnd() * 5);
        const hours = new Set([0]); while (hours.size < n) hours.add(Math.floor(rnd() * 80));
        const floor = [{ minLeadHours: 48, refundRate: 1 }, { minLeadHours: 24, refundRate: 0.5 }, { minLeadHours: 0, refundRate: 0 }];
        let raw = [...hours].map((h) => ({ minLeadHours: h, refundRate: Math.round(rnd() * 20) / 20 }));
        if (i % 2 === 0) {
            // Một nửa số ca: ép biểu "tử tế" (≥ sàn ở từng bậc, báo càng sớm hoàn càng nhiều) hoặc chỉ nới nhẹ để sát ranh giới
            raw.sort((a, b) => a.minLeadHours - b.minLeadHours);
            let prev = 0;
            raw = raw.map((t) => { prev = Math.max(t.refundRate, fe.rateAt(floor, t.minLeadHours), prev); return { ...t, refundRate: prev }; });
            if (rnd() < 0.3) { const j = Math.floor(rnd() * raw.length); raw[j] = { ...raw[j], refundRate: Math.max(0, raw[j].refundRate - 0.05) }; }
        }
        const parsed = normalizeTiers(raw);
        if (parsed.error) continue;          // biểu không hợp lệ về cấu trúc đã bị chặn ở bước chuẩn hóa
        const be = meetsFloor(parsed.tiers, floor);
        const feRes = fe.floorViolation(parsed.tiers, floor);
        assert.strictEqual(Boolean(be), Boolean(feRes), JSON.stringify(parsed.tiers));
        compared += 1; if (be) violations += 1;
    }
    assert.ok(compared > 300 && violations > 50 && compared - violations > 50, `đủ cả hai loại ca: ${compared}/${violations}`);
    assert.deepStrictEqual(fe.describeTiers(DEFAULT_PLATFORM).map((l) => l.when), ['Báo trước từ 24 giờ', 'Báo trước từ 12 đến dưới 24 giờ', 'Báo trước từ 6 đến dưới 12 giờ', 'Báo trước từ 2 đến dưới 6 giờ', 'Báo trước dưới 2 giờ']);
    assert.deepStrictEqual(fe.describeTiers([{ minLeadHours: 0, refundRate: 0.5 }]), [{ when: 'Mọi thời điểm', rate: 0.5 }]);
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
    }
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
