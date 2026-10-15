/** KIỂM THỬ lưu trữ ảnh (Cloudinary / đĩa / MongoDB) và gửi email qua Brevo. Không gọi mạng thật. */
const assert = require('assert');
const { Writable } = require('stream');
const express = require('express');
const multer = require('multer');

let passed = 0; let failed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });

const ENV_KEYS = ['CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    'BREVO_API_KEY', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'PRIVATE_STORAGE'];
const saved = {};
ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
const uploads = require('../utils/uploads');
const resetEnv = () => { ENV_KEYS.forEach((k) => delete process.env[k]); uploads._resetConfigCache(); };

function useCloudinaryEnv() {
    process.env.CLOUDINARY_CLOUD_NAME = 'democloud';
    process.env.CLOUDINARY_API_KEY = 'k';
    process.env.CLOUDINARY_API_SECRET = 's';
    uploads._resetConfigCache();
}

console.log('\n=== LƯU TRỮ ẢNH / EMAIL ===\n');

test('UP-01 · không cấu hình Cloudinary → dùng đĩa; fileUrl trả /uploads/<tên>', () => {
    resetEnv();
    assert.strictEqual(uploads.isCloudinaryConfigured(), false);
    assert.strictEqual(uploads.fileUrl({ filename: 'a.png' }), '/uploads/a.png');
});

test('UP-02 · cấu hình bằng 3 biến riêng lẻ hoặc CLOUDINARY_URL đều nhận', () => {
    resetEnv(); useCloudinaryEnv();
    assert.strictEqual(uploads.isCloudinaryConfigured(), true);
    resetEnv();
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@urlcloud';
    uploads._resetConfigCache();
    assert.strictEqual(uploads.isCloudinaryConfigured(), true);
    assert.strictEqual(uploads.cloudinary.config().cloud_name, 'urlcloud');
});

test('UP-03 · fileUrl ưu tiên URL Cloudinary', () => {
    assert.strictEqual(uploads.fileUrl({ url: 'https://res.cloudinary.com/x/image/upload/v1/a.jpg', filename: 'a' }),
        'https://res.cloudinary.com/x/image/upload/v1/a.jpg');
});

test('UP-04 · publicIdFromUrl: chỉ nhận ảnh của đúng tài khoản, hỗ trợ thư mục và transformation', () => {
    resetEnv(); useCloudinaryEnv();
    assert.strictEqual(uploads.publicIdFromUrl('https://res.cloudinary.com/democloud/image/upload/v1700000000/esport360/venues/abc123.jpg'), 'esport360/venues/abc123');
    assert.strictEqual(uploads.publicIdFromUrl('https://res.cloudinary.com/democloud/image/upload/f_auto,q_auto/v12/esport360/avatars/x.webp'), 'esport360/avatars/x');
    for (const no of ['https://res.cloudinary.com/other/image/upload/v1/a.jpg', 'https://lh3.googleusercontent.com/a', '/uploads/a.png', 'preset:avatar-01', null, undefined, 5]) {
        assert.strictEqual(uploads.publicIdFromUrl(no), null, String(no));
    }
});

test('UP-05 · removeStoredFile gọi destroy với đúng public_id và bỏ qua URL lạ', async () => {
    resetEnv(); useCloudinaryEnv();
    const calls = [];
    const orig = uploads.cloudinary.uploader.destroy;
    uploads.cloudinary.uploader.destroy = async (id) => { calls.push(id); return { result: 'ok' }; };
    try {
        uploads.removeStoredFile('https://res.cloudinary.com/democloud/image/upload/v1/esport360/venues/z.png');
        uploads.removeStoredFile('https://lh3.googleusercontent.com/a');
        uploads.removeStoredFile('preset:avatar-02');
        uploads.removeStoredFile(null);
        await new Promise((r) => setImmediate(r));
    } finally { uploads.cloudinary.uploader.destroy = orig; }
    assert.deepStrictEqual(calls, ['esport360/venues/z']);
});

test('UP-06 · multer + CloudinaryStorage: tải ảnh qua HTTP, nhận file.url, không ghi đĩa', async () => {
    resetEnv(); useCloudinaryEnv();
    const { CloudinaryStorage } = require('../middleware/storageEngines');
    const origStream = uploads.cloudinary.uploader.upload_stream;
    let seenOpts; let received = 0;
    uploads.cloudinary.uploader.upload_stream = (opts, cb) => {
        seenOpts = opts;
        return new Writable({
            write(chunk, enc, next) { received += chunk.length; next(); },
            final(done) { cb(null, { secure_url: 'https://res.cloudinary.com/democloud/image/upload/v1/esport360/venues/new1.png', public_id: 'esport360/venues/new1', bytes: received }); done(); },
        });
    };
    const upload = multer({ storage: new CloudinaryStorage({ folder: 'esport360/venues' }), limits: { fileSize: 1024 * 1024 } });
    const app = express();
    app.post('/up', upload.array('images', 3), (req, res) => res.json(req.files.map((f) => uploads.fileUrl(f))));
    app.use((err, req, res, next) => res.status(err.statusCode || 400).json({ message: err.message })); // eslint-disable-line no-unused-vars
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    try {
        const fd = new FormData();
        fd.append('images', new Blob([Buffer.alloc(2048, 1)], { type: 'image/png' }), 'a.png');
        const res = await fetch(`http://127.0.0.1:${server.address().port}/up`, { method: 'POST', body: fd });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), ['https://res.cloudinary.com/democloud/image/upload/v1/esport360/venues/new1.png']);
        assert.strictEqual(received, 2048);
        assert.strictEqual(seenOpts.folder, 'esport360/venues');
        assert.strictEqual(seenOpts.resource_type, 'image');
    } finally { server.close(); uploads.cloudinary.uploader.upload_stream = origStream; }
});

test('UP-07 · Cloudinary lỗi → 502 với thông báo thân thiện (không lộ chi tiết)', async () => {
    resetEnv(); useCloudinaryEnv();
    const { CloudinaryStorage } = require('../middleware/storageEngines');
    const origStream = uploads.cloudinary.uploader.upload_stream;
    uploads.cloudinary.uploader.upload_stream = (opts, cb) => new Writable({
        write(c, e, next) { next(); },
        final(done) { cb({ message: 'Invalid api_key SECRET-DETAIL', http_code: 401 }); done(); },
    });
    const upload = multer({ storage: new CloudinaryStorage({ folder: 'f' }) });
    const app = express();
    app.post('/up', upload.single('images'), (req, res) => res.json({ ok: true }));
    app.use((err, req, res, next) => res.status(err.statusCode || 400).json({ message: err.message })); // eslint-disable-line no-unused-vars
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const origErr = console.error; console.error = () => {};
    try {
        const fd = new FormData();
        fd.append('images', new Blob([Buffer.alloc(10)], { type: 'image/png' }), 'a.png');
        const res = await fetch(`http://127.0.0.1:${server.address().port}/up`, { method: 'POST', body: fd });
        const body = await res.json();
        assert.strictEqual(res.status, 502);
        assert.ok(!body.message.includes('SECRET-DETAIL'));
    } finally { console.error = origErr; server.close(); uploads.cloudinary.uploader.upload_stream = origStream; }
});

test('UP-08 · MongoFileStorage: lưu buffer vào PrivateFile, loại nội dung suy từ đuôi file (không tin client)', async () => {
    resetEnv();
    const PrivateFile = require('../models/PrivateFile');
    const { MongoFileStorage } = require('../middleware/storageEngines');
    const docs = [];
    const origCreate = PrivateFile.create;
    PrivateFile.create = async (d) => { docs.push(d); return d; };
    const upload = multer({ storage: new MongoFileStorage() });
    const app = express();
    app.post('/up', upload.array('documents', 5), (req, res) => res.json(req.files.map((f) => f.filename)));
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    try {
        const fd = new FormData();
        fd.append('documents', new Blob([Buffer.from('%PDF-1.4 hello')], { type: 'text/html' }), 'giay-phep.PDF');
        const res = await fetch(`http://127.0.0.1:${server.address().port}/up`, { method: 'POST', body: fd });
        const names = await res.json();
        assert.strictEqual(docs.length, 1);
        assert.strictEqual(docs[0].contentType, 'application/pdf');
        assert.strictEqual(docs[0].filename, names[0]);
        assert.ok(/\.pdf$/.test(names[0]));
        assert.strictEqual(docs[0].data.toString(), '%PDF-1.4 hello');
        assert.strictEqual(docs[0].originalName, 'giay-phep.PDF');
    } finally { server.close(); PrivateFile.create = origCreate; }
});

test('UP-09 · PRIVATE_STORAGE=disk quay về chế độ ghi đĩa (có thuộc tính diskStorage)', () => {
    resetEnv();
    process.env.PRIVATE_STORAGE = 'disk';
    const { privateFileStorage, MongoFileStorage } = require('../middleware/storageEngines');
    const os = require('os'); const path = require('path');
    const st = privateFileStorage(path.join(os.tmpdir(), 'e360-test-private'));
    assert.ok(!(st instanceof MongoFileStorage));
    delete process.env.PRIVATE_STORAGE;
    assert.ok(privateFileStorage('x') instanceof MongoFileStorage);
});

test('UP-10 · route tài liệu: PrivateFile có trong documentController, owner-application dọn file khi bị từ chối', () => {
    const fs = require('fs'); const path = require('path');
    const doc = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'documentController.js'), 'utf8');
    assert.ok(doc.includes('PrivateFile.findOne') && doc.includes("res.setHeader('X-Content-Type-Options', 'nosniff')"));
    const auth = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');
    assert.ok(auth.includes('discardPrivateUploads(req.files)'));
    const venue = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'venueController.js'), 'utf8');
    assert.ok(!venue.includes('`/uploads/${f.filename}`'), 'venueController không được tự ghép /uploads nữa');
});

// ===== EMAIL =====
const mailer = require('../utils/mailer');

test('ML-01 · parseAddress', () => {
    assert.deepStrictEqual(mailer.parseAddress('ESport360 <no-reply@x.vn>'), { name: 'ESport360', email: 'no-reply@x.vn' });
    assert.deepStrictEqual(mailer.parseAddress('"Sân Việt" <a@b.com>'), { name: 'Sân Việt', email: 'a@b.com' });
    assert.deepStrictEqual(mailer.parseAddress('a@b.com'), { email: 'a@b.com' });
    assert.deepStrictEqual(mailer.parseAddress('<a@b.com>'), { email: 'a@b.com' });
});

test('ML-02 · isConfigured: Brevo cần cả API key lẫn MAIL_FROM; SMTP cần đủ 3 biến', () => {
    resetEnv();
    assert.strictEqual(mailer.isConfigured(), false);
    process.env.BREVO_API_KEY = 'xkeysib-1';
    assert.strictEqual(mailer.isConfigured(), false, 'thiếu MAIL_FROM');
    process.env.MAIL_FROM = 'ESport360 <me@gmail.com>';
    assert.strictEqual(mailer.isConfigured(), true);
    resetEnv();
    process.env.SMTP_HOST = 'smtp.x'; process.env.SMTP_USER = 'u';
    assert.strictEqual(mailer.isConfigured(), false);
    process.env.SMTP_PASS = 'p';
    assert.strictEqual(mailer.isConfigured(), true);
});

test('ML-03 · sendMail qua Brevo gửi đúng endpoint, header và nội dung', async () => {
    resetEnv();
    process.env.BREVO_API_KEY = 'xkeysib-abc'; process.env.MAIL_FROM = 'ESport360 <me@gmail.com>';
    const origFetch = global.fetch; let req;
    global.fetch = async (url, init) => { req = { url, init }; return { ok: true, json: async () => ({ messageId: '<1@x>' }) }; };
    try {
        const out = await mailer.sendMail({ to: 'khach@example.com', subject: 'Chào', html: '<p>Xin chào</p>' });
        assert.strictEqual(out.messageId, '<1@x>');
    } finally { global.fetch = origFetch; }
    assert.strictEqual(req.url, 'https://api.brevo.com/v3/smtp/email');
    assert.strictEqual(req.init.headers['api-key'], 'xkeysib-abc');
    const body = JSON.parse(req.init.body);
    assert.deepStrictEqual(body.sender, { name: 'ESport360', email: 'me@gmail.com' });
    assert.deepStrictEqual(body.to, [{ email: 'khach@example.com' }]);
    assert.strictEqual(body.subject, 'Chào');
    assert.strictEqual(body.htmlContent, '<p>Xin chào</p>');
    assert.ok(body.textContent.includes('Xin chào'));
});

test('ML-04 · Brevo trả lỗi / mất mạng → 502 thân thiện, không lộ API key hay nội dung lỗi', async () => {
    resetEnv();
    process.env.BREVO_API_KEY = 'xkeysib-secret'; process.env.MAIL_FROM = 'a@b.com';
    const origFetch = global.fetch; const origErr = console.error; console.error = () => {};
    try {
        global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Key not found xkeysib-secret' });
        await assert.rejects(mailer.sendMail({ to: 'x@y.z', subject: 's', html: 'h' }),
            (e) => e.statusCode === 502 && !e.message.includes('xkeysib'));
        global.fetch = async () => { throw new Error('ECONNRESET'); };
        await assert.rejects(mailer.sendMail({ to: 'x@y.z', subject: 's', html: 'h' }), (e) => e.statusCode === 502);
    } finally { global.fetch = origFetch; console.error = origErr; }
});

test('ML-05 · không cấu hình gì → 503 như cũ', async () => {
    resetEnv();
    await assert.rejects(mailer.sendMail({ to: 'x@y.z', subject: 's', html: 'h' }), (e) => e.statusCode === 503);
});

(async () => {
    for (const { name, fn } of queue) {
        try { await fn(); console.log(`  ✓ ${name}`); passed += 1; }
        catch (e) { console.log(`  ✗ ${name}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); failed += 1; }
    }
    ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    console.log(`\n${passed} đạt, ${failed} lỗi\n`);
    process.exit(failed ? 1 : 0);
})();
