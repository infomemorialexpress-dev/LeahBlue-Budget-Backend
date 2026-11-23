import { Router } from 'express';
import authRoutes from './authRoutes';
import billRoutes from './billRoutes';
import categoryBudgetRoutes from './categoryBudgetRoutes';
import dashboardRoutes from './dashboardRoutes';
import expenseRoutes from './expenseRoutes';
import goalRoutes from './goalRoutes';
import healthRoutes from './healthRoutes';
import incomeRoutes from './incomeRoutes';
import paycheckPlanRoutes from './paycheckPlanRoutes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/incomes', incomeRoutes);
router.use('/expenses', expenseRoutes);
router.use('/bills', billRoutes);
router.use('/category-budgets', categoryBudgetRoutes);
router.use('/goals', goalRoutes);
router.use('/paycheck-plans', paycheckPlanRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;

