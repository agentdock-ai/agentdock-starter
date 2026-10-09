"use client";
import { useState } from "react";
import { ChevronRight, CircleAlert, LoaderCircle, Wrench } from "lucide-react";
import { ChatIcon } from "./icon";
import type { RenderToolCallItem } from "@agentdock-ai/ui-core";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { ErrorState } from "./error-state";
import { formatJson } from "./utils";

export function ToolCall({ item }: { item: RenderToolCallItem }) {
  const [open, setOpen] = useState(false);
  const { tool, active } = item;
  const failed = tool.status === "failed";
  const running = active && tool.status === "running";
  const status = failed
    ? "Failed"
    : tool.status === "approval"
      ? "Needs approval"
      : running
        ? "Running"
        : tool.status === "complete"
          ? "Complete"
          : "Stopped";
  const Icon = failed ? CircleAlert : running ? LoaderCircle : Wrench;
  const progress = running
    ? tool.progress
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .at(-1)
    : undefined;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <CollapsibleTrigger
        aria-label={`${tool.name} ${status}`}
        className="flex min-h-7 w-full min-w-0 items-center gap-2 rounded-sm py-0.5 text-left font-mono text-xs leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-10"
      >
        <ChatIcon
          icon={Icon}
          size={14}
          aria-hidden="true"
          className={`shrink-0 ${failed ? "text-destructive" : ""} ${active ? "motion-safe:animate-spin" : ""}`}
        />
        <span className="min-w-0 flex-1 truncate" title={tool.name}>
          {tool.name}
        </span>
        {status !== "Complete" && (
          <span
            className={`shrink-0 font-sans text-[11px] ${failed ? "text-destructive" : ""}`}
          >
            {status}
          </span>
        )}
        <ChatIcon
          icon={ChevronRight}
          size={12}
          aria-hidden="true"
          className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      {progress && (
        <p
          role="status"
          className="mb-1 ml-5 line-clamp-2 text-[12px] leading-5 text-muted-foreground [overflow-wrap:anywhere]"
        >
          {progress}
        </p>
      )}
      <CollapsibleContent>
        <div className="my-2 ml-5 space-y-2.5">
          <Payload title="Parameters" value={tool.input} />
          {tool.progress.length > 0 && (
            <Payload
              title="Progress"
              value={tool.progress
                .map((part) => ("text" in part ? part.text : formatJson(part)))
                .join("\n")}
            />
          )}
          {tool.output !== undefined && !failed && (
            <Payload title="Result" value={tool.output} />
          )}
          {failed && (
            <ErrorState
              title="Tool failed"
              detail={
                tool.error ??
                (typeof tool.output === "string"
                  ? tool.output
                  : "The tool returned an error.")
              }
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Payload({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] leading-4 text-muted-foreground">
        {title}
      </p>
      <pre
        tabIndex={0}
        aria-label={title}
        className="max-h-60 max-w-full overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] leading-[18px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]"
      >
        {formatJson(value)}
      </pre>
    </div>
  );
}
