const API = "http://localhost:3001";

// Streams an AI result. Calls onToken for each piece. Returns when done.
export async function streamAI({ docId, action, text, tone, token, signal, onToken }) {
  const res = await fetch(`${API}/ai/transform`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ docId, action, text, tone }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "AI request failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Server-sent events are separated by a blank line.
    const events = buffer.split("\n\n");
    buffer = events.pop();

    for (const ev of events) {
      if (ev.startsWith("event: error")) throw new Error("The AI request failed");
      if (!ev.startsWith("data: ")) continue;
      const data = ev.slice(6);
      if (data === "[DONE]") return;
      onToken(JSON.parse(data));
    }
  }
}