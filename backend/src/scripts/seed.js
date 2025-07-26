#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

class DatabaseSeeder {
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

  async seedUsers() {
    console.log('🌱 Seeding users...');
    
    const users = [
      {
        email: 'john.doe@example.com',
        name: 'John Doe',
        picture_url: 'https://via.placeholder.com/150/0000FF/808080?text=JD'
      },
      {
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        picture_url: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=JS'
      },
      {
        email: 'bob.wilson@example.com',
        name: 'Bob Wilson',
        picture_url: 'https://via.placeholder.com/150/00FF00/000000?text=BW'
      }
    ];

    const insertedUsers = [];

    for (const user of users) {
      try {
        const result = await this.pool.query(`
          INSERT INTO users (email, name, picture_url)
          VALUES ($1, $2, $3)
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            picture_url = EXCLUDED.picture_url,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id, email, name
        `, [user.email, user.name, user.picture_url]);
        
        insertedUsers.push(result.rows[0]);
        console.log(`  ✅ User created/updated: ${result.rows[0].email}`);
      } catch (error) {
        console.error(`  ❌ Failed to create user ${user.email}:`, error.message);
      }
    }

    return insertedUsers;
  }

  async seedEvents(users) {
    console.log('🌱 Seeding calendar events...');
    
    const eventTemplates = [
      {
        title: 'Team Standup',
        description: 'Daily team standup meeting',
        duration_hours: 1,
        status: 'confirmed'
      },
      {
        title: 'Project Planning',
        description: 'Planning session for upcoming features',
        duration_hours: 2,
        status: 'confirmed'
      },
      {
        title: 'Client Meeting',
        description: 'Meeting with client to discuss requirements',
        duration_hours: 1.5,
        status: 'tentative'
      },
      {
        title: 'Code Review',
        description: 'Review pull requests and code quality',
        duration_hours: 1,
        status: 'confirmed'
      },
      {
        title: 'Lunch Break',
        description: 'Lunch with the team',
        duration_hours: 1,
        status: 'confirmed'
      }
    ];

    const locations = [
      'Conference Room A',
      'Office',
      'Remote',
      'Cafeteria',
      'Meeting Room B'
    ];

    let eventCount = 0;

    for (const user of users) {
      for (let day = 0; day < 30; day++) {
        const date = new Date();
        date.setDate(date.getDate() + day);
        
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        
        const eventsPerDay = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < eventsPerDay; i++) {
          const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
          const location = locations[Math.floor(Math.random() * locations.length)];
          
          const startHour = Math.floor(Math.random() * 7) + 9;
          const startMinute = Math.random() < 0.5 ? 0 : 30;
          
          const startDate = new Date(date);
          startDate.setHours(startHour, startMinute, 0, 0);
          
          const endDate = new Date(startDate);
          endDate.setHours(startDate.getHours() + template.duration_hours);
          
          const attendees = [];
          if (Math.random() > 0.5) {
            const otherUsers = users.filter(u => u.id !== user.id);
            const attendeeCount = Math.floor(Math.random() * Math.min(otherUsers.length, 3));
            
            for (let j = 0; j < attendeeCount; j++) {
              const attendee = otherUsers[Math.floor(Math.random() * otherUsers.length)];
              if (!attendees.find(a => a.email === attendee.email)) {
                attendees.push({
                  email: attendee.email,
                  name: attendee.name,
                  responseStatus: Math.random() > 0.3 ? 'accepted' : 'needsAction'
                });
              }
            }
          }

          try {
            await this.pool.query(`
              INSERT INTO calendar_events (
                user_id, title, description, start_date, end_date,
                location, attendees, status, source
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual')
            `, [
              user.id,
              template.title,
              template.description,
              startDate,
              endDate,
              location,
              JSON.stringify(attendees),
              template.status
            ]);
            
            eventCount++;
          } catch (error) {
            console.error(`  ❌ Failed to create event for ${user.email}:`, error.message);
          }
        }
      }
    }

    console.log(`  ✅ Created ${eventCount} events`);
  }

  async seedSyncStates(users) {
    console.log('🌱 Seeding sync states...');
    
    for (const user of users) {
      try {
        await this.pool.query(`
          INSERT INTO sync_state (user_id, full_sync_completed, last_sync_time)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id) DO UPDATE SET
            full_sync_completed = EXCLUDED.full_sync_completed,
            last_sync_time = EXCLUDED.last_sync_time,
            updated_at = CURRENT_TIMESTAMP
        `, [
          user.id,
          Math.random() > 0.5, 
          new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) 
        ]);
        
        console.log(`  ✅ Sync state created/updated for: ${user.email}`);
      } catch (error) {
        console.error(`  ❌ Failed to create sync state for ${user.email}:`, error.message);
      }
    }
  }

  async refreshStats() {
    console.log('🔄 Refreshing calendar statistics...');
    
    try {
      await this.pool.query('SELECT refresh_calendar_stats()');
      console.log('  ✅ Calendar statistics refreshed');
    } catch (error) {
      console.error('  ❌ Failed to refresh statistics:', error.message);
    }
  }

  async run() {
    try {
      console.log('🚀 Starting database seeding...');
      
      const users = await this.seedUsers();
      
      if (users.length > 0) {
        await this.seedEvents(users);
        await this.seedSyncStates(users);
        await this.refreshStats();
      }
      
      console.log('🎉 Database seeding completed successfully!');
      
      const stats = await this.pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as user_count,
          (SELECT COUNT(*) FROM calendar_events) as event_count,
          (SELECT COUNT(*) FROM sync_state) as sync_state_count
      `);
      
      const { user_count, event_count, sync_state_count } = stats.rows[0];
      
      console.log('\n📊 Database Summary:');
      console.log(`  Users: ${user_count}`);
      console.log(`  Events: ${event_count}`);
      console.log(`  Sync States: ${sync_state_count}`);
      
    } catch (error) {
      console.error('💥 Seeding failed:', error.message);
      process.exit(1);
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const seeder = new DatabaseSeeder();
  
  try {
    await seeder.run();
  } finally {
    await seeder.close();
  }
}

module.exports = DatabaseSeeder;

if (require.main === module) {
  main();
}