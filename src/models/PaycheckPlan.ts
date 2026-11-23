import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ICategoryAllocation {
  name: string;
  amount: number;
}

export interface IPaycheckPlan extends Document {
  userId: Types.ObjectId;
  incomeId?: Types.ObjectId;
  payDate: Date;
  paycheckAmount: number;
  reservedBillsTotal: number;
  categoryAllocations: ICategoryAllocation[];
  savingsAllocation: number;
  personalSpending: number;
  remainingUnallocated: number;
  createdAt: Date;
  updatedAt: Date;
}

const paycheckPlanSchema = new Schema<IPaycheckPlan>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    incomeId: {
      type: Schema.Types.ObjectId,
      ref: 'Income',
    },
    payDate: {
      type: Date,
      required: true,
    },
    paycheckAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    reservedBillsTotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    categoryAllocations: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        amount: {
          type: Number,
          required: true,
          default: 0,
          min: 0,
        },
      },
    ],
    savingsAllocation: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    personalSpending: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    remainingUnallocated: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const PaycheckPlan: Model<IPaycheckPlan> = mongoose.model<IPaycheckPlan>(
  'PaycheckPlan',
  paycheckPlanSchema,
);
