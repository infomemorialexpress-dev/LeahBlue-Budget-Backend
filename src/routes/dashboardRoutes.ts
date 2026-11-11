import { Router } from 'express';
import { getDashboardSummary, getWeeklyCheckIn } from '../controllers/dashboardController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getDashboardSummary);
router.get('/summary', getDashboardSummary);
router.get('/weekly-checkin', getWeeklyCheckIn);

export default router;

