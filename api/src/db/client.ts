import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    sql = postgres(databaseUrl);
    db = drizzle(sql, { schema });
  }
  return db;
}

export function getSql() {
  if (!sql) getDb();
  return sql!;
}

export type Database = ReturnType<typeof getDb>;
