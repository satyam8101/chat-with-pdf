import Groq from "groq-sdk";
import { GROQ_API_KEY, GROQ_MODEL } from "./config.js";

const groq = new Groq({ apiKey: GROQ_API_KEY });

function buildPrompt(question, snippets) {
  const context = snippets
    .map((s, i) => `[${i + 1}] (${s.file}) ${s.text}`)
    .join("\n\n");
  return `You are a resume analyst. Answer using ONLY the resume snippets provided.
Each snippet is numbered in brackets, e.g. [1]. When you use a fact from a snippet, cite its number right after that fact, like (1) or [2]. You may cite multiple, like (1, 3). If the information is not in the snippets, say "Not found in the provided resumes." Never invent citations.

=== RESUME SNIPPETS ===
${context}
=== END ===

Question: ${question}`;
}

export function citationList(text, max) {
  const found = new Set();
  const re = /\[([0-9,\s]+)\]|\(([0-9,\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const group = m[1] || m[2];
    for (const part of group.split(",")) {
      const n = parseInt(part.trim(), 10);
      if (Number.isInteger(n) && n >= 1 && n <= max) found.add(n);
    }
  }
  return [...found];
}

function sourcesFor(cited, snippets) {
  return cited.map((n) => ({ n, file: snippets[n - 1].file }));
}

export async function answer(question, snippets) {
  const chat = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: buildPrompt(question, snippets) }],
    temperature: 0.2,
  });
  const reply = chat.choices[0]?.message?.content ?? "";
  return {
    answer: reply,
    sources: sourcesFor(citationList(reply, snippets.length), snippets),
  };
}

export async function* answerStream(question, snippets) {
  const stream = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: buildPrompt(question, snippets) }],
    temperature: 0.2,
    stream: true,
  });
  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      yield { delta };
    }
  }
  yield { sources: sourcesFor(citationList(full, snippets.length), snippets) };
}