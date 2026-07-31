"use client";

/**
 * How the editor reaches its data.
 *
 * In the spike every component imported `@/lib/documents`, which imported a Supabase
 * client — so adopting the editor meant adopting Supabase, and the components could not
 * be tested without a database. They now read whatever the host provides through this
 * context, and the host is free to back it with Supabase, plain Postgres, an HTTP API or
 * an in-memory object.
 *
 * The shapes are the same `DocumentStore` and `CommentStore` the agent uses
 * (`@mjml-agent-editor/core`), so one adapter serves both sides.
 */

import type { CommentStore, DocumentStore } from "@mjml-agent-editor/core";
import { createContext, useContext, type ReactNode } from "react";

export interface EditorStores {
  readonly documents: DocumentStore;
  readonly comments: CommentStore;
}

const StoreContext = createContext<EditorStores | null>(null);

export function EditorStoreProvider({
  stores,
  children,
}: {
  stores: EditorStores;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={stores}>{children}</StoreContext.Provider>;
}

function useStores(): EditorStores {
  const stores = useContext(StoreContext);
  if (!stores) {
    throw new Error(
      "The editor needs an <EditorStoreProvider>. Wrap the editor and pass a DocumentStore " +
        "and a CommentStore — see packages/editor/README.md.",
    );
  }
  return stores;
}

export function useDocumentStore(): DocumentStore {
  return useStores().documents;
}

export function useCommentStore(): CommentStore {
  return useStores().comments;
}
