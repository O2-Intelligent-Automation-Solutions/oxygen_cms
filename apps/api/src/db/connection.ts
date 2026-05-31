import knex, { type Knex } from 'knex';
import type { AppConfig } from '../config/loadConfig.js';

export function createDatabaseConnection(config: AppConfig): Knex {
  return knex({
    client: 'mysql2',
    connection: {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database
    },
    pool: {
      min: 0,
      max: 10
    }
  });
}
