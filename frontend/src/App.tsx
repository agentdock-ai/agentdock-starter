import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentStore,
  createConversationClient,
  useConversations,
} from "@agentdock-ai/react";
import { Chat, ChatWorkspace, ThreadSidebar } from "@/components/agentdock-ui";

export function App() {
  const threadId = useRef<string | null>(null);
  const refreshHistoryRef = useRef<(id: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const client = useMemo(
    () =>
      createConversationClient({
        getThreadId: () => threadId.current,
        onOperationSettled: (id) => {
          if (threadId.current === id) void refreshHistoryRef.current(id);
        },
      }),
    [],
  );
  const conversations = useConversations(client);
  refreshHistoryRef.current = (id) => conversations.refreshHistory(id);
  const [store, setStore] = useState(() => new AgentStore());
  const [bootstrapped, setBootstrapped] = useState(false);

  const create = useCallback(async () => {
    const created = await conversations.create();
    threadId.current = created.id;
    sessionStorage.setItem("agentdock:selectedThreadId", created.id);
  }, [conversations.create]);

  const select = useCallback(
    async (id: string) => {
      threadId.current = id;
      await conversations.select(id);
      sessionStorage.setItem("agentdock:selectedThreadId", id);
    },
    [conversations.select],
  );

  useEffect(() => {
    if (bootstrapped || conversations.loading) return;
    setBootstrapped(true);
    if (conversations.threads.length === 0) {
      void create();
      return;
    }
    const remembered = sessionStorage.getItem("agentdock:selectedThreadId");
    const selected =
      conversations.threads.find((item) => item.id === remembered) ??
      conversations.threads[0]!;
    threadId.current = selected.id;
    void conversations.select(selected.id);
  }, [
    bootstrapped,
    conversations.loading,
    conversations.select,
    conversations.threads,
    create,
  ]);

  useEffect(() => {
    if (!conversations.selectedThread || !conversations.history) return;
    const next = new AgentStore();
    next.hydrateConversationHistory(conversations.history);
    setStore(next);
  }, [conversations.history, conversations.selectedThread]);

  return (
    <main className="h-dvh w-full p-2 sm:p-4">
      {conversations.error && (
        <p
          role="alert"
          className="mb-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive"
        >
          {conversations.error}
        </p>
      )}
      {conversations.selectedThread ? (
        <ChatWorkspace
          className="h-full"
          title={conversations.selectedThread.title}
          brand="AgentDock"
          sidebar={
            <ThreadSidebar
              threads={conversations.threads}
              selectedId={conversations.selectedThread.id}
              onSelect={(id) => {
                if (id !== conversations.selectedThread?.id) void select(id);
              }}
              onNew={() => void create()}
              onRename={(id, title) => void conversations.rename(id, title)}
              footer={
                conversations.hasMoreThreads ? (
                  <button
                    type="button"
                    onClick={() => void conversations.loadMoreThreads()}
                    className="underline underline-offset-2"
                  >
                    Load more conversations
                  </button>
                ) : undefined
              }
            />
          }
        >
          {conversations.loading ? (
            <div
              role="status"
              className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
            >
              Loading thread…
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              {conversations.history?.nextCursor && (
                <button
                  type="button"
                  onClick={() => void conversations.loadOlderHistory()}
                  className="shrink-0 py-1 text-xs text-muted-foreground underline underline-offset-2"
                >
                  Load earlier messages
                </button>
              )}
              <Chat
                key={conversations.selectedThread.id}
                store={store}
                adapter={client.adapter}
                className="min-h-0 flex-1"
                welcomeTitle="What should we build?"
                welcomeDescription="Create and edit files, run a sandbox check, or attach an image to discuss."
                suggestions={[
                  "Build a clean portfolio website in HTML and CSS.",
                  "Create a small .mjs script that prints a greeting, then run it.",
                ]}
              />
            </div>
          )}
        </ChatWorkspace>
      ) : (
        <div
          role="status"
          className="flex h-full items-center justify-center text-sm text-muted-foreground"
        >
          {conversations.loading
            ? "Loading conversations…"
            : "Connect to the Node server to start a thread."}
        </div>
      )}
    </main>
  );
}
