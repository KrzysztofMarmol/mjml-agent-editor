"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Mail } from "lucide-react";

import { createDocument, listDocuments, type DocumentSummary } from "@/lib/documents";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Spinner,
} from "@mjml-agent-editor/editor/ui";

export default function Home() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load the email list.");
      });
  }, []);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createDocument(name.trim() || "New email");
      router.push(`/editor/${id}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create the email.");
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-10">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-fg">
          <Mail className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">MJML Editor</h1>
          <p className="text-sm text-muted-foreground">MJML email editor + AI agent.</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Input
          placeholder="New email name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
        <Button
          className="bg-brand text-brand-fg hover:bg-brand/90"
          onClick={() => void create()}
          disabled={creating}
        >
          {creating ? (
            <>
              <Spinner /> Creating…
            </>
          ) : (
            <>
              <Plus /> Create
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
            <EmptyTitle>No emails</EmptyTitle>
            <EmptyDescription>Create your first email above to get started.</EmptyDescription>
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
                {new Date(d.updatedAt).toLocaleString("en-US")}
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
