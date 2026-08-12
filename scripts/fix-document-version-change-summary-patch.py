from pathlib import Path

path = Path("scripts/patch-document-version-change-summary.py")
text = path.read_text()

model_old = '''replace_once(\n    "src/domain/models.ts",\n    \'\'\'  contentProvider: string;\\n  contentKey: string;\\n  createdBySubjectId: Identifier;\\n\'\'\',\n    \'\'\'  contentProvider: string;\\n  contentKey: string;\\n  changeSummary?: string;\\n  createdBySubjectId: Identifier;\\n\'\'\',\n)'''
model_new = '''replace_once(\n    "src/domain/models.ts",\n    \'\'\'export interface DocumentVersion {\\n  id: Identifier;\\n  tenantId: Identifier;\\n  documentId: Identifier;\\n  versionNumber: number;\\n  contentHash: string;\\n  contentProvider: string;\\n  contentKey: string;\\n  createdBySubjectId: Identifier;\\n  createdAt: IsoTimestamp;\\n}\'\'\',\n    \'\'\'export interface DocumentVersion {\\n  id: Identifier;\\n  tenantId: Identifier;\\n  documentId: Identifier;\\n  versionNumber: number;\\n  contentHash: string;\\n  contentProvider: string;\\n  contentKey: string;\\n  changeSummary?: string;\\n  createdBySubjectId: Identifier;\\n  createdAt: IsoTimestamp;\\n}\'\'\',\n)'''
if text.count(model_old) != 1:
    raise SystemExit(f"Expected one generic DocumentVersion patch block, found {text.count(model_old)}")
text = text.replace(model_old, model_new, 1)

initial_old = '''replace_once(\n    "src/application/document-workflow-service.ts",\n    \'\'\'      contentProvider: "r2",\\n      contentKey: command.contentKey,\\n      createdBySubjectId: command.actorSubjectId,\\n\'\'\',\n    \'\'\'      contentProvider: "r2",\\n      contentKey: command.contentKey,\\n      changeSummary: "Initial version created from approved template.",\\n      createdBySubjectId: command.actorSubjectId,\\n\'\'\',\n)'''
initial_new = '''service_path = Path("src/application/document-workflow-service.ts")\nservice_text = service_path.read_text()\ninitial_needle = \'\'\'      contentProvider: "r2",\\n      contentKey: command.contentKey,\\n      createdBySubjectId: command.actorSubjectId,\\n\'\'\'\nif service_text.count(initial_needle) != 2:\n    raise SystemExit(f"Expected initial and changed version object matches, found {service_text.count(initial_needle)}")\nservice_path.write_text(\n    service_text.replace(\n        initial_needle,\n        \'\'\'      contentProvider: "r2",\\n      contentKey: command.contentKey,\\n      changeSummary: "Initial version created from approved template.",\\n      createdBySubjectId: command.actorSubjectId,\\n\'\'\',\n        1,\n    )\n)'''
if text.count(initial_old) != 1:
    raise SystemExit(f"Expected one initial-version patch block, found {text.count(initial_old)}")
text = text.replace(initial_old, initial_new, 1)

path.write_text(text)
