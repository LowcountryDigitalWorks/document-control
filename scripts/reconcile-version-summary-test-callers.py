from pathlib import Path

# Fix the spread-based authorization caller that the generic createChangedVersion scan cannot see.
path = Path("tests/unit/authorized-workflow-service.test.ts")
text = path.read_text()
old_changed = '''        contentHash: `sha256:${"2".repeat(64)}`,\n        contentKey: "unused-after-denial",\n      }),'''
new_changed = '''        contentHash: `sha256:${"2".repeat(64)}`,\n        contentKey: "unused-after-denial",\n        changeSummary: "Synthetic controlled version change.",\n      }),'''
if text.count(old_changed) != 1:
    raise SystemExit(f"Expected one spread-based createChangedVersion fixture, found {text.count(old_changed)}")
text = text.replace(old_changed, new_changed, 1)
wrong_evidence = '''        tenantId: "tenant-1",\n        documentId: "document-1",\n        changeSummary: "Synthetic controlled version change.",\n        actorSubjectId: "subject-1",\n'''
correct_evidence = '''        tenantId: "tenant-1",\n        documentId: "document-1",\n        actorSubjectId: "subject-1",\n'''
if text.count(wrong_evidence) != 1:
    raise SystemExit(f"Expected one misplaced evidence summary fixture, found {text.count(wrong_evidence)}")
path.write_text(text.replace(wrong_evidence, correct_evidence, 1))

# The controlled-retirement harness owns a partial explicit migration list and raw version inserts.
path = Path("tests/unit/document-retirement.test.ts")
text = path.read_text()
old_migrations = '''    "0002_system_role_permissions.sql",\n    "0008_controlled_document_retirement.sql",\n'''
new_migrations = '''    "0002_system_role_permissions.sql",\n    "0008_controlled_document_retirement.sql",\n    "0011_document_version_change_summary.sql",\n'''
if text.count(old_migrations) != 1:
    raise SystemExit(f"Expected one retirement migration list, found {text.count(old_migrations)}")
text = text.replace(old_migrations, new_migrations, 1)
old_insert = '''    INSERT INTO document_versions\n      (id, tenant_id, document_id, version_number, content_hash, content_provider,\n       content_key, created_by_subject_id, created_at)\n    VALUES\n      ('${versionId}', '${tenantId}', '${documentId}', 1, '${hash}', 'r2',\n       'tenants/${tenantId}/workspaces/${workspaceId}/documents/${documentId}/versions/${versionId}/content',\n       'owner-1', '${timestamp}');'''
new_insert = '''    INSERT INTO document_versions\n      (id, tenant_id, document_id, version_number, content_hash, content_provider,\n       content_key, change_summary, created_by_subject_id, created_at)\n    VALUES\n      ('${versionId}', '${tenantId}', '${documentId}', 1, '${hash}', 'r2',\n       'tenants/${tenantId}/workspaces/${workspaceId}/documents/${documentId}/versions/${versionId}/content',\n       'Approved record baseline for retirement testing.', 'owner-1', '${timestamp}');'''
if text.count(old_insert) != 1:
    raise SystemExit(f"Expected one retirement document-version seed, found {text.count(old_insert)}")
text = text.replace(old_insert, new_insert, 1)
old_direct = '''        INSERT INTO document_versions\n          (id, tenant_id, document_id, version_number, content_hash, content_provider,\n           content_key, created_by_subject_id, created_at)\n        VALUES\n          ('direct-v2', '${tenantId}', '${documentId}', 2, 'sha256:${"c".repeat(64)}', 'r2',\n           'direct-key', 'owner-1', '${timestamp}');'''
new_direct = '''        INSERT INTO document_versions\n          (id, tenant_id, document_id, version_number, content_hash, content_provider,\n           content_key, change_summary, created_by_subject_id, created_at)\n        VALUES\n          ('direct-v2', '${tenantId}', '${documentId}', 2, 'sha256:${"c".repeat(64)}', 'r2',\n           'direct-key', 'Direct version attempt after retirement.', 'owner-1', '${timestamp}');'''
if text.count(old_direct) != 1:
    raise SystemExit(f"Expected one direct retirement-block insert, found {text.count(old_direct)}")
path.write_text(text.replace(old_direct, new_direct, 1))
