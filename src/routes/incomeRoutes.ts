import { Router } from 'express';
import {
  createIncome,
  deleteIncome,
  getIncomeById,
  getIncomes,
  updateIncome,
} from '../controllers/incomeController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.route('/').get(getIncomes).post(createIncome);
router
  .route('/:id')
  .get(getIncomeById)
  .put(updateIncome)
  .patch(updateIncome)
  .delete(deleteIncome);

export default router;

