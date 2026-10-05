"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ChatAttachment,
  ChatAttachmentAdapter,
} from "@agentdock-ai/react";
import { errorDetail } from "./utils";

export interface AttachmentDraft {
  id: string;
  file: File;
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  attachment?: ChatAttachment;
  error?: string;
}

function accepts(file: File, accept?: string) {
  if (!accept) return true;
  return accept.split(",").some((entry) => {
    const value = entry.trim().toLowerCase();
    return value.startsWith(".")
      ? file.name.toLowerCase().endsWith(value)
      : value.endsWith("/*")
        ? file.type.toLowerCase().startsWith(value.slice(0, -1))
        : file.type.toLowerCase() === value;
  });
}

/** Draft lifetime only. The app adapter owns uploads, validation and storage. */
export function useChatAttachments(adapter?: ChatAttachmentAdapter) {
  const [items, setItems] = useState<AttachmentDraft[]>([]);
  const [error, setError] = useState("");
  const current = useRef<AttachmentDraft[]>([]);
  const uploads = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const publish = (next: AttachmentDraft[]) => {
    current.current = next;
    setItems(next);
  };
  const release = (item: AttachmentDraft) => {
    uploads.current.get(item.id)?.abort();
    uploads.current.delete(item.id);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current.forEach(release);
    };
  }, []);

  async function upload(item: AttachmentDraft) {
    if (!adapter) return;
    const controller = new AbortController();
    uploads.current.set(item.id, controller);
    try {
      const attachment = await adapter.upload({
        file: item.file,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        !current.current.some((draft) => draft.id === item.id)
      )
        return;
      publish(
        current.current.map((draft) =>
          draft.id === item.id
            ? { ...draft, status: "ready", attachment }
            : draft,
        ),
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message =
        cause instanceof Error
          ? errorDetail(cause.message)
          : "The file could not be uploaded.";
      publish(
        current.current.map((draft) =>
          draft.id === item.id
            ? { ...draft, status: "error", error: message }
            : draft,
        ),
      );
    } finally {
      if (uploads.current.get(item.id) === controller)
        uploads.current.delete(item.id);
    }
  }
  return {
    items,
    error,
    blocked: items.some((item) => item.status !== "ready"),
    add(files: readonly File[]) {
      if (!adapter) return;
      setError("");
      for (const file of files) {
        if (
          current.current.some(
            (item) =>
              item.file.name === file.name &&
              item.file.size === file.size &&
              item.file.lastModified === file.lastModified,
          )
        )
          continue;
        if (
          adapter.maxFiles !== undefined &&
          current.current.length >= adapter.maxFiles
        ) {
          setError(`You can attach up to ${adapter.maxFiles} files.`);
          break;
        }
        if (!accepts(file, adapter.accept)) {
          setError(`This file type is not supported: ${file.name}`);
          continue;
        }
        if (
          adapter.maxFileSize !== undefined &&
          file.size > adapter.maxFileSize
        ) {
          setError(
            `File is too large: ${file.name}. Maximum ${Math.round(adapter.maxFileSize / 1_000_000)} MB.`,
          );
          continue;
        }
        const item: AttachmentDraft = {
          id: crypto.randomUUID(),
          file,
          status: "uploading",
          ...(file.type.startsWith("image/") && file.type !== "image/svg+xml"
            ? { previewUrl: URL.createObjectURL(file) }
            : {}),
        };
        publish([...current.current, item]);
        void upload(item);
      }
    },
    remove(id: string) {
      const item = current.current.find((draft) => draft.id === id);
      if (item) release(item);
      publish(current.current.filter((draft) => draft.id !== id));
      setError("");
    },
    retry(id: string) {
      const item = current.current.find((draft) => draft.id === id);
      if (!item || item.status !== "error") return;
      publish(
        current.current.map((draft) =>
          draft.id === id ? { ...draft, status: "uploading" } : draft,
        ),
      );
      void upload(item);
    },
    take() {
      const sent = current.current;
      publish([]);
      setError("");
      sent.forEach(release);
      return sent;
    },
    restore(sent: readonly AttachmentDraft[]) {
      if (!mounted.current) return;
      const restored = sent.map((item) => ({
        ...item,
        previewUrl: item.previewUrl
          ? URL.createObjectURL(item.file)
          : undefined,
      }));
      publish([...restored, ...current.current]);
    },
  };
}
