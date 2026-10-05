import fs from 'node:fs';
import path from 'node:path';

/** Text drawn on each page of the generated fixture PDF. */
const PAGES = [
  ['Page 1 - Kinematics', 'v = u + at', 's = ut + 1/2 a t^2'],
  ['Page 2 - Thermodynamics', 'PV = nRT', 'dS = Q / T'],
  ['Page 3 - Chemistry', '2 H2 + O2 -> 2 H2O', 'pH = -log[H+]'],
];

function contentStream(lines) {
  const [title, ...formulas] = lines;
  let ops = `BT /F1 24 Tf 60 720 Td (${title}) Tj ET\n`;
  formulas.forEach((formula, i) => {
    ops += `BT /F1 32 Tf 90 ${620 - i * 90} Td (${formula}) Tj ET\n`;
  });
  ops += `BT /F1 12 Tf 60 100 Td (Reference text for transcription.) Tj ET\n`;
  return ops;
}

/**
 * Writes a small multi-page PDF built from raw objects.
 *
 * Hand-rolled rather than pulled from a library so the e2e fixture needs no
 * extra dependency and stays byte-stable across runs.
 */
export function writeFixturePdf(filePath) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;

  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  objects.length = 3; // reserve 1..3, filled in below

  const pageIds = [];
  for (const lines of PAGES) {
    const stream = contentStream(lines);
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontId - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pdf, 'latin1');
  return { path: filePath, pages: PAGES.length };
}
