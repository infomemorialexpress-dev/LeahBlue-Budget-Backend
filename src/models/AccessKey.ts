import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAccessKey extends Document {
  token: string;
  email: string;
  customerName?: string;
  isUsed: boolean;
  usedAt?: Date | null;
  expiresAt?: Date | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const accessKeySchema = new Schema<IAccessKey>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      default: 'stan-store',
    },
  },
  {
    timestamps: true,
  },
);

export const AccessKey: Model<IAccessKey> = mongoose.model<IAccessKey>(
  'AccessKey',
  accessKeySchema,
);
