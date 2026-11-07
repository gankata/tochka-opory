import type { ReactNode } from "react";

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  const result: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) result.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      result.push(<code key={key++} className="rounded bg-secondary px-1.5 py-0.5 text-[0.9em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      result.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      result.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeHref(link[2]) : null;
      if (link && href) {
        result.push(<a key={key++} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{link[1]}</a>);
      } else {
        result.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) result.push(text.slice(last));
  return result;
}

export default function MarkdownView({ content }: { content: string }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={key++} className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-secondary p-4 text-sm leading-relaxed"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const classes = ["text-3xl font-semibold", "text-2xl font-semibold", "text-xl font-semibold", "text-lg font-semibold"];
      blocks.push(<div key={key++} role="heading" aria-level={level + 1} className={`${classes[level - 1]} mt-2`}>{inlineMarkdown(heading[2])}</div>);
      index++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(<blockquote key={key++} className="border-l-2 border-primary pl-4 text-muted-foreground">{inlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>);
      index++;
      continue;
    }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[index])) {
        const value = lines[index].replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
        const task = /^\[([ xX])\]\s+(.+)$/.exec(value);
        items.push(<li key={index} className={task ? "list-none -ml-5 flex items-start gap-2" : "pl-1"}>{task && <span aria-hidden="true" className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[11px] ${task[1] ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{task[1] ? "✓" : ""}</span>}<span>{inlineMarkdown(task ? task[2] : value)}</span></li>);
        index++;
      }
      blocks.push(ordered ? <ol key={key++} className="list-decimal space-y-2 pl-6">{items}</ol> : <ul key={key++} className="list-disc space-y-2 pl-6">{items}</ul>);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="border-border" />);
      index++;
      continue;
    }
    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,4}\s|>|```|\s*(?:[-*]|\d+\.)\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={key++}>{paragraph.map((part, partIndex) => <span key={partIndex}>{partIndex > 0 && <br />}{inlineMarkdown(part)}</span>)}</p>);
  }

  if (!blocks.length) return <p className="text-muted-foreground">Пустая страница. Начните писать в редакторе.</p>;
  return <div className="markdown-view space-y-4 break-words text-[16px] leading-7">{blocks}</div>;
}
