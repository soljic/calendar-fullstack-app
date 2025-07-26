import { Router } from 'express';
import authRoutes from './auth';
import calendarRoutes, { webhookRouter } from './calendar';

const router = Router();

router.use('/auth', authRoutes);
router.use('/calendar', calendarRoutes);

// Webhook route without authentication (must be before main calendar routes)
router.use('/calendar', webhookRouter);

export default router;