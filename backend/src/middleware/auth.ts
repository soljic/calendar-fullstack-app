import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/tokenService';
import { UnauthorizedError } from './errorHandler';
import { User } from '../types';


export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token = req.cookies?.auth_token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token is required');
    }

    const payload = TokenService.verifyJWT(token);
    
    const user = await TokenService.getUserById(payload.userId);
    
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    req.user = user;

    next();
  } catch (error) {
    if (req.cookies?.auth_token) {
      res.clearCookie('auth_token');
    }
    
    next(error);
  }
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token = req.cookies?.auth_token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      token = authHeader && authHeader.split(' ')[1];
    }

    if (token) {
      try {
        const payload = TokenService.verifyJWT(token);
        
        const user = await TokenService.getUserById(payload.userId);
        
        if (user) {
          req.user = user;
        }
      } catch (tokenError) {
        if (req.cookies?.auth_token) {
          res.clearCookie('auth_token');
        }
        console.warn('Optional auth token validation failed:', tokenError);
      }
    }

    next();
  } catch (error) {
    console.warn('Optional auth middleware error:', error);
    next();
  }
};

export const requireCalendarAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user as User;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    await TokenService.ensureValidToken(user.id);

    next();
  } catch (error) {
    console.error('Calendar access check failed:', error);
    next(error);
  }
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user as User;

  if (!user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  next();
};

export const autoRefreshTokens = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user as User;

    if (user) {
      try {
        await TokenService.ensureValidToken(user.id);
      } catch (refreshError) {
        console.warn(`Token refresh failed for user ${user.id}:`, refreshError);
      }
    }

    next();
  } catch (error) {
    console.warn('Auto token refresh error:', error);
    next(); 
  }
};