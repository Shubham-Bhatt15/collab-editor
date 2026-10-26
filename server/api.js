import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const sign = (u) =>
  jwt.sign({ sub: u.id, name: u.name }, process.env.JWT_SECRET, { expiresIn: "7d" });

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: p.sub, name: p.name };
    next();
  } catch {
    res.status(401).json({ error: "Not logged in" });
  }
}

app.post("/signup", async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password || password.length < 8)
    return res.status(400).json({ error: "Name, email and a password of 8+ characters are required" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, name",
      [email.toLowerCase(), name, hash]
    );
    res.json({ token: sign(rows[0]), user: rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Email already registered" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query(
    "SELECT id, name, password_hash FROM users WHERE email = $1",
    [(email || "").toLowerCase()]
  );
  const u = rows[0];
  // Same message for unknown email and wrong password, so emails can't be probed.
  if (!u || !(await bcrypt.compare(password || "", u.password_hash)))
    return res.status(401).json({ error: "Invalid email or password" });
  res.json({ token: sign(u), user: { id: u.id, name: u.name } });
});

app.get("/documents", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, m.role, d.updated_at
     FROM documents d JOIN document_members m ON m.document_id = d.id
     WHERE m.user_id = $1 ORDER BY d.updated_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.post("/documents", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO documents (title) VALUES ($1) RETURNING id, title",
      [req.body?.title || "Untitled"]
    );
    await client.query(
      "INSERT INTO document_members (document_id, user_id, role) VALUES ($1, $2, 'owner')",
      [rows[0].id, req.user.id]
    );
    await client.query("COMMIT");
    res.json({ ...rows[0], role: "owner" });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// Owner shares a document with someone by email.
app.post("/documents/:id/members", auth, async (req, res) => {
  const { email, role } = req.body || {};
  if (!["editor", "viewer"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  const own = await pool.query(
    "SELECT 1 FROM document_members WHERE document_id = $1 AND user_id = $2 AND role = 'owner'",
    [req.params.id, req.user.id]
  );
  if (!own.rows[0]) return res.status(403).json({ error: "Only the owner can share" });
  const target = await pool.query("SELECT id FROM users WHERE email = $1", [(email || "").toLowerCase()]);
  if (!target.rows[0]) return res.status(404).json({ error: "No user with that email" });
  await pool.query(
    `INSERT INTO document_members (document_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [req.params.id, target.rows[0].id, role]
  );
  res.json({ ok: true });
});

app.listen(3001, () => console.log("API on http://localhost:3001"));