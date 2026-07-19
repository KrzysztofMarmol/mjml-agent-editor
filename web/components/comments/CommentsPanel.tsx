"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addComment,
  listComments,
  resolveComment,
  type CommentTarget,
  type SectionComment,
} from "@/lib/documents";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Props = {
  docId: string;
  /** Aktualnie wybrany cel komentarza (sekcja lub element w niej). */
  target: CommentTarget | null;
  /** Zmiana wartości wymusza przeładowanie listy. */
  refreshSignal: number;
  /** Liczba otwartych komentarzy (badge na zakładce). */
  onOpenCountChange?: (count: number) => void;
};

/** Etykieta elementu komentarza: nazwa elementu albo „cała sekcja". */
function scopeLabel(c: SectionComment): string {
  return c.object_id ? (c.object_label ?? "element") : "cała sekcja";
}

export default function CommentsPanel({ docId, target, refreshSignal, onOpenCountChange }: Props) {
  const [comments, setComments] = useState<SectionComment[]>([]);
  const [body, setBody] = useState("");

  const reload = useCallback(() => {
    listComments(docId)
      .then(setComments)
      .catch((e) => {
        console.error(e);
        toast.error("Nie udało się wczytać komentarzy.");
      });
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

  // Emituj licznik otwartych w górę (badge na zakładce Komentarze).
  useEffect(() => {
    onOpenCountChange?.(openCount);
  }, [openCount, onOpenCountChange]);

  const submit = async () => {
    if (!target || !body.trim()) return;
    try {
      await addComment(docId, target, body.trim());
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm">
      <div className="rounded-lg border border-border p-2">
        {target ? (
          <>
            <p className="mb-1 text-xs text-muted-foreground">
              Komentarz do{" "}
              {target.objectId ? (
                <>
                  elementu{" "}
                  <span className="font-medium text-foreground">{target.objectLabel}</span> w sekcji{" "}
                  <code className="font-mono">{target.sectionId}</code>
                </>
              ) : (
                <>
                  całej sekcji <code className="font-mono">{target.sectionId}</code>
                </>
              )}
              :
            </p>
            <Textarea
              className="min-h-16 resize-y"
              placeholder="Co zmienić i jak? np. „przycisk na zielono, krótszy tekst”"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button size="sm" className="mt-2" onClick={() => void submit()} disabled={!body.trim()}>
              Dodaj komentarz
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Zaznacz sekcję lub element w edytorze (albo użyj przycisku komentarza z
            jego paska narzędzi), żeby dodać komentarz.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <h3 className="font-medium">Otwarte</h3>
        <Badge variant="secondary">{openCount}</Badge>
      </div>
      {openCount === 0 && (
        <p className="text-xs text-muted-foreground">Brak otwartych komentarzy.</p>
      )}

      {/* Drzewko: sekcja → komentarze; każdy pokazuje, czego dotyczy */}
      {[...openBySection.entries()].map(([sectionId, list]) => (
        <div key={sectionId} className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
            sekcja <code className="font-mono">{sectionId}</code> ({list.length})
          </div>
          <div className="space-y-2 p-2">
            {list.map((c) => (
              <div
                key={c.id}
                className={cnScope(c.object_id)}
              >
                <p className="text-xs text-muted-foreground">{scopeLabel(c)}</p>
                <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void resolve(c.id)}
                >
                  <Check /> Oznacz jako rozwiązany
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <details className="mt-1">
          <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            Rozwiązane <Badge variant="outline">{resolved.length}</Badge>
          </summary>
          {resolved.map((c) => (
            <div key={c.id} className="mt-1 rounded-lg border border-border p-2 opacity-60">
              <p className="text-xs text-muted-foreground">
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

/** Kolor karty komentarza wg zakresu: element (indigo) vs cała sekcja (amber). */
function cnScope(objectId: string | null): string {
  return objectId
    ? "rounded-lg border border-indigo-200 bg-indigo-50 p-2"
    : "rounded-lg border border-amber-300 bg-amber-50 p-2";
}
