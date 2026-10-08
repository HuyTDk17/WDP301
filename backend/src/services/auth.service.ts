import ApiError from '../utils/ApiError';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { Favorite } from '../models/Favorite';
import { Review } from '../models/Review';
import { LoginInput, RegisterInput } from '../validations/auth.validation';
import { hashPassword, signAccessToken, verifyPassword } from './session.service';

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  avatar: string;
  creditBalance: number;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: AuthUserDto;
}

const toDto = (user: {
  _id: unknown;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  avatar?: string;
  creditBalance?: number;
}): AuthUserDto => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  phone: user.phone ?? '',
  role: user.role,
  avatar: user.avatar ?? '',
  creditBalance: user.creditBalance ?? 0,
});

export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new ApiError(409, 'Email đã được đăng ký');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await User.create({
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: passwordHash,
    role: input.role,
    status: 'active',
    emailVerified: true,
  });

  return {
    accessToken: signAccessToken(user._id.toString()),
    expiresIn: 60 * 60,
    user: toDto(user),
  };
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const user = await User.findOne({ email: input.email }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Email hoặc mật khẩu không đúng');
  }

  const valid = await verifyPassword(input.password, user.password);
  if (!valid) {
    throw new ApiError(401, 'Email hoặc mật khẩu không đúng');
  }

  if (user.status !== 'active') {
    throw new ApiError(403, 'Tài khoản đã bị khoá');
  }

  return {
    accessToken: signAccessToken(user._id.toString()),
    expiresIn: 60 * 60,
    user: toDto(user),
  };
};

// ─── Hồ sơ cá nhân ─────────────────────────────────────────────────────────

/** Thông tin cá nhân đầy đủ + vài con số tổng quan về hoạt động của người dùng. */
export const getProfile = async (userId: string) => {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new ApiError(404, 'Không tìm thấy người dùng');
  }

  const [byStatus, favorites, reviews] = await Promise.all([
    Booking.aggregate<{ _id: string; count: number; amount: number }>([
      { $match: { customerId: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    Favorite.countDocuments({ userId }),
    Review.countDocuments({ userId }),
  ]);

  const stat = (status: string) => byStatus.find((s) => s._id === status);

  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      city: user.city ?? '',
      creditBalance: user.creditBalance ?? 0,
      emailVerified: user.emailVerified ?? false,
      authProvider: user.authProvider ?? 'local',
      ownerApplicationStatus: user.ownerApplicationStatus ?? 'none',
      businessName: user.businessName ?? '',
      createdAt: user.createdAt,
    },
    stats: {
      totalBookings: byStatus.reduce((sum, s) => sum + s.count, 0),
      confirmedBookings: stat('confirmed')?.count ?? 0,
      completedBookings: stat('completed')?.count ?? 0,
      cancelledBookings: stat('cancelled')?.count ?? 0,
      // Chỉ tính các lượt đã chơi xong.
      totalSpent: stat('completed')?.amount ?? 0,
      favorites,
      reviews,
    },
  };
};
