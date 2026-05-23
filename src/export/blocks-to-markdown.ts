interface Block {
  id: string;
  type: string;
  [k: string]: unknown;
}

function emit(b: Block): string {
  switch (b.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(b.level ?? 1)));
      const text = String(b.text ?? "");
      return `${"#".repeat(level)} ${text}\n`;
    }
    case "paragraph":
      return `${String(b.markdown ?? "")}\n`;
    case "list": {
      const items = (b.items as string[]) ?? [];
      if (b.ordered) {
        return items.map((it, i) => `${i + 1}. ${it}`).join("\n") + "\n";
      }
      return items.map((it) => `- ${it}`).join("\n") + "\n";
    }
    case "quote":
      return (
        String(b.markdown ?? "")
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") + "\n"
      );
    case "code": {
      const lang = String(b.language ?? "");
      const src = String(b.source ?? "");
      return `\`\`\`${lang}\n${src}\n\`\`\`\n`;
    }
    case "divider":
      return "---\n";
    default: {
      // Round-trip non-text blocks lossless.
      const json = JSON.stringify(b, null, 2);
      return `\`\`\`block:${b.type}\n${json}\n\`\`\`\n`;
    }
  }
}

export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    parts.push(emit(b));
  }
  return parts.join("\n");
}
