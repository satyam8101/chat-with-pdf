# Resume RAG Analyser — Knowledge Base

A retrieval-augmented generation (RAG) system that ingests resumes, stores their
embeddings, and answers questions about them using Groq's LLM. **Pure Node.js**
(MERN-style) — no Python, no local models, no Docker.

Every heavy step is a hosted, free-tier API:
- **Embeddings**: Gemini (`gemini-embedding-001`), fallback Jina → Hugging Face
- **Vector store**: Chroma Cloud (hosted)
- **Generation**: Groq (`llama-3.3-70b-versatile`)

---

## 1. Architecture

```
Browser (React, Vite :5173 / or static build served by Express)
      │  fetch /api/*
      ▼
Express API (server.js :4000)
      │
      ├─ POST /api/upload            → parse → chunk → embed → Chroma Cloud
      ├─ POST /api/chat/stream (SSE) → embed query → search Chroma → Groq (stream)
      ├─ GET  /api/files  ·  DELETE /api/files/:name  ·  GET /api/health
      │
      ├────────────►  Chroma Cloud   (hosted vector store)
      ├────────────►  Gemini         (embedding, fallback Jina → HF)
      └────────────►  Groq           (answer generation)
```

Two local processes (or one deployed service — Express serves the built frontend):

| Process | Tech | Port | Role |
|---|---|---|---|
| API | Node Express | 4000 | HTTP API + optional static hosting of the built UI |
| Frontend (dev) | React + Vite | 5173 | upload UI + chat UI (dev only) |

---

## 2. Workflows

### A. Ingest / upload (documents → vectors)

1. **Browser** uploads a resume (PDF/DOCX/TXT) → `POST /api/upload`.
2. **Express** keeps the file in memory (multer), calls `parseBuffer` to extract
   plain text, then `chunkText` to split it into ~900-char chunks.
3. Express builds items `{id, text, metadata:{file, chunk}}` and calls
   `store.ingest()`.
4. `store.ingest()` embeds every chunk (`embed.embedTexts` → Gemini) and
   `upsert`s them into Chroma Cloud. Re-uploading the same file overwrites its
   chunks.
5. Browser refreshes the file list via `GET /api/files`.

### B. Query / chat (question → answer)

1. **Browser** sends the question to `POST /api/chat/stream`.
2. `store.search()` embeds the question and returns the top-k similar chunks
   (Chroma cosine distance).
3. Express wraps chunks as numbered snippets `[1] file …`, passes them to
   Groq's streaming API (`answerStream`), and relays token deltas to the browser
   over Server-Sent Events.
4. When the stream finishes, citations `(1)`, `[2]`, … are extracted from the
   answer and mapped back to file names → final SSE event `sources`.
5. **Browser** renders the text live (streaming) and shows source chips.

---

## 3. Files — what each does

### `src/config.js` — environment & constants
Reads `.env` (dotenv) and exports all settings: embedding keys/models
(`GEMINI_*`, `JINA_*`, `HF_*`), Groq (`GROQ_API_KEY`, `GROQ_MODEL`), Chroma
(`CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`, `CHROMA_COLLECTION`), and
app settings (`RESUMES_DIR`, `TOP_K`, `SERVER_PORT`).

### `src/embed.js` — embedding fallback chain
| Function | Purpose |
|---|---|
| `embedTexts(texts)` | Dispatcher: tries **Gemini → Jina → Hugging Face** in order; returns first provider that succeeds, raises if all fail |
| `geminiEmbed(texts)` | `@google/genai` → `gemini-embedding-001`, `outputDimensionality` 768 |
| `jinaEmbed(texts)` | `api.jina.ai/v1/embeddings` → `jina-embeddings-v3`, 1024 dims |
| `hfEmbed(texts)` | HF Inference API → `all-MiniLM-L6-v2` feature extraction |
| `geminiClient()` | Lazily-created singleton `GoogleGenAI` client |

### `src/store.js` — Chroma Cloud vector store
| Function | Purpose |
|---|---|
| `client()` | Lazy singleton `CloudClient` (Chroma Cloud, API-key auth) |
| `collection()` | Lazy `getOrCreateCollection("resumes")` |
| `ingest(items)` | Embeds chunk texts, `upsert` into Chroma |
| `search(query, topK)` | Embeds the query, returns top-k `{id, text, metadata, score}` |
| `listFiles()` | Distinct file names + chunk counts (from metadata) |
| `deleteFile(filename)` | Deletes every chunk whose metadata `file` matches |
| `health()` | `{ok, count}` |

### `src/parse.js` — text extraction
| Function | Purpose |
|---|---|
| `parseFile(filePath)` | Reads a file from disk, delegates to `parseBuffer` |
| `parseBuffer(buf, filename)` | Switches on extension: PDF via `pdf-parse`, DOCX via `mammoth`, TXT/MD as UTF-8 |

### `src/chunk.js` — chunking
| Function | Purpose |
|---|---|
| `chunkText(text, {size, overlap})` | Splits by lines, groups into ~900-char chunks with ~120-char overlap so context isn't cut mid-sentence |
| `tail(text, n)` | Returns the last `n` chars of a chunk to seed the next one |

### `src/groq.js` — LLM + citations
| Function | Purpose |
|---|---|
| `buildPrompt(question, snippets)` | Builds the numbered-snippet prompt `[1] file …` and instructs the model to cite inline |
| `citationList(text, max)` | Regex-extracts citation numbers from `(1)` / `[1, 2]` patterns; validates against the snippet count |
| `sourcesFor(cited, snippets)` | Maps citation numbers → `{n, file}` |
| `answer(question, snippets)` | Non-streaming completion; returns `{answer, sources}` |
| `answerStream(question, snippets)` | Async generator: yields `{delta}` per token, then a final `{sources}` event |

### `server.js` — Express HTTP API
| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness + chunk count (hits Chroma Cloud) |
| `POST /api/upload` | Accepts a resume (`multipart/form-data`, field `resume`), parses + chunks + ingests |
| `GET /api/files` | File list from Chroma metadata |
| `DELETE /api/files/:name` | Removes one resume and all its chunks from the index |
| `POST /api/chat` | Non-streaming Q&A (fallback) |
| `POST /api/chat/stream` | SSE streaming Q&A; sends `data:` events (`delta`, then `done` with `sources`), or `error` |
| static | Serves `client/dist` if built, with SPA fallback |

### CLIs (alternative to the UI)
| File | Purpose |
|---|---|
| `ingest.js` | Re-indexes every file in `resumes/` (calls `store.ingest`) |
| `query.js` | Asks one question and prints snippets, answer, sources |

### Frontend — `client/`
| File | Purpose |
|---|---|
| `vite.config.js` | Dev server on :5173, proxies `/api` → :4000 |
| `src/App.jsx` | `App()` — layout (upload panel + chat panel); `loadFiles()`; `handleUpload()`; `handleDelete()`; `sendQuestion()` — streams via a `fetch` reader parsing SSE lines, with `appendDelta`/`finalize` helpers |
| `src/index.css` | Dark theme, panels, message bubbles, source chips |

---

## 4. Data flow with numbered snippets

Snippets are numbered by retrieval order:

```
[1] (arjun_mehta.txt) Kubernetes and Docker…
[2] (sneha_patel.txt) React, TypeScript…
```

The model is told to cite inline: `"Arjun knows Docker (1) and Sneha knows React (2)"`.
`citationList()` then extracts `[1, 2]` and the UI shows:

```
[1] arjun_mehta.txt   [2] sneha_patel.txt
```

---

## 5. Environment variables (`.env`)

| Var | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google AI Studio key for embeddings |
| `GEMINI_EMBED_MODEL` | no | default `gemini-embedding-001` |
| `GEMINI_EMBED_DIMENSIONS` | no | default `3072` — must match the dimension the Chroma collection was created with |
| `JINA_API_KEY` | no | fallback if Gemini fails |
| `HF_TOKEN` | no | second fallback |
| `GROQ_API_KEY` | yes | for the answer LLM |
| `GROQ_MODEL` | no | default `openai/gpt-oss-120b` |
| `CHROMA_API_KEY` | yes | Chroma Cloud API key |
| `CHROMA_TENANT` | yes | Chroma Cloud tenant ID |
| `CHROMA_DATABASE` | yes | Chroma Cloud database name |
| `CHROMA_COLLECTION` | no | default `resumes` |
| `RESUMES_DIR` | no | default `resumes` |
| `TOP_K` | no | default `4` |
| `SERVER_PORT` | no | default `4000` (falls back to `PORT`) |

---

## 6. How to run

```bash
# 1. API — port 4000
node server.js

# 2. Frontend dev — port 5173
cd client && npm run dev

# open http://localhost:5173
```

CLI alternative: `node ingest.js` then `node query.js "your question"`.

---

## 6.1 Deployment

Pure Node means a **single service**: Express serves the built React app and the
API together (same origin → no CORS, SSE works through normal proxies).

**Render (easiest):** the repo includes `render.yaml` — New → Blueprint → pick
repo. It builds the frontend, runs `node server.js`, and prompts for the secrets
(`GROQ_API_KEY`, `GEMINI_API_KEY`, `CHROMA_API_KEY`, `CHROMA_TENANT`,
`CHROMA_DATABASE`). The API reads the injected `PORT`.

**VPS/Railway/Fly.io:** use the included `Dockerfile` (Node image that installs
both packages, builds the frontend, runs `node server.js`). Put Nginx in front
with `proxy_buffering off` for `/api/chat/stream`.

Free-tier note: Render/Railway services sleep after ~15 min idle (cold start on
the first request).

---

## 7. Design decisions

- **Pure Node** — after moving storage to Chroma Cloud, the Python sidecar had no
  job left (it existed only to embed Chroma locally, which Node's client can't).
  Chroma's official JS `CloudClient` connects to Cloud directly, so embedding +
  storage now live in Node (`src/embed.js`, `src/store.js`).
- **Gemini embeddings first** — best free-tier quality/rate-limit; Jina/HF are
  automatic fallbacks if it errors.
- **Chroma Cloud** — hosted vector store, so nothing to persist locally; makes
  deployment a single stateless service.
- **Swappable storage** — all Chroma calls are isolated in `src/store.js`;
  swapping to Qdrant/LanceDB means replacing one module.
- **No local models / no Docker** — all ML work is remote APIs; zero heavy installs.
  (`@chroma-core/default-embed` is installed only to silence a Chroma client
  warning — it's 0.2 MB and its model is never invoked since we always pass
  explicit embeddings.)
- **Upsert** — re-uploading a resume overwrites its chunks instead of erroring.
- **Streaming + citations** — Groq tokens stream over SSE; the model cites
  numbered snippets and the UI renders source chips for cited files only.