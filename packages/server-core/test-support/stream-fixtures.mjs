import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";

export function createScriptedMessageChunks(contents, { id } = {}) {
  return contents.map(
    (content) =>
      new AIMessageChunk({ content, ...(id === undefined ? {} : { id }) }),
  );
}

export function createToolCallArgumentChunks({
  name,
  toolCallId,
  input,
  messageId,
  chunkCount = 3,
}) {
  if (!Number.isSafeInteger(chunkCount) || chunkCount < 2)
    throw new Error("chunkCount must be an integer greater than one.");

  const serializedInput = JSON.stringify(input);
  let offset = 0;
  return Array.from({ length: chunkCount }, (_, index) => {
    const remaining = chunkCount - index;
    const length = Math.ceil((serializedInput.length - offset) / remaining);
    const args = serializedInput.slice(offset, offset + length);
    offset += length;
    return new AIMessageChunk({
      content: "",
      ...(messageId === undefined ? {} : { id: messageId }),
      tool_call_chunks: [
        {
          ...(index === 0 ? { name } : {}),
          args,
          id: toolCallId,
          index: 0,
        },
      ],
    });
  });
}

export function createScriptedChatModel({ streamSequences }) {
  return new ScriptedChatModel(streamSequences);
}

class ScriptedChatModel extends BaseChatModel {
  constructor(streamSequences) {
    super({});
    this.streamSequences = streamSequences;
    this.streamIndex = 0;
  }

  bindTools() {
    return this;
  }

  _llmType() {
    return "agentdock-starter-test-fixture";
  }

  async *_streamResponseChunks(_messages, _options, runManager) {
    for (const chunk of this.streamSequences[this.streamIndex++] ?? []) {
      const generation = new ChatGenerationChunk({ message: chunk });
      yield generation;
      await runManager?.handleLLMNewToken(
        "",
        undefined,
        undefined,
        undefined,
        undefined,
        { chunk: generation },
      );
    }
  }

  async _generate() {
    return { generations: [{ message: new AIMessage({ content: "" }) }] };
  }
}
