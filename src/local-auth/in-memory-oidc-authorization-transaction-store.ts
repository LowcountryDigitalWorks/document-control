import type {
  OidcAuthorizationTransaction,
  OidcAuthorizationTransactionStore,
} from "../application/oidc";

export class InMemoryOidcAuthorizationTransactionStore implements OidcAuthorizationTransactionStore {
  private readonly transactions = new Map<
    string,
    OidcAuthorizationTransaction
  >();

  public async save(transaction: OidcAuthorizationTransaction): Promise<void> {
    if (this.transactions.has(transaction.transactionId)) {
      throw new Error("OIDC authorization transaction already exists.");
    }
    this.transactions.set(transaction.transactionId, { ...transaction });
  }

  public async find(
    transactionId: string,
  ): Promise<OidcAuthorizationTransaction | null> {
    const transaction = this.transactions.get(transactionId);
    return transaction ? { ...transaction } : null;
  }

  public async consume(
    transactionId: string,
    consumedAt: string,
  ): Promise<boolean> {
    const transaction = this.transactions.get(transactionId);
    if (
      !transaction ||
      transaction.consumedAt !== undefined ||
      Date.parse(transaction.expiresAt) <= Date.parse(consumedAt)
    ) {
      return false;
    }
    this.transactions.set(transactionId, { ...transaction, consumedAt });
    return true;
  }

  public async cleanup(inactiveBefore: string): Promise<number> {
    const before = Date.parse(inactiveBefore);
    let removed = 0;
    for (const [transactionId, transaction] of this.transactions) {
      if (
        Date.parse(transaction.expiresAt) <= before ||
        (transaction.consumedAt !== undefined &&
          Date.parse(transaction.consumedAt) <= before)
      ) {
        this.transactions.delete(transactionId);
        removed += 1;
      }
    }
    return removed;
  }
}
