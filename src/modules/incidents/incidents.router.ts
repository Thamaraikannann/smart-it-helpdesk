// TODO: Wire incident routes (Tasks 5.5, 6.1, 7.3)
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import {
  createIncident,
  listIncidents,
  getIncidentById,
  updateIncident,
} from './incidents.controller';

const router = Router();
router.use(authMiddleware);

// POST   /api/v1/incidents
router.post('/', createIncident);

// GET    /api/v1/incidents
router.get('/', listIncidents);

// GET    /api/v1/incidents/:id
router.get('/:id', getIncidentById);

// PATCH  /api/v1/incidents/:id
router.patch('/:id', updateIncident);

export default router;
