export interface DatabaseResult {
  changes: number;
  lastRowId?: number;
}

export interface DatabaseProvider {
  query<Row>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<readonly Row[]>;
  execute(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<DatabaseResult>;
}

export interface ContentObject {
  bytes: ArrayBuffer;
  contentType: string;
  contentHash: string;
}

export interface ContentStore {
  get(key: string, expectedHash: string): Promise<ContentObject | null>;
  create(key: string, object: ContentObject): Promise<void>;
}
