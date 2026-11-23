import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IGoalContribution {
  amount: number;
  date: Date;
}

export interface IGoal extends Document {
  userId: Types.ObjectId;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate?: Date;
  monthlyContribution?: number;
  contributions?: IGoalContribution[];
  createdAt: Date;
  updatedAt: Date;
}

const goalSchema = new Schema<IGoal>(
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
    targetAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    savedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthlyContribution: {
      type: Number,
      default: 0,
      min: 0,
    },
    contributions: [
      {
        amount: {
          type: Number,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    targetDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

export const Goal: Model<IGoal> = mongoose.model<IGoal>('Goal', goalSchema);

