from pathlib import Path

path = Path("src/application/work-queue-action-input.ts")
text = path.read_text()
old = '''function containsDisallowedControlCharacter(value: string): boolean {
  return /[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/u.test(value);
}
'''
new = '''function containsDisallowedControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return true;
    }
  }
  return false;
}
'''
if text.count(old) != 1:
    raise SystemExit("Expected control-character validator marker not found exactly once")
path.write_text(text.replace(old, new, 1))
