import fs from "node:fs/promises";
import path from "node:path";
import { chunkText } from "./src/chunk.js";
import { parseFile } from "./src/parse.js";
import { ingest } from "./src/store.js";
import { RESUMES_DIR } from "./src/config.js";

async function main() {
  const files = (await fs.readdir(RESUMES_DIR)).filter((f) =>
    /\.(pdf|docx|txt|md)$/i.test(f),
  );
  if (!files.length) {
    console.log(`No resumes found in ${RESUMES_DIR}/`);
    return;
  }

  const items = [];
  for (const f of files) {
    const filePath = path.join(RESUMES_DIR, f);
    const text = await parseFile(filePath);
    const chunks = chunkText(text);
    chunks.forEach((c, i) => {
      items.push({
        id: `${path.basename(f, path.extname(f))}__${i}`,
        text: c,
        metadata: { file: f, chunk: i },
      });
    });
    console.log(`Parsed ${f}: ${chunks.length} chunks`);
  }

  const result = await ingest(items);
  console.log(`Indexed ${result.count} chunks from ${files.length} files`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});