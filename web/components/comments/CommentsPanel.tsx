"use client";

import { useCallback, useEffect, useState } from "react";

import {
  addComment,
  listComments,
  resolveComment,
  type SectionComment,
} from "@/lib/documents";

type Props = {
  docId: string;
  selectedSectionId: string | null;
  /** Zmiana wartości wymusza przeładowanie listy. */
  refreshSignal: number;
};

export default function CommentsPanel({ docId, selectedSectionId, refreshSignal }: Props) {
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    listComments(docId).then(setComments).catch(console.error);
  }, [docId]);

  useEffect(reload, [reload, refreshSignal]);

  const open = comments.filter((c) => c.status === "open");
  const resolved = comments.filter((c) => c.status === "resolved");

  const submit = async () => {
    if (!selectedSectionId || !body.trim()) return;
    await addComment(docId, selectedSectionId, body.trim());
    setBody("");
    reload();
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 text-sm">
      <div className="rounded border border-zinc-200 p-2">
        {selectedSectionId ? (
          <>
            <p className="mb-1 text-xs text-zinc-500">
              Komentarz do sekcji <code className="font-mono">{selectedSectionId}</code>:
            </p>
            <textarea
              className="h-16 w-full resize-none rounded border border-zinc-300 p-2"
              placeholder="Co zmienić i jak? np. „przycisk na zielono, krótszy tekst”"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              onClick={() => void submit()}
              disabled={!body.trim()}
              className="mt-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
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
        <div key={c.id} className="rounded border border-amber-300 bg-amber-50 p-2">
          <p className="text-xs text-zinc-500">
            sekcja <code className="font-mono">{c.section_id}</code>
          </p>
          <p className="whitespace-pre-wrap">{c.body}</p>
          <button
            onClick={() => void resolveComment(c.id).then(reload)}
            className="mt-1 text-xs text-zinc-500 underline"
          >
            oznacz jako rozwiązany
          </button>
        </div>
      ))}

      {resolved.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-zinc-500">
            Rozwiązane ({resolved.length})
          </summary>
          {resolved.map((c) => (
            <div key={c.id} className="mt-1 rounded border border-zinc-200 p-2 opacity-60">
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
