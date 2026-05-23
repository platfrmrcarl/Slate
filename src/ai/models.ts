export type Feature =
  | "generate-page"
  | "rewrite"
  | "alt-text"
  | "seo-meta"
  | "translate"
  | "chat"
  | "spam-classify";

const ENV_KEYS: Record<Feature, string> = {
  "generate-page": "AI_MODEL_GENERATE_PAGE",
  rewrite: "AI_MODEL_REWRITE",
  "alt-text": "AI_MODEL_ALT_TEXT",
  "seo-meta": "AI_MODEL_SEO_META",
  translate: "AI_MODEL_TRANSLATE",
  chat: "AI_MODEL_CHAT",
  "spam-classify": "AI_MODEL_SPAM",
};

const FALLBACKS: Record<Feature, string> = {
  "generate-page": "claude-opus-4-7",
  rewrite: "claude-haiku-4-5",
  "alt-text": "claude-haiku-4-5",
  "seo-meta": "claude-haiku-4-5",
  translate: "claude-sonnet-4-6",
  chat: "claude-sonnet-4-6",
  "spam-classify": "claude-haiku-4-5",
};

export function modelFor(feature: Feature): string {
  return process.env[ENV_KEYS[feature]] ?? FALLBACKS[feature];
}

export const MAX_TOKENS: Record<Feature, number> = {
  "generate-page": 8000,
  rewrite: 2000,
  "alt-text": 500,
  "seo-meta": 500,
  translate: 8000,
  chat: 4000,
  "spam-classify": 200,
};
