import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type BillFrequency = 'one-time' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export const BILL_FREQUENCIES: readonly BillFrequency[] = [
  'one-time',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
];

export interface IBill extends Document {
  userId: Types.ObjectId;
  name: string;
  amount: number;
  dueDate: number;
  frequency: BillFrequency;
  category: string;
  isPaid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const billSchema = new Schema<IBill>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Number,
      required: true,
      min: 1,
      max: 31,
      validate: {
        validator: Number.isInteger,
        message: 'dueDate must be a whole day of the month between 1 and 31',
      },
    },
    frequency: {
      type: String,
      enum: BILL_FREQUENCIES,
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const Bill: Model<IBill> = mongoose.model<IBill>('Bill', billSchema);

