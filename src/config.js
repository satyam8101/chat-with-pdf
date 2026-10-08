import "dotenv/config";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_EMBED_MODEL =
  process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
export const GEMINI_EMBED_DIMENSIONS = Number(
  process.env.GEMINI_EMBED_DIMENSIONS || 3072,
);
export const JINA_API_KEY = process.env.JINA_API_KEY;
export const JINA_EMBED_MODEL =
  process.env.JINA_EMBED_MODEL || "jina-embeddings-v3";
export const HF_TOKEN = process.env.HF_TOKEN;
export const HF_EMBED_MODEL =
  process.env.HF_EMBED_MODEL || "sentence-transformers/all-MiniLM-L6-v2";

export const GROQ_API_KEY = process.env.GROQ_API_KEY;
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export const CHROMA_API_KEY = process.env.CHROMA_API_KEY;
export const CHROMA_TENANT = process.env.CHROMA_TENANT;
export const CHROMA_DATABASE = process.env.CHROMA_DATABASE;
export const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || "resumes";

export const RESUMES_DIR = process.env.RESUMES_DIR || "resumes";
export const TOP_K = Number(process.env.TOP_K || 4);
export const SERVER_PORT = Number(
  process.env.PORT || process.env.SERVER_PORT || 4000,
);
