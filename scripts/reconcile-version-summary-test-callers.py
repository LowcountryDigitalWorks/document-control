from pathlib import Path

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
