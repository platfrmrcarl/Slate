import type { Role } from "@/db/schema";

export type Action =
  | "manage:users"
  | "manage:themes"
  | "manage:plugins"
  | "manage:settings"
  | "publish:any-post"
  | "publish:own-post"
  | "edit:any-post"
  | "edit:own-post"
  | "delete:any-post"
  | "delete:own-post"
  | "upload:media"
  | "moderate:comments"
  | "read:protected-content"
  | "comment:create";

export interface ActorLike {
  id: string;
  role: Role;
}

interface OwnableResource {
  authorId: string;
}

const ROLE_RANK: Record<Role, number> = {
  subscriber: 0,
  contributor: 1,
  author: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

function atLeast(actor: ActorLike, role: Role): boolean {
  return ROLE_RANK[actor.role] >= ROLE_RANK[role];
}

function owns(actor: ActorLike, resource?: OwnableResource): boolean {
  return !!resource && resource.authorId === actor.id;
}

export function can(actor: ActorLike, action: Action, resource?: OwnableResource): boolean {
  switch (action) {
    case "manage:users":
    case "manage:themes":
    case "manage:plugins":
    case "manage:settings":
      return atLeast(actor, "admin");

    case "publish:any-post":
    case "edit:any-post":
    case "delete:any-post":
    case "moderate:comments":
      return atLeast(actor, "editor");

    case "publish:own-post":
    case "delete:own-post":
      return atLeast(actor, "author") && (atLeast(actor, "editor") || owns(actor, resource));

    case "edit:own-post":
      return atLeast(actor, "contributor") && (atLeast(actor, "editor") || owns(actor, resource));

    case "upload:media":
      return atLeast(actor, "author");

    case "read:protected-content":
      return atLeast(actor, "subscriber");

    case "comment:create":
      return atLeast(actor, "subscriber");

    default:
      return false;
  }
}
