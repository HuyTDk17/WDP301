import { Schema, model, InferSchemaType } from 'mongoose';

const ownerDocumentSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['owner', 'customer', 'admin'], default: 'customer' },
    authProvider: { type: String, default: 'local' },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '' },
    city: { type: String, default: '' },

    // Thông tin doanh nghiệp (owner)
    businessName: { type: String, default: '' },
    taxId: { type: String, default: '' },
    businessAddress: { type: String, default: '' },
    businessPhone: { type: String, default: '' },
    legalRepresentative: { type: String, default: '' },
    licenseNumber: { type: String, default: '' },

    // Hồ sơ đăng ký làm chủ sân
    ownerApplicationStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    ownerApplicationDocuments: { type: [ownerDocumentSchema], default: [] },
    ownerApplicationNote: { type: String, default: '' },
    ownerApplicationSubmittedAt: { type: Date, default: null },
    ownerApplicationReviewedAt: { type: Date, default: null },
    ownerApplicationReviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ownerApplicationRejectionReason: { type: String, default: '' },

    // Thông tin ngân hàng
    bankName: { type: String, default: '' },
    bankAccount: { type: String, default: '' },
    bankBin: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankInfoPendingReview: { type: Boolean, default: false },
    bankInfoChangedAt: { type: Date, default: null },
    bankInfoConfirmedAt: { type: Date, default: null },
    bankInfoConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    status: { type: String, enum: ['active', 'locked', 'banned'], default: 'active' },
    banReason: { type: String, default: '' },
    creditBalance: { type: Number, default: 0 },
    emailVerified: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User = model('User', userSchema, 'users');
