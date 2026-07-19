import EditorWorkspace from "@/components/editor/EditorWorkspace";

export default async function EditorPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  return <EditorWorkspace docId={docId} />;
}
