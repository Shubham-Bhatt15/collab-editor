import "dotenv/config";
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const server = Server.configure({
  port: 1234,
  debounce: 2000,
  maxDebounce: 10000,

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const { rows } = await pool.query(
          "SELECT data FROM documents WHERE name = $1",
          [documentName]
        );
        return rows[0]?.data ?? null;
      },

      store: async ({ documentName, state }) => {
        await pool.query(
          `INSERT INTO documents (name, data, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (name)
           DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [documentName, state]
        );
        console.log(`saved "${documentName}" (${state.length} bytes)`);
      },
    }),
  ],

  async onConnect({ documentName }) {
    console.log(`client connected to "${documentName}"`);
  },
  async onDisconnect({ documentName }) {
    console.log(`client left "${documentName}"`);
  },
});

server.listen();