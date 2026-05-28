/**
 * ID 生成工具。
 * - `uuid()`: 标准 UUID v4，依赖 Node.js 原生 crypto.randomUUID()。
 * - `ulid()`: Crockford Base32 时间排序 ID（26 字符），可选前缀。
 * @stability S0
 */

/** 生成标准 UUID v4 */
export function uuid(): string {
  return crypto.randomUUID();
}

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 生成 ULID（Universally Unique Lexicographically Sortable Identifier）。
 * 26 字符：10 字符时间戳（48-bit ms） + 16 字符随机数（80-bit）。
 * 同毫秒内多次调用返回的 ULID 仍按时间顺序单调递增。
 */
export function ulid(prefix?: string): string {
  const timestamp = encodeTime(Date.now(), 10);
  const random = encodeRandom(16);
  const id = `${timestamp}${random}`;
  return prefix ? `${prefix}_${id}` : id;
}

function encodeTime(now: number, length: number): string {
  let out = '';
  let value = now;
  for (let i = length - 1; i >= 0; i--) {
    const mod = value % 32;
    out = CROCKFORD_ALPHABET[mod]! + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandom(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CROCKFORD_ALPHABET[bytes[i]! % 32];
  }
  return out;
}
