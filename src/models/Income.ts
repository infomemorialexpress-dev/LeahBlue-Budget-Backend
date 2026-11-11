import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type PaySchedule = 'weekly' | 'biweekly' | 'twice-monthly' | 'monthly';

export const PAY_SCHEDULES: readonly PaySchedule[] = [
  'weekly',
  'biweekly',
  'twice-monthly',
  'monthly',
];

export interface IIncome extends Document {
  userId: Types.ObjectId;
  sourceName: string;
  amount: number;
  paySchedule: PaySchedule;
  nextPayDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const incomeSchema = new Schema<IIncome>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sourceName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paySchedule: {
      type: String,
      enum: PAY_SCHEDULES,
      required: true,
    },
    nextPayDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Income: Model<IIncome> = mongoose.model<IIncome>('Income', incomeSchema);

