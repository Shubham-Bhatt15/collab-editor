import { useEffect, useRef, useState } from "react";
import { streamAI } from "./ai.js";

const ACTIONS = [
  { id: "rewrite", label: "Rewrite" },
  { id: "shorten", label: "Shorten" },
  { id: "grammar", label: "Fix grammar" },
];
const TONES = ["professional", "friendly", "casual", "formal"];

export default function AIPanel({ editor, docId, token, canEdit }) {
  const [job, setJob] = useState(null); // { action, source, range, result, state, error }
  const abortRef = useRef(null);

  // Cancel any in-flight request when the panel unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  function selection() {
    const { from, to, empty } = editor.state.selection;
    if (empty) return null;
    return { from, to, text: editor.state.doc.textBetween(from, to, "\n") };
  }

  async function run(action, tone) {
    const sel = action === "summarize" ? null : selection();
    const text = action === "summarize" ? editor.getText() : sel?.text;

    if (!text?.trim()) {
      setJob({ action, result: "", state: "error", error: "Select some text first." });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setJob({ action, source: text, range: sel && { from: sel.from, to: sel.to }, result: "", state: "streaming" });

    try {
      await streamAI({
        docId, action, text, tone, token,
        signal: controller.signal,
        onToken: (t) => setJob((j) => (j ? { ...j, result: j.result + t } : j)),
      });
      setJob((j) => (j ? { ...j, state: "done" } : j));
    } catch (e) {
      if (e.name === "AbortError") return;
      setJob((j) => ({ ...(j || {}), state: "error", error: e.message }));
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setJob(null);
  }

  function accept() {
    // Applied as a normal editor transaction, so Yjs syncs it to everyone.
    if (job.range && job.result) {
      editor.chain().focus().insertContentAt({ from: job.range.from, to: job.range.to }, job.result).run();
    }
    setJob(null);
  }

  const busy = job?.state === "streaming";

  return (
    <div className="ai-panel">
      <div className="ai-bar">
        <strong>AI</strong>
        {canEdit && (
          <>
            {ACTIONS.map((a) => (
              <button key={a.id} disabled={busy} onClick={() => run(a.id)}>{a.label}</button>
            ))}
            <select disabled={busy} value="" onChange={(e) => e.target.value && run("tone", e.target.value)}>
              <option value="">Change tone…</option>
              {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}
        <button disabled={busy} onClick={() => run("summarize")}>Summarize document</button>
      </div>
      {canEdit && <p className="muted">Select text in the editor, then pick an action.</p>}

      {job && (
        <div className="ai-preview">
          {job.state === "error" ? (
            <p className="error">{job.error}</p>
          ) : (
            <>
              <div className="ai-result">{job.result || "Thinking…"}</div>
              <div className="row">
                {job.range && job.state === "done" && (
                  <button className="primary" onClick={accept}>Accept</button>
                )}
                <button onClick={cancel}>{busy ? "Stop" : job.range ? "Discard" : "Close"}</button>
              </div>
            </>
          )}
          {job.state === "error" && <button onClick={() => setJob(null)}>Close</button>}
        </div>
      )}
    </div>
  );
}