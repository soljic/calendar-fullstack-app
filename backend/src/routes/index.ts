import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import calendarRoutes from './calendars';
import eventRoutes from './events';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/calendars', calendarRoutes);
router.use('/events', eventRoutes);

export default router;