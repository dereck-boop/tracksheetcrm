import { appUrl } from "@/lib/stripe";
import { CopyLink } from "./CopyLink";

/** HTML for pasting into the studio's own website (e.g. a Squarespace Code Block). embed.js resizes the frame to fit. */
const embedCode = (url: string) =>
  `<iframe src="${url}?embed=1" data-studio-form style="width:100%;height:1150px;border:0" title="Book a session"></iframe>\n<script src="${appUrl()}/embed.js" async></script>`;

/** The public page where clients request sessions, with copy and open buttons. */
export function BookingPageLink({ slug, compact }: { slug: string; compact?: boolean }) {
  const url = `${appUrl()}/book/${slug}`;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${compact ? "" : "rounded-md border border-gray-200 bg-white p-3"}`}>
      <span className="text-gray-600">Client booking page:</span>
      <a href={url} target="_blank" rel="noreferrer" className="link break-all">{url}</a>
      <CopyLink url={url} label="Copy link" />
      {!compact && <CopyLink url={embedCode(url)} label="Copy embed code" />}
    </div>
  );
}
