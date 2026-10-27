/** KIỂM THỬ avatar: danh sách backend phải khớp file SVG ở frontend, và chỉ nhận giá trị hợp lệ. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const avatars = require('../utils/avatars');

let passed = 0; let failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed += 1; }
    catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed += 1; }
}
console.log('\n=== AVATAR ===\n');

const feDir = path.join(__dirname, '..', '..', 'e360sport', 'public', 'avatars');
const feData = path.join(__dirname, '..', '..', 'e360sport', 'src', 'data', 'avatars.js');

test('AV-01 · mỗi id backend có đúng một file SVG ở frontend, và ngược lại', () => {
    const files = fs.readdirSync(feDir).filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', '')).sort();
    assert.deepStrictEqual(files, [...avatars.PRESET_IDS].sort());
});

test('AV-02 · danh sách id ở src/data/avatars.js khớp backend', () => {
    const src = fs.readFileSync(feData, 'utf8');
    const ids = [...src.matchAll(/id: '(avatar-\d+)'/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(ids, [...avatars.PRESET_IDS].sort());
});

test('AV-03 · chỉ nhận preset hợp lệ', () => {
    assert.ok(avatars.isValidPreset('preset:avatar-01'));
    for (const bad of ['preset:avatar-99', 'avatar-01', 'preset:../../etc/passwd', '', null, undefined, 5, 'http://evil/x.png', '/uploads/a.png']) {
        assert.ok(!avatars.isValidPreset(bad), `phải từ chối ${String(bad)}`);
    }
});

test('AV-04 · chỉ xoá file nằm trong /uploads do hệ thống lưu (không xoá ảnh Google, preset hay đường dẫn lạ)', () => {
    assert.ok(avatars.isLocalUpload('/uploads/avatar-1-2.png'));
    for (const no of ['preset:avatar-01', 'https://lh3.googleusercontent.com/a', '/uploads/../server.js', '/uploads/a/b.png', null]) {
        assert.ok(!avatars.isLocalUpload(no), `không được coi là file upload: ${String(no)}`);
    }
});

test('AV-05 · route: PUT /auth/avatar có mặt, upload ảnh dùng middleware chỉ nhận ảnh ≤ 2MB', () => {
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'authRoutes.js'), 'utf8');
    assert.ok(/router\.put\('\/avatar'/.test(routes));
    assert.ok(routes.includes("uploadAvatar.single('avatar')"));
    const mw = fs.readFileSync(path.join(__dirname, '..', 'middleware', 'uploadAvatar.js'), 'utf8');
    assert.ok(!mw.includes('.pdf') && mw.includes('2 * 1024 * 1024'));
});

console.log(`\n${passed} đạt, ${failed} lỗi\n`);
process.exit(failed ? 1 : 0);
