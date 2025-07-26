import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { env } from '../config/environment';
import { db } from '../config/database';
import { JwtPayload, User } from '../types';
import { InternalServerError, UnauthorizedError } from '../middleware/errorHandler';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: Date;
  scope?: string;
}

export interface EncryptedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export class TokenService {
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly ENCRYPTION_KEY = crypto
    .createHash('sha256')
    .update(env.JWT_SECRET)
    .digest();

  static encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipher('aes-256-cbc', this.ENCRYPTION_KEY);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Token encryption failed:', error);
      throw new InternalServerError('Failed to encrypt token');
    }
  }

  static decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted token format');
      }

      const [ivHex, encrypted] = parts;
      const decipher = crypto.createDecipher('aes-256-cbc', this.ENCRYPTION_KEY);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Token decryption failed:', error);
      throw new InternalServerError('Failed to decrypt token');
    }
  }

  static generateJWT(payload: JwtPayload): string {
    try {
      return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
        issuer: 'calendar-app',
        audience: 'calendar-users',
      } as jwt.SignOptions);
    } catch (error) {
      console.error('JWT generation failed:', error);
      throw new InternalServerError('Failed to generate authentication token');
    }
  }

  static verifyJWT(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        issuer: 'calendar-app',
        audience: 'calendar-users',
      }) as JwtPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      } else {
        console.error('JWT verification failed:', error);
        throw new UnauthorizedError('Token verification failed');
      }
    }
  }

  static async storeTokens(
    userId: string, 
    tokens: GoogleTokens
  ): Promise<void> {
    try {
      const encryptedAccessToken = this.encrypt(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token 
        ? this.encrypt(tokens.refresh_token) 
        : null;

      await db.query(`
        UPDATE users 
        SET 
          access_token = $1,
          refresh_token = $2,
          token_expires_at = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId, encryptedAccessToken, encryptedRefreshToken, tokens.expires_at]);

      console.log(`Tokens stored for user: ${userId}`);
    } catch (error) {
      console.error(`Failed to store tokens for user ${userId}:`, error);
      throw new InternalServerError('Failed to store authentication tokens');
    }
  }

  static async getStoredTokens(userId: string): Promise<EncryptedTokens | null> {
    try {
      const result = await db.query(`
        SELECT access_token, refresh_token, token_expires_at
        FROM users 
        WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      if (!row.access_token) {
        return null;
      }

      return {
        accessToken: this.decrypt(row.access_token),
        refreshToken: row.refresh_token ? this.decrypt(row.refresh_token) : undefined,
        expiresAt: row.token_expires_at,
      };
    } catch (error) {
      console.error(`Failed to retrieve tokens for user ${userId}:`, error);
      throw new InternalServerError('Failed to retrieve authentication tokens');
    }
  }

  static async refreshGoogleToken(userId: string): Promise<GoogleTokens> {
    try {
      const storedTokens = await this.getStoredTokens(userId);
      
      if (!storedTokens?.refreshToken) {
        throw new UnauthorizedError('No refresh token available');
      }

      const oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        refresh_token: storedTokens.refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new UnauthorizedError('Failed to refresh access token');
      }

      const newTokens: GoogleTokens = {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || storedTokens.refreshToken,
        expires_at: credentials.expiry_date 
          ? new Date(credentials.expiry_date) 
          : undefined,
        scope: credentials.scope,
      };

      await this.storeTokens(userId, newTokens);

      console.log(`Tokens refreshed for user: ${userId}`);
      return newTokens;
    } catch (error) {
      console.error(`Failed to refresh tokens for user ${userId}:`, error);
      
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      
      throw new InternalServerError('Failed to refresh authentication tokens');
    }
  }

  static async ensureValidToken(userId: string): Promise<string> {
    try {
      const storedTokens = await this.getStoredTokens(userId);
      
      if (!storedTokens) {
        throw new UnauthorizedError('No authentication tokens found');
      }

      const now = new Date();
      const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

      // Check if token is expired or will expire soon
      if (storedTokens.expiresAt && storedTokens.expiresAt.getTime() - now.getTime() < bufferTime) {
        console.log(`Token expires soon for user ${userId}, refreshing...`);
        const refreshedTokens = await this.refreshGoogleToken(userId);
        return refreshedTokens.access_token;
      }

      return storedTokens.accessToken;
    } catch (error) {
      console.error(`Failed to ensure valid token for user ${userId}:`, error);
      throw error;
    }
  }

  static async revokeTokens(userId: string): Promise<void> {
    try {
      const storedTokens = await this.getStoredTokens(userId);
      
      if (storedTokens?.accessToken) {
        // Revoke Google tokens
        try {
          const oauth2Client = new google.auth.OAuth2();
          await oauth2Client.revokeToken(storedTokens.accessToken);
          console.log(`Google tokens revoked for user: ${userId}`);
        } catch (revokeError) {
          console.warn(`Failed to revoke Google tokens for user ${userId}:`, revokeError);
          // Continue with local cleanup even if Google revocation fails
        }
      }

      // Clear tokens from database
      await db.query(`
        UPDATE users 
        SET 
          access_token = NULL,
          refresh_token = NULL,
          token_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId]);

      console.log(`Local tokens cleared for user: ${userId}`);
    } catch (error) {
      console.error(`Failed to revoke tokens for user ${userId}:`, error);
      throw new InternalServerError('Failed to revoke authentication tokens');
    }
  }

  static generateStateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static async storeStateToken(state: string, userId?: string): Promise<void> {
    try {
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      await db.query(`
        INSERT INTO oauth_states (state, user_id, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (state) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `, [state, userId, expiry]);
    } catch (error) {
      console.error('Failed to store state token:', error);
      throw new InternalServerError('Failed to store OAuth state');
    }
  }

  static async validateStateToken(state: string): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT id FROM oauth_states 
        WHERE state = $1 AND expires_at > CURRENT_TIMESTAMP
      `, [state]);

      if (result.rows.length > 0) {
        // Clean up used state token
        await db.query('DELETE FROM oauth_states WHERE state = $1', [state]);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to validate state token:', error);
      return false;
    }
  }

  static async cleanupExpiredStates(): Promise<void> {
    try {
      const result = await db.query(`
        DELETE FROM oauth_states WHERE expires_at <= CURRENT_TIMESTAMP
      `);
      
      if (result.rowCount && result.rowCount > 0) {
        console.log(`Cleaned up ${result.rowCount} expired OAuth states`);
      }
    } catch (error) {
      console.error('Failed to cleanup expired states:', error);
    }
  }

  static async getUserById(userId: string): Promise<User | null> {
    try {
      const result = await db.query(`
        SELECT * FROM users WHERE id = $1
      `, [userId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      return null;
    } catch (error) {
      console.error('Failed to get user by ID:', error);
      return null;
    }
  }

  static async getUserFromGoogleProfile(profile: any): Promise<User | null> {
    try {
      const result = await db.query(`
        SELECT * FROM users WHERE google_id = $1
      `, [profile.id]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      return null;
    } catch (error) {
      console.error('Failed to get user from Google profile:', error);
      return null;
    }
  }

  static async createUserFromGoogleProfile(
    profile: any, 
    tokens: GoogleTokens
  ): Promise<User> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      const email = profile.emails?.[0]?.value;
      const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
      const pictureUrl = profile.photos?.[0]?.value;

      if (!email) {
        throw new Error('Email not provided by Google');
      }

      const encryptedAccessToken = this.encrypt(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token 
        ? this.encrypt(tokens.refresh_token) 
        : null;

      const userResult = await client.query(`
        INSERT INTO users (
          google_id, email, name, picture_url,
          access_token, refresh_token, token_expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        profile.id,
        email,
        name,
        pictureUrl,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokens.expires_at
      ]);

      const user = userResult.rows[0];

      // Initialize sync state
      await client.query(`
        INSERT INTO sync_state (user_id) VALUES ($1)
      `, [user.id]);

      await client.query('COMMIT');

      console.log(`New user created from Google profile: ${user.email}`);
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to create user from Google profile:', error);
      throw new InternalServerError('Failed to create user account');
    } finally {
      client.release();
    }
  }

  static async updateUserFromGoogleProfile(
    user: User,
    profile: any,
    tokens: GoogleTokens
  ): Promise<User> {
    try {
      const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
      const pictureUrl = profile.photos?.[0]?.value;

      const encryptedAccessToken = this.encrypt(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token 
        ? this.encrypt(tokens.refresh_token) 
        : null;

      const result = await db.query(`
        UPDATE users 
        SET 
          name = $1,
          picture_url = $2,
          access_token = $3,
          refresh_token = $4,
          token_expires_at = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `, [
        name,
        pictureUrl,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokens.expires_at,
        user.id
      ]);

      console.log(`User updated from Google profile: ${user.email}`);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to update user from Google profile:', error);
      throw new InternalServerError('Failed to update user account');
    }
  }
}