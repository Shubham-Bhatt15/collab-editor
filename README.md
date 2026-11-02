# Collab Editor

A real-time collaborative rich-text editor (Google Docs-lite) with per-document permissions and streaming AI writing tools.

**Live demo:** _add link after deploying_ · **Demo video/GIF:** _add after recording_

![Screenshot](docs/screenshot.png)

## Features

**Collaboration**
- Real-time co-editing; concurrent edits merge without conflicts (CRDT)
- Live cursors and presence with user names and colors
- Offline/reconnect support: edits made while disconnected sync on reconnect

**Documents and access control**
- Sign up / log in (bcrypt-hashed passwords, JWT)
- Dashboard: create, rename, delete, open documents
- Share by email with **owner / editor / viewer** roles
- Roles are enforced **on the server** (WebSocket and REST), not just in the UI

**AI writing tools**
- Rewrite, shorten, fix grammar, change tone on selected text
- Summarize the whole document
- Streaming output into a preview panel; nothing changes the document until you click **Accept**
- Cancel mid-stream (the server aborts the model call)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tiptap (ProseMirror) |
| Sync | Yjs (CRDT), Hocuspocus (WebSocket server and provider) |
| API | Node.js, Express |
| Database | PostgreSQL (`pg`) |
| Auth | bcryptjs, JSON Web Tokens |
| AI | Any OpenAI-compatible provider via the `openai` SDK (configured by env vars) |

## Architecture

```mermaid
flowchart LR
  B[Browser<br/>React + Tiptap + Yjs]
  S[Sync server<br/>Hocuspocus :1234]
  A[REST API<br/>Express :3001]
  D[(PostgreSQL)]
  L[LLM provider]

  B -- "WebSocket + JWT" --> S
  B -- "HTTPS / JSON + SSE" --> A
  S --> D
  A --> D
  A -- "streaming" --> L
```

- **Sync server** authenticates each WebSocket connection with the JWT, checks the user's role for that document, and makes viewers read-only. It loads and saves the Yjs document state (binary) in Postgres, debounced.
- **REST API** handles accounts, documents, sharing, and the AI endpoint.
- Both servers share one database and one `JWT_SECRET`.

### How a keystroke travels

1. ProseMirror creates a transaction, and `y-prosemirror` applies it to the local `Y.Doc` (the UI updates instantly).
2. Yjs emits a small binary update, which the provider sends over the WebSocket.
3. The server applies it and broadcasts it to the other clients in that document.
4. Their Yjs docs merge it and the editors update.
5. After a debounce (2 s after the last edit, 10 s max), the server writes the document state to Postgres.

### How an AI request works

1. The client sends the selected text and an action to `POST /ai/transform` with the JWT.
2. The server checks the user's role for that document, applies a per-user rate limit and an input length cap.
3. The document text is wrapped in `<document_text>` tags, and the system prompt tells the model to treat it strictly as data.
4. The response streams back as server-sent events. If the client disconnects, the model call is aborted.
5. The user previews the result and clicks **Accept**, which applies it as a normal editor transaction so every collaborator sees it.

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ running locally
- An API key from an OpenAI-compatible provider (a free tier works)

### 1. Install

```bash
git clone https://github.com/Shubham-Bhatt15/collab-editor.git
cd collab-editor
npm install
npm --prefix server install
npm --prefix client install
```

### 2. Create the database

```bash
psql -U postgres -c "CREATE DATABASE collab;"
psql -U postgres -d collab -f server/schema.sql
```

> `schema.sql` drops and recreates the tables, so don't run it against data you want to keep.

### 3. Configure environment

Copy `server/.env.example` to `server/.env` and fill it in:

```
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/collab
JWT_SECRET=a-long-random-string
LLM_API_KEY=your-key
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=model-name-from-your-provider
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Run

```bash
npm run dev
```

This starts the sync server (1234), the API (3001), and the client (5173). Open http://localhost:5173.

## API overview

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/signup`, `/login` | No (rate limited) | Returns a JWT and the user |
| GET | `/documents` | Yes | Documents you belong to, with your role |
| POST | `/documents` | Yes | Create a document (you become owner) |
| PATCH | `/documents/:id` | Owner / editor | Rename |
| DELETE | `/documents/:id` | Owner | Delete |
| GET | `/documents/:id/members` | Owner | List members |
| POST | `/documents/:id/members` | Owner | Add or change a member's role |
| DELETE | `/documents/:id/members/:userId` | Owner | Remove a member |
| POST | `/ai/transform` | Yes (rate limited) | Streaming AI action |

## Design decisions

- **CRDT (Yjs) instead of Operational Transformation.** Merges are order-independent, work offline, and don't need a central server to sequence edits. The cost is extra metadata per character.
- **Store the binary Yjs state, not HTML or text.** Merge history survives restarts, so reconnecting clients sync correctly.
- **Awareness is separate from the document.** Cursors and names are ephemeral and never persisted.
- **Authorize on the WebSocket handshake.** Hiding buttons doesn't stop someone from connecting directly, so the server checks the JWT and the document role in `onAuthenticate` and sets viewers to read-only.
- **UUID document ids.** They can't be guessed or enumerated like incrementing ids.
- **Same error for unknown email and wrong password** so login can't be used to probe which emails exist.
- **Parameterized SQL everywhere** to prevent SQL injection.
- **Document creation uses a transaction** so a document can never exist without an owner.
- **AI never writes to the document directly.** Output streams to a preview, and a human accepts it.
- **Provider-agnostic AI.** The model and base URL are configuration, so switching providers needs no code change.
- **Prompt injection mitigation.** Document text is untrusted: it is delimited, the system prompt says to treat it as data, the model has no tools, and its output is only ever shown as text.

## Known limitations

- **AI Accept uses plain positions.** If a collaborator edits the same region while the AI is generating, the replacement can land in the wrong place. Fix: anchor with Yjs relative positions.
- **Accepted AI text is inserted as plain text**, so formatting inside the selection is lost.
- **Removing a member doesn't disconnect an open WebSocket.** Access is checked at connection time, so removal applies on their next connection.
- **JWT is stored in `localStorage`.** Acceptable for a demo; httpOnly cookies with CSRF protection are safer in production. There is also no token revocation or refresh flow.
- **A server crash can lose up to about 10 seconds of edits** because saves are debounced.
- **Single sync-server instance.** Running several would need a pub/sub layer such as Redis (Hocuspocus has a Redis extension).
- Small models can still be fooled by prompt injection. Mitigations reduce the risk but don't eliminate it.

## Roadmap

- [ ] Automated tests (permissions, viewer read-only, rate limits, AI authorization, concurrent edits)
- [ ] Deployment (client, API, sync server, hosted Postgres)
- [ ] AI edits anchored with Yjs relative positions
- [ ] AI as a collaborator: its own cursor, edits shown as accept/reject suggestions
- [ ] Auto-generated document titles
- [ ] Load test and published numbers (concurrent editors, sync latency)
- [ ] Docker Compose for one-command setup

## Project structure

```
collab-editor/
├── client/              React app (Vite, Tiptap)
│   └── src/             App, Login, Dashboard, ShareDialog, Editor, AIPanel, api/ai helpers
├── server/
│   ├── index.js         Hocuspocus sync server (auth, roles, persistence)
│   ├── api.js           Express REST API and AI endpoint
│   ├── db.js            Postgres pool and env checks
│   └── schema.sql       Database schema
└── package.json         Root scripts (npm run dev)
```

## What I learned

_Add 3 to 4 sentences in your own words: the hardest bug you hit, what surprised you about CRDTs, and what you'd do differently. Interviewers read this section._

## License

MIT