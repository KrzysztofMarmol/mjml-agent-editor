"use client";

import { useCallback, useEffect, useState } from "react";

import {
  addComment,
  listComments,
  resolveComment,
  type SectionComment,
} from "@/lib/documents";
import { useToast } from "@/components/ui/toast";

type Props = {
  docId: string;
  selectedSectionId: string | null;
  /** Zmiana wartości wymusza przeładowanie listy. */
  refreshSignal: number;
  /** Klik komentarza → zaznacz/scroll do sekcji w kanwie. */
  onNavigate?: (sectionId: string) => void;
  /** Informacja o otwartych komentarzach (badge + podświetlenia w kanwie). */
  onOpenChange?: (info: { count: number; sectionIds: string[] }) => void;
};

export default function CommentsPanel({
  docId,
  selectedSectionId,
  refreshSignal,
  onNavigate,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    listComments(docId)
      .then(setComments)
      .catch((e) => {
        console.error(e);
        toast.error("Nie udało się wczytać komentarzy.");
      });
  }, [docId, toast]);

  useEffect(reload, [reload, refreshSignal]);

  const open = comments.filter((c) => c.status === "open");
  const resolved = comments.filter((c) => c.status === "resolved");

  // Emituj otwarte sekcje w górę (podświetlenia w kanwie + badge).
  useEffect(() => {
    const openList = comments.filter((c) => c.status === "open");
    const sectionIds = [...new Set(openList.map((c) => c.section_id))];
    onOpenChange?.({ count: openList.length, sectionIds });
  }, [comments, onOpenChange]);

  const submit = async () => {
    if (!selectedSectionId || !body.trim()) return;
    try {
      await addComment(docId, selectedSectionId, body.trim());
      setBody("");
      reload();
      toast.success("Dodano komentarz.");
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się dodać komentarza.");
    }
  };

  const resolve = async (id: string) => {
    try {
      await resolveComment(id);
      reload();
      toast.success("Komentarz rozwiązany.");
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się rozwiązać komentarza.");
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 text-sm">
      <div className="rounded-lg border border-border p-2">
        {selectedSectionId ? (
          <>
            <p className="mb-1 text-xs text-zinc-500">
              Komentarz do sekcji <code className="font-mono">{selectedSectionId}</code>:
            </p>
            <textarea
              className="min-h-16 w-full resize-y rounded-md border border-zinc-300 p-2"
              placeholder="Co zmienić i jak? np. „przycisk na zielono, krótszy tekst”"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              onClick={() => void submit()}
              disabled={!body.trim()}
              className="mt-1 rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-fg disabled:opacity-50"
            >
              Dodaj komentarz
            </button>
          </>
        ) : (
          <p className="text-xs text-zinc-500">
            Zaznacz sekcję w edytorze (albo użyj 💬 z jej paska narzędzi), żeby
            dodać komentarz.
          </p>
        )}
      </div>

      <h3 className="mt-1 font-medium">Otwarte ({open.length})</h3>
      {open.length === 0 && <p className="text-xs text-zinc-400">Brak otwartych komentarzy.</p>}
      {open.map((c) => (
        <div key={c.id} className="rounded-lg border border-amber-300 bg-amber-50 p-2">
          <button
            type="button"
            onClick={() => onNavigate?.(c.section_id)}
            className="block w-full text-left"
            title="Przejdź do sekcji w edytorze"
          >
            <p className="text-xs text-amber-700 underline-offset-2 hover:underline">
              sekcja <code className="font-mono">{c.section_id}</code>
            </p>
            <p className="whitespace-pre-wrap text-zinc-800">{c.body}</p>
          </button>
          <button
            onClick={() => void resolve(c.id)}
            className="mt-2 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Oznacz jako rozwiązany
          </button>
        </div>
      ))}

      {resolved.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-zinc-500">
            Rozwiązane ({resolved.length})
          </summary>
          {resolved.map((c) => (
            <div key={c.id} className="mt-1 rounded-lg border border-border p-2 opacity-60">
              <p className="text-xs text-zinc-500">
                sekcja <code className="font-mono">{c.section_id}</code>
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
