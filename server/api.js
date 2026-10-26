import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import rateLimit from "express-rate-limit";

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

async function roleOf(docId, userId) {
  const { rows } = await pool.query(
    "SELECT role FROM document_members WHERE document_id = $1 AND user_id = $2",
    [docId, userId]
  );
  return rows[0]?.role;
}

app.use(
  ["/login", "/signup"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts, try again later" },
  })
);

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


// List who has access (owner only).
app.get("/documents/:id/members", auth, async (req, res) => {
  if ((await roleOf(req.params.id, req.user.id)) !== "owner")
    return res.status(403).json({ error: "Only the owner can see members" });
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, m.role
     FROM document_members m JOIN users u ON u.id = m.user_id
     WHERE m.document_id = $1 ORDER BY m.role, u.name`,
    [req.params.id]
  );
  res.json(rows);
});

// Rename (owner or editor).
app.patch("/documents/:id", auth, async (req, res) => {
  const role = await roleOf(req.params.id, req.user.id);
  if (role !== "owner" && role !== "editor")
    return res.status(403).json({ error: "You can't rename this document" });
  const title = String(req.body?.title || "").trim().slice(0, 200) || "Untitled";
  await pool.query("UPDATE documents SET title = $2 WHERE id = $1", [req.params.id, title]);
  res.json({ ok: true, title });
});

// Delete (owner only). Members are removed by ON DELETE CASCADE.
app.delete("/documents/:id", auth, async (req, res) => {
  if ((await roleOf(req.params.id, req.user.id)) !== "owner")
    return res.status(403).json({ error: "Only the owner can delete" });
  await pool.query("DELETE FROM documents WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// Remove someone's access (owner only, can't remove yourself).
app.delete("/documents/:id/members/:userId", auth, async (req, res) => {
  const target = Number(req.params.userId);
  if ((await roleOf(req.params.id, req.user.id)) !== "owner")
    return res.status(403).json({ error: "Only the owner can remove members" });
  if (target === req.user.id) return res.status(400).json({ error: "Owner can't be removed" });
  await pool.query("DELETE FROM document_members WHERE document_id = $1 AND user_id = $2", [
    req.params.id,
    target,
  ]);
  res.json({ ok: true });
});

app.listen(3001, () => console.log("API on http://localhost:3001"));