import { getActiveTheme } from "./active";
import type { ThemeModule } from "./registry";
import type { CustomizationValues } from "./manifest";

export interface ThemeContext {
  slug: string;
  tokens: CustomizationValues;
  Layout: ThemeModule["Layout"];
  Heading: ThemeModule["primitives"]["Heading"];
  Paragraph: ThemeModule["primitives"]["Paragraph"];
  Button: ThemeModule["primitives"]["Button"];
  Hero: ThemeModule["primitives"]["Hero"];
  Image: ThemeModule["primitives"]["Image"];
  templates: ThemeModule["templates"];
}

export async function resolveThemeContext(): Promise<ThemeContext | null> {
  const active = await getActiveTheme();
  if (!active) return null;
  const { primitives, templates, Layout } = active.module;
  return {
    slug: active.slug,
    tokens: active.tokens,
    Layout,
    Heading: primitives.Heading,
    Paragraph: primitives.Paragraph,
    Button: primitives.Button,
    Hero: primitives.Hero,
    Image: primitives.Image,
    templates,
  };
}
