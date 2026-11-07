const FORMAT = "tochka-opory-encrypted@1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function base64(bytes: Uint8Array) {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string) {
  const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function keyFor(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 310_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptArchive(payload: unknown, password: string) {
  if (password.length < 8) throw new Error("Пароль архива должен содержать минимум 8 символов");
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload)));
  return JSON.stringify({ format: FORMAT, kdf: "PBKDF2-SHA256", iterations: 310000, cipher: "AES-256-GCM", salt: base64(salt), iv: base64(iv), data: base64(new Uint8Array(encrypted)) });
}
export async function decryptArchive(text: string, password: string) {
  const archive = JSON.parse(text) as { format?: string; salt?: string; iv?: string; data?: string };
  if (archive.format !== FORMAT || !archive.salt || !archive.iv || !archive.data) throw new Error("Это не зашифрованный архив приложения");
  const key = await keyFor(password, fromBase64(archive.salt));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(archive.iv) as BufferSource }, key, fromBase64(archive.data) as BufferSource);
  return JSON.parse(decoder.decode(decrypted)) as unknown;
}
