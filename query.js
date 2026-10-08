import { answer } from "./src/groq.js";
import { search } from "./src/store.js";
import { TOP_K } from "./src/config.js";

const question = process.argv[2];
if (!question) {
  console.error('Usage: node query.js "your question"');
  process.exit(1);
}

const { results } = await search(question, TOP_K);
if (!results.length) {
  console.log("No relevant resumes found.");
  process.exit(0);
}

console.log("--- Relevant snippets ---");
for (const r of results) {
  console.log(`\n[${r.metadata.file}] (score ${r.score.toFixed(4)}): ${r.text}`);
}

const reply = await answer(question, results);
console.log(`\n--- ANSWER ---\n${reply}`);
console.log(`\n--- SOURCES ---`);
for (const r of results) console.log(`- ${r.metadata.file}`);