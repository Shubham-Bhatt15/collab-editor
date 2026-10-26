export default function Dashboard({ docs, onCreate, onRename, onDelete, onShare }) {
  if (docs === null) return <p className="muted">Loading documents…</p>;

  return (
    <>
      <div className="toolbar">
        <h2>Your documents</h2>
        <button className="primary" onClick={onCreate}>+ New document</button>
      </div>

      {docs.length === 0 ? (
        <div className="empty">
          <p>No documents yet.</p>
          <button className="primary" onClick={onCreate}>Create your first document</button>
        </div>
      ) : (
        <div className="grid">
          {docs.map((d) => (
            <div className="card" key={d.id}>
              <a className="card-title" href={`#${d.id}`}>{d.title}</a>
              <div className="card-meta">
                <span className={`badge ${d.role}`}>{d.role}</span>
                <span className="muted">{new Date(d.updated_at).toLocaleString()}</span>
              </div>
              <div className="card-actions">
                {d.role !== "viewer" && (
                  <button
                    onClick={() => {
                      const t = prompt("Rename document", d.title);
                      if (t !== null) onRename(d.id, t);
                    }}
                  >
                    Rename
                  </button>
                )}
                {d.role === "owner" && (
                  <>
                    <button onClick={() => onShare(d)}>Share</button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm(`Delete "${d.title}" for everyone? This can't be undone.`)) onDelete(d.id);
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}