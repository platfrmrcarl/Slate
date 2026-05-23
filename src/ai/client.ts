import type Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { recordUsage } from "./usage";
import { logger } from "@/lib/logger";
import { isTextBlock, isToolUseBlock, type SdkMessage } from "./sdk-types";

let cached: Anthropic | undefined;

async function client(): Promise<Anthropic> {
  if (!cached) {
    const mod = await import("@anthropic-ai/sdk");
    const Ctor = mod.default;
    cached = new Ctor({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
}

/**
 * Thin wrapper around `client.messages.create` that hides the SDK Message →
 * narrow `SdkMessage` widening in one place. All adapters in `src/ai/*`
 * should go through this rather than building their own client + cast.
 *
 * `SdkMessage` keeps the fields we actually read and uses an open-ended
 * `SdkUnknownBlock` for content variants we don't render — so the SDK's
 * concrete `Message` widens here with a single `as` assertion (no
 * `as unknown as ...` round-trip).
 */
export async function createMessage(params: MessageCreateParamsNonStreaming): Promise<SdkMessage> {
  const c = await client();
  const res = await c.messages.create(params);
  return res as SdkMessage;
}

export interface CacheableTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export function cacheable(text: string): CacheableTextBlock {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

export function plain(text: string): CacheableTextBlock {
  return { type: "text", text };
}

export interface CallToolInput {
  feature: string;
  model: string;
  maxTokens: number;
  system: string | CacheableTextBlock[];
  user: string;
  tool: { name: string; description: string; input_schema: object };
  userId: string | null;
}

export interface CallToolResult<T = unknown> {
  input: T;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export async function callTool<T = unknown>(input: CallToolInput): Promise<CallToolResult<T>> {
  const started = Date.now();
  try {
    const res = await createMessage({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      tools: [
        {
          name: input.tool.name,
          description: input.tool.description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: input.tool.input_schema as any,
        },
      ],
      tool_choice: { type: "tool", name: input.tool.name },
      messages: [{ role: "user", content: input.user }],
    });
    const toolBlock = res.content.find(isToolUseBlock);
    if (!toolBlock) throw new Error("model did not return a tool_use block");
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cachedTokens: res.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - started,
      requestId: res.id,
      success: true,
    });
    return {
      input: toolBlock.input as T,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    logger().warn({ err, feature: input.feature, model: input.model }, "ai:tool-call failed");
    throw err;
  }
}

export interface CallTextInput {
  feature: string;
  model: string;
  maxTokens: number;
  system: string | CacheableTextBlock[];
  user: string;
  userId: string | null;
}

export interface CallTextResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export async function callText(input: CallTextInput): Promise<CallTextResult> {
  const started = Date.now();
  try {
    const res = await createMessage({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
    const text = res.content.filter(isTextBlock).map((b) => b.text).join("\n");
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cachedTokens: res.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - started,
      requestId: res.id,
      success: true,
    });
    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: input.feature,
      model: input.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
