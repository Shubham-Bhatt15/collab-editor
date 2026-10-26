import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const server = Server.configure({
  port: 1234,
  debounce: 2000,
  maxDebounce: 10000,

  // Runs on every connection, before the document is loaded.
  async onAuthenticate({ token, documentName, connection }) {
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new Error("Invalid token");
    }
    if (!UUID.test(documentName)) throw new Error("Bad document id");

    const { rows } = await pool.query(
      "SELECT role FROM document_members WHERE document_id = $1 AND user_id = $2",
      [documentName, payload.sub]
    );
    if (!rows[0]) throw new Error("Forbidden");

    // Viewers can read and see cursors, but the server ignores their edits.
    if (rows[0].role === "viewer") connection.readOnly = true;

    console.log(`${payload.name} joined ${documentName} as ${rows[0].role}`);
    return { user: { id: payload.sub, name: payload.name } };
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const { rows } = await pool.query("SELECT data FROM documents WHERE id = $1", [documentName]);
        return rows[0]?.data ?? null;
      },
      store: async ({ documentName, state }) => {
        await pool.query("UPDATE documents SET data = $2, updated_at = now() WHERE id = $1", [
          documentName,
          state,
        ]);
        console.log(`saved "${documentName}" (${state.length} bytes)`);
      },
    }),
  ],

  async onDisconnect({ documentName }) {
    console.log(`client left "${documentName}"`);
  },
});

server.listen();