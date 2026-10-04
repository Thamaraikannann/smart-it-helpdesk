// TODO: Implement audit controller (Task 9.1)
import { Request, Response, NextFunction } from 'express';

export async function getAuditLog(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // TODO: implement in task 9.1
  next(new Error('Not implemented'));
}
