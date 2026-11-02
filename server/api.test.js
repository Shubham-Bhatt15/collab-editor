import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "./api.js";
import { pool } from "./db.js";

const FAKE_ID = "00000000-0000-4000-8000-000000000000";
let owner, editor, viewer, stranger, docId;

async function signup(name) {
  const email = `${name}@test.com`;
  const res = await request(app).post("/signup").send({ name, email, password: "password123" });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  await pool.query("TRUNCATE users, documents, document_members RESTART IDENTITY CASCADE");
  owner = await signup("owner");
  editor = await signup("editor");
  viewer = await signup("viewer");
  stranger = await signup("stranger");

  const doc = await request(app).post("/documents").set(as(owner)).send({ title: "Test doc" });
  docId = doc.body.id;
  await request(app).post(`/documents/${docId}/members`).set(as(owner)).send({ email: editor.email, role: "editor" });
  await request(app).post(`/documents/${docId}/members`).set(as(owner)).send({ email: viewer.email, role: "viewer" });
});

afterAll(() => pool.end());

describe("authentication", () => {
  it("rejects short passwords", async () => {
    const res = await request(app).post("/signup").send({ name: "x", email: "x@test.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate emails", async () => {
    const res = await request(app).post("/signup").send({ name: "dup", email: owner.email, password: "password123" });
    expect(res.status).toBe(409);
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    const ok = await request(app).post("/login").send({ email: owner.email, password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const bad = await request(app).post("/login").send({ email: owner.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("gives the same error for an unknown email and a wrong password", async () => {
    const unknown = await request(app).post("/login").send({ email: "nobody@test.com", password: "password123" });
    const wrong = await request(app).post("/login").send({ email: owner.email, password: "wrong-password" });
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it("requires a token for documents", async () => {
    expect((await request(app).get("/documents")).status).toBe(401);
  });
});

describe("document access", () => {
  it("only lists documents the user belongs to", async () => {
    const res = await request(app).get("/documents").set(as(stranger));
    expect(res.body).toEqual([]);
  });

  it("shows members their role", async () => {
    const res = await request(app).get("/documents").set(as(viewer));
    expect(res.body[0].role).toBe("viewer");
  });

  it("rejects malformed document ids", async () => {
    const res = await request(app).patch("/documents/not-a-uuid").set(as(owner)).send({ title: "x" });
    expect(res.status).toBe(400);
  });
});

describe("role enforcement", () => {
  it("viewer cannot rename", async () => {
    const res = await request(app).patch(`/documents/${docId}`).set(as(viewer)).send({ title: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("editor can rename", async () => {
    const res = await request(app).patch(`/documents/${docId}`).set(as(editor)).send({ title: "Renamed" });
    expect(res.status).toBe(200);
  });

  it("editor cannot share or list members", async () => {
    const share = await request(app).post(`/documents/${docId}/members`).set(as(editor))
      .send({ email: stranger.email, role: "editor" });
    expect(share.status).toBe(403);
    expect((await request(app).get(`/documents/${docId}/members`).set(as(editor))).status).toBe(403);
  });

  it("editor cannot delete", async () => {
    expect((await request(app).delete(`/documents/${docId}`).set(as(editor))).status).toBe(403);
  });

  it("owner cannot be removed", async () => {
    const res = await request(app).delete(`/documents/${docId}/members/${owner.id}`).set(as(owner));
    expect(res.status).toBe(400);
  });

  it("owner can delete, and members lose the document", async () => {
    const created = await request(app).post("/documents").set(as(owner)).send({ title: "Temp" });
    await request(app).post(`/documents/${created.body.id}/members`).set(as(owner))
      .send({ email: viewer.email, role: "viewer" });
    expect((await request(app).delete(`/documents/${created.body.id}`).set(as(owner))).status).toBe(200);

    const list = await request(app).get("/documents").set(as(viewer));
    expect(list.body.find((d) => d.id === created.body.id)).toBeUndefined();
  });
});

describe("AI endpoint access checks", () => {
  const body = (extra) => ({ docId, action: "rewrite", text: "hello world", ...extra });

  it("requires login", async () => {
    expect((await request(app).post("/ai/transform").send(body())).status).toBe(401);
  });

  it("rejects unknown actions", async () => {
    const res = await request(app).post("/ai/transform").set(as(owner)).send(body({ action: "hack" }));
    expect(res.status).toBe(400);
  });

  it("rejects text that is too long", async () => {
    const res = await request(app).post("/ai/transform").set(as(owner)).send(body({ text: "a".repeat(5000) }));
    expect(res.status).toBe(413);
  });

  it("blocks users with no access to the document", async () => {
    const res = await request(app).post("/ai/transform").set(as(stranger)).send(body());
    expect(res.status).toBe(403);
  });

  it("blocks a document that does not exist", async () => {
    const res = await request(app).post("/ai/transform").set(as(owner)).send(body({ docId: FAKE_ID }));
    expect(res.status).toBe(403);
  });

  it("blocks viewers from edit actions", async () => {
    const res = await request(app).post("/ai/transform").set(as(viewer)).send(body());
    expect(res.status).toBe(403);
  });
});