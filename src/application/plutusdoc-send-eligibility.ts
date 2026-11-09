/**
 * Pure precondition evaluation for a future PlutusDoc send adapter.
 *
 * This module does not call PlutusDoc or perform any send action. Provider
 * structural readiness, exact lifecycle state, and human approval remain
 * separate inputs so readiness cannot override terminal state or approval.
 */
export interface PlutusDocSendEligibilityInput {
  lifecycleStatus: string;
  structuralReady: boolean;
  humanApprovalStatus: string;
}

export interface PlutusDocSendEligibility {
  lifecycleEligible: boolean;
  structuralReady: boolean;
  humanApprovalSatisfied: boolean;
  sendEligible: boolean;
}

const TERMINAL_STATUSES = new Set([
  "signed",
  "completed",
  "declined",
  "voided",
]);

export function evaluatePlutusDocSendEligibility(
  input: Readonly<PlutusDocSendEligibilityInput>,
): PlutusDocSendEligibility {
  const lifecycleEligible = TERMINAL_STATUSES.has(input.lifecycleStatus)
    ? false
    : input.lifecycleStatus === "draft";
  const structuralReady = input.structuralReady === true;
  const humanApprovalSatisfied = input.humanApprovalStatus === "approved";

  return {
    lifecycleEligible,
    structuralReady,
    humanApprovalSatisfied,
    sendEligible:
      lifecycleEligible && structuralReady && humanApprovalSatisfied,
  };
}
