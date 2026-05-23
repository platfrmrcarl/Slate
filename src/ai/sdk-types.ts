/**
 * Narrow Anthropic SDK shapes used by our adapters.
 *
 * The SDK's full `Message` / `ContentBlock` types carry many fields we never
 * touch (citations, container info, geo metadata, etc). Re-exporting trimmed
 * shapes here lets the rest of `src/ai/*` work with familiar discriminated
 * unions — and keeps the one widening cast contained to `client.ts`.
 *
 * If you find yourself reading a new field off a response, add it here first
 * so we don't sprinkle SDK-shaped casts across the AI code again.
 */

export interface SdkUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface SdkTextBlock {
  type: "text";
  text: string;
}

export interface SdkToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

// Open-ended fallback: the SDK content union includes thinking / tool result /
// server-tool blocks we don't render. Keep an open member so `.filter` calls
// downstream stay type-safe without claiming we know every shape.
export interface SdkUnknownBlock {
  type: string;
  [k: string]: unknown;
}

export type SdkContentBlock = SdkTextBlock | SdkToolUseBlock | SdkUnknownBlock;

export interface SdkMessage {
  id: string;
  content: SdkContentBlock[];
  usage: SdkUsage;
  stop_reason?: string | null;
}

export function isTextBlock(b: SdkContentBlock): b is SdkTextBlock {
  return b.type === "text" && typeof (b as SdkTextBlock).text === "string";
}

export function isToolUseBlock(b: SdkContentBlock): b is SdkToolUseBlock {
  return b.type === "tool_use";
}
