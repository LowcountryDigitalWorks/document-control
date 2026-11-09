import { describe, expect, it } from "vitest";
import { evaluatePlutusDocSendEligibility } from "../../src/application/plutusdoc-send-eligibility";

describe("PlutusDoc send eligibility", () => {
  it("keeps a voided document ineligible even when structural readiness and approval are true", () => {
    const syntheticVoidedEvidence = {
      lifecycleStatus: "voided",
      structuralReady: true,
      humanApprovalStatus: "approved",
    };

    expect(evaluatePlutusDocSendEligibility(syntheticVoidedEvidence)).toEqual({
      lifecycleEligible: false,
      structuralReady: true,
      humanApprovalSatisfied: true,
      sendEligible: false,
    });
  });

  it.each(["declined", "signed", "completed"])(
    "fails closed for terminal status %s",
    (lifecycleStatus) => {
      expect(
        evaluatePlutusDocSendEligibility({
          lifecycleStatus,
          structuralReady: true,
          humanApprovalStatus: "approved",
        }).sendEligible,
      ).toBe(false);
    },
  );

  it("requires human approval independently of provider structural readiness", () => {
    expect(
      evaluatePlutusDocSendEligibility({
        lifecycleStatus: "draft",
        structuralReady: true,
        humanApprovalStatus: "pending",
      }).sendEligible,
    ).toBe(false);
  });

  it("requires provider structural readiness independently of human approval", () => {
    expect(
      evaluatePlutusDocSendEligibility({
        lifecycleStatus: "draft",
        structuralReady: false,
        humanApprovalStatus: "approved",
      }).sendEligible,
    ).toBe(false);
  });

  it("allows only the pure precondition result for an approved, structurally ready draft", () => {
    expect(
      evaluatePlutusDocSendEligibility({
        lifecycleStatus: "draft",
        structuralReady: true,
        humanApprovalStatus: "approved",
      }).sendEligible,
    ).toBe(true);
  });

  it("fails closed for unknown lifecycle or approval states", () => {
    expect(
      evaluatePlutusDocSendEligibility({
        lifecycleStatus: "unknown",
        structuralReady: true,
        humanApprovalStatus: "approved",
      }).sendEligible,
    ).toBe(false);

    expect(
      evaluatePlutusDocSendEligibility({
        lifecycleStatus: "draft",
        structuralReady: true,
        humanApprovalStatus: "unknown",
      }).sendEligible,
    ).toBe(false);
  });
});
