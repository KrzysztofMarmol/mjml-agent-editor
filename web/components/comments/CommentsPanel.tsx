"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addComment,
  listComments,
  resolveComment,
  type CommentTarget,
  type SectionComment,
} from "@/lib/documents";

type Props = {
  docId: string;
  /** Aktualnie wybrany cel komentarza (sekcja lub element w niej). */
  target: CommentTarget | null;
  /** Zmiana wartości wymusza przeładowanie listy. */
  refreshSignal: number;
};

/** Etykieta elementu komentarza: nazwa elementu albo „cała sekcja". */
function scopeLabel(c: SectionComment): string {
  return c.object_id ? (c.object_label ?? "element") : "cała sekcja";
}

export default function CommentsPanel({ docId, target, refreshSignal }: Props) {
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    listComments(docId).then(setComments).catch(console.error);
  }, [docId]);

  useEffect(reload, [reload, refreshSignal]);

  // Grupowanie per sekcja: { sectionId -> komentarze } dla otwartych.
  const openBySection = useMemo(() => {
    const map = new Map<string, SectionComment[]>();
    for (const c of comments) {
      if (c.status !== "open") continue;
      const list = map.get(c.section_id) ?? [];
      list.push(c);
      map.set(c.section_id, list);
    }
    return map;
  }, [comments]);

  const resolved = comments.filter((c) => c.status === "resolved");
  const openCount = comments.filter((c) => c.status === "open").length;

  const submit = async () => {
    if (!target || !body.trim()) return;
    await addComment(docId, target, body.trim());
    setBody("");
    reload();
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 text-sm">
      <div className="rounded border border-zinc-200 p-2">
        {target ? (
          <>
            <p className="mb-1 text-xs text-zinc-500">
              Komentarz do{" "}
              {target.objectId ? (
                <>
                  elementu <span className="font-medium text-zinc-700">{target.objectLabel}</span> w
                  sekcji <code className="font-mono">{target.sectionId}</code>
                </>
              ) : (
                <>
                  całej sekcji <code className="font-mono">{target.sectionId}</code>
                </>
              )}
              :
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
            Zaznacz sekcję lub element w edytorze (albo użyj 💬 z jego paska
            narzędzi), żeby dodać komentarz.
          </p>
        )}
      </div>

      <h3 className="mt-1 font-medium">Otwarte ({openCount})</h3>
      {openCount === 0 && <p className="text-xs text-zinc-400">Brak otwartych komentarzy.</p>}

      {/* Drzewko: sekcja → komentarze; każdy pokazuje, czego dotyczy */}
      {[...openBySection.entries()].map(([sectionId, list]) => (
        <div key={sectionId} className="rounded border border-zinc-200">
          <div className="border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600">
            sekcja <code className="font-mono">{sectionId}</code> ({list.length})
          </div>
          <div className="space-y-2 p-2">
            {list.map((c) => (
              <div
                key={c.id}
                className={`rounded border p-2 ${
                  c.object_id
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <p className="text-xs text-zinc-500">{scopeLabel(c)}</p>
                <p className="whitespace-pre-wrap">{c.body}</p>
                <button
                  onClick={() => void resolveComment(c.id).then(reload)}
                  className="mt-1 text-xs text-zinc-500 underline"
                >
                  oznacz jako rozwiązany
                </button>
              </div>
            ))}
          </div>
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
                sekcja <code className="font-mono">{c.section_id}</code> · {scopeLabel(c)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
