import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface ICategoryBudget extends Document {
  userId: Types.ObjectId;
  name: string;
  category: string;
  monthlyTarget: number;
  targetAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const categoryBudgetSchema = new Schema<ICategoryBudget>(
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
    monthlyTarget: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

categoryBudgetSchema.virtual('category').get(function () {
  return this.name;
});
categoryBudgetSchema.virtual('category').set(function (val: string) {
  this.name = val;
});

categoryBudgetSchema.virtual('targetAmount').get(function () {
  return this.monthlyTarget;
});
categoryBudgetSchema.virtual('targetAmount').set(function (val: number) {
  this.monthlyTarget = val;
});

categoryBudgetSchema.set('toJSON', { virtuals: true });
categoryBudgetSchema.set('toObject', { virtuals: true });

export const CategoryBudget: Model<ICategoryBudget> = mongoose.model<ICategoryBudget>(
  'CategoryBudget',
  categoryBudgetSchema,
);
