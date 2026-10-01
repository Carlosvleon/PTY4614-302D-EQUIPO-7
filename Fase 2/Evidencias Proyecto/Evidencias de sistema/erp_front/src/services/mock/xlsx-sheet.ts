/** Lee la primera hoja de un .xlsx (plantilla del ERP o Excel). */

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function findEocd(b: Uint8Array): number {
  const min = Math.max(0, b.length - 22 - 65535);
  for (let i = b.length - 22; i >= min; i -= 1) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
  }
  throw new Error('El archivo no es un Excel .xlsx válido');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  void writer.write(copy);
  void writer.close();
  const chunks: Uint8Array[] = [];
  let len = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    len += value.length;
  }
  const out = new Uint8Array(len);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

type ZipEntry = { name: string; data: Uint8Array };

async function unzip(b: Uint8Array): Promise<ZipEntry[]> {
  const eocd = findEocd(b);
  const count = u16(b, eocd + 10);
  let off = u32(b, eocd + 16);
  const entries: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    if (u32(b, off) !== 0x02014b50) throw new Error('El archivo no es un Excel .xlsx válido');
    const method = u16(b, off + 10);
    const compSize = u32(b, off + 20);
    const nameLen = u16(b, off + 28);
    const extraLen = u16(b, off + 30);
    const commentLen = u16(b, off + 32);
    const localOff = u32(b, off + 42);
    const name = dec.decode(b.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
    const localNameLen = u16(b, localOff + 26);
    const localExtraLen = u16(b, localOff + 28);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    const comp = b.subarray(dataOff, dataOff + compSize);
    let data: Uint8Array;
    if (method === 0) data = comp;
    else if (method === 8) data = await inflateRaw(comp);
    else throw new Error('El Excel usa una compresión que el modo demo no lee. Guárdelo de nuevo como .xlsx.');
    entries.push({ name, data });
  }
  return entries;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  const sis = xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
  for (const si of sis) {
    const texts = [...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    out.push(texts.join(''));
  }
  return out;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const body = cell[2] ?? '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? '';
      const idx = ref ? colIndex(ref) : cells.length;
      const kind = /t="([^"]+)"/.exec(attrs)?.[1] ?? '';
      let value = '';
      if (kind === 'inlineStr') {
        value = decodeXml(/<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? '');
      } else if (kind === 's') {
        const i = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
        value = strings[i] ?? '';
      } else if (kind !== 'e') {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      }
      while (cells.length < idx) cells.push('');
      cells[idx] = value;
    }
    if (cells.some((c) => c.trim())) rows.push(cells);
  }
  return rows;
}

export async function leerPrimeraHojaXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = await unzip(bytes);
  const sheet = entries.find((e) => e.name === 'xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('El Excel no trae la primera hoja');
  const shared = entries.find((e) => e.name === 'xl/sharedStrings.xml');
  const strings = shared ? sharedStrings(new TextDecoder().decode(shared.data)) : [];
  return sheetRows(new TextDecoder().decode(sheet.data), strings);
}
