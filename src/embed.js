import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_API_KEY,
  GEMINI_EMBED_DIMENSIONS,
  GEMINI_EMBED_MODEL,
  HF_EMBED_MODEL,
  HF_TOKEN,
  JINA_API_KEY,
  JINA_EMBED_MODEL,
} from "./config.js";

let _client = null;

function geminiClient() {
  if (!_client) _client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return _client;
}

async function geminiEmbed(texts) {
  if (!GEMINI_API_KEY) return null;
  const res = await geminiClient().models.embedContent({
    model: GEMINI_EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: GEMINI_EMBED_DIMENSIONS },
  });
  return (res.embeddings || []).map((e) => e.values);
}

async function jinaEmbed(texts) {
  if (!JINA_API_KEY) return null;
  const res = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JINA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: JINA_EMBED_MODEL,
      task: "text-matching",
      dimensions: 1024,
      input: texts,
    }),
  });
  if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
  const data = await res.json();
  const out = new Array(texts.length);
  for (const item of data.data) out[item.index] = item.embedding;
  return out;
}

async function hfEmbed(texts) {
  const headers = { "Content-Type": "application/json" };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`;
  const res = await fetch(
    `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_EMBED_MODEL}`,
    { method: "POST", headers, body: JSON.stringify({ inputs: texts }) },
  );
  if (!res.ok) throw new Error(`HF HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data) && Array.isArray(data[0])) return data;
  return [data];
}

export async function embedTexts(texts) {
  const errors = [];
  for (const [name, fn] of [
    ["gemini", geminiEmbed],
    ["jina", jinaEmbed],
    ["hf", hfEmbed],
  ]) {
    try {
      const emb = await fn(texts);
      if (!emb) continue;
      if (!emb.length || emb.some((e) => !e || !e.length)) {
        throw new Error("empty embeddings");
      }
      console.error(`[embed] used ${name} (${emb.length} x ${emb[0].length})`);
      return emb;
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  throw new Error(`All embedding providers failed: ${errors.join("; ")}`);
}