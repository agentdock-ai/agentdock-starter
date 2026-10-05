"use client";
import { useEffect, useRef, useState } from "react";
import { Paperclip, Image, Plus } from "lucide-react";
import { ChatIcon } from "./icon";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function ComposerAttachmentPicker({
  accept,
  disabled,
  onFiles,
}: {
  accept?: string;
  disabled?: boolean;
  onFiles: (files: readonly File[]) => void;
}) {
  const files = useRef<HTMLInputElement>(null);
  const images = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const imageAccept = accept
    ? accept
        .split(",")
        .filter((type) => type.trim().startsWith("image/"))
        .join(",")
    : "image/*";
  const select = (input: HTMLInputElement) => {
    onFiles(Array.from(input.files ?? []));
    input.value = "";
  };
  const itemStyle =
    "flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-muted focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-40";
  return (
    <div className="mr-auto flex items-center gap-0.5">
      <input
        ref={files}
        type="file"
        multiple
        accept={accept}
        aria-label="Choose files"
        hidden
        onChange={(event) => select(event.currentTarget)}
      />
      <input
        ref={images}
        type="file"
        multiple
        accept={imageAccept}
        aria-label="Choose images"
        hidden
        onChange={(event) => select(event.currentTarget)}
      />
      <DropdownMenu
        open={open && !disabled}
        onOpenChange={setOpen}
        modal={false}
      >
        <DropdownMenuTrigger
          type="button"
          aria-label="Add attachments"
          title="Add attachments"
          disabled={disabled}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 [@media(pointer:coarse)]:size-9"
        >
          <ChatIcon icon={Plus} size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          aria-label="Attachments"
          className="z-50 w-60 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-background p-1.5 text-foreground shadow-md"
        >
          {imageAccept && (
            <DropdownMenuItem
              disabled={disabled}
              onClick={() => images.current?.click()}
              className={itemStyle}
            >
              <ChatIcon
                icon={Image}
                size={16}
                className="text-muted-foreground"
              />
              Add photos
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={disabled}
            onClick={() => files.current?.click()}
            className={itemStyle}
          >
            <ChatIcon
              icon={Paperclip}
              size={16}
              className="text-muted-foreground"
            />
            Attach files
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
