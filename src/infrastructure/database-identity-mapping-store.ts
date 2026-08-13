import type {
  ExternalAuthenticationProvider,
  IdentityMappingStore,
  NormalizedIdentity,
} from "../application/authentication";
import type { DatabaseProvider } from "../application/ports";

interface IdentitySubjectRow {
  subjectId: string;
}

export class DatabaseIdentityMappingStore implements IdentityMappingStore {
  public constructor(private readonly database: DatabaseProvider) {}

  public async findByProviderIdentity(
    provider: ExternalAuthenticationProvider,
    providerSubject: string,
  ): Promise<NormalizedIdentity | null> {
    const [row] = await this.database.query<IdentitySubjectRow>(
      `SELECT id AS subjectId
       FROM identity_subjects
       WHERE provider = ? AND provider_subject = ?`,
      [provider, providerSubject],
    );
    return row ? { subjectId: row.subjectId } : null;
  }
}
