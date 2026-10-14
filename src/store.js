import { CloudClient } from "chromadb";
import {
  CHROMA_API_KEY,
  CHROMA_COLLECTION,
  CHROMA_DATABASE,
  CHROMA_TENANT,
} from "./config.js";
import { embedTexts } from "./embed.js";

let _client = null;
let _collection = null;

function client() {
  if (!_client) {
    _client = new CloudClient({
      apiKey: CHROMA_API_KEY,
      tenant: CHROMA_TENANT,
      database: CHROMA_DATABASE,
    });
  }
  return _client;
}

async function collection() {
  if (!_collection) {
    _collection = await client().getOrCreateCollection({
      name: CHROMA_COLLECTION,
      embeddingFunction: null,
    });
  }
  return _collection;
}

export async function ingest(items) {
  const texts = items.map((i) => i.text);
  const embeddings = await embedTexts(texts);
  await (await collection()).upsert({
    ids: items.map((i) => i.id),
    documents: texts,
    embeddings,
    metadatas: items.map((i) => i.metadata),
  });
  return { count: items.length };
}

export async function search(query, topK) {
  const [embedding] = await embedTexts([query]);
  const res = await (await collection()).query({
    queryEmbeddings: [embedding],
    nResults: topK,
    include: ["documents", "metadatas", "distances"],
  });
  const ids = res.ids?.[0] || [];
  const docs = res.documents?.[0] || [];
  const metas = res.metadatas?.[0] || [];
  const dists = res.distances?.[0] || [];
  const results = ids.map((id, i) => ({
    id,
    text: docs[i] ?? "",
    metadata: metas[i] ?? {},
    score: dists[i] ?? Infinity,
  }));
  return { results };
}

export async function listFiles() {
  const data = await (await collection()).get({ include: ["metadatas"] });
  const counts = {};
  for (const m of data.metadatas || []) {
    const f = m?.file || "unknown";
    counts[f] = (counts[f] || 0) + 1;
  }
  return { files: Object.entries(counts).map(([file, chunks]) => ({ file, chunks })) };
}

export async function deleteFile(filename) {
  await (await collection()).delete({ where: { file: { $eq: filename } } });
  return { ok: true, count: 0 };
}

export async function health() {
  return { ok: true, count: await (await collection()).count() };
}