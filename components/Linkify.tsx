const URL_RE = /https?:\/\/[^\s<>"]+/g;

/** Plain text with any http(s):// URLs turned into links that open in a new tab. Text stays escaped by React. */
export function Linkify({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    // Leave sentence punctuation after a URL ("see https://x.com/y.") outside the link.
    const url = m[0].replace(/[.,;:!?'")\]]+$/, "");
    const start = m.index!;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a key={start} href={url} target="_blank" rel="noopener noreferrer" className="link break-all">
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
