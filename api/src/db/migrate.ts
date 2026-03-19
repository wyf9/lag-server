import { getSql } from './client.js';

export async function autoMigrate(): Promise<void> {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nickname VARCHAR(64) NOT NULL,
      avatar_color VARCHAR(7) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS voice_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(64) NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      max_participants INTEGER NOT NULL DEFAULT 50,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS voice_room_participants (
      room_id UUID NOT NULL REFERENCES voice_rooms(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (room_id, user_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS room_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES voice_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_room_messages_room_id ON room_messages(room_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_voice_room_participants_room_id ON voice_room_participants(room_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_voice_room_participants_user_id ON voice_room_participants(user_id)`;

  console.log('[migrate] Database schema ready');
}
