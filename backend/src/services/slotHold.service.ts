import mongoose, { ClientSession, Types } from 'mongoose';
import ApiError from '../utils/ApiError';
import { Court } from '../models/Court';
import { Venue } from '../models/Venue';
import { SlotLock } from '../models/SlotLock';
import { PlatformSetting } from '../models/PlatformSetting';
import { CreateSlotHoldInput } from '../validations/slotHold.validation';
import {
  activeLockFilter,
  expiredLockFilter,
  slotIndexesBetween,
  timeToMinutes,
} from '../utils/slots';

/**
 * Cơ chế giữ chỗ tạm (slot hold).
 *
 * Luồng dùng: `createHold` → (xử lý yêu cầu: chờ duyệt, tính phí…) →
 * `createBooking({ holdId })` để chốt, hoặc `releaseHold` để nhả.
 * Nếu không làm gì, hold tự hết hạn sau `quoteTtlMinutes` (cấu hình nền tảng).
 */

const DEFAULT_TTL_MINUTES = 10;
const MAX_TTL_MINUTES = 60;

const minutesToTime = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

const holdTtlMinutes = async (requested?: number): Promise<number> => {
  if (requested) {
    return Math.min(requested, MAX_TTL_MINUTES);
  }
  const setting = await PlatformSetting.findOne({ singleton: 'main' }).lean();
  return setting?.quoteTtlMinutes ?? DEFAULT_TTL_MINUTES;
};

const runInTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
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

interface HoldDto {
  holdId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  expiresAt: Date;
  remainingSeconds: number;
}

type HoldLock = {
  holdId?: Types.ObjectId | null;
  courtId: Types.ObjectId;
  date: string;
  slotIndex: number;
  purpose?: string | null;
  expiresAt?: Date | null;
};

const toDto = (locks: HoldLock[]): HoldDto => {
  const indexes = locks.map((l) => l.slotIndex).sort((a, b) => a - b);
  const expiresAt = locks[0].expiresAt as Date;
  return {
    holdId: String(locks[0].holdId),
    courtId: String(locks[0].courtId),
    date: locks[0].date,
    startTime: minutesToTime(indexes[0] * 30),
    endTime: minutesToTime((indexes[indexes.length - 1] + 1) * 30),
    purpose: locks[0].purpose ?? 'booking',
    expiresAt,
    remainingSeconds: Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)),
  };
};

// ─── Tạo hold ──────────────────────────────────────────────────────────────

export const createHold = async (userId: string, input: CreateSlotHoldInput): Promise<HoldDto> => {
  if (timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) {
    throw new ApiError(400, 'Giờ kết thúc phải sau giờ bắt đầu');
  }

  const court = await Court.findOne({ _id: input.courtId, status: 'active' }).lean();
  if (!court) {
    throw new ApiError(404, 'Không tìm thấy sân con hoặc sân không hoạt động');
  }

  const venue = await Venue.findById(court.venueId).lean();
  if (!venue || venue.status !== 'approved' || !venue.isActive) {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const indexes = slotIndexesBetween(input.startTime, input.endTime);
  const ttl = await holdTtlMinutes(input.ttlMinutes);
  const holdId = new Types.ObjectId();
  const expiresAt = new Date(Date.now() + ttl * 60_000);
  const slotFilter = { courtId: court._id, date: input.date, slotIndex: { $in: indexes } };

  try {
    await runInTransaction(async (session) => {
      // Dọn hold đã hết hạn (TTL của MongoDB chạy mỗi ~60 giây nên có thể còn sót).
      await SlotLock.deleteMany({ ...slotFilter, ...expiredLockFilter() }).session(session);

      const conflicting = await SlotLock.findOne({ ...slotFilter, ...activeLockFilter() }).session(session);
      if (conflicting) {
        throw new ApiError(409, 'Khung giờ đã được đặt hoặc đang được giữ chỗ');
      }

      await SlotLock.insertMany(
        indexes.map((slotIndex) => ({
          courtId: court._id,
          date: input.date,
          slotIndex,
          holdId,
          heldBy: userId,
          purpose: input.purpose,
          expiresAt,
        })),
        { session }
      );
    });
  } catch (error) {
    // Hai yêu cầu cùng lúc: index unique chặn yêu cầu đến sau.
    if (isDuplicateKeyError(error)) {
      throw new ApiError(409, 'Khung giờ đã được đặt hoặc đang được giữ chỗ');
    }
    throw error;
  }

  return {
    holdId: String(holdId),
    courtId: String(court._id),
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    purpose: input.purpose,
    expiresAt,
    remainingSeconds: ttl * 60,
  };
};

// ─── Xem / nhả hold ────────────────────────────────────────────────────────

export const getHold = async (userId: string, holdId: string): Promise<HoldDto> => {
  const locks = await SlotLock.find({ holdId, heldBy: userId, ...activeLockFilter() }).lean();
  if (!locks.length) {
    throw new ApiError(404, 'Không tìm thấy giữ chỗ hoặc đã hết hạn');
  }
  return toDto(locks);
};

export const releaseHold = async (userId: string, holdId: string) => {
  const result = await SlotLock.deleteMany({ holdId, heldBy: userId });
  return { released: result.deletedCount > 0 };
};

// ─── Chốt hold thành khoá của booking (gọi trong transaction tạo booking) ──

/**
 * Kiểm tra hold còn hiệu lực và khớp đúng sân/ngày/khung giờ, rồi xoá các khoá
 * giữ chỗ để booking tạo khoá chính thức trong cùng transaction.
 */
export const consumeHold = async (
  session: ClientSession,
  params: { holdId: string; userId: string; courtId: unknown; date: string; indexes: number[] }
): Promise<void> => {
  const locks = await SlotLock.find({
    holdId: params.holdId,
    heldBy: params.userId,
    ...activeLockFilter(),
  }).session(session);

  if (!locks.length) {
    throw new ApiError(409, 'Giữ chỗ đã hết hạn, vui lòng chọn lại khung giờ');
  }

  const heldIndexes = locks.map((l) => l.slotIndex).sort((a, b) => a - b);
  const wanted = [...params.indexes].sort((a, b) => a - b);
  const sameSlots =
    String(locks[0].courtId) === String(params.courtId) &&
    locks[0].date === params.date &&
    heldIndexes.length === wanted.length &&
    heldIndexes.every((value, i) => value === wanted[i]);

  if (!sameSlots) {
    throw new ApiError(400, 'Giữ chỗ không khớp với sân / khung giờ đang đặt');
  }

  await SlotLock.deleteMany({ holdId: params.holdId }).session(session);
};
