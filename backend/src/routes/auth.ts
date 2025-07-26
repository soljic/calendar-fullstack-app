import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/authController';
import { 
  authenticateToken, 
  optionalAuth, 
  requireAuth,
  requireCalendarAccess,
  autoRefreshTokens
} from '../middleware/auth';

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  message: {
    success: false,
    error: {
      type: 'https://httpstatuses.com/429',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many authentication attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const oauthInitRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 3,
  message: {
    success: false,
    error: {
      type: 'https://httpstatuses.com/429',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many OAuth attempts, please try again later',
    },
  },
});

/**
 * @route   GET /auth/google
 * @desc    Initiate Google OAuth flow
 * @access  Public
 */
router.get(
  '/google',
  oauthInitRateLimit,
  AuthController.initiateGoogleAuth
);

/**
 * @route   GET /auth/google/callback
 * @desc    Handle Google OAuth callback
 * @access  Public
 */
router.get(
  '/google/callback',
  authRateLimit,
  AuthController.handleGoogleCallback
);

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access tokens
 * @access  Private
 */
router.post(
  '/refresh',
  authRateLimit,
  authenticateToken,
  AuthController.refreshToken
);

/**
 * @route   POST /auth/logout
 * @desc    Logout user and revoke tokens
 * @access  Private
 */
router.post(
  '/logout',
  optionalAuth, 
  AuthController.logout
);

/**
 * @route   GET /auth/me
 * @desc    Get current user information
 * @access  Private
 */
router.get(
  '/me',
  authenticateToken,
  autoRefreshTokens,
  AuthController.getCurrentUser
);

/**
 * @route   GET /auth/status
 * @desc    Check authentication status
 * @access  Public
 */
router.get(
  '/status',
  optionalAuth,
  AuthController.checkAuthStatus
);

/**
 * @route   GET /auth/error
 * @desc    Handle OAuth errors
 * @access  Public
 */
router.get(
  '/error',
  AuthController.handleAuthError
);

/**
 * @route   GET /auth/validate-calendar
 * @desc    Validate Google Calendar access
 * @access  Private
 */
router.get(
  '/validate-calendar',
  authenticateToken,
  requireCalendarAccess,
  AuthController.validateCalendarAccess
);

export default router;