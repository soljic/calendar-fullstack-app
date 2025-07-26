import { Pool, PoolClient, QueryResult } from 'pg';
import { env } from './environment';

class Database {
  private pool: Pool;
  private static instance: Database;

  private constructor() {
    this.pool = new Pool({
      host: env.DATABASE.host,
      port: env.DATABASE.port,
      database: env.DATABASE.database,
      user: env.DATABASE.user,
      password: env.DATABASE.password,
      ssl: env.DATABASE.ssl ? { rejectUnauthorized: false } : false,
      max: env.DATABASE.max,
      idleTimeoutMillis: env.DATABASE.idleTimeoutMillis,
      connectionTimeoutMillis: env.DATABASE.connectionTimeoutMillis,
    });

    this.pool.on('connect', (client: PoolClient) => {
      console.log('New database connection established');
    });

    this.pool.on('error', (err: Error) => {
      console.error('Database connection error:', err);
    });

    this.pool.on('remove', () => {
      console.log('Database connection removed from pool');
    });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Query executed', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Database query error:', { text, error });
      throw error;
    }
  }

  public async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      console.log('Database connection test successful:', result.rows[0]);
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    try {
      await this.pool.end();
      console.log('Database connection pool closed');
    } catch (error) {
      console.error('Error closing database connection pool:', error);
    }
  }

  public getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

export const db = Database.getInstance();

export const initializeDatabase = async (): Promise<void> => {
  try {
    const isConnected = await db.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing database connection...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing database connection...');
  await db.close();
  process.exit(0);
});