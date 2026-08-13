import type { OidcSecurityPrimitives } from "../application/oidc";

const pkceAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export class WebCryptoOidcSecurityPrimitives
  implements OidcSecurityPrimitives
{
  public async randomHex(byteLength: number): Promise<string> {
    if (
      !Number.isSafeInteger(byteLength) ||
      byteLength < 16 ||
      byteLength > 64
    ) {
      throw new Error("OIDC random byte length is invalid.");
    }
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  public async randomPkceVerifier(): Promise<string> {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    let value = "";
    for (const byte of bytes) {
      value += pkceAlphabet[byte % pkceAlphabet.length];
    }
    return value;
  }

  public async sha256Hex(value: string): Promise<string> {
    return toHex(await sha256(value));
  }

  public async sha256Base64Url(value: string): Promise<string> {
    return toBase64Url(await sha256(value));
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
