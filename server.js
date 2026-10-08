import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { parseBuffer } from "./src/parse.js";
import { chunkText } from "./src/chunk.js";
import { answer, answerStream } from "./src/groq.js";
import { deleteFile, health, ingest, listFiles, search } from "./src/store.js";
import { SERVER_PORT, TOP_K } from "./src/config.js";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get("/api/health", async (_req, res) => {
  try {
    res.json(await health());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/upload", upload.single("resume"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const originalName = req.file.originalname;

  let text;
  try {
    text = await parseBuffer(req.file.buffer, originalName);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const chunks = chunkText(text);
  const items = chunks.map((c, i) => ({
    id: `${path.basename(originalName, path.extname(originalName))}__${i}`,
    text: c,
    metadata: { file: originalName, chunk: i },
  }));

  try {
    const result = await ingest(items);
    res.json({ ok: true, file: originalName, chunks: result.count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/files", async (_req, res) => {
  try {
    const data = await listFiles();
    res.json(data.files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/files/:name", async (req, res) => {
  try {
    const data = await deleteFile(req.params.name);
    res.json({ ok: true, count: data.count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/chat", async (req, res) => {
  const question = (req.body?.question || "").trim();
  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }
  try {
    const { results } = await search(question, TOP_K);
    if (!results.length) {
      return res.json({ answer: "No relevant resumes found yet.", sources: [] });
    }
    const snippets = results.map((r) => ({ file: r.metadata.file, text: r.text }));
    const { answer: reply, sources } = await answer(question, snippets);
    res.json({ answer: reply, sources });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/chat/stream", async (req, res) => {
  const question = (req.body?.question || "").trim();
  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const { results } = await search(question, TOP_K);
    if (!results.length) {
      send({ done: true, answer: "No relevant resumes found yet.", sources: [] });
      return res.end();
    }
    const snippets = results.map((r) => ({ file: r.metadata.file, text: r.text }));
    for await (const ev of answerStream(question, snippets)) {
      if (ev.delta) {
        send({ delta: ev.delta });
      } else if (ev.sources) {
        send({ done: true, sources: ev.sources });
      }
    }
    res.end();
  } catch (e) {
    if (res.headersSent) {
      send({ error: e.message });
      res.end();
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

const dist = path.join(process.cwd(), "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(SERVER_PORT, () => {
  console.log(`API running on http://127.0.0.1:${SERVER_PORT}`);
});