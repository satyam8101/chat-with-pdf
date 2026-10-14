import fs from "node:fs/promises";
import path from "node:path";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

GlobalWorkerOptions.workerSrc = "";

export async function parseFile(filePath) {
  const buf = await fs.readFile(filePath);
  return parseBuffer(buf, filePath);
}

export async function parseBuffer(buf, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".pdf") {
    const uint8 = new Uint8Array(buf);
    const doc = await getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(" ") + "\n";
    }
    return text.trim();
  }
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (ext === ".txt" || ext === ".md") {
    return buf.toString("utf8");
  }
  throw new Error(`Unsupported file type: ${ext}`);
}
