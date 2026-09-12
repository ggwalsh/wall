import { renderWallPlan } from "./canvas";
import type { Series } from "./pack";
import type { BomLine, WallSeg } from "./plan";

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function jpegToPdf(opts: {
  jpeg: Uint8Array;
  imgW: number;
  imgH: number;
  series: Series;
  heightIn: number;
  bom: BomLine[];
  twsFt: number;
}) {
  const pageW = 792;
  const pageH = 612;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const enc = new TextEncoder();
  const push = (s: string | Uint8Array) => {
    const b = typeof s === "string" ? enc.encode(s) : s;
    chunks.push(b);
    pos += b.length;
  };

  push("%PDF-1.4\n");
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body();
    push("\nendobj\n");
  };

  const kitLines = opts.bom.map((l) => `${l.qty}  ${l.sku}  ${l.name}`);
  const rowH = 12;
  const kitTop = 48;
  const kitX = 520;
  const maxRows = Math.floor((pageH - kitTop - 36) / rowH);
  const page1Kit = kitLines.slice(0, maxRows);
  const extra = kitLines.slice(maxRows);
  const pageCount = extra.length ? 2 : 1;

  const kids = pageCount === 2 ? ["5 0 R", "8 0 R"] : ["5 0 R"];

  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`);
  obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const imgScale = Math.min(470 / opts.imgW, 470 / opts.imgH);
  const dw = opts.imgW * imgScale;
  const dh = opts.imgH * imgScale;
  const dx = 28;
  const dy = 70;

  const content1 = [
    "0.118 0.110 0.114 rg",
    `0 0 ${pageW} ${pageH} re f`,
    "0.541 0.102 0.188 rg",
    `0 ${pageH - 36} ${pageW} 36 re f`,
    "BT /F2 14 Tf 1 1 1 rg 28 588 Td (Geoff Walsh  /  Wall kit) Tj ET",
    "BT /F1 9 Tf 0.686 0.686 0.686 rg 400 588 Td (SHIELD WALL  " +
      esc(opts.series.toUpperCase()) +
      "  /  " +
      (opts.heightIn / 12).toFixed(1) +
      " ft ceiling  /  " +
      opts.twsFt.toFixed(1) +
      " ft TWS) Tj ET",
    "q",
    `${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx} ${pageH - dy - dh} cm`,
    "/Im0 Do",
    "Q",
    "BT /F2 10 Tf 0.686 0.686 0.686 rg 520 548 Td (KIT) Tj ET",
    ...page1Kit.map((line, i) => {
      const y = 530 - i * rowH;
      return `BT /F1 8 Tf 0.85 0.85 0.85 rg ${kitX} ${y} Td (${esc(line.slice(0, 62))}) Tj ET`;
    }),
    extra.length
      ? "BT /F1 8 Tf 0.54 0.1 0.19 rg 520 40 Td (continued on page 2) Tj ET"
      : "",
    "BT /F1 8 Tf 0.5 0.5 0.5 rg 28 22 Td (Existing structure is not in the kit. Core solid / Classic dashed / Clear double-line.) Tj ET",
  ]
    .filter(Boolean)
    .join("\n");

  obj(5, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 6 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im0 7 0 R >> >> >>`);
  obj(6, `<< /Length ${enc.encode(content1).length} >>\nstream\n${content1}\nendstream`);
  offsets[7] = pos;
  push("7 0 obj\n");
  push(
    `<< /Type /XObject /Subtype /Image /Width ${opts.imgW} /Height ${opts.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${opts.jpeg.length} >>\nstream\n`,
  );
  push(opts.jpeg);
  push("\nendstream\nendobj\n");

  if (extra.length) {
    const content2 = [
      "q",
      "0.118 0.110 0.114 rg",
      `0 0 ${pageW} ${pageH} re f`,
      "0.541 0.102 0.188 rg",
      `0 ${pageH - 36} ${pageW} 36 re f`,
      "BT /F2 14 Tf 1 1 1 rg 28 588 Td (Kit continued) Tj ET",
      ...extra.map((line, i) => {
        const col = i < 40 ? 0 : 1;
        const row = i % 40;
        const x = 28 + col * 380;
        const y = 548 - row * 12;
        return `BT /F1 8 Tf 0.85 0.85 0.85 rg ${x} ${y} Td (${esc(line.slice(0, 70))}) Tj ET`;
      }),
    ].join("\n");
    obj(8, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 9 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    obj(9, `<< /Length ${enc.encode(content2).length} >>\nstream\n${content2}\nendstream`);
  }

  const xrefPos = pos;
  const maxObj = extra.length ? 9 : 7;
  push(`xref\n0 ${maxObj + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxObj; i++) {
    const off = offsets[i] ?? 0;
    push(`${String(off).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function dataUrlToBytes(dataUrl: string) {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function downloadWallPdf(input: {
  walls: WallSeg[];
  series: Series;
  heightIn: number;
  bom: BomLine[];
  twsFt: number;
}) {
  const w = 1400;
  const h = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  renderWallPlan(ctx, w, h, input.walls, input.series);
  const jpeg = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.88));
  const pdf = jpegToPdf({
    jpeg,
    imgW: w,
    imgH: h,
    series: input.series,
    heightIn: input.heightIn,
    bom: input.bom,
    twsFt: input.twsFt,
  });
  const file = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = "geoff-walsh-wall-kit.pdf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  try {
    window.open(url, "_blank", "noopener");
  } catch {
    /* preview iframes sometimes block downloads; the tab is the fallback */
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
