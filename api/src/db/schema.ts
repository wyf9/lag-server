import { pgTable, uuid, varchar, timestamp, integer, text, primaryKey, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  nickname: varchar('nickname', { length: 64 }).notNull(),
  email: varchar('email', { length: 320 }),
  avatarUrl: text('avatar_url'),
  avatarColor: varchar('avatar_color', { length: 7 }).notNull(),
  disabled: boolean('disabled').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});

export const oauthIdentities = pgTable('oauth_identities', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(), issuer: varchar('issuer', { length: 2048 }).notNull(),
  subject: varchar('subject', { length: 512 }).notNull(), claims: jsonb('claims').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('oauth_identity_subject').on(table.provider, table.issuer, table.subject), index('oauth_identity_user').on(table.userId)]);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(), csrfHash: varchar('csrf_hash', { length: 64 }).notNull(),
  idToken: text('id_token'), providerSessionId: varchar('provider_session_id', { length: 512 }), userAgent: text('user_agent'), clientIp: varchar('client_ip', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(), absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [index('session_user').on(table.userId), index('session_expiry').on(table.idleExpiresAt, table.absoluteExpiresAt)]);

export const oauthTransactions = pgTable('oauth_transactions', {
  id: uuid('id').defaultRandom().primaryKey(), stateHash: varchar('state_hash', { length: 64 }).notNull().unique(), nonce: varchar('nonce', { length: 128 }),
  codeVerifier: varchar('code_verifier', { length: 128 }), redirectUri: text('redirect_uri'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export const roleGrants = pgTable('role_grants', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 64 }).notNull(), scopeType: varchar('scope_type', { length: 32 }).default('platform').notNull(), scopeId: varchar('scope_id', { length: 512 }),
  source: varchar('source', { length: 32 }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('role_grant_unique').on(table.userId, table.role, table.scopeType, table.scopeId, table.source)]);

export const platformSettings = pgTable('platform_settings', { key: varchar('key', { length: 128 }).primaryKey(), value: jsonb('value').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull() });

export const voiceRooms = pgTable('voice_rooms', {
  id: uuid('id').defaultRandom().primaryKey(), name: varchar('name', { length: 64 }).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  maxParticipants: integer('max_participants').default(50).notNull(),
  visibility: varchar('visibility', { length: 16 }).default('public').notNull(),
  allowGuests: boolean('allow_guests').default(true).notNull(),
  defaultRole: varchar('default_role', { length: 16 }).default('listener').notNull(),
  historyVisibility: varchar('history_visibility', { length: 24 }).default('all').notNull(),
  retention: varchar('retention', { length: 16 }).default('30').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const voiceRoomParticipants = pgTable('voice_room_participants', { roomId: uuid('room_id').references(() => voiceRooms.id, { onDelete: 'cascade' }).notNull(), userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull() }, (table) => [primaryKey({ columns: [table.roomId, table.userId] })]);
export const roomMessages = pgTable('room_messages', { id: uuid('id').defaultRandom().primaryKey(), roomId: uuid('room_id').references(() => voiceRooms.id, { onDelete: 'cascade' }).notNull(), userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), content: text('content').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() });
export const roomAclEntries = pgTable('room_acl_entries', { id: uuid('id').defaultRandom().primaryKey(), roomId: uuid('room_id').notNull().references(() => voiceRooms.id, { onDelete: 'cascade' }), subjectType: varchar('subject_type', { length: 32 }).notNull(), subjectId: varchar('subject_id', { length: 512 }).notNull(), permission: varchar('permission', { length: 32 }).notNull(), grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() }, (table) => [uniqueIndex('room_acl_unique').on(table.roomId, table.subjectType, table.subjectId, table.permission)]);
export const roomInvites = pgTable('room_invites', {
  id: uuid('id').defaultRandom().primaryKey(), roomId: uuid('room_id').notNull().references(() => voiceRooms.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).unique(), invitedUserId: uuid('invited_user_id').references(() => users.id, { onDelete: 'cascade' }),
  permission: varchar('permission', { length: 32 }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxUses: integer('max_uses'), useCount: integer('use_count').default(0).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const roomMembers = pgTable('room_members', {
  roomId: uuid('room_id').notNull().references(() => voiceRooms.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 16 }).notNull(), joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(), invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [primaryKey({ columns: [table.roomId, table.userId] }), index('room_member_user').on(table.userId)]);
export const roomBans = pgTable('room_bans', {
  roomId: uuid('room_id').notNull().references(() => voiceRooms.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannedBy: uuid('banned_by').references(() => users.id, { onDelete: 'set null' }), bannedRole: varchar('banned_role', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.roomId, table.userId] })]);
export const roomOwnershipTransfers = pgTable('room_ownership_transfers', {
  roomId: uuid('room_id').primaryKey().references(() => voiceRooms.id, { onDelete: 'cascade' }), fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const auditEvents = pgTable('audit_events', { id: uuid('id').defaultRandom().primaryKey(), actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }), action: varchar('action', { length: 128 }).notNull(), targetType: varchar('target_type', { length: 64 }), targetId: varchar('target_id', { length: 512 }), metadata: jsonb('metadata').notNull(), clientIp: varchar('client_ip', { length: 255 }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull() });
export const logoutEvents = pgTable('logout_events', { id: uuid('id').defaultRandom().primaryKey(), provider: varchar('provider', { length: 32 }).notNull(), issuer: varchar('issuer', { length: 2048 }).notNull(), eventKey: varchar('event_key', { length: 512 }).notNull(), subject: varchar('subject', { length: 512 }), sessionId: varchar('provider_session_id', { length: 512 }), receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull() }, (table) => [uniqueIndex('logout_event_replay').on(table.provider, table.issuer, table.eventKey)]);
