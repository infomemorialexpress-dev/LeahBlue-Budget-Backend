import { Router } from 'express';
import {
  createPaycheckPlan,
  getPaycheckPlans,
  getPaycheckPlanSuggestion,
} from '../controllers/paycheckPlanController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/suggest', getPaycheckPlanSuggestion);
router.route('/').get(getPaycheckPlans).post(createPaycheckPlan);

export default router;
