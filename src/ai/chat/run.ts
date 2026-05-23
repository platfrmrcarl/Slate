import { aiEnabled } from "@/ai/disabled";
import { createMessage } from "@/ai/client";
import { modelFor, MAX_TOKENS } from "@/ai/models";
import { isTextBlock, isToolUseBlock } from "@/ai/sdk-types";
import { recordUsage } from "@/ai/usage";
import { chatTools, findTool } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunInput {
  history: ChatMessage[];
  userMessage: string;
  contextRef?: string;
  userId: string;
}

export interface RunResult {
  reply: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  disabled?: true;
  error?: string;
}

const MAX_TOOL_ROUNDS = 3;

export async function runChat(input: RunInput): Promise<RunResult> {
  if (!aiEnabled()) return { reply: "AI is disabled.", toolCalls: [], disabled: true };
  const model = modelFor("chat");
  const started = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: input.userMessage },
    ];
    const toolCalls: RunResult["toolCalls"] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let lastResponseId = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await createMessage({
        model,
        max_tokens: MAX_TOKENS.chat,
        system: [
          {
            type: "text",
            text:
              "You are an authoring assistant inside a CMS. Use tools to answer questions about the current site. " +
              "Always cite the tool you used.",
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: chatTools.map(({ name, description, input_schema }) => ({
          name,
          description,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: input_schema as any,
        })),
        messages,
      });
      lastResponseId = res.id;
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      cacheReadTokens += res.usage.cache_read_input_tokens ?? 0;

      const stopReason = res.stop_reason;
      if (stopReason !== "tool_use") {
        const reply = res.content
          .filter(isTextBlock)
          .filter((b) => !!b.text)
          .map((b) => b.text)
          .join("\n");
        await recordUsage({
          userId: input.userId,
          feature: "chat",
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          latencyMs: Date.now() - started,
          requestId: lastResponseId,
          success: true,
        });
        return { reply, toolCalls };
      }

      messages = [...messages, { role: "assistant", content: res.content }];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newToolResults: any[] = [];
      for (const block of res.content) {
        if (!isToolUseBlock(block)) continue;
        const tool = findTool(block.name);
        let output: unknown;
        if (!tool) {
          output = { error: `unknown tool: ${block.name}` };
        } else {
          try {
            output = await tool.run(block.input);
          } catch (err) {
            output = { error: err instanceof Error ? err.message : String(err) };
          }
        }
        toolCalls.push({ name: block.name, input: block.input, output });
        newToolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
      messages = [...messages, { role: "user", content: newToolResults }];
    }

    await recordUsage({
      userId: input.userId,
      feature: "chat",
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      latencyMs: Date.now() - started,
      requestId: lastResponseId,
      success: true,
    });
    return { reply: "Stopped after tool round limit.", toolCalls, error: "tool-round-limit" };
  } catch (err) {
    await recordUsage({
      userId: input.userId,
      feature: "chat",
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return {
      reply: "Sorry, I hit an error.",
      toolCalls: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
