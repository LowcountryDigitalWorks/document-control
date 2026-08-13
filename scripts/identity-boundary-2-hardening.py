from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected patch anchor missing in {path}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/application/oidc.ts",
    '''  const applicationOrigin = "https://document-control.invalid";
  const parsed = new URL(value, applicationOrigin);
  if (
    parsed.origin !== applicationOrigin ||
    !parsed.pathname.startsWith("/app")
  ) {
    throw new Error("OIDC return target is outside the application boundary.");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
''',
    '''  const applicationOrigin = "https://document-control.invalid";
  const parsed = new URL(value, applicationOrigin);
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw new Error("OIDC return target is invalid.");
  }
  if (
    parsed.origin !== applicationOrigin ||
    (decodedPathname !== "/app" && !decodedPathname.startsWith("/app/")) ||
    decodedPathname.includes("\\\\")
  ) {
    throw new Error("OIDC return target is outside the application boundary.");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
''',
)

replace_once(
    "tests/unit/oidc-security.test.ts",
    '''      "/not-the-app",
      "/app\\\\evil.example.test",
''',
    '''      "/not-the-app",
      "/application",
      "/app\\\\evil.example.test",
      "/app/%5Cevil.example.test",
''',
)

replace_once(
    "tests/unit/oidc-authenticated-route.test.ts",
    '''} from "../../src/http/authentication";
import {
''',
    '''} from "../../src/http/authentication";
import { hasSameOrigin } from "../../src/http/demo-session";
import {
''',
)

replace_once(
    "tests/unit/oidc-authenticated-route.test.ts",
    '''  app.post("/app/logout", async (context) => {
    const cookieHeader = context.req.header("Cookie") ?? "";
''',
    '''  app.post("/app/logout", async (context) => {
    if (!hasSameOrigin(context.req.url, context.req.header("Origin"))) {
      return context.text("Request not allowed.", 403);
    }
    const cookieHeader = context.req.header("Cookie") ?? "";
''',
)

replace_once(
    "tests/unit/oidc-authenticated-route.test.ts",
    '''    const logout = await harness.app.request(
      "https://app.example.test/app/logout",
      {
        method: "POST",
        headers: { Cookie: sessionCookie },
      },
    );
''',
    '''    const crossOriginLogout = await harness.app.request(
      "https://app.example.test/app/logout",
      {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          Origin: "https://evil.example.test",
        },
      },
    );
    expect(crossOriginLogout.status).toBe(403);
    const stillAuthenticated = await harness.app.request(
      "https://app.example.test/app/protected/tenant-a/workspace-a",
      { headers: { Cookie: sessionCookie } },
    );
    expect(stillAuthenticated.status).toBe(200);

    const logout = await harness.app.request(
      "https://app.example.test/app/logout",
      {
        method: "POST",
        headers: {
          Cookie: sessionCookie,
          Origin: "https://app.example.test",
        },
      },
    );
''',
)

replace_once(
    "tests/unit/http-authentication.test.ts",
    '''    expect(missing.status).toBe(401);
    expect(await missing.text()).toBe("Authentication required.");

    const session = await harness.sessions.establish(principal);
''',
    '''    expect(missing.status).toBe(401);
    expect(await missing.text()).toBe("Authentication required.");

    const duplicateCookie = await harness.app.request(
      "http://example.test/protected/context",
      {
        headers: {
          Cookie: `${authenticatedSessionCookieName}=${"a".repeat(64)}; ${authenticatedSessionCookieName}=${"b".repeat(64)}`,
        },
      },
    );
    expect(duplicateCookie.status).toBe(401);

    const session = await harness.sessions.establish(principal);
''',
)

Path("tests/unit/oidc-http.test.ts").write_text(
    '''import { describe, expect, it } from "vitest";
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
''',
    encoding="utf-8",
)
