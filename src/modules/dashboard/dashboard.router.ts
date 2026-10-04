// TODO: Wire dashboard routes (Task 10.1)
import { Router } from 'express';
import { getDashboard } from './dashboard.controller';

const router = Router();

// GET /api/v1/dashboard
router.get('/', getDashboard);

export default router;
