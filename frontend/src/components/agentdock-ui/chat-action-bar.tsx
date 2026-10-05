"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ChatIcon } from "./icon";
import { Button } from "./ui/button";
export function ChatActionBar({ text }: { text: string }) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
      <Button
        aria-label={status === "Copied" ? "Answer copied" : "Copy answer"}
        title="Copy answer"
        className="size-7 min-h-7 px-0 opacity-60 hover:opacity-100 focus-visible:opacity-100"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus("Copied");
          } catch {
            setStatus("Copy unavailable. Select the text to copy.");
          }
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setStatus(""), 2500);
        }}
      >
        {status === "Copied" ? (
          <ChatIcon icon={Check} size={14} aria-hidden="true" />
        ) : (
          <ChatIcon icon={Copy} size={14} aria-hidden="true" />
        )}
      </Button>
      <span role="status">{status}</span>
    </div>
  );
}
