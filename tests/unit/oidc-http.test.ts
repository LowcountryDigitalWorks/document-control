import { describe, expect, it } from "vitest";
import {
  clearOidcAuthorizationTransactionCookie,
  createOidcAuthorizationTransactionCookie,
  oidcAuthorizationTransactionCookieName,
  readOidcAuthorizationTransactionCookie,
  readOidcCallbackInput,
} from "../../src/http/oidc";

const transactionId = "a".repeat(64);
const state = "b".repeat(64);

describe("OIDC HTTP callback and cookie boundary", () => {
  it("uses a short bounded callback-only transaction cookie with no protocol secret material", () => {
    const cookie = createOidcAuthorizationTransactionCookie(
      transactionId,
      "https://app.example.test/auth/oidc/start",
      300,
    );
    expect(cookie).toBe(
      `${oidcAuthorizationTransactionCookieName}=${transactionId}; Path=/auth/oidc/callback; Max-Age=300; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(cookie).not.toContain(state);
    expect(
      clearOidcAuthorizationTransactionCookie(
        "https://app.example.test/auth/oidc/callback",
      ),
    ).toBe(
      `${oidcAuthorizationTransactionCookieName}=; Path=/auth/oidc/callback; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
    );
  });

  it("requires exactly one callback state, code, and transaction cookie", () => {
    const cookie = `${oidcAuthorizationTransactionCookieName}=${transactionId}`;
    expect(
      readOidcCallbackInput(
        `https://app.example.test/auth/oidc/callback?state=${state}&code=code-1`,
        cookie,
      ),
    ).toEqual({ transactionId, state, authorizationCode: "code-1" });
    expect(
      readOidcCallbackInput(
        `https://app.example.test/auth/oidc/callback?state=${state}&state=${"c".repeat(64)}&code=code-1`,
        cookie,
      ),
    ).toBeNull();
    expect(
      readOidcCallbackInput(
        `https://app.example.test/auth/oidc/callback?state=${state}&code=code-1&code=code-2`,
        cookie,
      ),
    ).toBeNull();
    expect(
      readOidcAuthorizationTransactionCookie(`${cookie}; ${cookie}`),
    ).toBeNull();
  });
});
