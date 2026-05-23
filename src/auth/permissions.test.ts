import { describe, expect, it } from "vitest";
import { can, type ActorLike, type Action } from "./permissions";

function actor(role: ActorLike["role"], id = "user-1"): ActorLike {
  return { id, role };
}

const ALL_ROLES = ["owner", "admin", "editor", "author", "contributor", "subscriber"] as const;

// Ensure `Action` type is exported and referenced.
const _actionSample: Action = "manage:users";
void _actionSample;

describe("permissions matrix", () => {
  describe("manage:users", () => {
    it("allows owner and admin", () => {
      expect(can(actor("owner"), "manage:users")).toBe(true);
      expect(can(actor("admin"), "manage:users")).toBe(true);
    });
    it("denies others", () => {
      for (const r of ["editor", "author", "contributor", "subscriber"] as const) {
        expect(can(actor(r), "manage:users")).toBe(false);
      }
    });
  });

  describe("manage:themes / manage:plugins / manage:settings", () => {
    it.each(["manage:themes", "manage:plugins", "manage:settings"] as const)(
      "%s allowed only for owner+admin",
      (action) => {
        expect(can(actor("owner"), action)).toBe(true);
        expect(can(actor("admin"), action)).toBe(true);
        expect(can(actor("editor"), action)).toBe(false);
      },
    );
  });

  describe("publish:any-post", () => {
    it("allows owner, admin, editor", () => {
      expect(can(actor("owner"), "publish:any-post")).toBe(true);
      expect(can(actor("admin"), "publish:any-post")).toBe(true);
      expect(can(actor("editor"), "publish:any-post")).toBe(true);
    });
    it("denies author, contributor, subscriber", () => {
      expect(can(actor("author"), "publish:any-post")).toBe(false);
      expect(can(actor("contributor"), "publish:any-post")).toBe(false);
      expect(can(actor("subscriber"), "publish:any-post")).toBe(false);
    });
  });

  describe("publish:own-post", () => {
    it("allows owner, admin, editor, author on their own", () => {
      const u = actor("author", "user-1");
      const resource = { authorId: "user-1" };
      expect(can(u, "publish:own-post", resource)).toBe(true);
    });
    it("denies author on someone else's post", () => {
      const u = actor("author", "user-1");
      const resource = { authorId: "user-2" };
      expect(can(u, "publish:own-post", resource)).toBe(false);
    });
    it("denies contributor and subscriber even on their own", () => {
      expect(can(actor("contributor", "u1"), "publish:own-post", { authorId: "u1" })).toBe(false);
      expect(can(actor("subscriber", "u1"), "publish:own-post", { authorId: "u1" })).toBe(false);
    });
  });

  describe("edit:own-post (contributor allowed)", () => {
    it("contributor can edit their own draft", () => {
      expect(can(actor("contributor", "u1"), "edit:own-post", { authorId: "u1" })).toBe(true);
    });
    it("contributor cannot edit others", () => {
      expect(can(actor("contributor", "u1"), "edit:own-post", { authorId: "u2" })).toBe(false);
    });
  });

  describe("upload:media", () => {
    it("allows owner through author", () => {
      for (const r of ["owner", "admin", "editor", "author"] as const) {
        expect(can(actor(r), "upload:media")).toBe(true);
      }
    });
    it("denies contributor and subscriber", () => {
      expect(can(actor("contributor"), "upload:media")).toBe(false);
      expect(can(actor("subscriber"), "upload:media")).toBe(false);
    });
  });

  describe("moderate:comments", () => {
    it("allows owner, admin, editor", () => {
      for (const r of ["owner", "admin", "editor"] as const) {
        expect(can(actor(r), "moderate:comments")).toBe(true);
      }
    });
    it("denies the rest", () => {
      for (const r of ["author", "contributor", "subscriber"] as const) {
        expect(can(actor(r), "moderate:comments")).toBe(false);
      }
    });
  });

  describe("unknown action", () => {
    it("denies by default", () => {
      for (const r of ALL_ROLES) {
        // @ts-expect-error — testing runtime default-deny
        expect(can(actor(r), "do:something:undefined")).toBe(false);
      }
    });
  });
});
