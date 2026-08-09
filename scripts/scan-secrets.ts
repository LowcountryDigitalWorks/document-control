import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  { name: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "Google API key", expression: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  {
    name: "private key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "sensitive environment assignment",
    expression:
      /\b(?:CLOUDFLARE_API_TOKEN|DATABASE_URL|GITHUB_TOKEN)\s*=\s*["']?[^\s"']{12,}/gi,
  },
] as const;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings: string[] = [];

for (const file of files) {
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;

  const text = bytes.toString("utf8");
  for (const { name, expression } of patterns) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line} ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${files.length} tracked files).`);
}
