import { useCallback, useEffect, useRef, useState } from "react";

export default function App() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const chatEndRef = useRef(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice("");
    const form = new FormData();
    form.append("resume", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setNotice(`Indexed ${data.file} (${data.chunks} chunks)`);
      setFiles((prev) => [
        { file: data.file, chunks: data.chunks },
        ...prev.filter((f) => f.file !== data.file),
      ]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(name) {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      setFiles((prev) => prev.filter((f) => f.file !== name));
      setNotice(`Deleted ${name}`);
    } catch (err) {
      setNotice(`Error: ${err.message}`);
    }
  }

  async function sendQuestion() {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", streaming: true },
    ]);
    setQuestion("");
    setBusy(true);

    const appendDelta = (delta) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: last.content + delta };
        return next;
      });

    const finalize = (sources = [], content) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          streaming: false,
          sources,
          content: content ?? last.content,
        };
        return next;
      });

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (data.delta) appendDelta(data.delta);
          if (data.done) finalize(data.sources || [], data.answer);
          else if (data.error) finalize([], `Error: ${data.error}`);
        }
      }
    } catch (err) {
      finalize([], `Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Resume RAG Analyser</h1>
        <p>Upload resumes, then ask questions about them.</p>
      </header>

      <main>
        <section className="panel upload-panel">
          <h2>Upload Resume</h2>
          <div className="drop-zone">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleUpload}
              disabled={uploading}
            />
            <p>PDF, DOCX, or TXT — up to 10 MB</p>
          </div>
          {uploading && <p className="notice">Indexing…</p>}
          {notice && <p className="notice">{notice}</p>}

          <h3>Indexed Resumes</h3>
          {files.length === 0 ? (
            <p className="empty">No resumes indexed yet.</p>
          ) : (
            <ul>
              {files.map((f) => (
                <li key={f.file}>
                  <span className="file-name">{f.file}</span>
                  <div className="file-actions">
                    <span className="chunks">{f.chunks} chunks</span>
                    <button
                      className="delete-btn"
                      onClick={() => {
                        if (confirm(`Delete ${f.file} from the index?`))
                          handleDelete(f.file);
                      }}
                      title="Delete from index"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel chat-panel">
          <h2>Ask the Resumes</h2>
          <div className="messages">
            {messages.length === 0 ? (
              <p className="empty">
                Try: &ldquo;Who has Kubernetes experience?&rdquo;
              </p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <div className="msg-content">{m.content}</div>
                  {m.streaming && <div className="typing">…</div>}
                  {m.sources?.length > 0 && (
                    <div className="sources">
                      {m.sources.map((s) => (
                        <span key={s.n} className="chip">
                          [{s.n}] {s.file}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="input-row">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendQuestion()}
              placeholder="Ask a question about the resumes…"
              disabled={busy}
            />
            <button onClick={sendQuestion} disabled={busy || !question.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}