import { FilterQuery, ClientSession } from 'mongoose';
import ApiError from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { Court } from '../models/Court';
import { Venue } from '../models/Venue';
import { User } from '../models/User';
import { Payment } from '../models/Payment';
import { SlotLock } from '../models/SlotLock';
import { Notification } from '../models/Notification';
import { PlatformSetting } from '../models/PlatformSetting';
import { CreateBookingInput, ListBookingsQuery } from '../validations/booking.validation';
import {
  activeLockFilter,
  bookingStartAt,
  expiredLockFilter,
  slotIndexesBetween,
  timeToMinutes,
} from '../utils/slots';
import { consumeHold } from './slotHold.service';

// ─── Helpers ──────────────────────────────────────────────────────────────

const commissionRate = async (): Promise<number> => {
  const setting = await PlatformSetting.findOne({ singleton: 'main' }).lean();
  return setting?.commissionRate ?? 10;
};

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

// ─── Chính sách huỷ (hoàn tiền theo thời gian báo trước) ───────────────────

export interface CancellationTier {
  minLeadHours: number;
  refundRate: number;
}

/** Dùng khi `platformsettings.cancellationTiers` chưa được cấu hình. */
const DEFAULT_CANCELLATION_TIERS: CancellationTier[] = [
  { minLeadHours: 24, refundRate: 1 },
  { minLeadHours: 12, refundRate: 0.7 },
  { minLeadHours: 6, refundRate: 0.5 },
  { minLeadHours: 2, refundRate: 0.2 },
  { minLeadHours: 0, refundRate: 0 },
];

export const getCancellationTiers = async (): Promise<CancellationTier[]> => {
  const setting = await PlatformSetting.findOne({ singleton: 'main' }).lean();
  const tiers = setting?.cancellationTiers?.length ? setting.cancellationTiers : DEFAULT_CANCELLATION_TIERS;
  return tiers
    .map((t) => ({ minLeadHours: t.minLeadHours, refundRate: t.refundRate }))
    .sort((a, b) => b.minLeadHours - a.minLeadHours);
};

interface CancellationQuote {
  cancellable: boolean;
  /** Lý do không huỷ được (khi `cancellable = false`). */
  reason: string | null;
  leadHours: number;
  refundRate: number;
  refundAmount: number;
  cancellationFee: number;
  tiers: CancellationTier[];
}

const buildCancellationQuote = (
  booking: { status: string; date: string; startTime: string; amount: number },
  tiers: CancellationTier[]
): CancellationQuote => {
  const leadHours = (bookingStartAt(booking.date, booking.startTime).getTime() - Date.now()) / 3_600_000;
  const base = { leadHours: Math.round(leadHours * 10) / 10, tiers };
  const blocked = (reason: string): CancellationQuote => ({
    ...base,
    cancellable: false,
    reason,
    refundRate: 0,
    refundAmount: 0,
    cancellationFee: 0,
  });

  if (booking.status === 'cancelled') return blocked('Đặt sân đã bị huỷ trước đó');
  if (booking.status === 'completed' || booking.status === 'no_show') {
    return blocked('Không thể huỷ đặt sân đã kết thúc');
  }
  if (leadHours <= 0) return blocked('Đã qua giờ bắt đầu, không thể huỷ đặt sân');

  // Chưa thanh toán thì không có gì để hoàn, cũng không mất phí.
  if (booking.status === 'awaiting_payment') {
    return { ...base, cancellable: true, reason: null, refundRate: 0, refundAmount: 0, cancellationFee: 0 };
  }

  const tier = tiers.find((t) => leadHours >= t.minLeadHours);
  const refundRate = tier?.refundRate ?? 0;
  const refundAmount = Math.round(booking.amount * refundRate);

  return {
    ...base,
    cancellable: true,
    reason: null,
    refundRate,
    refundAmount,
    cancellationFee: booking.amount - refundAmount,
  };
};

// ─── Tạo booking (giữ slot chống double-booking) ──────────────────────────

export const createBooking = async (customerId: string, input: CreateBookingInput) => {
  if (timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) {
    throw new ApiError(400, 'Giờ kết thúc phải sau giờ bắt đầu');
  }

  if (bookingStartAt(input.date, input.startTime).getTime() <= Date.now()) {
    throw new ApiError(400, 'Không thể đặt khung giờ đã qua');
  }

  const court = await Court.findOne({ _id: input.courtId, status: 'active' }).lean();
  if (!court) {
    throw new ApiError(404, 'Không tìm thấy sân con hoặc sân không hoạt động');
  }

  const venue = await Venue.findById(court.venueId).lean();
  if (!venue || venue.status !== 'approved' || !venue.isActive) {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const open = venue.openHours?.open || '05:30';
  const close = venue.openHours?.close || '23:00';
  if (
    timeToMinutes(input.startTime) < timeToMinutes(open) ||
    timeToMinutes(input.endTime) > timeToMinutes(close)
  ) {
    throw new ApiError(400, `Sân chỉ mở cửa từ ${open} đến ${close}`);
  }

  const duration = (timeToMinutes(input.endTime) - timeToMinutes(input.startTime)) / 60;
  const rate = await commissionRate();
  const amount = Math.round(court.pricePerHour * duration);
  const ownerCommission = Math.round((amount * rate) / 100);

  const indexes = slotIndexesBetween(input.startTime, input.endTime);
  const slotFilter = { courtId: court._id, date: input.date, slotIndex: { $in: indexes } };

  let result;
  try {
    result = await Booking.startSession().then((session) =>
      withSession(session, async (s) => {
        if (input.holdId) {
          // Đã giữ chỗ trước → chốt hold thành khoá chính thức.
          await consumeHold(s, {
            holdId: input.holdId,
            userId: customerId,
            courtId: court._id,
            date: input.date,
            indexes,
          });
        }

        // Dọn hold hết hạn, rồi kiểm tra + khoá slot trong transaction để chống double-booking.
        await SlotLock.deleteMany({ ...slotFilter, ...expiredLockFilter() }).session(s);

        const conflicting = await SlotLock.findOne({ ...slotFilter, ...activeLockFilter() }).session(s);
        if (conflicting) {
          throw new ApiError(409, 'Khung giờ đã được đặt, vui lòng chọn khung khác');
        }

        const booking = await Booking.create(
          [
            {
              customerId,
              venueId: venue._id,
              courtId: court._id,
              venueName: venue.name,
              courtName: court.name,
              date: input.date,
              startTime: input.startTime,
              endTime: input.endTime,
              duration,
              sport: venue.sports?.[0] ?? '',
              notes: input.notes ?? '',
              amount,
              ownerCommission,
              commissionRate: rate,
              status: 'confirmed',
              paymentMethod: 'bank_transfer',
              originalPaidAmount: amount,
            },
          ],
          { session: s }
        ).then((docs) => docs[0]);

        await SlotLock.insertMany(
          indexes.map((slotIndex) => ({
            courtId: court._id,
            date: input.date,
            slotIndex,
            bookingId: booking._id,
          })),
          { session: s }
        );

        await Notification.create(
          [
            {
              userId: customerId,
              type: 'booking',
              icon: '📅',
              title: 'Đặt sân thành công',
              message: `${venue.name} — ${court.name}, ${input.date} ${input.startTime}-${input.endTime}`,
              link: '/bookings',
              read: false,
            },
          ],
          { session: s }
        );

        return booking;
      })
    );
  } catch (error) {
    // Hai người đặt cùng lúc: index unique chặn người đến sau.
    if (isDuplicateKeyError(error)) {
      throw new ApiError(409, 'Khung giờ đã được đặt, vui lòng chọn khung khác');
    }
    throw error;
  }

  return {
    id: result._id,
    venueName: result.venueName,
    courtName: result.courtName,
    date: result.date,
    startTime: result.startTime,
    endTime: result.endTime,
    amount: result.amount,
    status: result.status,
  };
};

// ─── Danh sách booking của khách ───────────────────────────────────────────

export const listMyBookings = async (customerId: string, query: ListBookingsQuery) => {
  const filter: FilterQuery<typeof Booking> = { customerId };
  if (query.status) {
    filter.status = query.status;
  }

  const page = query.page;
  const pageSize = query.pageSize;

  const [total, items] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  return {
    total,
    page,
    pageSize,
    items: items.map((b) => ({
      id: b._id,
      venueName: b.venueName,
      courtName: b.courtName,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      amount: b.amount,
      status: b.status,
      transferCount: b.transferCount,
    })),
  };
};

export const getMyBooking = async (customerId: string, bookingId: string) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId }).lean();
  if (!booking) {
    throw new ApiError(404, 'Không tìm thấy đặt sân');
  }

  // Thông tin thêm để hiển thị hoá đơn.
  const [venue, customer] = await Promise.all([
    Venue.findById(booking.venueId).select('address').lean(),
    User.findById(customerId).select('name email phone').lean(),
  ]);

  return {
    id: booking._id,
    venueId: booking.venueId,
    courtId: booking.courtId,
    venueName: booking.venueName,
    courtName: booking.courtName,
    venueAddress: venue?.address ?? null,
    customer: customer
      ? { name: customer.name, email: customer.email, phone: customer.phone ?? '' }
      : null,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    duration: booking.duration,
    sport: booking.sport,
    notes: booking.notes,
    amount: booking.amount,
    serviceFee: booking.serviceFee,
    discountAmount: booking.discountAmount,
    creditApplied: booking.creditApplied,
    ownerCommission: booking.ownerCommission,
    status: booking.status,
    paymentMethod: booking.paymentMethod,
    cancellationReason: booking.cancellationReason,
    refundAmount: booking.refundAmount,
    cancellationFee: booking.cancellationFee,
    transferCount: booking.transferCount,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
};

// ─── Huỷ booking ───────────────────────────────────────────────────────────

/** Xem trước số tiền hoàn / phí huỷ nếu huỷ ngay bây giờ. */
export const getCancellationQuote = async (customerId: string, bookingId: string) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId }).lean();
  if (!booking) {
    throw new ApiError(404, 'Không tìm thấy đặt sân');
  }
  return buildCancellationQuote(booking, await getCancellationTiers());
};

export const cancelBooking = async (
  customerId: string,
  bookingId: string,
  reason?: string
) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId }).lean();
  if (!booking) {
    throw new ApiError(404, 'Không tìm thấy đặt sân');
  }

  const quote = buildCancellationQuote(booking, await getCancellationTiers());
  if (!quote.cancellable) {
    throw new ApiError(409, quote.reason ?? 'Không thể huỷ đặt sân này');
  }

  const cancellationReason = reason ?? 'Khách tự huỷ';
  const venue = await Venue.findById(booking.venueId).select('ownerId').lean();

  const updated = await Booking.startSession().then((session) =>
    withSession(session, async (s) => {
      const doc = await Booking.findOneAndUpdate(
        // Điều kiện status chặn trường hợp bấm huỷ hai lần cùng lúc.
        { _id: bookingId, customerId, status: booking.status },
        {
          status: 'cancelled',
          cancellationReason,
          refundAmount: quote.refundAmount,
          cancellationFee: quote.cancellationFee,
        },
        { new: true, session: s }
      ).lean();

      if (!doc) {
        throw new ApiError(409, 'Đặt sân vừa được cập nhật, vui lòng tải lại');
      }

      // Nhả slot đã khoá.
      await SlotLock.deleteMany({ bookingId }).session(s);

      if (quote.refundAmount > 0) {
        await Payment.create(
          [
            {
              bookingId,
              purpose: 'cancellation_refund',
              method: booking.paymentMethod,
              amount: quote.refundAmount,
              status: 'refund_requested',
              orderRef: `RF${Date.now().toString(36).toUpperCase()}`,
              refundReason: cancellationReason,
              refundOwnerId: venue?.ownerId ?? null,
            },
          ],
          { session: s }
        );
      }

      const refundText =
        quote.refundAmount > 0
          ? `Hoàn ${quote.refundAmount.toLocaleString('vi-VN')}đ (${Math.round(quote.refundRate * 100)}%).`
          : 'Không được hoàn tiền theo chính sách huỷ.';

      await Notification.create(
        [
          {
            userId: customerId,
            type: 'booking',
            icon: '❌',
            title: 'Đã huỷ đặt sân',
            message: `${booking.venueName} — ${booking.courtName}, ${booking.date} ${booking.startTime}-${booking.endTime}. ${refundText}`,
            link: '/bookings',
            read: false,
          },
        ],
        { session: s }
      );

      return doc;
    })
  );

  return {
    id: updated._id,
    status: updated.status,
    cancellationReason: updated.cancellationReason,
    refundRate: quote.refundRate,
    refundAmount: updated.refundAmount,
    cancellationFee: updated.cancellationFee,
  };
};

// ─── Helper chạy transaction ───────────────────────────────────────────────

const withSession = async <T>(
  session: ClientSession,
  fn: (session: ClientSession) => Promise<T>
): Promise<T> => {
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
