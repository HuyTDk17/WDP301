const assert = require('assert');
const { connect, disconnect, test, summary, call, makeUser, makeVenueWithCourt, makeConfirmedBooking, futureSlot } = require('./_helpers');
const Booking = require('../../models/Booking');
const bookingController = require('../../controllers/bookingController');
const PlayerMatch = require('../../models/PlayerMatch');
const playerMatchController = require('../../controllers/playerMatchController');

async function main() {
    await connect();
    const customer = await makeUser();
    const otherCustomer = await makeUser();
    const owner = await makeUser({ role: 'owner' });
    const { venue, court } = await makeVenueWithCourt({ ownerId: owner._id });

    await test('INV-01 · chủ booking hoàn tất xem được hóa đơn với tổng tiền đã chốt', async () => {
        const booking = await makeConfirmedBooking({ customer, venue, court });
        booking.status = 'completed';
        await booking.save();

        const response = await call(bookingController.getInvoice, { params: { id: booking._id }, user: customer });
        assert.strictEqual(response.statusCode, 200);
        assert.strictEqual(response.body.invoice.total, booking.amount + booking.serviceFee - booking.discountAmount);
        assert.match(response.body.invoice.code, /^E360-\d{4}-[A-F0-9]{8}$/);
    });

    await test('INV-02 · khách khác không xem được hóa đơn', async () => {
        const booking = await Booking.findOne({ customerId: customer._id, status: 'completed' });
        const response = await call(bookingController.getInvoice, { params: { id: booking._id }, user: otherCustomer });
        assert.strictEqual(response.statusCode, 403);
    });

    await test('INV-03 · booking chưa hoàn tất chưa được cấp hóa đơn', async () => {
        const booking = await makeConfirmedBooking({ customer, venue, court, hoursFromNow: 80 });
        const response = await call(bookingController.getInvoice, { params: { id: booking._id }, user: customer });
        assert.strictEqual(response.statusCode, 409);
    });

    const slot = futureSlot(96);
    let match;
    await test('MATCH-01 · khách tạo trận và tự được ghi danh', async () => {
        const response = await call(playerMatchController.createMatch, {
            user: customer,
            body: { sport: 'Cầu lông', area: 'Cầu Giấy, Hà Nội', ...slot, maxPlayers: 2, description: 'Trình độ trung bình' },
        });
        assert.strictEqual(response.statusCode, 201);
        assert.strictEqual(response.body.match.players.length, 1);
        assert.strictEqual(String(response.body.match.players[0].userId._id), String(customer._id));
        match = response.body.match;
    });

    await test('MATCH-02 · lọc danh sách theo khu vực và môn thể thao', async () => {
        const response = await call(playerMatchController.listMatches, { query: { area: 'Cầu Giấy', sport: 'Cầu lông' }, user: customer });
        assert.ok(response.body.matches.some((item) => String(item._id) === String(match._id)));
    });

    await test('MATCH-03 · chỉ một khách có thể tham gia suất cuối', async () => {
        const [first, second] = await Promise.all([
            call(playerMatchController.joinMatch, { params: { id: match._id }, user: otherCustomer }),
            call(playerMatchController.joinMatch, { params: { id: match._id }, user: await makeUser() }),
        ]);
        assert.deepStrictEqual([first.statusCode, second.statusCode].sort(), [200, 409]);
        const saved = await PlayerMatch.findById(match._id);
        assert.strictEqual(saved.players.length, 2);
        assert.strictEqual(saved.status, 'full');
    });

    await test('MATCH-04 · người chơi không thể tham gia hai lần', async () => {
        const matchWithSpace = await PlayerMatch.create({
            creatorId: customer._id, sport: 'Tennis', area: 'Ba Đình', ...futureSlot(120),
            maxPlayers: 4, players: [{ userId: customer._id }],
        });
        const first = await call(playerMatchController.joinMatch, { params: { id: matchWithSpace._id }, user: otherCustomer });
        const second = await call(playerMatchController.joinMatch, { params: { id: matchWithSpace._id }, user: otherCustomer });
        assert.strictEqual(first.statusCode, 200);
        assert.strictEqual(second.statusCode, 409);
    });

    const ok = summary();
    await disconnect();
    process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });