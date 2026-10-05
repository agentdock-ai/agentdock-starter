import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "./utils";
export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="min-w-0 space-y-3 text-[14px] leading-6 [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeUrl(url) ?? ""}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-6 text-[15px] font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-6 text-[15px] font-semibold tracking-tight">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-5 text-[15px] font-semibold">{children}</h4>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-6 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-6 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-border pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt, src }) => (
            <span className="text-[13px] text-muted-foreground">
              {typeof src === "string" && safeUrl(src) ? (
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {alt || "View image"}
                </a>
              ) : (
                alt || "Image unavailable"
              )}
            </span>
          ),
          pre: ({ children }) => (
            <pre
              tabIndex={0}
              aria-label="Code block"
              className="my-4 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0"
            >
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded-md border border-border/60 bg-muted/60 px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div
              tabIndex={0}
              role="region"
              aria-label="Table"
              className="my-4 max-w-full overflow-x-auto rounded-lg border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <table className="w-full border-collapse text-left text-[13px]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="whitespace-nowrap border-b border-border bg-muted/50 px-4 py-2.5 font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-4 py-2.5 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-6 border-border" />,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
