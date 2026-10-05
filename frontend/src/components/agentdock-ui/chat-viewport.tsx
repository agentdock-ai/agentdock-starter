"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollToLatest } from "./scroll-to-latest";

export function ChatViewport({
  children,
  revision,
  latestUserId,
  empty,
}: {
  children: ReactNode;
  revision: unknown;
  latestUserId?: string;
  empty: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const previousUser = useRef(latestUserId);
  const lastScroll = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  function toBottom() {
    const el = viewport.current;
    if (!el) return;
    following.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    lastScroll.current = el.scrollTop;
    setShowLatest(false);
  }
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    if (previousUser.current !== latestUserId) {
      previousUser.current = latestUserId;
      following.current = true;
      const rows = el.querySelectorAll<HTMLElement>('[data-role="user"]');
      const row = rows.item(rows.length - 1);
      if (row) el.scrollTop = row.offsetTop - 24;
      lastScroll.current = el.scrollTop;
      setShowLatest(false);
    } else if (following.current) {
      el.scrollTop = el.scrollHeight;
      lastScroll.current = el.scrollTop;
    } else setShowLatest(el.scrollHeight - el.scrollTop - el.clientHeight > 48);
  }, [revision, latestUserId]);
  useLayoutEffect(() => {
    if (!viewport.current || !content.current) return;
    const observer = new ResizeObserver(() => {
      if (following.current && viewport.current) {
        viewport.current.scrollTop = viewport.current.scrollHeight;
        lastScroll.current = viewport.current.scrollTop;
      }
    });
    observer.observe(viewport.current);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Conversation messages"
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [overflow-anchor:none] [scrollbar-gutter:stable]"
        onScroll={() => {
          const el = viewport.current!;
          const nearBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (el.scrollTop < lastScroll.current - 1) following.current = false;
          else if (nearBottom) following.current = true;
          lastScroll.current = el.scrollTop;
          if (nearBottom) setShowLatest(false);
        }}
        onClickCapture={(event) => {
          // Expanding a disclosure should preserve the reader's place.
          if (
            event.target instanceof Element &&
            event.target.closest("[aria-expanded]")
          )
            following.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (
            event.key === "PageUp" ||
            event.key === "Home" ||
            event.key === "ArrowUp"
          )
            following.current = false;
        }}
      >
        <div ref={content} className={cnContent(empty)}>
          {children}
        </div>
      </div>
      {showLatest && <ScrollToLatest onClick={toBottom} />}
    </div>
  );
}
function cnContent(empty: boolean) {
  return `mx-auto flex w-full max-w-[44rem] flex-col px-4 pt-6 pb-8 sm:px-4 ${empty ? "min-h-full justify-center" : "gap-6 pb-10"}`;
}
