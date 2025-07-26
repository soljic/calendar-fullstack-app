import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
const session = require('express-session');
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { env, isDevelopment } from './config/environment';
import { initializeDatabase } from './config/database';
import { configurePassport } from './config/passport';
import { errorHandler, requestLogger } from './middleware';
import { ApiResponse } from './types';
import routes from './routes';

class Server {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = env.PORT;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    this.app.use(cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    const limiter = rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX_REQUESTS,
      message: {
        success: false,
        error: {
          type: 'https://httpstatuses.com/429',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Too many requests from this IP, please try again later',
        },
      } as ApiResponse,
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use(limiter);

    this.app.use(session({
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: !isDevelopment,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, 
      },
    }));

    this.app.use(cookieParser());

    this.app.use(passport.initialize());
    this.app.use(passport.session());

    configurePassport();

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    if (isDevelopment) {
      this.app.use(requestLogger);
    }

    this.app.set('trust proxy', 1);
  }

  private setupRoutes(): void {
    this.app.get('/health', (req, res) => {
      const response: ApiResponse = {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: env.NODE_ENV,
        },
      };
      res.json(response);
    });

    this.app.get('/', (req, res) => {
      const response: ApiResponse = {
        success: true,
        message: 'Calendar API Server is running',
        data: {
          version: '1.0.0',
          environment: env.NODE_ENV,
        },
      };
      res.json(response);
    });

    this.app.use('/api/v1', routes);

    this.app.all('*', (req, res) => {
      const response: ApiResponse = {
        success: false,
        error: {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: 404,
          detail: `Route ${req.method} ${req.path} not found`,
          instance: req.path,
        },
      };
      res.status(404).json(response);
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);

    process.on('uncaughtException', (error: Error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully...');
      process.exit(0);
    });
  }

  public async start(): Promise<void> {
    try {
      await initializeDatabase();

      this.app.listen(this.port, () => {
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`📊 Environment: ${env.NODE_ENV}`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
        
        if (isDevelopment) {
          console.log(`🛠️  Development mode enabled`);
        }
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

const server = new Server();
server.start().catch((error) => {
  console.error('Server startup error:', error);
  process.exit(1);
});