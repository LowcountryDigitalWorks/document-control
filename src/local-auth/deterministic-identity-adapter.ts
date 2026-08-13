import {
  normalizeAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from "../application/authentication";

export class DeterministicIdentityAdapter {
  private readonly principal: AuthenticatedPrincipal;

  public constructor(principal: AuthenticatedPrincipal) {
    this.principal = normalizeAuthenticatedPrincipal(principal);
  }

  public async authenticate(): Promise<AuthenticatedPrincipal> {
    return { ...this.principal };
  }
}
