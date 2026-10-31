"use client";

/**
 * What an element holds, in its own settings: a section's column widths, and the links of a
 * navigation bar or social group, which are too small to pick out on the canvas.
 */

import type { Component, Editor } from "grapesjs";
import type { ReactNode } from "react";
import { AtSign, ChevronRight, Link2, Plus } from "lucide-react";

import type { EditorLabels } from "../../../labels.js";
import { cn } from "../../../lib/utils";
import { layerName } from "../layers.js";
import {
  addNavbarLink,
  addNetwork,
  COLUMN_RATIOS,
  columnsOf,
  currentRatio,
  setRatio,
} from "./structure.js";

function tagOf(c: Component): string {
  return String(c.get("tagName") || c.get("type") || "");
}

export default function StructureSection({
  editor,
  component,
  labels,
  locked,
}: {
  editor: Editor;
  component: Component;
  labels: EditorLabels;
  locked: boolean;
}) {
  switch (tagOf(component)) {
    case "mj-section":
      return <ColumnWidths component={component} labels={labels} locked={locked} />;
    case "mj-social":
      return (
        <Children
          editor={editor}
          component={component}
          labels={labels}
          locked={locked}
          title={labels.socialNetworks}
          add={labels.addNetwork}
          icon={<AtSign className="size-3.5 shrink-0" />}
          onAdd={() => editor.select(addNetwork(component))}
        />
      );
    case "mj-navbar":
      return (
        <Children
          editor={editor}
          component={component}
          labels={labels}
          locked={locked}
          title={labels.navbarLinks}
          add={labels.addLink}
          icon={<Link2 className="size-3.5 shrink-0" />}
          onAdd={() => editor.select(addNavbarLink(component, labels.newLinkText))}
        />
      );
    default:
      return null;
  }
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-panel-muted-fg/80 uppercase">
      {children}
    </h3>
  );
}

function ColumnWidths({
  component,
  labels,
  locked,
}: {
  component: Component;
  labels: EditorLabels;
  locked: boolean;
}) {
  const columns = columnsOf(component);
  const ratios = columns && COLUMN_RATIOS[columns.length];
  if (!columns || !ratios) return null;
  const current = currentRatio(columns);
  return (
    <section className="border-b border-panel-border/60 py-2">
      <Heading>{labels.columnWidths}</Heading>
      <div className="flex gap-1.5 px-3 py-1">
        {ratios.map((ratio) => {
          const name = labels.columnRatio(ratio.join(":"));
          const active = current?.join() === ratio.join();
          return (
            <button
              key={ratio.join()}
              type="button"
              disabled={locked}
              aria-pressed={active}
              title={name}
              aria-label={name}
              onClick={() => !active && setRatio(columns, ratio)}
              className={cn(
                "flex h-8 flex-1 items-center gap-0.5 rounded-md border px-1.5 transition-colors",
                active
                  ? "border-brand bg-brand/15"
                  : "border-panel-border bg-panel-elevated hover:border-panel-muted-fg",
              )}
            >
              {ratio.map((part, i) => (
                <span
                  key={i}
                  style={{ flexGrow: part }}
                  className={cn(
                    "h-4 basis-0 rounded-sm",
                    active ? "bg-brand" : "bg-panel-muted-fg/50",
                  )}
                />
              ))}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Children({
  editor,
  component,
  labels,
  locked,
  title,
  add,
  icon,
  onAdd,
}: {
  editor: Editor;
  component: Component;
  labels: EditorLabels;
  locked: boolean;
  title: string;
  add: string;
  icon: ReactNode;
  onAdd: () => void;
}) {
  const children = component.components().models;
  return (
    <section className="border-b border-panel-border/60 py-2">
      <Heading>{title}</Heading>
      <ul className="flex flex-col px-2">
        {children.map((child) => (
          <li key={child.cid}>
            <button
              type="button"
              onClick={() => editor.select(child)}
              className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-panel-fg hover:bg-panel-hover"
            >
              <span className="text-panel-muted-fg">{icon}</span>
              <span className="min-w-0 flex-1 truncate">{layerName(child, labels)}</span>
              <ChevronRight className="size-3 shrink-0 text-panel-muted-fg opacity-0 group-hover:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={locked}
        onClick={onAdd}
        className="mx-3 mt-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-panel-muted-fg hover:text-panel-fg disabled:opacity-50"
      >
        <Plus className="size-3.5" />
        {add}
      </button>
    </section>
  );
}
