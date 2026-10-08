export function chunkText(text, { size = 900, overlap = 120 } = {}) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > size) {
      chunks.push(current.trim());
      current = tail(current, overlap);
      if (current) current += " ";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function tail(text, n) {
  return text.length > n ? text.slice(-n) : text;
}