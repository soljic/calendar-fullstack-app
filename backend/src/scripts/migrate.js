#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class MigrationRunner {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calendar_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    this.migrationsDir = path.join(__dirname, '../migrations');
    this.migrationTableName = 'schema_migrations';
  }

  async createMigrationTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.migrationTableName} (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename 
        ON ${this.migrationTableName}(filename);
    `;

    try {
      await this.pool.query(query);
      console.log('✅ Migration table created/verified');
    } catch (error) {
      console.error('❌ Failed to create migration table:', error.message);
      throw error;
    }
  }

  async getExecutedMigrations() {
    try {
      const result = await this.pool.query(
        `SELECT filename, checksum FROM ${this.migrationTableName} ORDER BY filename`
      );
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to fetch executed migrations:', error.message);
      throw error;
    }
  }

  async getMigrationFiles() {
    try {
      const files = fs.readdirSync(this.migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      return files.map(filename => {
        const filePath = path.join(this.migrationsDir, filename);
        const content = fs.readFileSync(filePath, 'utf8');
        const checksum = require('crypto')
          .createHash('sha256')
          .update(content)
          .digest('hex');
        
        return { filename, filePath, content, checksum };
      });
    } catch (error) {
      console.error('❌ Failed to read migration files:', error.message);
      throw error;
    }
  }

  async executeMigration(migration) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log(`🔄 Executing migration: ${migration.filename}`);
      
      // Execute the migration SQL
      await client.query(migration.content);
      
      // Record the migration as executed
      await client.query(
        `INSERT INTO ${this.migrationTableName} (filename, checksum) VALUES ($1, $2)`,
        [migration.filename, migration.checksum]
      );
      
      await client.query('COMMIT');
      console.log(`✅ Migration completed: ${migration.filename}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${migration.filename}`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async validateMigrationChecksum(migration, executedMigration) {
    if (migration.checksum !== executedMigration.checksum) {
      throw new Error(
        `Migration checksum mismatch for ${migration.filename}. ` +
        `Expected: ${executedMigration.checksum}, Got: ${migration.checksum}. ` +
        `This indicates the migration file has been modified after execution.`
      );
    }
  }

  async runMigrations() {
    try {
      console.log('🚀 Starting database migrations...');
      
      await this.createMigrationTable();
      
      const executedMigrations = await this.getExecutedMigrations();
      const executedMap = new Map(
        executedMigrations.map(m => [m.filename, m])
      );
      
      const migrationFiles = await this.getMigrationFiles();
      
      for (const migration of migrationFiles) {
        const executed = executedMap.get(migration.filename);
        if (executed) {
          await this.validateMigrationChecksum(migration, executed);
        }
      }
      
      const pendingMigrations = migrationFiles.filter(
        migration => !executedMap.has(migration.filename)
      );
      
      if (pendingMigrations.length === 0) {
        console.log('✅ No pending migrations found. Database is up to date.');
        return;
      }
      
      console.log(`📄 Found ${pendingMigrations.length} pending migration(s):`);
      pendingMigrations.forEach(m => console.log(`  - ${m.filename}`));
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      console.log('🎉 All migrations completed successfully!');
      
    } catch (error) {
      console.error('💥 Migration failed:', error.message);
      process.exit(1);
    }
  }

  async rollbackLastMigration() {
    try {
      console.log('🔙 Rolling back last migration...');
      
      const result = await this.pool.query(
        `SELECT filename FROM ${this.migrationTableName} 
         ORDER BY executed_at DESC, id DESC LIMIT 1`
      );
      
      if (result.rows.length === 0) {
        console.log('ℹ️  No migrations to rollback.');
        return;
      }
      
      const lastMigration = result.rows[0].filename;
      console.log(`⚠️  Warning: Rollback functionality is not implemented.`);
      console.log(`Last migration: ${lastMigration}`);
      console.log(`Please manually rollback by running the rollback script in the migration file.`);
      
    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      throw error;
    }
  }

  async getStatus() {
    try {
      const executedMigrations = await this.getExecutedMigrations();
      const migrationFiles = await this.getMigrationFiles();
      
      console.log('📊 Migration Status:');
      console.log(`Total migration files: ${migrationFiles.length}`);
      console.log(`Executed migrations: ${executedMigrations.length}`);
      console.log(`Pending migrations: ${migrationFiles.length - executedMigrations.length}`);
      
      console.log('\n📋 Executed migrations:');
      if (executedMigrations.length === 0) {
        console.log('  None');
      } else {
        executedMigrations.forEach(m => {
          console.log(`  ✅ ${m.filename}`);
        });
      }
      
      const executedMap = new Map(
        executedMigrations.map(m => [m.filename, m])
      );
      const pendingMigrations = migrationFiles.filter(
        migration => !executedMap.has(migration.filename)
      );
      
      console.log('\n📋 Pending migrations:');
      if (pendingMigrations.length === 0) {
        console.log('  None');
      } else {
        pendingMigrations.forEach(m => {
          console.log(`  ⏳ ${m.filename}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to get migration status:', error.message);
      throw error;
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const command = process.argv[2] || 'migrate';
  const runner = new MigrationRunner();
  
  try {
    switch (command) {
      case 'migrate':
      case 'up':
        await runner.runMigrations();
        break;
        
      case 'rollback':
      case 'down':
        await runner.rollbackLastMigration();
        break;
        
      case 'status':
        await runner.getStatus();
        break;
        
      default:
        console.log('Usage: node migrate.js [migrate|rollback|status]');
        console.log('');
        console.log('Commands:');
        console.log('  migrate, up    Run pending migrations (default)');
        console.log('  rollback, down Rollback last migration');
        console.log('  status         Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('💥 Command failed:', error.message);
    process.exit(1);
  } finally {
    await runner.close();
  }
}

module.exports = MigrationRunner;

if (require.main === module) {
  main();
}