import type {
  CommentStore,
  CommentTarget,
  DocumentPatch,
  DocumentStore,
  EmailDocument,
  GenerateImageRequest,
  ImageProvider,
  SectionComment,
} from "@mjml-agent-editor/core";
import { beforeEach, describe, expect, it } from "vitest";

import { createMjmlCompiler } from "./mjml-compiler.js";
import { createAgentTools, type AgentTools } from "./tools.js";

const DOCUMENT_ID = "doc-1";

const VALID_DOC = `<mjml><mj-body>
<mj-section css-class="sec-aaa"><mj-column><mj-text>Welcome</mj-text></mj-column></mj-section>
<mj-section css-class="sec-bbb"><mj-column><mj-button>Buy</mj-button></mj-column></mj-section>
</mj-body></mjml>`;

class InMemoryDocuments implements DocumentStore {
  saveCount = 0;
  constructor(private document: EmailDocument) {}

  get(documentId: string): Promise<EmailDocument> {
    if (documentId !== this.document.id) return Promise.reject(new Error("unknown document"));
    return Promise.resolve(this.document);
  }

  save(documentId: string, patch: DocumentPatch): Promise<void> {
    if (documentId !== this.document.id) return Promise.reject(new Error("unknown document"));
    this.saveCount++;
    this.document = { ...this.document, ...patch, updatedAt: "2026-01-01T00:00:00Z" };
    return Promise.resolve();
  }

  get mjml(): string {
    return this.document.mjml;
  }
}

class InMemoryComments implements CommentStore {
  resolved: string[] = [];
  constructor(private comments: SectionComment[] = []) {}

  list(): Promise<SectionComment[]> {
    return Promise.resolve(this.comments);
  }

  listOpen(): Promise<SectionComment[]> {
    return Promise.resolve(this.comments.filter((comment) => comment.status === "open"));
  }

  add(documentId: string, target: CommentTarget, body: string): Promise<void> {
    this.comments.push({
      id: `c${this.comments.length + 1}`,
      documentId,
      body,
      status: "open",
      createdAt: "2026-01-01T00:00:00Z",
      ...target,
    });
    return Promise.resolve();
  }

  resolve(commentId: string): Promise<void> {
    this.resolved.push(commentId);
    const comment = this.comments.find((candidate) => candidate.id === commentId);
    if (comment)
      this.comments = this.comments.map((c) =>
        c.id === commentId ? { ...c, status: "resolved" } : c,
      );
    return Promise.resolve();
  }

  remove(commentId: string): Promise<void> {
    this.removed.push(commentId);
    this.comments = this.comments.filter((candidate) => candidate.id !== commentId);
    return Promise.resolve();
  }

  removed: string[] = [];

  get ids(): string[] {
    return this.comments.map((comment) => comment.id);
  }
}

/** A store from a host that never implemented the optional delete. */
class CommentsWithoutRemove extends InMemoryComments {
  override remove = undefined as unknown as (commentId: string) => Promise<void>;
}

class StubImages implements ImageProvider {
  requests: GenerateImageRequest[] = [];
  generate(request: GenerateImageRequest): Promise<string> {
    this.requests.push(request);
    return Promise.resolve(`https://images.test/${request.size}.png`);
  }
}

/** The SDK passes call metadata the tools here never read. */
const CALL_OPTIONS = { toolCallId: "test-call", messages: [] } as never;

function run<Name extends keyof AgentTools>(
  tools: AgentTools,
  name: Name,
  input: unknown,
): Promise<string> {
  const execute = (tools[name] as { execute?: (input: never, options: never) => unknown }).execute;
  if (!execute) throw new Error(`tool ${String(name)} has no execute`);
  return Promise.resolve(execute(input as never, CALL_OPTIONS)) as Promise<string>;
}

describe("createMjmlCompiler", () => {
  const compiler = createMjmlCompiler();

  it("compiles a valid document", async () => {
    const result = await compiler.compile(VALID_DOC);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.html).toContain("<!doctype html>");
  });

  it("rejects an unknown element in strict mode", async () => {
    const result = await compiler.compile(`<mjml><mj-body><mj-bogus /></mj-body></mjml>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("mj-bogus");
  });

  it("does not leak the server's working directory into error text", async () => {
    const result = await compiler.compile(`<mjml><mj-body><mj-bogus /></mj-body></mjml>`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).not.toContain(process.cwd());
      expect(result.errors).toContain("document");
    }
  });
});

describe("agent tools", () => {
  let documents: InMemoryDocuments;
  let comments: InMemoryComments;
  let images: StubImages;
  let tools: AgentTools;

  beforeEach(() => {
    documents = new InMemoryDocuments({
      id: DOCUMENT_ID,
      name: "Test",
      mjml: VALID_DOC,
      projectData: null,
      updatedAt: "2026-01-01T00:00:00Z",
    });
    comments = new InMemoryComments();
    images = new StubImages();
    tools = createAgentTools({
      documentId: DOCUMENT_ID,
      documents,
      comments,
      images,
      compiler: createMjmlCompiler(),
    });
  });

  describe("get_document", () => {
    it("returns the section list and the source", async () => {
      const output = await run(tools, "get_document", {});
      expect(output).toContain(`"section_id":"aaa"`);
      expect(output).toContain(`"section_id":"bbb"`);
      expect(output).toContain("MJML:\n<mjml>");
    });
  });

  describe("get_section", () => {
    it("returns one section", async () => {
      expect(await run(tools, "get_section", { section_id: "bbb" })).toContain("Buy");
    });

    it("reports an unknown id", async () => {
      expect(await run(tools, "get_section", { section_id: "zzz" })).toBe(
        "ERROR: no section with id 'zzz'",
      );
    });
  });

  describe("set_document", () => {
    const REBUILT = `<mjml><mj-body><mj-section><mj-column><mj-text>New</mj-text></mj-column></mj-section></mj-body></mjml>`;

    it("saves valid MJML and assigns missing section ids", async () => {
      const output = await run(tools, "set_document", {
        mjml: REBUILT,
        confirm_full_rewrite: true,
      });
      expect(output).toContain("OK, saved.");
      expect(documents.mjml).toMatch(/css-class="sec-[0-9a-f]{8}"/);
    });

    it("refuses to save MJML that does not compile", async () => {
      const output = await run(tools, "set_document", {
        mjml: `<mjml><mj-body><mj-bogus /></mj-body></mjml>`,
        confirm_full_rewrite: true,
      });
      expect(output).toContain("validation failed");
      expect(documents.saveCount).toBe(0);
      expect(documents.mjml).toBe(VALID_DOC);
    });

    it("rejects an empty argument", async () => {
      expect(
        await run(tools, "set_document", { mjml: "   ", confirm_full_rewrite: true }),
      ).toContain("was empty");
      expect(documents.saveCount).toBe(0);
    });

    /**
     * The behaviour this guard exists for: `ensureSectionIds` only fills in ids that are
     * missing, so a rewrite renumbers every section and detaches every comment. The model
     * reaches for this tool out of habit after an edit it has already saved.
     */
    it("refuses to replace a document that already has sections without confirmation", async () => {
      const output = await run(tools, "set_document", {
        mjml: REBUILT,
        confirm_full_rewrite: false,
      });
      expect(output).toContain("ERROR:");
      expect(output).toContain("aaa");
      expect(output).toContain("bbb");
      expect(output).toContain("confirm_full_rewrite");
      expect(documents.saveCount).toBe(0);
      expect(documents.mjml).toBe(VALID_DOC);
    });

    it("says how many open comments a rewrite would destroy", async () => {
      await comments.add(DOCUMENT_ID, { sectionId: "aaa", objectId: null, objectLabel: null }, "x");
      await comments.add(DOCUMENT_ID, { sectionId: "bbb", objectId: null, objectLabel: null }, "y");
      const output = await run(tools, "set_document", {
        mjml: REBUILT,
        confirm_full_rewrite: false,
      });
      expect(output).toContain("2 open comment(s)");
    });

    it("creates from scratch without confirmation when there is nothing to lose", async () => {
      await run(tools, "remove_section", { section_id: "aaa" });
      await run(tools, "remove_section", { section_id: "bbb" });
      const output = await run(tools, "set_document", {
        mjml: REBUILT,
        confirm_full_rewrite: false,
      });
      expect(output).toContain("OK, saved.");
    });

    it("deletes the comments a confirmed rewrite orphaned", async () => {
      await comments.add(DOCUMENT_ID, { sectionId: "aaa", objectId: null, objectLabel: null }, "x");
      await comments.add(DOCUMENT_ID, { sectionId: "bbb", objectId: null, objectLabel: null }, "y");

      const output = await run(tools, "set_document", {
        mjml: REBUILT,
        confirm_full_rewrite: true,
      });

      expect(output).toContain("Removed 2 comment(s)");
      expect(comments.ids).toEqual([]);
      expect(comments.resolved).toEqual([]); // deleted, not marked answered
    });

    it("tells the caller when the host's store cannot delete", async () => {
      const withoutRemove = new CommentsWithoutRemove();
      await withoutRemove.add(
        DOCUMENT_ID,
        { sectionId: "aaa", objectId: null, objectLabel: null },
        "x",
      );
      const limited = createAgentTools({
        documentId: DOCUMENT_ID,
        documents,
        comments: withoutRemove,
        images,
        compiler: createMjmlCompiler(),
      });

      const output = await run(limited, "set_document", {
        mjml: REBUILT,
        confirm_full_rewrite: true,
      });

      expect(output).toContain("cannot delete them");
      expect(withoutRemove.ids).toEqual(["c1"]);
    });
  });

  describe("set_section", () => {
    it("replaces a section and keeps its id", async () => {
      const output = await run(tools, "set_section", {
        section_id: "aaa",
        mjml: `<mj-section css-class="sec-wrong"><mj-column><mj-text>Changed</mj-text></mj-column></mj-section>`,
      });
      expect(output).toBe("OK, saved.");
      expect(documents.mjml).toContain("Changed");
      expect(documents.mjml).toContain(`sec-aaa`);
      expect(documents.mjml).not.toContain("sec-wrong");
    });

    it("reports an unknown id without saving", async () => {
      const output = await run(tools, "set_section", {
        section_id: "zzz",
        mjml: `<mj-section><mj-column /></mj-section>`,
      });
      expect(output).toBe("ERROR: no section with id 'zzz'");
      expect(documents.saveCount).toBe(0);
    });

    it("reports a fragment that is not a single section", async () => {
      const output = await run(tools, "set_section", { section_id: "aaa", mjml: `<mj-column />` });
      expect(output).toContain("exactly one");
      expect(documents.saveCount).toBe(0);
    });
  });

  describe("insert_section", () => {
    it("inserts after the anchor and reports the new id", async () => {
      const output = await run(tools, "insert_section", {
        mjml: `<mj-section><mj-column><mj-text>Mid</mj-text></mj-column></mj-section>`,
        after_section_id: "aaa",
      });
      expect(output).toMatch(/^OK, saved\. New section: [0-9a-f]{8}$/);
      expect(documents.mjml.indexOf("Mid")).toBeGreaterThan(documents.mjml.indexOf("Welcome"));
      expect(documents.mjml.indexOf("Mid")).toBeLessThan(documents.mjml.indexOf("Buy"));
    });

    it("appends when no anchor is given", async () => {
      await run(tools, "insert_section", {
        mjml: `<mj-section><mj-column><mj-text>Tail</mj-text></mj-column></mj-section>`,
        after_section_id: null,
      });
      expect(documents.mjml.indexOf("Tail")).toBeGreaterThan(documents.mjml.indexOf("Buy"));
    });
  });

  describe("remove_section", () => {
    it("removes a section", async () => {
      expect(await run(tools, "remove_section", { section_id: "aaa" })).toBe("OK, saved.");
      expect(documents.mjml).not.toContain("Welcome");
      expect(documents.mjml).toContain("Buy");
    });

    it("takes that section's comments with it and leaves the others alone", async () => {
      await comments.add(DOCUMENT_ID, { sectionId: "aaa", objectId: null, objectLabel: null }, "x");
      await comments.add(DOCUMENT_ID, { sectionId: "bbb", objectId: null, objectLabel: null }, "y");

      const output = await run(tools, "remove_section", { section_id: "aaa" });

      expect(output).toContain("Removed 1 comment(s)");
      expect(comments.ids).toEqual(["c2"]);
    });

    it("reports an unknown id without saving", async () => {
      expect(await run(tools, "remove_section", { section_id: "zzz" })).toBe(
        "ERROR: no section with id 'zzz'",
      );
      expect(documents.saveCount).toBe(0);
    });
  });

  describe("generate_image", () => {
    it("delegates to the provider and scopes the request to the document", async () => {
      const url = await run(tools, "generate_image", { prompt: "a hero", size: "1536x1024" });
      expect(url).toBe("https://images.test/1536x1024.png");
      expect(images.requests).toEqual([
        { prompt: "a hero", size: "1536x1024", documentId: DOCUMENT_ID },
      ]);
    });

    it("surfaces a provider failure as a tool error rather than throwing", async () => {
      const failing = createAgentTools({
        documentId: DOCUMENT_ID,
        documents,
        comments,
        images: { generate: () => Promise.reject(new Error("quota exceeded")) },
        compiler: createMjmlCompiler(),
      });
      expect(await run(failing, "generate_image", { prompt: "x", size: "1024x1024" })).toBe(
        "ERROR: quota exceeded",
      );
    });
  });

  describe("comments", () => {
    it("reports when there are none", async () => {
      expect(await run(tools, "list_open_comments", {})).toBe("No open comments.");
    });

    it("returns open comments in the wire shape the prompt describes", async () => {
      await comments.add(
        DOCUMENT_ID,
        { sectionId: "aaa", objectId: "o1", objectLabel: "Button" },
        "make it green",
      );
      const output = JSON.parse(await run(tools, "list_open_comments", {}));
      expect(output).toEqual([
        {
          id: "c1",
          section_id: "aaa",
          object_id: "o1",
          object_label: "Button",
          body: "make it green",
        },
      ]);
    });

    it("hides resolved comments", async () => {
      await comments.add(DOCUMENT_ID, { sectionId: "aaa", objectId: null, objectLabel: null }, "x");
      await run(tools, "resolve_comment", { comment_id: "c1" });
      expect(comments.resolved).toEqual(["c1"]);
      expect(await run(tools, "list_open_comments", {})).toBe("No open comments.");
    });
  });
});
