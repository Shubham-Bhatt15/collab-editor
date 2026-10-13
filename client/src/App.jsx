import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import "./App.css";

// Document name comes from the URL hash: http://localhost:5173/#my-doc
const docName = window.location.hash.slice(1) || "demo";

// Created once, outside React, so re-renders never create a second connection.
const ydoc = new Y.Doc();
const provider = new HocuspocusProvider({
  url: "ws://localhost:1234",
  name: docName,
  document: ydoc,
});

// Temporary identity for cursors. Real users replace this in the auth step.
const COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5", "#0c8599"];
const user = {
  name: "User " + Math.floor(Math.random() * 1000),
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
};

export default function App() {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }), // Yjs handles undo/redo
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({ provider, user }),
    ],
  });

  return (
    <div className="page">
      <h1>Collab Editor</h1>
      <p className="meta">
        Document: <b>{docName}</b> · You are{" "}
        <span style={{ color: user.color }}>{user.name}</span>
      </p>
      <EditorContent editor={editor} className="editor" />
    </div>
  );
}