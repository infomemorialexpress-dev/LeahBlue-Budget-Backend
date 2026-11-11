import { Router } from 'express';
import {
  createGoal,
  deleteGoal,
  getGoals,
  updateGoal,
} from '../controllers/goalController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.route('/').get(getGoals).post(createGoal);
router.route('/:id').put(updateGoal).patch(updateGoal).delete(deleteGoal);

export default router;

