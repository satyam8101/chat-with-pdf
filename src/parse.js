import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export async function parseFile(filePath) {
  const buf = await fs.readFile(filePath);
  return parseBuffer(buf, filePath);
}

export async function parseBuffer(buf, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".pdf") {
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    return result.text;
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