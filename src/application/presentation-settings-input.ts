export interface PresentationSettingsInput {
  workspaceName: string;
  appName: string;
  companyName: string;
  primary: string;
  secondary: string;
  accent: string;
  workspaceTerm: string;
  documentTerm: string;
  approvalTerm: string;
}

export class PresentationSettingsValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PresentationSettingsValidationError";
  }
}

const textLimits = {
  workspaceName: 80,
  appName: 80,
  companyName: 100,
  term: 40,
} as const;

export function parsePresentationSettingsInput(
  values: URLSearchParams,
): PresentationSettingsInput {
  return {
    workspaceName: requiredText(
      values,
      "workspaceName",
      "Workspace name",
      textLimits.workspaceName,
    ),
    appName: requiredText(
      values,
      "appName",
      "Application name",
      textLimits.appName,
    ),
    companyName: requiredText(
      values,
      "companyName",
      "Company name",
      textLimits.companyName,
    ),
    primary: requiredColor(values, "primary", "Primary color"),
    secondary: requiredColor(values, "secondary", "Secondary color"),
    accent: requiredColor(values, "accent", "Accent color"),
    workspaceTerm: requiredText(
      values,
      "workspaceTerm",
      "Workspace terminology",
      textLimits.term,
    ),
    documentTerm: requiredText(
      values,
      "documentTerm",
      "Document terminology",
      textLimits.term,
    ),
    approvalTerm: requiredText(
      values,
      "approvalTerm",
      "Approval terminology",
      textLimits.term,
    ),
  };
}

function requiredText(
  values: URLSearchParams,
  key: string,
  label: string,
  maximumLength: number,
): string {
  const value = (values.get(key) ?? "").trim();
  if (!value) {
    throw new PresentationSettingsValidationError(`${label} is required.`);
  }
  if (value.length > maximumLength) {
    throw new PresentationSettingsValidationError(
      `${label} must be ${maximumLength} characters or fewer.`,
    );
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw new PresentationSettingsValidationError(
      `${label} cannot contain control characters.`,
    );
  }
  return value;
}

function requiredColor(
  values: URLSearchParams,
  key: string,
  label: string,
): string {
  const value = (values.get(key) ?? "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/u.test(value)) {
    throw new PresentationSettingsValidationError(
      `${label} must be a six-digit hexadecimal color such as #163b45.`,
    );
  }
  return value;
}
