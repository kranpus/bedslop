// Little-endian NBT (Bedrock's format), used to read and edit .mcstructure files.
// Values keep their exact tag types so a file can be read, changed and written back unchanged.

export const T = { End: 0, Byte: 1, Short: 2, Int: 3, Long: 4, Float: 5, Double: 6, ByteArray: 7, String: 8, List: 9, Compound: 10, IntArray: 11, LongArray: 12 } as const;

export type NbtTag =
  | { type: 1 | 2 | 3 | 5 | 6; value: number }
  | { type: 4; value: bigint }
  | { type: 7; value: Int8Array }
  | { type: 8; value: string }
  /** Lists of ints are kept packed in `ints` (value stays empty): structures hold millions of them. */
  | { type: 9; elementType: number; value: NbtTag[]; ints?: Int32Array }
  | { type: 10; value: Map<string, NbtTag> }
  | { type: 11; value: Int32Array }
  | { type: 12; value: BigInt64Array };

export type NbtCompound = Extract<NbtTag, { type: 10 }>;

export interface NbtRoot {
  name: string;
  tag: NbtCompound;
}

const utf8 = new TextDecoder();
const utf8enc = new TextEncoder();

export function readNbt(bytes: Uint8Array): NbtRoot {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error("The file ends too early. Is it a complete .mcstructure?");
  };
  const str = () => {
    need(2);
    const len = view.getUint16(pos, true);
    pos += 2;
    need(len);
    const s = utf8.decode(bytes.subarray(pos, pos + len));
    pos += len;
    return s;
  };
  const payload = (type: number, depth: number): NbtTag => {
    if (depth > 512) throw new Error("The file is nested too deeply.");
    switch (type) {
      case T.Byte: need(1); return { type, value: view.getInt8(pos++) };
      case T.Short: { need(2); const v = view.getInt16(pos, true); pos += 2; return { type, value: v }; }
      case T.Int: { need(4); const v = view.getInt32(pos, true); pos += 4; return { type, value: v }; }
      case T.Long: { need(8); const v = view.getBigInt64(pos, true); pos += 8; return { type, value: v }; }
      case T.Float: { need(4); const v = view.getFloat32(pos, true); pos += 4; return { type, value: v }; }
      case T.Double: { need(8); const v = view.getFloat64(pos, true); pos += 8; return { type, value: v }; }
      case T.ByteArray: {
        need(4); const n = view.getInt32(pos, true); pos += 4; need(n);
        const v = new Int8Array(bytes.slice(pos, pos + n).buffer); pos += n; return { type, value: v };
      }
      case T.String: return { type, value: str() };
      case T.List: {
        need(5);
        const elementType = view.getUint8(pos++);
        const n = view.getInt32(pos, true); pos += 4;
        if (n < 0 || n > bytes.length) throw new Error("A list in the file has an impossible length.");
        if (elementType === T.Int) {
          need(n * 4);
          const ints = new Int32Array(n);
          for (let i = 0; i < n; i++, pos += 4) ints[i] = view.getInt32(pos, true);
          return { type, elementType, value: [], ints };
        }
        const value: NbtTag[] = [];
        for (let i = 0; i < n; i++) value.push(payload(elementType, depth + 1));
        return { type, elementType, value };
      }
      case T.Compound: {
        const value = new Map<string, NbtTag>();
        for (;;) {
          need(1);
          const t = view.getUint8(pos++);
          if (t === T.End) break;
          const name = str();
          value.set(name, payload(t, depth + 1));
        }
        return { type, value };
      }
      case T.IntArray: {
        need(4); const n = view.getInt32(pos, true); pos += 4; need(n * 4);
        const v = new Int32Array(n);
        for (let i = 0; i < n; i++, pos += 4) v[i] = view.getInt32(pos, true);
        return { type, value: v };
      }
      case T.LongArray: {
        need(4); const n = view.getInt32(pos, true); pos += 4; need(n * 8);
        const v = new BigInt64Array(n);
        for (let i = 0; i < n; i++, pos += 8) v[i] = view.getBigInt64(pos, true);
        return { type, value: v };
      }
      default:
        throw new Error(`Unknown NBT tag type ${type}. This doesn't look like a Bedrock .mcstructure file.`);
    }
  };
  need(1);
  const rootType = view.getUint8(pos++);
  if (rootType !== T.Compound) throw new Error("This isn't a Bedrock .mcstructure file (Java .nbt structures are compressed and big-endian; re-save it in Bedrock).");
  const name = str();
  const tag = payload(T.Compound, 0) as NbtCompound;
  return { name, tag };
}

export function writeNbt(root: NbtRoot): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const push = (b: Uint8Array) => { chunks.push(b); size += b.length; };
  const num = (n: number, fn: (v: DataView) => void) => { const b = new Uint8Array(n); fn(new DataView(b.buffer)); push(b); };
  const str = (s: string) => {
    const b = utf8enc.encode(s);
    num(2, (v) => v.setUint16(0, b.length, true));
    push(b);
  };
  const payload = (t: NbtTag) => {
    switch (t.type) {
      case T.Byte: num(1, (v) => v.setInt8(0, t.value)); break;
      case T.Short: num(2, (v) => v.setInt16(0, t.value, true)); break;
      case T.Int: num(4, (v) => v.setInt32(0, t.value, true)); break;
      case T.Long: num(8, (v) => v.setBigInt64(0, t.value, true)); break;
      case T.Float: num(4, (v) => v.setFloat32(0, t.value, true)); break;
      case T.Double: num(8, (v) => v.setFloat64(0, t.value, true)); break;
      case T.ByteArray: num(4, (v) => v.setInt32(0, t.value.length, true)); push(new Uint8Array(t.value.buffer, t.value.byteOffset, t.value.length)); break;
      case T.String: str(t.value); break;
      case T.List:
        if (t.ints) {
          const ints = t.ints;
          num(5 + ints.length * 4, (v) => { v.setUint8(0, T.Int); v.setInt32(1, ints.length, true); ints.forEach((x, i) => v.setInt32(5 + i * 4, x, true)); });
          break;
        }
        num(5, (v) => { v.setUint8(0, t.value.length ? t.value[0].type : t.elementType); v.setInt32(1, t.value.length, true); });
        t.value.forEach(payload);
        break;
      case T.Compound:
        for (const [k, child] of t.value) {
          num(1, (v) => v.setUint8(0, child.type));
          str(k);
          payload(child);
        }
        push(new Uint8Array([T.End]));
        break;
      case T.IntArray: num(4 + t.value.length * 4, (v) => { v.setInt32(0, t.value.length, true); t.value.forEach((x, i) => v.setInt32(4 + i * 4, x, true)); }); break;
      case T.LongArray: num(4 + t.value.length * 8, (v) => { v.setInt32(0, t.value.length, true); t.value.forEach((x, i) => v.setBigInt64(4 + i * 8, x, true)); }); break;
    }
  };
  num(1, (v) => v.setUint8(0, T.Compound));
  str(root.name);
  payload(root.tag);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------- small helpers for building and reading tags ----------

export const nbt = {
  byte: (value: number): NbtTag => ({ type: T.Byte, value }),
  int: (value: number): NbtTag => ({ type: T.Int, value }),
  str: (value: string): NbtTag => ({ type: T.String, value }),
  list: (elementType: number, value: NbtTag[]): NbtTag => ({ type: T.List, elementType, value }),
  ints: (values: number[] | Int32Array): NbtTag => ({ type: T.List, elementType: T.Int, value: [], ints: Int32Array.from(values) }),
  compound: (entries: Record<string, NbtTag> | [string, NbtTag][]): NbtCompound =>
    ({ type: T.Compound, value: new Map(Array.isArray(entries) ? entries : Object.entries(entries)) }),
};

export function child(t: NbtTag | undefined, key: string): NbtTag | undefined {
  return t?.type === T.Compound ? t.value.get(key) : undefined;
}

export function path(t: NbtTag | undefined, ...keys: string[]): NbtTag | undefined {
  return keys.reduce<NbtTag | undefined>((acc, k) => child(acc, k), t);
}

export function asNumber(t: NbtTag | undefined): number | undefined {
  return t && (t.type === T.Byte || t.type === T.Short || t.type === T.Int || t.type === T.Float || t.type === T.Double) ? t.value : undefined;
}

export function asString(t: NbtTag | undefined): string | undefined {
  return t?.type === T.String ? t.value : undefined;
}

export function asList(t: NbtTag | undefined): NbtTag[] {
  return t?.type === T.List ? t.value : [];
}

/** A list of numbers as an Int32Array (packed or not). */
export function asInts(t: NbtTag | undefined): Int32Array {
  if (t?.type !== T.List) return new Int32Array(0);
  if (t.ints) return t.ints;
  return Int32Array.from(t.value.map((x) => asNumber(x) ?? 0));
}
