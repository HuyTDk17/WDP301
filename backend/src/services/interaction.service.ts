import ApiError from '../utils/ApiError';
import { Review } from '../models/Review';
import { Favorite } from '../models/Favorite';
import { Notification } from '../models/Notification';
import { Venue } from '../models/Venue';
import { CreateReviewInput } from '../validations/common.validation';

// ─── Đánh giá sân (#review) ────────────────────────────────────────────────

export const createReview = async (userId: string, input: CreateReviewInput) => {
  const venue = await Venue.findById(input.venueId).lean();
  if (!venue || venue.status !== 'approved') {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const review = await Review.create({
    venueId: input.venueId,
    userId,
    rating: input.rating,
    comment: input.comment ?? '',
  });

  // Cập nhật rating trung bình + số lượt đánh giá của sân.
  const stats = await Review.aggregate([
    { $match: { venueId: venue._id } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  if (stats.length) {
    await Venue.updateOne(
      { _id: venue._id },
      { rating: Math.round(stats[0].avg * 10) / 10, reviewCount: stats[0].count }
    );
  }

  return { id: review._id, rating: review.rating, comment: review.comment };
};

export const listReviews = async (venueId: string) => {
  const reviews = await Review.find({ venueId })
    .sort({ createdAt: -1 })
    .populate('userId', 'name avatar')
    .lean();

  return reviews.map((r) => ({
    id: r._id,
    rating: r.rating,
    comment: r.comment,
    helpful: r.helpful,
    createdAt: r.createdAt,
    user: r.userId,
  }));
};

// ─── Yêu thích sân (#favorite) ─────────────────────────────────────────────

export const addFavorite = async (userId: string, venueId: string) => {
  const venue = await Venue.findById(venueId).lean();
  if (!venue || venue.status !== 'approved') {
    throw new ApiError(404, 'Không tìm thấy sân');
  }

  const existing = await Favorite.findOne({ userId, venueId });
  if (existing) {
    return { id: existing._id, alreadyFavorited: true };
  }

  const fav = await Favorite.create({ userId, venueId });
  return { id: fav._id, alreadyFavorited: false };
};

export const removeFavorite = async (userId: string, venueId: string) => {
  const result = await Favorite.deleteOne({ userId, venueId });
  return { removed: result.deletedCount > 0 };
};

export const listFavorites = async (userId: string) => {
  const favorites = await Favorite.find({ userId })
    .sort({ createdAt: -1 })
    .populate('venueId', 'name address images rating reviewCount')
    .lean();

  return favorites.map((f) => f.venueId);
};

// ─── Thông báo (#notification) ─────────────────────────────────────────────

export const listNotifications = async (userId: string, unreadOnly: boolean) => {
  const filter = unreadOnly ? { userId, read: false } : { userId };
  const [total, unread, items] = await Promise.all([
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, read: false }),
    Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  return {
    total,
    unread,
    items: items.map((n) => ({
      id: n._id,
      type: n.type,
      icon: n.icon,
      title: n.title,
      message: n.message,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt,
    })),
  };
};

export const markNotificationsRead = async (
  userId: string,
  ids?: string[],
  all?: boolean
) => {
  if (all) {
    const result = await Notification.updateMany({ userId, read: false }, { read: true });
    return { updated: result.modifiedCount };
  }

  if (ids?.length) {
    const result = await Notification.updateMany(
      { userId, _id: { $in: ids } },
      { read: true }
    );
    return { updated: result.modifiedCount };
  }

  return { updated: 0 };
};
