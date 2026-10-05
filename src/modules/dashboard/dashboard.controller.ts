import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';

const dashboardService = new DashboardService();

/**
 * GET /api/v1/dashboard
 * Requirement 9 — Admin / Support_Agent only (enforced in router via requireRole).
 */
export async function getDashboard(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await dashboardService.getDashboardMetrics();
    res.status(200).json({ data: metrics });
  } catch (err) {
    next(err);
  }
}
