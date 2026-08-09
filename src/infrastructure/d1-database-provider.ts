import type { DatabaseProvider, DatabaseResult } from "../application/ports";

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

    return {
      changes: result.meta.changes,
      lastRowId: result.meta.last_row_id,
    };
  }
}
