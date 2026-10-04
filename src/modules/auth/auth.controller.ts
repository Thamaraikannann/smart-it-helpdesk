import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { ValidationError } from '../../lib/errors';

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as Record<string, unknown>;

    if (typeof email !== 'string' || email.trim() === '') {
      throw new ValidationError('Validation failed', [
        { field: 'email', message: 'Email is required' },
      ]);
    }

    if (typeof password !== 'string' || password === '') {
      throw new ValidationError('Validation failed', [
        { field: 'password', message: 'Password is required' },
      ]);
    }

    const result = await authService.login(email.trim(), password);

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
