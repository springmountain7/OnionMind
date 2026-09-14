import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { onionPool?: mysql.Pool };

const databaseUrl = new URL(process.env.DATABASE_URL ?? "mysql://invalid:invalid@127.0.0.1:3306/invalid");

export const pool =
  globalForDb.onionPool ??
  mysql.createPool({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.slice(1),
    connectionLimit: 8,
    enableKeepAlive: true,
    timezone: "Z"
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.onionPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
