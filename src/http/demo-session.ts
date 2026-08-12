import {
  isValidGuidedDemoSessionId,
  type GuidedDemoAction,
} from "../demo/workflow-demo";
import type { Bindings } from "./types";

const guidedDemoSessionCookie = "ldw_guided_demo_session";

export function guidedDemoEnabled(bindings: Bindings): boolean {
  return bindings.DEMO_MUTATIONS_ENABLED === "true";
}

export function parseGuidedDemoAction(value: string): GuidedDemoAction | null {
  if (
    value === "create" ||
    value === "submit" ||
    value === "review" ||
    value === "approve" ||
    value === "change"
  ) {
    return value;
  }
  return null;
}

export function resolveGuidedDemoSession(
  cookieHeader: string | undefined,
  requestUrl: string,
): { sessionId: string; setCookie?: string } {
  const existingSessionId = readGuidedDemoSession(cookieHeader);
  if (existingSessionId) {
    return { sessionId: existingSessionId };
  }

  const sessionId = crypto.randomUUID();
  return {
    sessionId,
    setCookie: createGuidedDemoSessionCookie(
      sessionId,
      new URL(requestUrl).protocol === "https:",
    ),
  };
}

export function readGuidedDemoSession(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === guidedDemoSessionCookie && isValidGuidedDemoSessionId(value)) {
      return value.toLowerCase();
    }
  }

  return null;
}

export function hasSameOrigin(
  requestUrl: string,
  origin: string | undefined,
): boolean {
  if (!origin) {
    return false;
  }
  return origin === new URL(requestUrl).origin;
}

function createGuidedDemoSessionCookie(
  sessionId: string,
  secure: boolean,
): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${guidedDemoSessionCookie}=${sessionId}; Path=/demo; Max-Age=3600; HttpOnly; SameSite=Strict${secureAttribute}`;
}
