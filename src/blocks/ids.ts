import { customAlphabet } from "nanoid";

// URL-safe, no ambiguous chars, 10 chars ≈ 60 bits of entropy — enough for in-document uniqueness.
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
const nano = customAlphabet(alphabet, 10);

export function generateBlockId(): string {
  return nano();
}
