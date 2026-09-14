import {
  bigint,
  char,
  customType,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "longblob"
});

const timestamps = {
  createdAt: datetime("created_at", { mode: "date" }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull()
};

export const users = mysqlTable(
  "users",
  {
    id: char("id", { length: 36 }).primaryKey(),
    zhihuSubject: varchar("zhihu_subject", { length: 191 }).notNull(),
    displayName: varchar("display_name", { length: 191 }),
    avatarUrl: varchar("avatar_url", { length: 1024 }),
    ...timestamps
  },
  (table) => [uniqueIndex("users_zhihu_subject_uq").on(table.zhihuSubject)]
);

export const oauthAccounts = mysqlTable("oauth_accounts", {
  userId: char("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessTokenCipher: text("access_token_cipher").notNull(),
  expiresAt: datetime("expires_at", { mode: "date" }),
  ...timestamps
});

export const oauthIdentities = mysqlTable(
  "oauth_identities",
  {
    provider: varchar("provider", { length: 32 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 191 }).notNull(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("oauth_identities_user_idx").on(table.userId)
  ]
);

export const sessions = mysqlTable(
  "sessions",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
    createdAt: datetime("created_at", { mode: "date" }).notNull()
  },
  (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expires_idx").on(table.expiresAt)]
);

export const oauthAttempts = mysqlTable(
  "oauth_attempts",
  {
    stateHash: char("state_hash", { length: 64 }).primaryKey(),
    nonceHash: char("nonce_hash", { length: 64 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
    usedAt: datetime("used_at", { mode: "date" }),
    createdAt: datetime("created_at", { mode: "date" }).notNull()
  },
  (table) => [index("oauth_attempts_expires_idx").on(table.expiresAt)]
);

export const notes = mysqlTable(
  "notes",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }),
    body: text("body").notNull(),
    ...timestamps
  },
  (table) => [index("notes_user_updated_idx").on(table.userId, table.updatedAt)]
);

export const noteImages = mysqlTable(
  "note_images",
  {
    id: char("id", { length: 36 }).primaryKey(),
    noteId: char("note_id", { length: 36 })
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    imageData: longblob("image_data").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    createdAt: datetime("created_at", { mode: "date" }).notNull()
  },
  (table) => [index("note_images_note_idx").on(table.noteId), index("note_images_user_idx").on(table.userId)]
);

export const zhihuItems = mysqlTable(
  "zhihu_items",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceHash: char("source_hash", { length: 64 }).notNull(),
    sourceUrl: varchar("source_url", { length: 1024 }).notNull(),
    contentType: varchar("content_type", { length: 32 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    summary: text("summary").notNull(),
    authorName: varchar("author_name", { length: 191 }),
    favoriteAt: datetime("favorite_at", { mode: "date" }),
    syncedAt: datetime("synced_at", { mode: "date" }).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("zhihu_items_user_source_uq").on(table.userId, table.sourceHash),
    index("zhihu_items_user_favorite_idx").on(table.userId, table.favoriteAt)
  ]
);

export type MemoryCardData = {
  coreClaim: string;
  evidence: string[];
  conditions: string[];
  counterpoints: string[];
  question: string;
  keywords: string[];
};

export const memoryCards = mysqlTable(
  "memory_cards",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceItemId: char("source_item_id", { length: 36 })
      .notNull()
      .references(() => zhihuItems.id, { onDelete: "cascade" }),
    data: json("data").$type<MemoryCardData>().notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    createdAt: datetime("created_at", { mode: "date" }).notNull(),
    updatedAt: datetime("updated_at", { mode: "date" }).notNull()
  },
  (table) => [uniqueIndex("memory_cards_user_source_uq").on(table.userId, table.sourceItemId)]
);

export type FeedbackData = {
  theme: string;
  observations: Array<{ text: string; sourceIds: string[] }>;
  hypotheses: Array<{ text: string; support: "弱" | "中" | "强"; sourceIds: string[] }>;
  alternatives: string[];
  uncertainties: string[];
  keyQuestion: string;
  nextAction: string;
};

export const feedbackReports = mysqlTable(
  "feedback_reports",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceRefs: json("source_refs").$type<Array<{ type: "note" | "card"; id: string }>>().notNull(),
    data: json("data").$type<FeedbackData>().notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    createdAt: datetime("created_at", { mode: "date" }).notNull()
  },
  (table) => [index("feedback_reports_user_created_idx").on(table.userId, table.createdAt)]
);

export const generationCooldowns = mysqlTable(
  "generation_cooldowns",
  {
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 32 }).notNull(),
    lastRunAt: datetime("last_run_at", { mode: "date" }).notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.action] })]
);

export const usageEvents = mysqlTable(
  "usage_events",
  {
    id: char("id", { length: 36 }).primaryKey(),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    inputTokens: bigint("input_tokens", { mode: "number", unsigned: true }).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number", unsigned: true }).notNull(),
    createdAt: datetime("created_at", { mode: "date" }).notNull()
  },
  (table) => [index("usage_events_user_created_idx").on(table.userId, table.createdAt)]
);
