import type { MiddlewareHandler } from "hono";
import {
  AuthenticationRequiredError,
  isOpaqueSessionIdentifier,
  type AuthenticatedRequestContext,
  type SessionService,
} from "../application/session";

export const authenticatedSessionCookieName = "ldw_authenticated_session";

export interface AuthenticatedHttpVariables {
  authenticated: AuthenticatedRequestContext;
}

export type AuthenticatedHttpEnvironment = {
  Variables: AuthenticatedHttpVariables;
};

export function createAuthenticationMiddleware(
  sessions: SessionService,
): MiddlewareHandler<AuthenticatedHttpEnvironment> {
  return async (context, next) => {
    const sessionId = readAuthenticatedSessionCookie(
      context.req.header("Cookie"),
    );
    if (!sessionId) return context.text("Authentication required.", 401);

    try {
      context.set("authenticated", await sessions.resolve(sessionId));
      await next();
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return context.text("Authentication required.", 401);
      }
      throw error;
    }
  };
}

export function readAuthenticatedSessionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (
      name === authenticatedSessionCookieName &&
      isOpaqueSessionIdentifier(value)
    ) {
      return value;
    }
  }
  return null;
}

export function createAuthenticatedSessionCookie(
  sessionId: string,
  requestUrl: string,
  maxAgeSeconds: number,
): string {
  if (!isOpaqueSessionIdentifier(sessionId)) {
    throw new Error("Authenticated-session cookie requires an opaque session ID.");
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("Authenticated-session cookie lifetime is invalid.");
  }
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${authenticatedSessionCookieName}=${sessionId}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

export function clearAuthenticatedSessionCookie(requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${authenticatedSessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}
