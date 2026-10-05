"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ChatIcon } from "./icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
export function Reasoning({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
      <CollapsibleTrigger className="flex min-h-6 max-w-full items-center gap-1.5 rounded-sm font-mono text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChatIcon
          icon={ChevronRight}
          size={12}
          aria-hidden="true"
          className={`${open ? "rotate-90" : ""} ${active ? "text-primary motion-safe:animate-pulse" : ""}`}
        />
        <span className={active ? "motion-safe:animate-pulse" : undefined}>
          {active ? "thinking" : "thoughts"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          tabIndex={0}
          role="region"
          aria-label="Reasoning details"
          className="my-2 ml-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap border-l border-border pl-4 text-[13px] leading-5 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]"
        >
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
