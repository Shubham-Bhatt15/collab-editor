import { useEffect, useState } from "react";
import Login from "./Login.jsx";
import Editor from "./Editor.jsx";
import { api } from "./api.js";
import "./App.css";

export default function App() {
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem("auth") || "null"));
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState(window.location.hash.slice(1));

  useEffect(() => {
    const onHash = () => setDocId(window.location.hash.slice(1));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function logout() {
    localStorage.removeItem("auth");
    setAuth(null);
    setDocs([]);
  }

  useEffect(() => {
    if (!auth) return;
    api("/documents", { token: auth.token }).then(setDocs).catch(logout);
  }, [auth]);

  function handleAuth(data) {
    localStorage.setItem("auth", JSON.stringify(data));
    setAuth(data);
  }

  async function createDoc() {
    const d = await api("/documents", { method: "POST", token: auth.token, body: { title: "Untitled" } });
    setDocs([d, ...docs]);
    window.location.hash = d.id;
  }

  if (!auth) return <div className="page"><h1>Collab Editor</h1><Login onAuth={handleAuth} /></div>;

  const current = docs.find((d) => d.id === docId);

  return (
    <div className="page">
      <h1>Collab Editor</h1>
      <p className="meta">
        Logged in as <b>{auth.user.name}</b> · <button className="link" onClick={logout}>Log out</button>
      </p>

      {current ? (
        <>
          <button className="link" onClick={() => (window.location.hash = "")}>← All documents</button>
          <Editor key={current.id} doc={current} token={auth.token} user={auth.user} />
        </>
      ) : (
        <>
          <button onClick={createDoc}>+ New document</button>
          <ul className="docs">
            {docs.map((d) => (
              <li key={d.id}>
                <a href={`#${d.id}`}>{d.title}</a> <span className="meta">({d.role})</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}