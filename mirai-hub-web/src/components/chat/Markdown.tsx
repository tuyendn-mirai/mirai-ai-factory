import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

// LLM replies are markdown, but a plain `<div>{text}</div>` renders it as an
// unformatted run-on line: newlines collapse (browser default white-space
// is "normal") and markup like `**bold**` or `- item` shows up as literal
// characters instead of structure. remark-breaks additionally treats a
// single "\n" as a line break -- most model output doesn't bother with the
// blank-line-per-paragraph convention CommonMark expects.
// Matches the download links our Langflow TTS component emits
// (infra/apps/langflow-ide/custom_components/litellm_text_to_speech.py):
// "[Download audio](https://.../api/v1/files/download/<flow_id>/<file>.mp3)".
// Rendered as a plain <a>, the browser would just download the file instead
// of playing it — an inline <audio> element plays it directly in the bubble.
const AUDIO_EXTENSION_RE = /\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/i;

// Same link, pulled out of a raw (non-rendered) string — used by
// ToolStepCard/MessageList to surface a playable response even when the
// model's own final reply doesn't happen to repeat the tool's markdown link
// verbatim. Requires the markdown-link form (not a bare URL) since that's
// exactly what the TTS component emits.
// Matches an absolute URL or a root-relative path (the latter is what
// mirai-hub-api's chat_loop.py rewrites a raw Langflow download link into —
// see app/routers/files.py's get_tool_audio).
const AUDIO_MARKDOWN_LINK_RE =
  /\[[^\]]*\]\(((?:https?:\/\/[^\s)]+|\/[^\s)]+)\.(?:mp3|wav|ogg|m4a|flac)(?:\?[^\s)]*)?)\)/i;

export function extractAudioUrl(text: string): string | null {
  return AUDIO_MARKDOWN_LINK_RE.exec(text)?.[1] ?? null;
}

const components: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap [&:not(:first-child)]:mt-3">{children}</p>,
  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 [&:not(:first-child)]:mt-3">{children}</ul>,
  ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1 [&:not(:first-child)]:mt-3">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ children, href }) => {
    if (href && AUDIO_EXTENSION_RE.test(href)) {
      return (
        <audio controls preload="none" src={href} className="mt-1 h-9 max-w-full [&:not(:first-child)]:mt-3">
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        </audio>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {children}
      </a>
    );
  },
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-foreground/80 [&:not(:first-child)]:mt-3">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return <code className={cn("font-mono text-[13px]", className)}>{children}</code>;
    }
    return (
      <code className="rounded bg-foreground/[0.08] px-1 py-0.5 font-mono text-[13px]">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-foreground/[0.06] p-3 [&:not(:first-child)]:mt-3">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto [&:not(:first-child)]:mt-3">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[14.5px] leading-[1.6] text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
