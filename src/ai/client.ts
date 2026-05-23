import type Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "./usage";
import { logger } from "@/lib/logger";

let cached: Anthropic | undefined;

async function client(): Promise<Anthropic> {
  if (!cached) {
    const mod = await import("@anthropic-ai/sdk");
    const Ctor = mod.default;
    cached = new Ctor({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cached;
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

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface AnthropicMessageResponse {
  id: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: string; [k: string]: unknown }
  >;
  usage: AnthropicUsage;
  stop_reason?: string;
}

export async function callTool<T = unknown>(input: CallToolInput): Promise<CallToolResult<T>> {
  const started = Date.now();
  try {
    const c = await client();
    const res = (await c.messages.create({
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
    })) as unknown as AnthropicMessageResponse;
    const toolBlock = res.content.find(
      (c2): c2 is { type: "tool_use"; id: string; name: string; input: unknown } =>
        c2.type === "tool_use",
    );
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
    const c = await client();
    const res = (await c.messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    })) as unknown as AnthropicMessageResponse;
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
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
