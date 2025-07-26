import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { TokenService } from '../services/tokenService';
import { sendSuccess, sendCreated } from '../utils/response';
import { 
  BadRequestError, 
  UnauthorizedError, 
  InternalServerError 
} from '../middleware/errorHandler';
import { User, JwtPayload, ApiResponse } from '../types';
import { env, isDevelopment } from '../config/environment';

export class AuthController {
  static async initiateGoogleAuth(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const state = TokenService.generateStateToken();
      await TokenService.storeStateToken(state);

      console.log('Initiating Google OAuth flow with state:', state);

      (req.session as any).oauthState = state;

      passport.authenticate('google', {
        scope: [
          'profile',
          'email',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ],
        state: state,
        accessType: 'offline',
        prompt: 'consent'
      })(req, res, next);

    } catch (error) {
      console.error('Failed to initiate Google OAuth:', error);
      next(new InternalServerError('Failed to initiate authentication'));
    }
  }

  static async handleGoogleCallback(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const state = req.query.state as string;
      const sessionState = (req.session as any).oauthState;

      if (!state || !sessionState || state !== sessionState) {
        console.warn('OAuth state mismatch or missing');
        return next(new BadRequestError('Invalid OAuth state parameter'));
      }

      const isValidState = await TokenService.validateStateToken(state);
      if (!isValidState) {
        console.warn('Invalid or expired OAuth state token');
        return next(new BadRequestError('Invalid or expired OAuth state'));
      }

      delete (req.session as any).oauthState;

      passport.authenticate('google', { session: false }, async (err, user: User) => {
        try {
          if (err) {
            console.error('Google OAuth authentication error:', err);
            return next(new UnauthorizedError('Authentication failed'));
          }

          if (!user) {
            console.warn('No user returned from Google OAuth');
            return next(new UnauthorizedError('Authentication failed'));
          }

          const jwtPayload: JwtPayload = {
            userId: user.id,
            email: user.email,
          };

          const jwtToken = TokenService.generateJWT(jwtPayload);

          const cookieOptions = {
            httpOnly: true,
            secure: !isDevelopment,
            sameSite: 'lax' as const,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
          };

          res.cookie('auth_token', jwtToken, cookieOptions);

          console.log(`User authenticated successfully: ${user.email}`);

          const redirectUrl = isDevelopment 
            ? 'http://localhost:3000/auth/success'
            : `${env.FRONTEND_URL}/auth/success`;

          res.redirect(redirectUrl);

        } catch (callbackError) {
          console.error('OAuth callback processing error:', callbackError);
          next(new InternalServerError('Failed to process authentication'));
        }
      })(req, res, next);

    } catch (error) {
      console.error('Google OAuth callback error:', error);
      next(new InternalServerError('Authentication callback failed'));
    }
  }

  static async refreshToken(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      console.log(`Refreshing tokens for user: ${user.email}`);

      const refreshedTokens = await TokenService.refreshGoogleToken(user.id);

      const jwtPayload: JwtPayload = {
        userId: user.id,
        email: user.email,
      };

      const newJwtToken = TokenService.generateJWT(jwtPayload);

      const cookieOptions = {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'lax' as const,
        maxAge: 7 * 24 * 60 * 60 * 1000, 
        path: '/'
      };

      res.cookie('auth_token', newJwtToken, cookieOptions);

      sendSuccess(res, {
        message: 'Tokens refreshed successfully',
        expires_at: refreshedTokens.expires_at
      });

    } catch (error) {
      console.error('Token refresh error:', error);
      
      if (error instanceof UnauthorizedError) {
        res.clearCookie('auth_token');
        next(error);
      } else {
        next(new InternalServerError('Failed to refresh tokens'));
      }
    }
  }

  static async logout(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user as User;

      if (user) {
        console.log(`Logging out user: ${user.email}`);
        
        try {
          await TokenService.revokeTokens(user.id);
        } catch (revokeError) {
          console.warn('Failed to revoke tokens during logout:', revokeError);
        }
      }

      res.clearCookie('auth_token');

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
        }
      });

      sendSuccess(res, { message: 'Logged out successfully' });

    } catch (error) {
      console.error('Logout error:', error);
      
      res.clearCookie('auth_token');
      
      next(new InternalServerError('Logout failed'));
    }
  }

  static async getCurrentUser(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user as User;

      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const userInfo = {
        id: user.id,
        email: user.email,
        name: user.name,
        picture_url: user.picture_url,
        created_at: user.created_at,
        updated_at: user.updated_at
      };

      sendSuccess(res, userInfo);

    } catch (error) {
      console.error('Get current user error:', error);
      next(new InternalServerError('Failed to get user information'));
    }
  }

  static async checkAuthStatus(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user as User;
      
      const status = {
        authenticated: !!user,
        user: user ? {
          id: user.id,
          email: user.email,
          name: user.name,
          picture_url: user.picture_url
        } : null
      };

      sendSuccess(res, status);

    } catch (error) {
      console.error('Auth status check error:', error);
      next(new InternalServerError('Failed to check authentication status'));
    }
  }

  static async handleAuthError(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const error = req.query.error as string;
      const errorDescription = req.query.error_description as string;

      console.warn('OAuth error:', { error, errorDescription });

      res.clearCookie('auth_token');

      const redirectUrl = isDevelopment 
        ? `http://localhost:3000/auth/error?error=${encodeURIComponent(error || 'unknown')}`
        : `${env.FRONTEND_URL}/auth/error?error=${encodeURIComponent(error || 'unknown')}`;

      res.redirect(redirectUrl);

    } catch (error) {
      console.error('Auth error handler error:', error);
      next(new InternalServerError('Authentication error handling failed'));
    }
  }

  static async validateCalendarAccess(
    req: Request, 
    res: Response, 
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user as User;

      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const accessToken = await TokenService.ensureValidToken(user.id);

      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      await calendar.calendarList.list({ maxResults: 1 });

      sendSuccess(res, { 
        message: 'Google Calendar access is valid',
        hasAccess: true
      });

    } catch (error) {
      console.error('Calendar access validation error:', error);
      
      sendSuccess(res, { 
        message: 'Google Calendar access is invalid or expired',
        hasAccess: false
      });
    }
  }
}