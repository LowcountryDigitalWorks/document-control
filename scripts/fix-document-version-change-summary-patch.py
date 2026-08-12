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

detail_old = '''replace_once(\n    "src/application/document-detail-read-service.ts",\n    \'\'\'  contentHash: string;\\n  contentProvider: string;\\n  createdBySubjectId: string;\\n\'\'\',\n    \'\'\'  contentHash: string;\\n  contentProvider: string;\\n  changeSummary: string;\\n  createdBySubjectId: string;\\n\'\'\',\n)'''
detail_new = '''replace_once(\n    "src/application/document-detail-read-service.ts",\n    \'\'\'export interface DocumentVersionEvidence {\\n  id: string;\\n  versionNumber: number;\\n  contentHash: string;\\n  contentProvider: string;\\n  createdBySubjectId: string;\\n  createdByName: string;\\n  createdAt: string;\\n\'\'\',\n    \'\'\'export interface DocumentVersionEvidence {\\n  id: string;\\n  versionNumber: number;\\n  contentHash: string;\\n  contentProvider: string;\\n  changeSummary: string;\\n  createdBySubjectId: string;\\n  createdByName: string;\\n  createdAt: string;\\n\'\'\',\n)'''
if text.count(detail_old) != 1:
    raise SystemExit(f"Expected one generic DocumentVersionEvidence patch block, found {text.count(detail_old)}")
text = text.replace(detail_old, detail_new, 1)

portable_old = '''replace_once(\n    "src/application/portable-export-read-service.ts",\n    \'\'\'              content_provider AS contentProvider,\\n              content_key AS contentKey,\\n              created_by_subject_id AS createdBySubjectId,\\n\'\'\',\n    \'\'\'              content_provider AS contentProvider,\\n              content_key AS contentKey,\\n              change_summary AS changeSummary,\\n              created_by_subject_id AS createdBySubjectId,\\n\'\'\',\n)'''
portable_new = '''replace_once(\n    "src/application/portable-export-read-service.ts",\n    \'\'\'              version_number AS versionNumber,\\n              content_hash AS contentHash,\\n              content_provider AS contentProvider,\\n              content_key AS contentKey,\\n              created_by_subject_id AS createdBySubjectId,\\n              created_at AS createdAt\\n       FROM document_versions\\n\'\'\',\n    \'\'\'              version_number AS versionNumber,\\n              content_hash AS contentHash,\\n              content_provider AS contentProvider,\\n              content_key AS contentKey,\\n              change_summary AS changeSummary,\\n              created_by_subject_id AS createdBySubjectId,\\n              created_at AS createdAt\\n       FROM document_versions\\n\'\'\',\n)'''
if text.count(portable_old) != 1:
    raise SystemExit(f"Expected one generic portable document-version query patch, found {text.count(portable_old)}")
text = text.replace(portable_old, portable_new, 1)

path.write_text(text)
