import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const migrationsPath = path.join(process.cwd(), "migrations");
const migrationFiles = (await fs.readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort();
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });

try {
  for (const file of migrationFiles) {
    const migration = await fs.readFile(path.join(migrationsPath, file), "utf8");
    await connection.query(migration);
  }
  console.log("Database migration complete.");
} finally {
  await connection.end();
}
