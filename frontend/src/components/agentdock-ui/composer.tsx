"use client";
import { useId, useLayoutEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ChatIcon } from "./icon";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ComposerAttachmentPicker } from "./composer-attachment-picker";
import { ComposerAttachments } from "./composer-attachments";
import type { AttachmentDraft } from "./use-chat-attachments";
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  waiting,
  cancelling,
  disabled,
  attachments = [],
  attachmentAccept,
  attachmentError,
  attachmentBlocked,
  onFiles,
  onRemoveAttachment,
  onRetryAttachment,
  placeholder = "Send a message…",
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  busy: boolean;
  waiting: boolean;
  cancelling: boolean;
  disabled?: boolean;
  attachments?: readonly AttachmentDraft[];
  attachmentAccept?: string;
  attachmentError?: string;
  attachmentBlocked?: boolean;
  onFiles?: (files: readonly File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onRetryAttachment?: (id: string) => void;
  placeholder?: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const hint = useId();
  useLayoutEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${Math.min(input.current.scrollHeight, 192)}px`;
    }
  }, [value]);
  const canSend =
    (!!value.trim() || attachments.some((item) => item.status === "ready")) &&
    !attachmentBlocked &&
    !busy &&
    !waiting &&
    !disabled;
  return (
    <form
      aria-label="Send a message"
      onDragOver={(event) => {
        if (onFiles && event.dataTransfer.types.includes("Files"))
          event.preventDefault();
      }}
      onDrop={(event) => {
        if (!onFiles || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
      className="rounded-2xl border border-border bg-background p-2 transition-colors focus-within:border-ring motion-reduce:transition-none"
    >
      {attachments.length > 0 && (
        <ComposerAttachments
          items={attachments}
          onRemove={onRemoveAttachment ?? (() => {})}
          onRetry={onRetryAttachment ?? (() => {})}
        />
      )}
      {attachmentError && (
        <p role="alert" className="px-2 pb-2 text-xs text-destructive">
          {attachmentError}
        </p>
      )}
      <Textarea
        ref={input}
        aria-label="Message"
        aria-describedby={hint}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onPaste={(event) => {
          if (onFiles && event.clipboardData.files.length > 0) {
            event.preventDefault();
            if (!disabled) onFiles(Array.from(event.clipboardData.files));
          }
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            !composing.current &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            if (canSend) onSubmit();
          }
        }}
      />
      <div className="flex min-h-7 items-center justify-end gap-2 pt-1">
        {onFiles && (
          <ComposerAttachmentPicker
            accept={attachmentAccept}
            disabled={disabled}
            onFiles={onFiles}
          />
        )}
        <p id={hint} className="sr-only">
          {waiting ? (
            "Waiting for your response"
          ) : busy ? (
            "You can write your next message"
          ) : (
            <>
              <span className="hidden sm:inline">Enter to send · </span>Shift +
              Enter for a new line
            </>
          )}
        </p>
        {busy && !waiting && onStop ? (
          <Button
            aria-label={cancelling ? "Stopping run" : "Stop run"}
            title="Stop run"
            variant="primary"
            disabled={cancelling || disabled}
            onClick={onStop}
            className="size-7 min-h-7 rounded-lg px-0 [@media(pointer:coarse)]:size-9"
          >
            <ChatIcon
              icon={Square}
              size={12}
              className="shrink-0"
              fill="currentColor"
              aria-hidden="true"
            />
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            disabled={!canSend}
            aria-label="Send message"
            title="Send message"
            className="size-7 min-h-7 rounded-lg px-0 [@media(pointer:coarse)]:size-9"
          >
            <ChatIcon
              icon={ArrowUp}
              size={18}
              className="shrink-0"
              aria-hidden="true"
            />
          </Button>
        )}
      </div>
    </form>
  );
}
