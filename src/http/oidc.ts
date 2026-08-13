export const oidcAuthorizationTransactionCookieName =
  "ldw_oidc_authorization_transaction";

const opaqueTransactionPattern = /^[0-9a-f]{64}$/u;

export interface OidcCallbackInput {
  transactionId: string;
  state: string;
  authorizationCode: string;
}

export function readOidcCallbackInput(
  requestUrl: string,
  cookieHeader: string | undefined,
): OidcCallbackInput | null {
  const transactionId = readOidcAuthorizationTransactionCookie(cookieHeader);
  if (!transactionId) return null;
  const url = new URL(requestUrl);
  const state = url.searchParams.get("state");
  const authorizationCode = url.searchParams.get("code");
  if (!state || !authorizationCode) return null;
  return { transactionId, state, authorizationCode };
}

export function readOidcAuthorizationTransactionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (
      name === oidcAuthorizationTransactionCookieName &&
      opaqueTransactionPattern.test(value)
    ) {
      return value;
    }
  }
  return null;
}

export function createOidcAuthorizationTransactionCookie(
  transactionId: string,
  requestUrl: string,
  maxAgeSeconds: number,
): string {
  if (!opaqueTransactionPattern.test(transactionId)) {
    throw new Error("OIDC transaction cookie requires an opaque identifier.");
  }
  if (
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0 ||
    maxAgeSeconds > 10 * 60
  ) {
    throw new Error("OIDC transaction cookie lifetime is invalid.");
  }
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${oidcAuthorizationTransactionCookieName}=${transactionId}; Path=/auth/oidc/callback; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearOidcAuthorizationTransactionCookie(
  requestUrl: string,
): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${oidcAuthorizationTransactionCookieName}=; Path=/auth/oidc/callback; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}
