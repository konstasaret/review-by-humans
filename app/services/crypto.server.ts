import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
function key() {
  const value = process.env.DATA_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value))
    throw new Error("DATA_ENCRYPTION_KEY must contain 32 random bytes as hex");
  return Buffer.from(value, "hex");
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function opaque(scope: string, value: string) {
  return createHmac("sha256", key())
    .update(JSON.stringify([scope, value]))
    .digest("hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  return (() => {
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body]
      .map((v) => v.toString("base64url"))
      .join(".");
  })();
}
export function decrypt(value: string) {
  const [iv, tag, body] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8");
}
