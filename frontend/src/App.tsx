import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentStore,
  createConversationClient,
  useConversations,
} from "@agentdock-ai/react";
import { Chat, ChatWorkspace, ThreadSidebar } from "@/components/agentdock-ui";
import { useThreadRoute } from "@/hooks/use-thread-route";

const SELECTED_THREAD_KEY = "agentdock:selectedThreadId";

export function App() {
  const threadId = useRef<string | null>(null);
  const resolvingHome = useRef(false);
  const creatingThread = useRef(false);
  const refreshHistoryRef = useRef<(id: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const { route, navigateToThread } = useThreadRoute();
  const [runningThreadIds, setRunningThreadIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const markThreadActivity = useCallback((id: string, running: boolean) => {
    setRunningThreadIds((current) => {
      if (current.has(id) === running) return current;
      const next = new Set(current);
      if (running) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const client = useMemo(
    () =>
      createConversationClient({
        getThreadId: () => threadId.current,
        onOperationSettled: (id) => {
          markThreadActivity(id, false);
          if (threadId.current === id) void refreshHistoryRef.current(id);
        },
      }),
    [markThreadActivity],
  );
  const conversations = useConversations(client);
  refreshHistoryRef.current = (id) => conversations.refreshHistory(id);
  const [store, setStore] = useState(() => new AgentStore());
  const [actionError, setActionError] = useState<string | null>(null);

  const createThread = useCallback(
    async (replace = false) => {
      if (creatingThread.current) return;
      setActionError(null);
      creatingThread.current = true;
      try {
        const created = await conversations.create();
        threadId.current = created.id;
        sessionStorage.setItem(SELECTED_THREAD_KEY, created.id);
        navigateToThread(created.id, { replace });
      } catch (cause) {
        setActionError(
          cause instanceof Error ? cause.message : "Could not create a thread.",
        );
      } finally {
        creatingThread.current = false;
      }
    },
    [conversations.create, navigateToThread],
  );

  const openThread = useCallback(
    (id: string) => {
      threadId.current = id;
      sessionStorage.setItem(SELECTED_THREAD_KEY, id);
      navigateToThread(id);
    },
    [navigateToThread],
  );

  useEffect(() => {
    if (route.type !== "thread") {
      resolvingHome.current = false;
      return;
    }

    threadId.current = route.threadId;
    sessionStorage.setItem(SELECTED_THREAD_KEY, route.threadId);
    if (creatingThread.current) return;
    if (conversations.selectedThread?.id !== route.threadId)
      void conversations.select(route.threadId);
  }, [route, conversations.select, conversations.selectedThread?.id]);

  useEffect(() => {
    if (route.type !== "home" || conversations.loading || resolvingHome.current)
      return;

    resolvingHome.current = true;
    const rememberedId = sessionStorage.getItem(SELECTED_THREAD_KEY);
    const selected =
      conversations.threads.find((thread) => thread.id === rememberedId) ??
      conversations.threads[0];

    if (selected) {
      navigateToThread(selected.id, { replace: true });
      return;
    }

    void createThread(true);
  }, [
    route.type,
    conversations.loading,
    conversations.threads,
    createThread,
    navigateToThread,
  ]);

  useEffect(() => {
    if (!conversations.selectedThread || !conversations.history) return;
    const next = new AgentStore();
    next.hydrateConversationHistory(conversations.history);
    setStore(next);
  }, [conversations.history, conversations.selectedThread]);

  const selectedThread =
    route.type === "thread" &&
    conversations.selectedThread?.id === route.threadId
      ? conversations.selectedThread
      : null;
  const sidebarThreads = useMemo(
    () =>
      conversations.threads.map((thread) => ({
        ...thread,
        isRunning: runningThreadIds.has(thread.id),
      })),
    [conversations.threads, runningThreadIds],
  );
  const selectedThreadId = selectedThread?.id;
  const onActivityChange = useCallback(
    (running: boolean) => {
      if (selectedThreadId) markThreadActivity(selectedThreadId, running);
    },
    [markThreadActivity, selectedThread?.id],
  );
  const error = actionError ?? conversations.error;

  return (
    <main className="h-dvh w-full">
      {error && selectedThread && (
        <p
          role="alert"
          className="mb-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {selectedThread ? (
        <ChatWorkspace
          className="h-full"
          title={selectedThread.title}
          brand="AgentDock"
          sidebar={
            <ThreadSidebar
              threads={sidebarThreads}
              selectedId={selectedThread.id}
              onSelect={(id) => {
                if (id !== selectedThread.id) openThread(id);
              }}
              onNew={() => void createThread()}
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
                key={selectedThread.id}
                store={store}
                adapter={client.adapter}
                className="min-h-0 flex-1"
                welcomeTitle="What should we build?"
                welcomeDescription="Create and edit files, run a sandbox check, or attach an image to discuss."
                suggestions={[
                  "Build a clean portfolio website in HTML and CSS.",
                  "Create a small .mjs script that prints a greeting, then run it.",
                ]}
                onActivityChange={onActivityChange}
              />
            </div>
          )}
        </ChatWorkspace>
      ) : (
        <div
          role="status"
          className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        >
          <span>
            {route.type === "not-found"
              ? "This thread URL is invalid."
              : error
                ? "Could not load this conversation."
                : "Loading conversation…"}
          </span>
          {(route.type === "not-found" || error) && (
            <button
              type="button"
              onClick={() => void createThread()}
              className="rounded-lg border border-border px-3 py-1.5 text-foreground hover:bg-muted/50"
            >
              Start a new thread
            </button>
          )}
        </div>
      )}
    </main>
  );
}
