import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

const COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599"];

export default function Editor({ doc, token, user, onRename }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: "ws://localhost:1234",
      name: doc.id,
      document: ydoc,
      token,
      onAuthenticated: () => setStatus("connected"),
      onAuthenticationFailed: () => setStatus("denied"),
    });
    setSession({ ydoc, provider });
    return () => {
      provider.destroy();
      ydoc.destroy();
      setSession(null);
    };
  }, [doc.id, token]);

  if (status === "denied") return <p className="error">You don't have access to this document.</p>;
  if (!session) return null;
  return <EditorInner session={session} doc={doc} user={user} status={status} onRename={onRename} />;;
}

function EditorInner({ session, doc, user, status, onRename }) {
  const [title, setTitle] = useState(doc.title);
  const canRename = doc.role !== "viewer";

  const editor = useEditor({
    editable: doc.role !== "viewer",
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: session.ydoc }),
      CollaborationCursor.configure({
        provider: session.provider,
        user: { name: user.name, color: COLORS[user.id % COLORS.length] },
      }),
    ],
  });

  return (
    <>
      <div className="editor-head">
        <input
          className="title-input"
          value={title}
          disabled={!canRename}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== doc.title && onRename(doc.id, title)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className={`badge ${doc.role}`}>{doc.role}</span>
        <span className={`status ${status}`}>● {status}</span>
      </div>
      {doc.role === "viewer" && <p className="muted">You have view-only access.</p>}
      <EditorContent editor={editor} className="editor" />
    </>
  );
}