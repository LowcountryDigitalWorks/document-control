import type { TemplateLifecycleState, TemplateVersion } from "./models";

const allowedTemplateTransitions: Readonly<
  Record<TemplateLifecycleState, readonly TemplateLifecycleState[]>
> = {
  draft: ["review", "retired"],
  review: ["draft", "approved", "retired"],
  approved: ["published", "retired"],
  published: ["superseded", "retired"],
  superseded: ["retired"],
  retired: [],
};

export function transitionTemplateVersion(
  version: TemplateVersion,
  target: TemplateLifecycleState,
  occurredAt: string,
): TemplateVersion {
  if (!allowedTemplateTransitions[version.lifecycleState].includes(target)) {
    throw new Error(
      `Template version cannot transition from ${version.lifecycleState} to ${target}.`,
    );
  }

  return {
    ...version,
    lifecycleState: target,
    publishedAt:
      target === "published" ? occurredAt : version.publishedAt,
    supersededAt:
      target === "superseded" ? occurredAt : version.supersededAt,
  };
}

export function availableTemplateTransitions(
  state: TemplateLifecycleState,
): readonly TemplateLifecycleState[] {
  return allowedTemplateTransitions[state];
}
