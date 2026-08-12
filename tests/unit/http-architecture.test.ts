import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function importsFrom(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return Array.from(
    source.matchAll(/(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/gu),
    (match) => match[1],
  );
}

describe("HTTP architecture boundaries", () => {
  it("keeps the Worker entrypoint limited to application composition", () => {
    const source = readFileSync(join(repositoryRoot, "src/index.ts"), "utf8");

    expect(source).toContain('from "./http/app"');
    expect(source).toContain('from "./http/dependencies"');
    expect(source).not.toMatch(/\bapp\.(?:get|post|put|patch|delete|use)\s*\(/u);
    expect(source).not.toContain("D1DatabaseProvider");
    expect(source).not.toContain("R2ContentStore");
  });

  it("keeps route modules dependent on injected application composition rather than infrastructure adapters", () => {
    const routesDirectory = join(repositoryRoot, "src/http/routes");
    const violations = sourceFiles(routesDirectory).flatMap((path) =>
      importsFrom(path)
        .filter(
          (specifier) =>
            specifier.includes("/infrastructure/") ||
            specifier.includes("d1-database-provider") ||
            specifier.includes("r2-content-store"),
        )
        .map(
          (specifier) =>
            `${relative(repositoryRoot, path)} imports ${specifier}`,
        ),
    );

    expect(violations).toEqual([]);
  });

  it("keeps the domain layer independent of Hono and infrastructure adapters", () => {
    const domainDirectory = join(repositoryRoot, "src/domain");
    const violations = sourceFiles(domainDirectory).flatMap((path) =>
      importsFrom(path)
        .filter(
          (specifier) =>
            specifier === "hono" ||
            specifier.startsWith("hono/") ||
            specifier.includes("/infrastructure/") ||
            specifier.includes("d1-") ||
            specifier.includes("r2-"),
        )
        .map(
          (specifier) =>
            `${relative(repositoryRoot, path)} imports ${specifier}`,
        ),
    );

    expect(violations).toEqual([]);
  });
});
