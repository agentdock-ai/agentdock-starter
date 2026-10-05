"use client";
import { useState } from "react";
import { ChevronRight, Terminal } from "lucide-react";
import { ChatIcon } from "./icon";
import type { RenderMessageItem } from "@agentdock-ai/ui-core";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { MessageContent } from "./message-content";
import { safeDiagnosticText } from "./utils";

/** Canonical tool-role messages can exist without a structured tool-call record. */
export function ToolMessage({ message }: { message: RenderMessageItem }) {
  const [open, setOpen] = useState(false);
  const blocks = message.blocks.map((block) =>
    block.type === "text"
      ? { ...block, text: safeDiagnosticText(block.text) }
      : block,
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 rounded-lg px-2 text-left font-mono text-xs text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
        <ChatIcon
          icon={ChevronRight}
          aria-hidden="true"
          size={14}
          className={open ? "rotate-90" : ""}
        />
        <ChatIcon icon={Terminal} aria-hidden="true" size={14} />
        <span>Tool output</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 max-h-64 overflow-auto border-l border-border py-2 pl-4">
          <MessageContent blocks={blocks} showReasoning={false} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
