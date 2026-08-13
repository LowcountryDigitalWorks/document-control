import {
  CONTENT_INGESTION_MAX_DECLARED_MEDIA_TYPE_LENGTH,
  CONTENT_INGESTION_MAX_FILENAME_LENGTH,
  ContentIngestionInputError,
} from "./content-ingestion-model";

export function normalizeDisplayFilename(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > CONTENT_INGESTION_MAX_FILENAME_LENGTH ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized === "." ||
    normalized === ".." ||
    containsUnsafeDisplayCodePoint(normalized)
  ) {
    throw new ContentIngestionInputError();
  }
  return normalized;
}

export function normalizeDeclaredMediaType(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  return normalizeAcceptedMediaType(value);
}

export function normalizeAcceptedMediaType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > CONTENT_INGESTION_MAX_DECLARED_MEDIA_TYPE_LENGTH ||
    !mediaTypePattern.test(normalized)
  ) {
    throw new ContentIngestionInputError("Media type metadata is invalid.");
  }
  return normalized;
}

export function normalizeGeneratedIdentifier(value: string): string {
  if (!safeIdentifier.test(value)) {
    throw new Error("Generated content-ingestion identifier is invalid.");
  }
  return value;
}

function containsUnsafeDisplayCodePoint(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint < 32 ||
      (codePoint >= 127 && codePoint <= 159) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const mediaTypePattern =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,110}$/;
