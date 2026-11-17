import ReactMarkdown from "react-markdown";

const SAFE_URL = /^(https?:|mailto:)/i;

/**
 * Renders user-written Markdown. Raw HTML is never interpreted (it shows up as plain text),
 * only http(s)/mailto links are clickable, and images are replaced by their alt text.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 break-words text-sm [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        urlTransform={(url) => (SAFE_URL.test(url) ? url : "")}
        components={{
          a: ({ href, children: label }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-link underline">
                {label}
              </a>
            ) : (
              <span>{label}</span>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
