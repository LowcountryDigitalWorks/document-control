from pathlib import Path

path = Path("tests/unit/roles-access-admin-service.test.ts")
text = path.read_text()
marker = '''  const database = new DatabaseSync(":memory:");
  database.exec(initial);
  database.exec(permissions);
'''
replacement = '''  const retirement = await readFile(
    new URL(
      "../../migrations/0007_custom_role_retirement.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(initial);
  database.exec(permissions);
  database.exec(retirement);
'''
if marker not in text:
    raise SystemExit("roles-access test harness marker missing")
path.write_text(text.replace(marker, replacement, 1))
