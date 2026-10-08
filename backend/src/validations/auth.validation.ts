import { z } from 'zod';

const phoneRegex = /^0(3|5|7|8|9)\d{8}$/;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự').max(120, 'Họ tên tối đa 120 ký tự'),
  email: z.string().trim().email('Email không hợp lệ'),
  phone: z.string().trim().regex(phoneRegex, 'Số điện thoại không hợp lệ (định dạng 0xxxxxxxxx)'),
  password: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự').max(72, 'Mật khẩu tối đa 72 ký tự'),
  role: z.enum(['customer', 'owner']).default('customer'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ'),
  password: z.string().min(1, 'Mật khẩu là bắt buộc'),
});

export type LoginInput = z.infer<typeof loginSchema>;
