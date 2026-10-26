import { useEffect, useState } from "react";
import { api } from "./api.js";

export default function ShareDialog({ doc, token, currentUserId, onClose }) {
  const [members, setMembers] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [error, setError] = useState("");

  const load = () =>
    api(`/documents/${doc.id}/members`, { token }).then(setMembers).catch((e) => setError(e.message));

  useEffect(() => { load(); }, [doc.id]);

  async function add(e) {
    e.preventDefault();
    setError("");
    try {
      await api(`/documents/${doc.id}/members`, { method: "POST", token, body: { email, role } });
      setEmail("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(userId) {
    setError("");
    try {
      await api(`/documents/${doc.id}/members/${userId}`, { method: "DELETE", token });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Share "{doc.title}"</h3>

        <form className="row" onSubmit={add}>
          <input placeholder="Person's email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="primary" type="submit">Add</button>
        </form>
        {error && <p className="error">{error}</p>}

        <ul className="members">
          {members === null && <li className="muted">Loading…</li>}
          {members?.map((m) => (
            <li key={m.id}>
              <span>{m.name} <span className="muted">{m.email}</span></span>
              <span className="row">
                <span className={`badge ${m.role}`}>{m.role}</span>
                {m.id !== currentUserId && <button className="danger" onClick={() => remove(m.id)}>Remove</button>}
              </span>
            </li>
          ))}
        </ul>

        <button onClick={onClose}>Done</button>
      </div>
    </div>
  );
}