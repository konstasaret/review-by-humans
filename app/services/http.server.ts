export function sameOrigin(request: Request) {
  const expected = new URL(process.env.SHOPIFY_APP_URL || request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new Response("Invalid origin", { status: 403 });
}
export async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  if (!reader) throw new Response("Missing body", { status: 400 });
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 64000) {
      await reader.cancel();
      throw new Response("Request too large", { status: 413 });
    }
    chunks.push(value);
  }
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") || "" },
    body: Buffer.concat(chunks),
  }).formData();
}
export const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
