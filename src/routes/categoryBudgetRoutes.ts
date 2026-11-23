import { Router } from 'express';
import {
  createCategoryBudget,
  deleteCategoryBudget,
  getCategoryBudgets,
  syncCategoryBudgets,
  updateCategoryBudget,
} from '../controllers/categoryBudgetController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getCategoryBudgets);
router.post('/', createCategoryBudget);
router.put('/', syncCategoryBudgets);
router.put('/:id', updateCategoryBudget);
router.delete('/:id', deleteCategoryBudget);

export default router;
