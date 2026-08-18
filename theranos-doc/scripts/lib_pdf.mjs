/**
 * Minimal dependency-free PDF writer: one full-page per JPEG, embedded via DCTDecode (no re-encoding).
 * Shared by make_carousel.mjs (video repurpose) and li_render.mjs (LinkedIn diagram carousel).
 */
import fs from "node:fs";

// Read a JPEG's pixel dimensions + component count from its SOF marker.
export function jpegInfo(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { w: 1080, h: 1080, comps: 3 };
}

export function imagesToPdf(jpegPaths, outPdf) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (s) => { const b = Buffer.isBuffer(s) ? s : Buffer.from(s, "latin1"); chunks.push(b); pos += b.length; };
  const obj = (id, body) => { offsets[id] = pos; push(`${id} 0 obj\n`); push(body); push("\nendobj\n"); };

  const N = jpegPaths.length;
  const pageIds = [];
  let next = 3;
  const objs = [];
  for (let k = 0; k < N; k++) {
    const jpeg = fs.readFileSync(jpegPaths[k]);
    const { w, h, comps } = jpegInfo(jpeg);
    const pageId = next++, contentId = next++, imgId = next++;
    pageIds.push(pageId);
    const cs = comps === 1 ? "/DeviceGray" : comps === 4 ? "/DeviceCMYK" : "/DeviceRGB";
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    objs.push({ id: pageId, body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${w} ${h}]/Resources<</XObject<</Im0 ${imgId} 0 R>>>>/Contents ${contentId} 0 R>>` });
    objs.push({ id: contentId, body: `<</Length ${content.length}>>\nstream\n${content}\nendstream` });
    objs.push({ id: imgId, jpeg, header: `<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace ${cs}/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>` });
  }

  push("%PDF-1.7\n");
  obj(1, "<</Type/Catalog/Pages 2 0 R>>");
  obj(2, `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(" ")}]/Count ${N}>>`);
  for (const o of objs) {
    if (o.jpeg) {
      offsets[o.id] = pos;
      push(`${o.id} 0 obj\n`); push(o.header); push("\nstream\n"); push(o.jpeg); push("\nendstream\nendobj\n");
    } else { obj(o.id, o.body); }
  }
  const xrefPos = pos;
  const total = next;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) xref += `${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF\n`);
  fs.writeFileSync(outPdf, Buffer.concat(chunks));
}
