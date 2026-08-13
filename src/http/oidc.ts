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
  const states = url.searchParams.getAll("state");
  const authorizationCodes = url.searchParams.getAll("code");
  if (states.length !== 1 || authorizationCodes.length !== 1) return null;
  const [state] = states;
  const [authorizationCode] = authorizationCodes;
  if (!state || !authorizationCode) return null;
  return { transactionId, state, authorizationCode };
}

export function readOidcAuthorizationTransactionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  let transactionId: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== oidcAuthorizationTransactionCookieName) continue;
    if (transactionId !== null) return null;
    const value = part.slice(separator + 1).trim();
    if (!opaqueTransactionPattern.test(value)) return null;
    transactionId = value;
  }
  return transactionId;
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
