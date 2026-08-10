import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../application/ports";

export class D1DatabaseProvider implements DatabaseProvider {
  public constructor(private readonly database: D1Database) {}

  public async query<Row>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    const result = await this.database
      .prepare(sql)
      .bind(...parameters)
      .all<Row>();

    if (!result.success) {
      throw new Error(result.error ?? "D1 query failed.");
    }

    return result.results;
  }

  public async execute(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<DatabaseResult> {
    const result = await this.database
      .prepare(sql)
      .bind(...parameters)
      .run();

    if (!result.success) {
      throw new Error(result.error ?? "D1 statement failed.");
    }

    return mapResult(result);
  }

  public async executeBatch(
    statements: readonly DatabaseStatement[],
  ): Promise<readonly DatabaseResult[]> {
    if (statements.length === 0) {
      return [];
    }

    const prepared = statements.map((statement) =>
      this.database
        .prepare(statement.sql)
        .bind(...(statement.parameters ?? [])),
    );
    const results = await this.database.batch(prepared);

    for (const result of results) {
      if (!result.success) {
        throw new Error(result.error ?? "D1 batch statement failed.");
      }
    }

    return results.map(mapResult);
  }
}

function mapResult(result: D1Result<unknown>): DatabaseResult {
  return {
    changes: result.meta.changes,
    lastRowId: result.meta.last_row_id,
  };
}
