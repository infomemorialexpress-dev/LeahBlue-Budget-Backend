import { Router } from 'express';
import {
  createBill,
  deleteBill,
  getBills,
  markBillAsPaid,
  updateBill,
} from '../controllers/billController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.route('/').get(getBills).post(createBill);
router.route('/:id').put(updateBill).patch(updateBill).delete(deleteBill);
router.patch('/:id/pay', markBillAsPaid);

export default router;

