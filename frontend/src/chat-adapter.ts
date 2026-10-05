import {
  decodeAgentEventStream,
  type ChatAdapter,
  type ChatAttachment,
} from "@agentdock-ai/react";

type AgentRequest = Record<string, unknown>;

export function createChatAdapter(
  threadId: string,
  onTitle?: (title: string) => void,
): ChatAdapter {
  let activeOperationId: string | null = null;

  async function* stream(body: AgentRequest, signal: AbortSignal) {
    const operationId = crypto.randomUUID();
    activeOperationId = operationId;
    try {
      const response = await fetch("/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          conversationId: threadId,
          operationId,
        }),
        signal,
      });
      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(result?.error ?? "The agent request failed.");
      }
      yield* decodeAgentEventStream(response.body, { signal });
    } finally {
      if (activeOperationId === operationId) activeOperationId = null;
    }
  }

  return {
    sendMessage: ({ text, attachments = [], signal }) => {
      if (text.trim()) onTitle?.(text.trim().replace(/\s+/g, " ").slice(0, 64));
      return stream(
        {
          action: "start",
          message: text,
          attachments: attachments.map(({ id }) => ({ id })),
        },
        signal,
      );
    },
    attachments: {
      accept: "image/png,image/jpeg,image/gif,image/webp",
      maxFiles: 4,
      maxFileSize: 5 * 1024 * 1024,
      async upload({ file, signal }): Promise<ChatAttachment> {
        const data = new FormData();
        data.set("threadId", threadId);
        data.set("file", file);
        const response = await fetch("/attachments", {
          method: "POST",
          body: data,
          signal,
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(result?.error ?? "The image upload failed.");
        }
        return (await response.json()) as ChatAttachment;
      },
    },
    respondToInterrupt: ({ interruptId, decisions, signal }) =>
      stream({ action: "resume", interruptId, decisions }, signal),
    continueRun: ({ signal }) => stream({ action: "continue" }, signal),
    async cancelRun({ signal }) {
      if (!activeOperationId)
        throw new Error("There is no active run to stop.");
      const response = await fetch("/agent/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: threadId,
          operationId: activeOperationId,
        }),
        signal,
      });
      if (!response.ok) throw new Error("The run could not be stopped.");
    },
  };
}
