"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ChatIcon } from "./icon";
import type { RenderToolCallItem } from "@agentdock-ai/ui-core";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { ToolCall } from "./tool-call";
export function ToolTimeline({
  tools,
}: {
  tools: readonly RenderToolCallItem[];
}) {
  const [expanded, setExpanded] = useState<boolean | undefined>();
  const active = tools.some((item) => item.active);
  const open = expanded ?? active;
  const failures = tools.filter((item) => item.tool.status === "failed").length;
  if (tools.length === 1)
    return (
      <div className="px-2">
        <ToolCall item={tools[0]!} />
      </div>
    );
  return (
    <Collapsible
      open={open}
      onOpenChange={setExpanded}
      className="min-w-0 px-2"
    >
      <CollapsibleTrigger className="flex min-h-6 items-center gap-1 rounded-sm font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChatIcon
          icon={ChevronRight}
          size={12}
          aria-hidden="true"
          className={open ? "rotate-90" : ""}
        />
        <span className="underline decoration-border underline-offset-2">
          {active ? "running" : "ran"} {tools.length} tools
        </span>
        {failures > 0 && (
          <span className="ml-1 text-destructive">· {failures} failed</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-1.5 mt-1 border-l border-border pl-3">
          {tools.map((item) => (
            <ToolCall key={item.tool.toolCallId} item={item} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
