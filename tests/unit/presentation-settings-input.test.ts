import { describe, expect, it } from "vitest";
import {
  parsePresentationSettingsInput,
  PresentationSettingsValidationError,
} from "../../src/application/presentation-settings-input";

function validValues(): URLSearchParams {
  return new URLSearchParams({
    workspaceName: "Operations",
    appName: "Document Control",
    companyName: "Lowcountry Digital Works",
    primary: "#163B45",
    secondary: "#247b78",
    accent: "#8e4228",
    workspaceTerm: "Workspace",
    documentTerm: "Document",
    approvalTerm: "Approval",
  });
}

describe("presentation settings input", () => {
  it("trims text and normalizes six-digit colors", () => {
    const values = validValues();
    values.set("workspaceName", "  Operations  ");
    values.set("documentTerm", "  Controlled Record  ");

    expect(parsePresentationSettingsInput(values)).toEqual({
      workspaceName: "Operations",
      appName: "Document Control",
      companyName: "Lowcountry Digital Works",
      primary: "#163b45",
      secondary: "#247b78",
      accent: "#8e4228",
      workspaceTerm: "Workspace",
      documentTerm: "Controlled Record",
      approvalTerm: "Approval",
    });
  });

  it("rejects invalid CSS color input before persistence", () => {
    const values = validValues();
    values.set("primary", "red; background:url(https://example.test)");

    expect(() => parsePresentationSettingsInput(values)).toThrowError(
      new PresentationSettingsValidationError(
        "Primary color must be a six-digit hexadecimal color such as #163b45.",
      ),
    );
  });

  it("rejects blank, oversized, and control-character text", () => {
    const blank = validValues();
    blank.set("appName", "   ");
    expect(() => parsePresentationSettingsInput(blank)).toThrow(
      "Application name is required.",
    );

    const oversized = validValues();
    oversized.set("workspaceTerm", "x".repeat(41));
    expect(() => parsePresentationSettingsInput(oversized)).toThrow(
      "Workspace terminology must be 40 characters or fewer.",
    );

    const control = validValues();
    control.set("companyName", "Example\nCompany");
    expect(() => parsePresentationSettingsInput(control)).toThrow(
      "Company name cannot contain control characters.",
    );
  });
});
