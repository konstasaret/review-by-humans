import { randomUUID } from "node:crypto";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { z } from "zod";
import { hash, opaque } from "./crypto.server";
export const actionScope = (shop: string, product: string) =>
  `review-${hash(JSON.stringify([shop, product]))}`;
export function verificationMode() {
  const mode = process.env.WORLD_PROVIDER || "mock";
  if (!["mock", "world"].includes(mode))
    throw new Error("Unknown World provider");
  if (mode === "mock" && process.env.NODE_ENV === "production")
    throw new Error("Development World mock is forbidden in production");
  if (
    mode === "world" &&
    (!process.env.WORLD_APP_ID ||
      !process.env.WORLD_RP_ID ||
      !process.env.WORLD_SIGNING_KEY ||
      !process.env.WORLD_ISSUER_SCHEMA_ID)
  )
    throw new Error("World credentials are incomplete");
  return mode;
}
export function challenge(action: string) {
  const mode = verificationMode();
  if (mode === "mock")
    return {
      mode,
      nonce: randomUUID(),
      expires_at: Math.floor(Date.now() / 1000) + 300,
      app_id: "",
      rp_context: null,
    };
  const signed = signRequest({
    signingKeyHex: process.env.WORLD_SIGNING_KEY!,
    action,
  });
  return {
    mode,
    nonce: signed.nonce,
    expires_at: signed.expiresAt,
    app_id: process.env.WORLD_APP_ID!,
    rp_context: {
      rp_id: process.env.WORLD_RP_ID!,
      nonce: signed.nonce,
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
      signature: signed.sig,
    },
  };
}
const proofSchema = z
  .object({
    protocol_version: z.literal("4.0"),
    action: z.string(),
    nonce: z.string(),
    environment: z.literal("production"),
    responses: z
      .array(
        z
          .object({
            identifier: z.literal("proof_of_human"),
            issuer_schema_id: z.number().int().positive(),
            nullifier: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
export interface VerificationProvider {
  verify(
    proof: unknown,
    context: { action: string; nonce: string },
  ): Promise<{
    digest: string;
    verified: boolean;
    mock: boolean;
    provider: string;
  }>;
}
export class WorldProvider implements VerificationProvider {
  constructor(private transport: typeof fetch = fetch) {}
  async verify(input: unknown, context: { action: string; nonce: string }) {
    const proof = proofSchema.parse(input);
    if (
      proof.responses[0].issuer_schema_id !==
      Number(process.env.WORLD_ISSUER_SCHEMA_ID)
    )
      throw new Error("Unexpected World credential issuer schema");
    if (proof.action !== context.action || proof.nonce !== context.nonce)
      throw new Error("Proof context mismatch");
    const response = await this.transport(
      `https://developer.world.org/api/v4/verify/${process.env.WORLD_RP_ID}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error("World proof rejected");
    const result = await response.json();
    const accepted = result.results?.find(
      (r: { identifier: string; success: boolean; nullifier?: string }) =>
        r.identifier === proof.responses[0].identifier && r.success === true,
    );
    if (
      result.success !== true ||
      result.action !== context.action ||
      result.environment !== "production" ||
      !accepted?.nullifier ||
      BigInt(accepted.nullifier) !== BigInt(proof.responses[0].nullifier)
    )
      throw new Error("World verification was not confirmed");
    return {
      digest: opaque(context.action, BigInt(accepted.nullifier).toString()),
      verified: true,
      mock: false,
      provider: "world",
    };
  }
}
export class MockProvider implements VerificationProvider {
  async verify(input: unknown, context: { action: string; nonce: string }) {
    if (process.env.NODE_ENV === "production")
      throw new Error("Development mock forbidden");
    const p = z
      .object({
        mockHuman: z.string().trim().min(3).max(80),
        nonce: z.string(),
      })
      .parse(input);
    if (p.nonce !== context.nonce) throw new Error("Mock nonce mismatch");
    return {
      digest: opaque(context.action, `mock:${p.mockHuman}`),
      verified: false,
      mock: true,
      provider: "development-mock",
    };
  }
}
export const provider = (): VerificationProvider =>
  verificationMode() === "world" ? new WorldProvider() : new MockProvider();
