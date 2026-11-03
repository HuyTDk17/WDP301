const assert = require('assert');
const g = require('../utils/geo');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('validLocation chấp nhận Hà Nội, chặn 0,0 và lat/lng đảo', () => {
    assert(g.validLocation(21.03, 105.85));
    assert(!g.validLocation(0, 0));
    assert(!g.validLocation(105.85, 21.03));
    assert(!g.validLocation('abc', 105));
    assert(!g.validLocation('', ''));
});
t('parseBounds', () => {
    assert.deepStrictEqual(g.parseBounds({ swLat: '20', swLng: '105', neLat: '21', neLng: '106' }), { swLat: 20, swLng: 105, neLat: 21, neLng: 106 });
    assert.strictEqual(g.parseBounds({ swLat: '21', swLng: '105', neLat: '20', neLng: '106' }), null);
    assert.strictEqual(g.parseBounds({ swLat: '20' }), null);
    assert.strictEqual(g.parseBounds({}), null);
});
t('parseNear mặc định 5km và kẹp 0.5–50', () => {
    assert.strictEqual(g.parseNear({ lat: '21', lng: '105' }).radiusKm, 5);
    assert.strictEqual(g.parseNear({ lat: '21', lng: '105', radiusKm: '999' }).radiusKm, 50);
    assert.strictEqual(g.parseNear({ lat: '21', lng: '105', radiusKm: '0' }).radiusKm, 0.5);
    assert.strictEqual(g.parseNear({ lat: '21' }), null);
});
t('haversine Hà Nội – TP.HCM ≈ 1.140 km', () => {
    const d = g.haversineKm(21.0278, 105.8342, 10.8231, 106.6297);
    assert(d > 1100 && d < 1180, d);
    assert.strictEqual(g.haversineKm(21, 105, 21, 105), 0);
});
t('geoStages', () => {
    assert.deepStrictEqual(g.geoStages({}), []);
    assert.strictEqual(g.geoStages({ bounds: { swLat: 1, swLng: 2, neLat: 3, neLng: 4 } }).length, 1);
    const s = g.geoStages({ near: { lat: 21, lng: 105, radiusKm: 5 } });
    assert.strictEqual(s.length, 3);
    assert(s[1].$addFields.distanceKm);
    assert.strictEqual(s[2].$match.distanceKm.$lte, 5);
});
t('parseLocationBody', () => {
    assert.deepStrictEqual(g.parseLocationBody({}), {});
    assert.deepStrictEqual(g.parseLocationBody({ lat: '', lng: '' }), { clear: true });
    assert.deepStrictEqual(g.parseLocationBody({ lat: '21.0', lng: '105.8' }), { location: { lat: 21, lng: 105.8 } });
    assert(g.parseLocationBody({ lat: '5', lng: '105' }).error);
    assert(g.parseLocationBody({ lat: '21' }).error);
});
console.log(`${n} test đạt`);
