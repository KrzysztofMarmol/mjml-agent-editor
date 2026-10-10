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
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { mergeLabels, type EditorLabels } from "./labels.js";

export interface EditorStores {
  readonly documents: DocumentStore;
  readonly comments: CommentStore;
}

const StoreContext = createContext<EditorStores | null>(null);
const LabelContext = createContext<EditorLabels | null>(null);
type AgentTurn = {
  /** Set by the chat panel, from its pre-turn save to the turn's end. */
  running: boolean;
  setRunning: (running: boolean) => void;
  /**
   * Set by the canvas, from a turn's start until the document it left is loaded. The chat
   * waits for it before the next turn, so a turn never starts on a stale canvas.
   */
  locked: boolean;
  setLocked: (locked: boolean) => void;
};

const TurnContext = createContext<AgentTurn>({
  running: false,
  setRunning: () => {},
  locked: false,
  setLocked: () => {},
});

export function EditorStoreProvider({
  stores,
  labels,
  children,
}: {
  stores: EditorStores;
  /**
   * Overrides for the copy the editor renders. Omitted, everything is English.
   *
   * It rides on this provider rather than a second one because the host already has to
   * wrap the editor in exactly one place, and a component that needs a store almost always
   * needs a word too.
   */
  labels?: Partial<EditorLabels>;
  children: ReactNode;
}) {
  const merged = useMemo(() => mergeLabels(labels), [labels]);
  const [running, setRunning] = useState(false);
  const [locked, setLocked] = useState(false);
  const turn = useMemo(() => ({ running, setRunning, locked, setLocked }), [running, locked]);
  return (
    <StoreContext.Provider value={stores}>
      <LabelContext.Provider value={merged}>
        <TurnContext.Provider value={turn}>{children}</TurnContext.Provider>
      </LabelContext.Provider>
    </StoreContext.Provider>
  );
}

/**
 * The agent turn, shared by the chat and the canvas. The canvas is read only meanwhile: the
 * agent and the visitor would otherwise both write the document.
 */
export function useAgentTurn(): AgentTurn {
  return useContext(TurnContext);
}

/**
 * Falls back to the defaults instead of throwing, unlike the stores.
 *
 * A missing store means the editor cannot work at all and should say so loudly; missing copy
 * means English, which is a perfectly good outcome and keeps the components renderable in
 * isolation.
 */
export function useLabels(): EditorLabels {
  return useContext(LabelContext) ?? mergeLabels();
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
