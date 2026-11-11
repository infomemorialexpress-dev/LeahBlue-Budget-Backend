import { NextFunction, Request, Response } from 'express';
import { Goal } from '../models/Goal';
import {
  handleValidationError,
  pickDefinedFields,
  requireUserId,
  requireValidId,
} from '../utils/controllerHelpers';

const GOAL_FIELDS = ['name', 'targetAmount', 'savedAmount', 'targetDate'] as const;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Lists all savings goals belonging to the authenticated user.
 */
export async function getGoals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const goals = await Goal.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json(goals);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a new savings goal for the authenticated user.
 */
export async function createGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const payload = pickDefinedFields(req.body, GOAL_FIELDS);
    if (payload.targetDate === '' || payload.targetDate === null) {
      delete payload.targetDate;
    }

    const goal = await Goal.create({ ...payload, userId });
    res.status(201).json(goal);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Updates a savings goal owned by the authenticated user.
 * Supports direct field edits as well as positive/negative `contribution` adjustments.
 */
export async function updateGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const updates = pickDefinedFields(req.body, GOAL_FIELDS);
    const hasContribution = req.body?.contribution !== undefined;

    if (Object.keys(updates).length === 0 && !hasContribution) {
      res.status(400).json({ message: 'No valid fields provided for update' });
      return;
    }

    const existingGoal = await Goal.findOne({ _id: id, userId });
    if (!existingGoal) {
      res.status(404).json({ message: 'Goal not found' });
      return;
    }

    if (hasContribution) {
      const contribution = Number(req.body.contribution);
      if (!Number.isFinite(contribution)) {
        res.status(400).json({ message: 'Contribution must be a valid number' });
        return;
      }

      const nextSavedAmount = roundCurrency(existingGoal.savedAmount + contribution);
      if (nextSavedAmount < 0) {
        res.status(400).json({ message: 'Saved amount cannot be negative' });
        return;
      }

      updates.savedAmount = nextSavedAmount;
    }

    const unsetFields: Record<string, 1> = {};
    if (updates.targetDate === '' || updates.targetDate === null) {
      delete updates.targetDate;
      unsetFields.targetDate = 1;
    }

    const updateQuery: Record<string, unknown> = {};
    if (Object.keys(updates).length > 0) {
      updateQuery.$set = updates;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }

    const updatedGoal = await Goal.findOneAndUpdate(
      { _id: id, userId },
      updateQuery,
      { new: true, runValidators: true },
    );

    res.status(200).json(updatedGoal);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Deletes a savings goal owned by the authenticated user.
 */
export async function deleteGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const goal = await Goal.findOneAndDelete({ _id: id, userId });
    if (!goal) {
      res.status(404).json({ message: 'Goal not found' });
      return;
    }

    res.status(200).json({ message: 'Goal deleted successfully' });
  } catch (error) {
    next(error);
  }
}

