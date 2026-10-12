import { HumanMessage } from "@langchain/core/messages";
import type { ConversationInputAttachment } from "@agentdock-ai/conversations";

export function createStartInput(
  prompt: string,
  attachments: readonly ConversationInputAttachment[],
) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];
  if (prompt) content.push({ type: "text", text: prompt });
  for (const attachment of attachments) {
    const base64 = Buffer.from(attachment.bytes).toString("base64");
    content.push({
      type: "image_url",
      image_url: { url: `data:${attachment.mimeType};base64,${base64}` },
    });
  }
  const messages = [new HumanMessage({ content })];
  return { messages };
}
