import { FilterQuery } from 'mongoose';
import ApiError from '../utils/ApiError';
import { Venue } from '../models/Venue';
import { Court } from '../models/Court';
import { SlotLock } from '../models/SlotLock';
import { ListVenuesQuery, ListCourtsQuery } from '../validations/venue.validation';
import { activeLockFilter, slotIndexesBetween, timeToMinutes } from '../utils/slots';
import { getCancellationTiers } from './booking.service';

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
 * (ví dụ: "an phát" vẫn khớp "An Phát").
 */
const removeDiacritics = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/**
 * Biến chuỗi tìm kiếm thành regex khớp cả dạng có dấu và không dấu.
 * Mỗi ký tự được mở rộng thành nhóm gồm bản gốc + các biến thể dấu.
 */
const diacriticRegex = (query: string): RegExp => {
  const variants: Record<string, string> = {
    a: 'aáàảãạăắằẳẵặâấầẩẫậ',
    e: 'eéèẻẽẹêếềểễệ',
    i: 'iíìỉĩị',
    o: 'oóòỏõọôốồổỗộơớờởỡợ',
    u: 'uúùủũụưứừửữự',
    y: 'yýỳỷỹỵ',
    d: 'dđ',
  };
  const escaped = removeDiacritics(query)
    .toLowerCase()
    .split('')
    .map((ch) => {
      const pool = variants[ch];
      if (pool) {
        return `[${pool}]`;
      }
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(escaped, 'i');
};

const minutesToTime = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const slotIndexFromMinutes = (mins: number): number => Math.floor(mins / 30);

// ─── #13/#14/#15 — danh sách + tìm kiếm + lọc sân ─────────────────────────

export const listVenues = async (query: ListVenuesQuery) => {
  const filter: FilterQuery<typeof Venue> = {
    status: 'approved',
    isActive: true,
    suspendedByOwnerBan: false,
  };

  if (query.q) {
    const rx = diacriticRegex(query.q);
    filter.$or = [{ name: rx }, { description: rx }, { 'address.street': rx }];
  }
  if (query.sport) {
    filter.sports = query.sport;
  }
  if (query.city) {
    filter['address.city'] = new RegExp(query.city, 'i');
  }
  if (query.district) {
    filter['address.district'] = new RegExp(query.district, 'i');
  }

  // Lọc theo giá và/hoặc giờ còn trống: tìm các sân con thoả điều kiện rồi suy ra venue.
  const filterByPrice = query.minPrice !== undefined || query.maxPrice !== undefined;
  const filterByTime = !!(query.date && query.startTime && query.endTime);
  let availableCourtsByVenue: Map<string, number> | null = null;

  if (filterByPrice || filterByTime) {
    const courtFilter: FilterQuery<typeof Court> = { status: 'active' };
    if (query.sport) {
      courtFilter.type = query.sport;
    }
    if (filterByPrice) {
      courtFilter.pricePerHour = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }

    let courts = await Court.find(courtFilter).select('_id venueId').lean();

    if (filterByTime && query.date && query.startTime && query.endTime) {
      const locks = await SlotLock.find({
        courtId: { $in: courts.map((c) => c._id) },
        date: query.date,
        slotIndex: { $in: slotIndexesBetween(query.startTime, query.endTime) },
        ...activeLockFilter(),
      })
        .select('courtId')
        .lean();
      const busy = new Set(locks.map((l) => String(l.courtId)));
      courts = courts.filter((c) => !busy.has(String(c._id)));

      // Khung giờ phải nằm trọn trong giờ mở cửa (HH:MM so sánh chuỗi được).
      filter['openHours.open'] = { $lte: query.startTime };
      filter['openHours.close'] = { $gte: query.endTime };
    }

    availableCourtsByVenue = new Map();
    for (const court of courts) {
      const key = String(court.venueId);
      availableCourtsByVenue.set(key, (availableCourtsByVenue.get(key) ?? 0) + 1);
    }
    filter._id = { $in: [...new Set(courts.map((c) => c.venueId))] };
  }

  const page = query.page;
  const pageSize = query.pageSize;

  const [total, items] = await Promise.all([
    Venue.countDocuments(filter),
    Venue.find(filter)
      .sort({ rating: -1, reviewCount: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  // Giá thấp nhất trong các sân con đang hoạt động của từng venue.
  const prices = await Court.aggregate<{ _id: unknown; minPrice: number }>([
    { $match: { venueId: { $in: items.map((v) => v._id) }, status: 'active' } },
    { $group: { _id: '$venueId', minPrice: { $min: '$pricePerHour' } } },
  ]);
  const minPriceByVenue = new Map(prices.map((p) => [String(p._id), p.minPrice]));

  return {
    total,
    page,
    pageSize,
    items: items.map((v) => ({
      id: v._id,
      name: v.name,
      description: v.description,
      sports: v.sports,
      address: v.address,
      amenities: v.amenities,
      images: v.images,
      openHours: v.openHours,
      rating: v.rating,
      reviewCount: v.reviewCount,
      minPrice: minPriceByVenue.get(String(v._id)) ?? null,
      // Số sân con khớp bộ lọc giá / giờ trống (null khi không lọc).
      matchingCourts: availableCourtsByVenue?.get(String(v._id)) ?? null,
    })),
  };
};

export const getVenue = async (venueId: string) => {
  const venue = await Venue.findOne({
    _id: venueId,
    status: 'approved',
    isActive: true,
  }).lean();

  if (!venue) {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const courts = await Court.find({ venueId, status: 'active' })
    .sort({ name: 1 })
    .lean();

  const minPrice = courts.length
    ? Math.min(...courts.map((c) => c.pricePerHour))
    : null;

  const cancellationPolicy = await getCancellationTiers();

  return {
    id: venue._id,
    name: venue.name,
    description: venue.description,
    sports: venue.sports,
    address: venue.address,
    amenities: venue.amenities,
    images: venue.images,
    openHours: venue.openHours,
    rules: venue.rules,
    rating: venue.rating,
    reviewCount: venue.reviewCount,
    transferRequiresApproval: venue.transferRequiresApproval,
    minPrice,
    // Tỉ lệ hoàn tiền theo số giờ báo trước khi huỷ.
    cancellationPolicy,
    courts: courts.map((c) => ({
      id: c._id,
      name: c.name,
      type: c.type,
      size: c.size,
      surface: c.surface,
      pricePerHour: c.pricePerHour,
    })),
  };
};

// ─── Sân con (courts) của một venue ────────────────────────────────────────

export const listCourts = async (venueId: string, query: ListCourtsQuery) => {
  const venue = await Venue.findOne({ _id: venueId, status: 'approved', isActive: true }).lean();
  if (!venue) {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const filter: FilterQuery<typeof Court> = { venueId, status: 'active' };
  if (query.type) {
    filter.type = query.type;
  }

  const courts = await Court.find(filter).sort({ name: 1 }).lean();

  // Nếu có truy vấn khung giờ → trả thêm trạng thái còn trống / đã bận.
  let availability: Record<string, unknown> | undefined;
  if (query.date && query.startTime && query.endTime) {
    const startMin = timeToMinutes(query.startTime);
    const endMin = timeToMinutes(query.endTime);
    const slotIndexes: number[] = [];
    for (let m = startMin; m < endMin; m += 30) {
      slotIndexes.push(slotIndexFromMinutes(m));
    }

    const locks = await SlotLock.find({
      courtId: { $in: courts.map((c) => c._id) },
      date: query.date,
      slotIndex: { $in: slotIndexes },
      ...activeLockFilter(),
    }).lean();

    const busy = new Set(locks.map((l) => l.courtId.toString()));
    availability = Object.fromEntries(
      courts.map((c) => [c._id.toString(), !busy.has(c._id.toString())])
    );
  }

  return courts.map((c) => ({
    id: c._id,
    name: c.name,
    type: c.type,
    size: c.size,
    surface: c.surface,
    pricePerHour: c.pricePerHour,
    status: c.status,
    available: availability ? availability[c._id.toString()] : true,
  }));
};

// ─── Khung giờ trống của một court trong ngày ──────────────────────────────

export const courtAvailability = async (venueId: string, courtId: string, date: string) => {
  const court = await Court.findOne({ _id: courtId, venueId, status: 'active' }).lean();
  if (!court) {
    throw new ApiError(404, 'Không tìm thấy sân con');
  }

  const venue = await Venue.findById(venueId).lean();
  if (!venue) {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const open = timeToMinutes(venue.openHours?.open || '05:30');
  const close = timeToMinutes(venue.openHours?.close || '23:00');

  const locks = await SlotLock.find({ courtId, date, ...activeLockFilter() }).lean();
  const bookedIndexes = new Set(locks.map((l) => l.slotIndex));

  const slots: { start: string; end: string; available: boolean }[] = [];
  for (let m = open; m < close; m += 30) {
    slots.push({
      start: minutesToTime(m),
      end: minutesToTime(m + 30),
      available: !bookedIndexes.has(slotIndexFromMinutes(m)),
    });
  }

  return {
    courtId: court._id,
    courtName: court.name,
    date,
    openHours: venue.openHours,
    slots,
  };
};
