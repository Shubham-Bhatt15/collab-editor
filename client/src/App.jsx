import { useEffect, useState } from "react";
import Login from "./Login.jsx";
import Editor from "./Editor.jsx";
import Dashboard from "./Dashboard.jsx";
import ShareDialog from "./ShareDialog.jsx";
import { api } from "./api.js";
import "./App.css";

export default function App() {
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem("auth") || "null"));
  const [docs, setDocs] = useState(null); // null means still loading
  const [docId, setDocId] = useState(window.location.hash.slice(1));
  const [sharing, setSharing] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onHash = () => setDocId(window.location.hash.slice(1));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function logout() {
    localStorage.removeItem("auth");
    setAuth(null);
    setDocs(null);
  }

  useEffect(() => {
    if (!auth) return;
    api("/documents", { token: auth.token }).then(setDocs).catch(logout);
  }, [auth]);

  function handleAuth(data) {
    localStorage.setItem("auth", JSON.stringify(data));
    setAuth(data);
  }

  async function act(fn) {
    setError("");
    try { await fn(); } catch (e) { setError(e.message); }
  }

  const createDoc = () =>
    act(async () => {
      const d = await api("/documents", { method: "POST", token: auth.token, body: { title: "Untitled" } });
      setDocs((ds) => [d, ...ds]);
      window.location.hash = d.id;
    });

  const renameDoc = (id, title) =>
    act(async () => {
      const r = await api(`/documents/${id}`, { method: "PATCH", token: auth.token, body: { title } });
      setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, title: r.title } : d)));
    });

  const deleteDoc = (id) =>
    act(async () => {
      await api(`/documents/${id}`, { method: "DELETE", token: auth.token });
      setDocs((ds) => ds.filter((d) => d.id !== id));
    });

  if (!auth)
    return (
      <div className="auth-page">
        <h1>Collab Editor</h1>
        <Login onAuth={handleAuth} />
      </div>
    );

  const current = docs?.find((d) => d.id === docId);

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#">Collab Editor</a>
        <span>
          {auth.user.name} <button onClick={logout}>Log out</button>
        </span>
      </header>

      <main className="page">
        {error && <p className="error">{error}</p>}

        {current ? (
          <>
            <a className="back" href="#">← All documents</a>
            <Editor key={current.id} doc={current} token={auth.token} user={auth.user} onRename={renameDoc} />
          </>
        ) : docId && docs !== null ? (
          <p className="muted">Document not found, or you don't have access. <a href="#">Back to documents</a></p>
        ) : (
          <Dashboard
            docs={docs}
            onCreate={createDoc}
            onRename={renameDoc}
            onDelete={deleteDoc}
            onShare={setSharing}
          />
        )}
      </main>

      {sharing && (
        <ShareDialog doc={sharing} token={auth.token} currentUserId={auth.user.id} onClose={() => setSharing(null)} />
      )}
    </>
  );
}