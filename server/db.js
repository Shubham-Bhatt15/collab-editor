import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });