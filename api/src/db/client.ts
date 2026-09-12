import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { getConfig } from '../config.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!db) {
    sql = postgres(getConfig().databaseUrl);
    db = drizzle(sql, { schema });
  }
  return db;
}

export function getSql() {
  if (!sql) getDb();
  return sql!;
}

export type Database = ReturnType<typeof getDb>;
