// TODO: Implement dashboard controller (Task 10.1)
import { Request, Response, NextFunction } from 'express';

export async function getDashboard(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // TODO: implement in task 10.1
  next(new Error('Not implemented'));
}
