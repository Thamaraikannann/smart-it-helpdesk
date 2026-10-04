// TODO: Implement incidents controller (Tasks 5.5, 6.1, 7.3)
import { Request, Response, NextFunction } from 'express';

export async function createIncident(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // TODO: implement in task 5.5
  next(new Error('Not implemented'));
}

export async function listIncidents(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // TODO: implement in task 6.1
  next(new Error('Not implemented'));
}

export async function getIncidentById(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // TODO: implement in task 6.1
  next(new Error('Not implemented'));
}

export async function updateIncident(
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // TODO: implement in task 7.3
  next(new Error('Not implemented'));
}
