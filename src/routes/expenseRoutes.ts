import { Router } from 'express';
import {
  createExpense,
  deleteExpense,
  getExpenseById,
  getExpenses,
  updateExpense,
} from '../controllers/expenseController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.route('/').get(getExpenses).post(createExpense);
router
  .route('/:id')
  .get(getExpenseById)
  .put(updateExpense)
  .patch(updateExpense)
  .delete(deleteExpense);

export default router;

