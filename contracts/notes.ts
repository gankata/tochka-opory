export const noteKinds = ["folder", "note", "wishlist"] as const;
export type NoteKind = (typeof noteKinds)[number];

export const wishlistPriorities = ["low", "normal", "high"] as const;
export type WishlistPriority = (typeof wishlistPriorities)[number];

export type WishlistItem = {
  id: string;
  title: string;
  url: string | null;
  price: number | null;
  priority: WishlistPriority;
  done: boolean;
  note: string | null;
};

export type NoteDocument = Record<string, unknown>;
export type NoteRelatedLink = { id: string; section: "operations" | "analytics" | "plan" | "calendar" | "mood"; targetId?: number | null; label: string };

export type NoteExport = {
  id?: number;
  userId?: number;
  parentId: number | null;
  kind: NoteKind;
  title: string;
  content: string;
  document?: NoteDocument | null;
  items: WishlistItem[];
  tags?: string[];
  relatedLinks?: NoteRelatedLink[];
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
};
