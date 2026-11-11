import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IExpense extends Document {
  userId: Types.ObjectId;
  description: string;
  amount: number;
  category: string;
  date: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    note: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Expense: Model<IExpense> = mongoose.model<IExpense>('Expense', expenseSchema);

