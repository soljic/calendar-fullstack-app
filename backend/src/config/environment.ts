import dotenv from 'dotenv';
import { DatabaseConfig } from '../types';

dotenv.config();

export interface Environment {
  NODE_ENV: string;
  PORT: number;
  DATABASE: DatabaseConfig;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  CORS_ORIGIN: string[];
  FRONTEND_URL: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  LOG_LEVEL: string;
}

const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
};

const getEnvNumber = (name: string, defaultValue?: number): number => {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
};

const getEnvArray = (name: string, defaultValue?: string[]): string[] => {
  const value = process.env[name];
  if (!value) {
    if (defaultValue) return defaultValue;
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value.split(',').map(item => item.trim());
};

export const env: Environment = {
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  PORT: getEnvNumber('PORT', 3000),
  
  DATABASE: {
    host: getEnvVar('DB_HOST', 'localhost'),
    port: getEnvNumber('DB_PORT', 5432),
    database: getEnvVar('DB_NAME', 'calendar_db'),
    user: getEnvVar('DB_USER', 'postgres'),
    password: getEnvVar('DB_PASSWORD'),
    ssl: process.env.NODE_ENV === 'production',
    max: getEnvNumber('DB_MAX_CONNECTIONS', 20),
    idleTimeoutMillis: getEnvNumber('DB_IDLE_TIMEOUT', 30000),
    connectionTimeoutMillis: getEnvNumber('DB_CONNECTION_TIMEOUT', 2000),
  },
  
  JWT_SECRET: getEnvVar('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnvVar('JWT_EXPIRES_IN', '7d'),
  
  GOOGLE_CLIENT_ID: getEnvVar('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: getEnvVar('GOOGLE_CLIENT_SECRET'),
  
  SESSION_SECRET: getEnvVar('SESSION_SECRET'),
  
  CORS_ORIGIN: getEnvArray('CORS_ORIGIN', ['http://localhost:3000']),
  
  FRONTEND_URL: getEnvVar('FRONTEND_URL', 'http://localhost:3000'),
  
  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  
  LOG_LEVEL: getEnvVar('LOG_LEVEL', 'info'),
};

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';