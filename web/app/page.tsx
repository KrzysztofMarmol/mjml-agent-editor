"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Mail } from "lucide-react";

import { createDocument, listDocuments, type EmailDocument } from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export default function Home() {
  const router = useRouter();
  const [docs, setDocs] = useState<EmailDocument[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch((e) => {
        console.error(e);
        toast.error("Nie udało się wczytać listy maili.");
      });
  }, []);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createDocument(name.trim() || "Nowy mail");
      router.push(`/editor/${id}`);
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się utworzyć maila.");
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-bold">MJML Editor Spike</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Edytor maili MJML + agent AI (Vercel AI SDK for Python).
      </p>

      <div className="mt-6 flex gap-2">
        <Input
          placeholder="Nazwa nowego maila…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
        <Button onClick={() => void create()} disabled={creating}>
          {creating ? (
            <>
              <Spinner /> Tworzę…
            </>
          ) : (
            <>
              <Plus /> Utwórz
            </>
          )}
        </Button>
      </div>

      {docs.length === 0 ? (
        <Empty className="mt-10 rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Mail />
            </EmptyMedia>
            <EmptyTitle>Brak maili</EmptyTitle>
            <EmptyDescription>Utwórz pierwszy mail powyżej, aby zacząć.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-8 divide-y divide-border overflow-hidden rounded-lg border">
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => router.push(`/editor/${d.id}`)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
            >
              <span className="font-medium">{d.name}</span>
              <span className="text-sm text-muted-foreground">
                {new Date(d.updated_at).toLocaleString("pl-PL")}
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
