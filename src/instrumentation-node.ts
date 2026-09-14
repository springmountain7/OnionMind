import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

export async function migrate() {
  const sql = await fs.readFile(path.join(process.cwd(), "migrations", "0001_initial.sql"), "utf8");
  const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });
  try {
    await connection.query(sql);
    console.log("Database migration complete.");
  } finally {
    await connection.end();
  }
}
