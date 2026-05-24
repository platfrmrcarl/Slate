import type { ComponentType, ReactNode } from "react";
import type { ThemeManifest } from "./manifest";

export interface ThemeModule {
  manifest: ThemeManifest;
  Layout: ComponentType<{ children: ReactNode; tokens: Record<string, unknown> }>;
  primitives: {
    Heading: ComponentType<{ level: 1 | 2 | 3 | 4 | 5 | 6; children: ReactNode }>;
    Paragraph: ComponentType<{ children: ReactNode }>;
    Button: ComponentType<{ href: string; label: string; variant?: string }>;
    Hero: ComponentType<{
      headline: string;
      subheadline?: string;
      cta?: { label: string; href: string };
      bgMediaId?: string;
    }>;
    Image: ComponentType<{
      media: string;
      alt?: string;
      caption?: string;
      size?: "small" | "medium" | "full";
    }>;
  };
  templates: {
    page: ComponentType<{ children: ReactNode; title: string }>;
    post: ComponentType<{
      children: ReactNode;
      title: string;
      publishedAt?: Date | null;
      authorName?: string;
    }>;
    archive: ComponentType<{ children: ReactNode; title: string }>;
    home: ComponentType<{ children: ReactNode }>;
  };
}

type Loader = () => Promise<{ default: ThemeModule }>;

const REGISTRY: Record<string, { slug: string; loader: Loader }> = {
  "slate-default": {
    slug: "slate-default",
    loader: () => import("../../themes/slate-default") as Promise<{ default: ThemeModule }>,
  },
  // Plugins are appended here at build time by the cli sub-plan's `slate theme install`.
};

export function listRegisteredThemes(): Array<{ slug: string }> {
  return Object.values(REGISTRY).map((t) => ({ slug: t.slug }));
}

export async function resolveThemeModule(slug: string): Promise<ThemeModule> {
  const entry = REGISTRY[slug];
  if (!entry) throw new Error(`theme not registered: ${slug}`);
  const mod = await entry.loader();
  return mod.default;
}
