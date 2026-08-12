from pathlib import Path

path = Path("scripts/patch-document-version-change-summary.py")
text = path.read_text()
old = '''replace_once(\n    "src/domain/models.ts",\n    \'\'\'  contentProvider: string;\\n  contentKey: string;\\n  createdBySubjectId: Identifier;\\n\'\'\',\n    \'\'\'  contentProvider: string;\\n  contentKey: string;\\n  changeSummary?: string;\\n  createdBySubjectId: Identifier;\\nn\'\'\'.replace("\\n\\n", "\\n"),\n)'''
# The helper source contains a simpler literal; replace that exact block directly.
old = '''replace_once(\n    "src/domain/models.ts",\n    \'\'\'  contentProvider: string;\\n  contentKey: string;\\n  createdBySubjectId: Identifier;\\n\'\'\',\n    \'\'\'  contentProvider: string;\\n  contentKey: string;\\n  changeSummary?: string;\\n  createdBySubjectId: Identifier;\\n\'\'\',\n)'''
new = '''replace_once(\n    "src/domain/models.ts",\n    \'\'\'export interface DocumentVersion {\\n  id: Identifier;\\n  tenantId: Identifier;\\n  documentId: Identifier;\\n  versionNumber: number;\\n  contentHash: string;\\n  contentProvider: string;\\n  contentKey: string;\\n  createdBySubjectId: Identifier;\\n  createdAt: IsoTimestamp;\\n}\'\'\',\n    \'\'\'export interface DocumentVersion {\\n  id: Identifier;\\n  tenantId: Identifier;\\n  documentId: Identifier;\\n  versionNumber: number;\\n  contentHash: string;\\n  contentProvider: string;\\n  contentKey: string;\\n  changeSummary?: string;\\n  createdBySubjectId: Identifier;\\n  createdAt: IsoTimestamp;\\n}\'\'\',\n)'''
if text.count(old) != 1:
    raise SystemExit(f"Expected one generic DocumentVersion patch block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
