import { serializeExport } from "../../application/export";
import { createSyntheticExport } from "../../demo/fixtures";
import { renderHome } from "../../ui/render";
import { createTheme } from "../../ui/theme";
import type { DocumentControlApp } from "../types";

export function registerSystemRoutes(app: DocumentControlApp): void {
  app.get("/", (context) => context.html(renderHome(createTheme(context.env))));

  app.get("/health", (context) =>
    context.json({ status: "ok", service: "document-control" }),
  );

  app.get("/demo/export", (context) => {
    const exportedAt = new Date().toISOString();
    return context.body(
      serializeExport(createSyntheticExport(exportedAt)),
      200,
      {
        "Content-Disposition":
          'attachment; filename="document-control-demo-export-v1.json"',
        "Content-Type": "application/json; charset=utf-8",
      },
    );
  });

  app.get("/favicon.svg", (context) =>
    context.body(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#163b45"/><path d="M15 17h8v23h13v7H15V17Zm25 0h8v30h-8V17Z" fill="#f8f7f2"/></svg>',
      200,
      {
        "Cache-Control": "public, max-age=86400",
        "Content-Type": "image/svg+xml",
      },
    ),
  );
}
