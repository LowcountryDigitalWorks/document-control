import type { OidcSigningJwk } from "../../src/infrastructure/webcrypto-oidc-id-token-validator";

export interface SyntheticOidcSigningFixture {
  publicJwk: OidcSigningJwk;
  sign(claims: Record<string, unknown>): Promise<string>;
}

export async function createSyntheticOidcSigningFixture(
  kid = "synthetic-test-rs256",
): Promise<SyntheticOidcSigningFixture> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey,
  )) as OidcSigningJwk;
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  return {
    publicJwk,
    async sign(claims) {
      const encodedHeader = base64UrlEncodeJson({
        alg: "RS256",
        kid,
        typ: "JWT",
      });
      const encodedPayload = base64UrlEncodeJson(claims);
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keyPair.privateKey,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
    },
  };
}

export function tamperJwtSignature(jwt: string): string {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Synthetic JWT is malformed.");
  const signature = parts[2] as string;
  if (signature.length === 0) {
    throw new Error("Synthetic JWT has no signature.");
  }
  const replacement = signature.startsWith("A") ? "B" : "A";
  return `${parts[0]}.${parts[1]}.${replacement}${signature.slice(1)}`;
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
