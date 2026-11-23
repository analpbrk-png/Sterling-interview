// Writes per-page text of the reference PDFs to tests/fixtures so parser tests run without pdf.js.
import { extractText, getDocumentProxy } from "unpdf";
import { readFile, writeFile, readdir } from "node:fs/promises";
const dir = "data/source-pdfs";
const out = {};
for (const f of (await readdir(dir)).filter((f) => f.endsWith(".pdf"))) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(`${dir}/${f}`)));
  out[f] = (await extractText(pdf, { mergePages: false })).text;
}
await writeFile("tests/fixtures/source-pdf-text.json", JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length} pages`).join("\n"));
