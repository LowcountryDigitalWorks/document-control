import type { SessionIdGenerator } from "../application/session";

export class CryptoSessionIdGenerator implements SessionIdGenerator {
  public async generate(): Promise<string> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
  }
}
