"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createDocument, listDocuments, type EmailDocument } from "@/lib/documents";

export default function Home() {
  const router = useRouter();
  const [docs, setDocs] = useState<EmailDocument[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    listDocuments().then(setDocs).catch(console.error);
  }, []);

  const create = async () => {
    const id = await createDocument(name.trim() || "Nowy mail");
    router.push(`/editor/${id}`);
  };

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-bold">MJML Editor Spike</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Edytor maili MJML + agent AI (Vercel AI SDK for Python).
      </p>

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded border border-zinc-300 p-2 text-sm"
          placeholder="Nazwa nowego maila…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          onClick={() => void create()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Utwórz
        </button>
      </div>

      <ul className="mt-8 divide-y divide-zinc-200">
        {docs.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => router.push(`/editor/${d.id}`)}
              className="flex w-full justify-between py-3 text-left hover:bg-zinc-50"
            >
              <span className="font-medium">{d.name}</span>
              <span className="text-sm text-zinc-400">
                {new Date(d.updated_at).toLocaleString("pl-PL")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
