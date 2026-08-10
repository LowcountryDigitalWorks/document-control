import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  { name: "AWS access key", expression: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "GitHub token",
    expression: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  { name: "Google API key", expression: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "Slack token", expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "OpenAI-style key", expression: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  {
    name: "private key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "sensitive environment assignment",
    expression:
      /\b(?:CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|DATABASE_URL|GITHUB_TOKEN|OPENAI_API_KEY|CLIENT_SECRET)\s*=\s*["']?[^\s"']{12,}/gi,
  },
] as const;

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings: string[] = [];

for (const file of files) {
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  scanText(file, bytes.toString("utf8"), findings);
}

const history = execFileSync(
  "git",
  ["log", "--all", "-p", "--full-history", "--no-ext-diff", "--no-color", "--text"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
scanText("git-history", history, findings);

const uniqueFindings = [...new Set(findings)];
if (uniqueFindings.length > 0) {
  console.error("Potential secrets detected:\n" + uniqueFindings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Secret scan passed (${files.length} tracked files plus reachable git history).`,
  );
}

function scanText(label: string, text: string, output: string[]): void {
  for (const { name, expression } of patterns) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      const line = text.slice(0, match.index).split("\n").length;
      output.push(`${label}:${line} ${name}`);
    }
  }
}
