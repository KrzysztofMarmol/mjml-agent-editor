"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

// Linki agenta otwieramy w nowej karcie (nie wyrzucamy z edytora).
const components: Components = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
};

function MarkdownImpl({ children }: { children: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words",
        "[&>:first-child]:mt-0 [&>:last-child]:mb-0",
        "[&_p]:my-1.5",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5 [&_li>ul]:my-0.5 [&_li>ol]:my-0.5",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&_a]:underline [&_a]:underline-offset-2",
        "[&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
        "[&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
        "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/5 [&_pre]:p-2 [&_pre]:text-xs",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-2 [&_hr]:border-border",
        "[&_table]:my-1.5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
