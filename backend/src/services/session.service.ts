import jwt, { JwtPayload } from 'jsonwebtoken';
import env from '../config/env';
import ApiError from '../utils/ApiError';
import { User } from '../models/User';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

interface AccessTokenPayload extends JwtPayload {
  sub: string;
  typ: 'access';
}

const parseAccessToken = (token: string): AccessTokenPayload => {
  try {
    const payload = jwt.verify(token, env.accessTokenSecret);
    if (
      typeof payload !== 'object' ||
      payload.typ !== 'access' ||
      typeof payload.sub !== 'string'
    ) {
      throw new ApiError(401, 'Phiên đăng nhập không hợp lệ');
    }
    return payload as AccessTokenPayload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, 'Phiên đăng nhập không hợp lệ');
  }
};

export const signAccessToken = (userId: string): string =>
  jwt.sign({ sub: userId, typ: 'access' }, env.accessTokenSecret, {
    expiresIn: env.accessTokenTtlMinutes * 60,
  });

/**
 * Nạp người dùng từ access token. Trả về 401 nếu token không hợp lệ hoặc tài khoản bị khoá.
 */
export const loadAuthenticatedUser = async (accessToken: string): Promise<AuthenticatedUser> => {
  const payload = parseAccessToken(accessToken);

  const user = await User.findById(payload.sub).lean();
  if (!user || user.status !== 'active') {
    throw new ApiError(401, 'Phiên đăng nhập không hợp lệ');
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone ?? '',
    role: user.role,
    status: user.status,
  };
};

export const hashPassword = async (plain: string): Promise<string> => {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(plain, env.bcryptRounds);
};

export const verifyPassword = async (plain: string, hash: string): Promise<boolean> => {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(plain, hash);
};
