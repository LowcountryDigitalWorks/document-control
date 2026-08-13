import {
  isOpaqueSessionIdentifier,
  type SessionTokenVerifier,
} from "../application/session";

const sessionVerifierDomain = "ldw.document-control.session.v1\u0000";

export class Sha256SessionTokenVerifier implements SessionTokenVerifier {
  public async derive(bearerToken: string): Promise<string> {
    if (!isOpaqueSessionIdentifier(bearerToken)) {
      throw new Error("Session bearer token is invalid.");
    }
    const bytes = new TextEncoder().encode(
      `${sessionVerifierDomain}${bearerToken}`,
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
