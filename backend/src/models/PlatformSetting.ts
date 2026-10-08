import { Schema, model } from 'mongoose';

const tierSchema = new Schema(
  {
    minLeadHours: { type: Number, required: true },
    rate: { type: Number, default: 0 },
  },
  { _id: false }
);

const transferFeeTierSchema = new Schema(
  {
    minLeadHours: { type: Number, required: true },
    sameVenueRate: { type: Number, default: 0 },
    sameOwnerRate: { type: Number, default: 0 },
    crossOwnerRate: { type: Number, default: 0 },
  },
  { _id: false }
);

const cancellationTierSchema = new Schema(
  {
    minLeadHours: { type: Number, required: true },
    refundRate: { type: Number, default: 1 },
  },
  { _id: false }
);

const platformSettingSchema = new Schema(
  {
    singleton: { type: String, default: 'main' },
    platformName: { type: String, default: 'ESport360' },
    supportEmail: { type: String, default: '' },
    commissionRate: { type: Number, default: 10 },
    gatewayFeeRate: { type: Number, default: 0.015 },

    // Transfer
    transferEnabled: { type: Boolean, default: true },
    transferMinLeadTimeHours: { type: Number, default: 2 },
    maxTransfersPerBooking: { type: Number, default: 1 },
    quoteTtlMinutes: { type: Number, default:10 },
    ownerApprovalTimeoutMinutes: { type: Number, default: 30 },
    transferFeeTiers: { type: [transferFeeTierSchema], default: [] },
    transferFeeMin: { type: Number, default: 5000 },
    transferFeeMax: { type: Number, default: 100000 },
    transferFixedFeeT5: { type: Number, default: 10000 },
    compensationTiers: { type: [tierSchema], default: [] },
    maxRefundRatio: { type: Number, default: 0.5 },
    refundToCreditEnabled: { type: Boolean, default: true },
    cancellationTiers: { type: [cancellationTierSchema], default: [] },

    // Ngân hàng nhận tiền của nền tảng
    bankName: { type: String, default: '' },
    bankBin: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankTransferWindowMinutes: { type: Number, default: 30 },

    // Hoa hồng / đối soát
    commissionCustomerSharePct: { type: Number, default: 0 },
    commissionDueDays: { type: Number, default: 7 },
    commissionGraceDays: { type: Number, default: 3 },
    commissionAutoIssueEnabled: { type: Boolean, default: true },
    commissionBlockEnabled: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

export const PlatformSetting = model('PlatformSetting', platformSettingSchema, 'platformsettings');
