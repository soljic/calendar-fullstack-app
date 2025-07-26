import { User } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    userId?: string;
  }
}