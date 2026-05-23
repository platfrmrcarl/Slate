/**
 * Minimal runtime block registry.
 *
 * The block-editor-core sub-plan delivers the canonical block list via
 * `src/blocks/types.ts` (the discriminated union). This registry sits
 * alongside that and serves as the merge point where plugins can contribute
 * custom block renderers at boot. It is intentionally simple: a Map keyed
 * on the discriminator string with two operations (`register`, `has`) plus
 * a `get` for introspection.
 *
 * Plugin blocks must follow the convention `custom:<plugin-slug>-<name>` to
 * avoid colliding with built-ins.
 */

export interface BlockDefinition {
  type: string;
  // Loose shape — plugin block modules may carry their own schema/render
  // functions. The registry doesn't enforce a shape beyond `type` so it
  // remains forward-compatible with whatever block-editor-core lands later.
  [key: string]: unknown;
}

class BlockRegistry {
  private readonly defs = new Map<string, BlockDefinition>();

  register(def: BlockDefinition): void {
    if (typeof def.type !== "string" || def.type.length === 0) {
      throw new Error("blockRegistry.register: definition.type must be a non-empty string");
    }
    this.defs.set(def.type, def);
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  get(type: string): BlockDefinition | undefined {
    return this.defs.get(type);
  }

  list(): BlockDefinition[] {
    return [...this.defs.values()];
  }

  /** Test-only: reset the registry. */
  _reset(): void {
    this.defs.clear();
  }
}

export const blockRegistry = new BlockRegistry();
