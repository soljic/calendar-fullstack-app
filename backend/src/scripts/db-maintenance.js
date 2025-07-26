#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

class DatabaseMaintenance {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'calendar_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  async analyzeDatabase() {
    console.log('📊 Analyzing database...');
    
    try {
      const stats = await this.pool.query(`
        SELECT * FROM get_database_stats()
        ORDER BY pg_total_relation_size(table_name::regclass) DESC
      `);
      
      console.log('\n📋 Table Statistics:');
      console.log('┌─────────────────────────┬────────────┬─────────────┬─────────────┐');
      console.log('│ Table                   │ Row Count  │ Table Size  │ Index Size  │');
      console.log('├─────────────────────────┼────────────┼─────────────┼─────────────┤');
      
      stats.rows.forEach(row => {
        console.log(`│ ${row.table_name.padEnd(23)} │ ${String(row.row_count).padStart(10)} │ ${row.table_size.padStart(11)} │ ${row.index_size.padStart(11)} │`);
      });
      
      console.log('└─────────────────────────┴────────────┴─────────────┴─────────────┘');
      
      const indexStats = await this.pool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_tup_read,
          idx_tup_fetch,
          idx_scan
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT 10
      `);
      
      console.log('\n🔍 Top 10 Most Used Indexes:');
      console.log('┌─────────────────────────┬─────────────────────────┬────────────┬─────────────┬───────────┐');
      console.log('│ Table                   │ Index                   │ Scans      │ Tuples Read │ Fetched   │');
      console.log('├─────────────────────────┼─────────────────────────┼────────────┼─────────────┼───────────┤');
      
      indexStats.rows.forEach(row => {
        console.log(`│ ${row.tablename.padEnd(23)} │ ${row.indexname.substring(0, 23).padEnd(23)} │ ${String(row.idx_scan).padStart(10)} │ ${String(row.idx_tup_read).padStart(11)} │ ${String(row.idx_tup_fetch).padStart(9)} │`);
      });
      
      console.log('└─────────────────────────┴─────────────────────────┴────────────┴─────────────┴───────────┘');
      
    } catch (error) {
      console.error('❌ Failed to analyze database:', error.message);
    }
  }

  async cleanupData() {
    console.log('🧹 Cleaning up old data...');
    
    try {
      const cancelledCount = await this.pool.query(`
        SELECT cleanup_old_cancelled_events(90) as deleted_count
      `);
      console.log(`  ✅ Removed ${cancelledCount.rows[0].deleted_count} old cancelled events`);
      
      const orphanedCount = await this.pool.query(`
        SELECT cleanup_orphaned_sync_states() as deleted_count
      `);
      console.log(`  ✅ Removed ${orphanedCount.rows[0].deleted_count} orphaned sync states`);
      
      const stuckSyncResult = await this.pool.query(`
        UPDATE sync_state 
        SET sync_in_progress = FALSE, 
            sync_error = 'Reset due to maintenance - sync was stuck',
            sync_error_count = sync_error_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE sync_in_progress = TRUE 
        AND updated_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'
      `);
      console.log(`  ✅ Reset ${stuckSyncResult.rowCount} stuck sync processes`);
      
    } catch (error) {
      console.error('❌ Failed to cleanup data:', error.message);
    }
  }

  async vacuum() {
    console.log('🔧 Running VACUUM on tables...');
    
    const tables = ['users', 'calendar_events', 'sync_state', 'schema_migrations'];
    
    for (const table of tables) {
      try {
        console.log(`  🔄 Vacuuming ${table}...`);
        await this.pool.query(`VACUUM ANALYZE ${table}`);
        console.log(`  ✅ ${table} vacuumed successfully`);
      } catch (error) {
        console.error(`  ❌ Failed to vacuum ${table}:`, error.message);
      }
    }
  }

  async reindex() {
    console.log('🔧 Reindexing database...');
    
    try {
      await this.pool.query('REINDEX DATABASE CONCURRENTLY');
      console.log('  ✅ Database reindexed successfully');
    } catch (error) {
      console.error('  ❌ Failed to reindex database:', error.message);
      
      const tables = ['users', 'calendar_events', 'sync_state'];
      for (const table of tables) {
        try {
          console.log(`  🔄 Reindexing ${table}...`);
          await this.pool.query(`REINDEX TABLE ${table}`);
          console.log(`  ✅ ${table} reindexed successfully`);
        } catch (tableError) {
          console.error(`  ❌ Failed to reindex ${table}:`, tableError.message);
        }
      }
    }
  }

  async updateStatistics() {
    console.log('📊 Updating statistics...');
    
    try {
      await this.pool.query('ANALYZE');
      console.log('  ✅ Table statistics updated');
      
      await this.pool.query('SELECT refresh_calendar_stats()');
      console.log('  ✅ Calendar statistics refreshed');
      
    } catch (error) {
      console.error('❌ Failed to update statistics:', error.message);
    }
  }

  async checkHealth() {
    console.log('🏥 Checking database health...');
    
    try {
      const bloatResult = await this.pool.query(`
        SELECT 
          schemaname,
          tablename,
          n_dead_tup,
          n_live_tup,
          CASE 
            WHEN n_live_tup > 0 
            THEN round((n_dead_tup::float / (n_live_tup + n_dead_tup)::float) * 100, 2)
            ELSE 0 
          END as dead_tuple_percent
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        AND n_live_tup > 0
        ORDER BY dead_tuple_percent DESC
      `);
      
      console.log('\n💀 Dead Tuple Analysis:');
      console.log('┌─────────────────────────┬─────────────┬─────────────┬─────────────────┐');
      console.log('│ Table                   │ Live Tuples │ Dead Tuples │ Dead Percentage │');
      console.log('├─────────────────────────┼─────────────┼─────────────┼─────────────────┤');
      
      bloatResult.rows.forEach(row => {
        const warning = row.dead_tuple_percent > 20 ? '⚠️ ' : '  ';
        console.log(`${warning}${row.tablename.padEnd(23)} │ ${String(row.n_live_tup).padStart(11)} │ ${String(row.n_dead_tup).padStart(11)} │ ${String(row.dead_tuple_percent).padStart(13)}% │`);
      });
      
      console.log('└─────────────────────────┴─────────────┴─────────────┴─────────────────┘');
      
      const unusedIndexes = await this.pool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        AND idx_scan = 0
        ORDER BY tablename, indexname
      `);
      
      if (unusedIndexes.rows.length > 0) {
        console.log('\n⚠️  Unused Indexes (consider removing):');
        unusedIndexes.rows.forEach(row => {
          console.log(`  - ${row.tablename}.${row.indexname}`);
        });
      } else {
        console.log('\n✅ All indexes are being used');
      }
      
      console.log('\n🔗 Connection Pool Status:');
      console.log(`  Total Connections: ${this.pool.totalCount}`);
      console.log(`  Idle Connections: ${this.pool.idleCount}`);
      console.log(`  Waiting Connections: ${this.pool.waitingCount}`);
      
    } catch (error) {
      console.error('❌ Failed to check database health:', error.message);
    }
  }

  async backupRecommendations() {
    console.log('\n💡 Maintenance Recommendations:');
    
    try {
      const stats = await this.pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE access_token IS NULL) as users_without_tokens,
          (SELECT COUNT(*) FROM calendar_events WHERE status = 'cancelled') as cancelled_events,
          (SELECT COUNT(*) FROM sync_state WHERE sync_error_count > 3) as problematic_syncs,
          (SELECT COUNT(*) FROM calendar_events WHERE created_at < CURRENT_DATE - INTERVAL '1 year') as old_events
      `);
      
      const data = stats.rows[0];
      
      if (data.users_without_tokens > 0) {
        console.log(`  📧 ${data.users_without_tokens} users without access tokens - consider cleanup`);
      }
      
      if (data.cancelled_events > 100) {
        console.log(`  🗑️  ${data.cancelled_events} cancelled events - consider archiving old ones`);
      }
      
      if (data.problematic_syncs > 0) {
        console.log(`  ⚠️  ${data.problematic_syncs} users with sync problems - investigate errors`);
      }
      
      if (data.old_events > 1000) {
        console.log(`  📅 ${data.old_events} events older than 1 year - consider archiving`);
      }
      
      console.log('  🔄 Run VACUUM ANALYZE regularly on busy tables');
      console.log('  📊 Monitor query performance with pg_stat_statements');
      console.log('  🔍 Set up monitoring for connection pool exhaustion');
      console.log('  💾 Ensure regular backups are configured');
      
    } catch (error) {
      console.error('❌ Failed to generate recommendations:', error.message);
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const command = process.argv[2] || 'analyze';
  const maintenance = new DatabaseMaintenance();
  
  try {
    switch (command) {
      case 'analyze':
        await maintenance.analyzeDatabase();
        break;
        
      case 'cleanup':
        await maintenance.cleanupData();
        break;
        
      case 'vacuum':
        await maintenance.vacuum();
        break;
        
      case 'reindex':
        await maintenance.reindex();
        break;
        
      case 'stats':
        await maintenance.updateStatistics();
        break;
        
      case 'health':
        await maintenance.checkHealth();
        break;
        
      case 'full':
        console.log('🔧 Running full maintenance...');
        await maintenance.analyzeDatabase();
        await maintenance.cleanupData();
        await maintenance.vacuum();
        await maintenance.updateStatistics();
        await maintenance.checkHealth();
        await maintenance.backupRecommendations();
        break;
        
      default:
        console.log('Usage: node db-maintenance.js [analyze|cleanup|vacuum|reindex|stats|health|full]');
        console.log('');
        console.log('Commands:');
        console.log('  analyze   Analyze database statistics (default)');
        console.log('  cleanup   Clean up old data');
        console.log('  vacuum    Run VACUUM ANALYZE on tables');
        console.log('  reindex   Reindex database');
        console.log('  stats     Update table statistics');
        console.log('  health    Check database health');
        console.log('  full      Run full maintenance routine');
        process.exit(1);
    }
  } catch (error) {
    console.error('💥 Maintenance failed:', error.message);
    process.exit(1);
  } finally {
    await maintenance.close();
  }
}

module.exports = DatabaseMaintenance;

if (require.main === module) {
  main();
}