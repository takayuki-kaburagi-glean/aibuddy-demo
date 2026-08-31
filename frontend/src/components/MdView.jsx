import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import HtmlPreview from './HtmlPreview.jsx';

// Detect ```html … ``` code blocks and replace them with a preview (iframe).
// Other code blocks are shown as a normal <pre>.
function preRenderer({ node, children }) {
  const child = node?.children?.[0];
  const cls = (child?.properties?.className || []).join(' ');
  if (/\blanguage-html\b/.test(cls)) {
    const code = (child.children || []).map((n) => n.value || '').join('');
    return <HtmlPreview code={code} />;
  }
  return <pre>{children}</pre>;
}

const COMPONENTS = { pre: preRenderer };

// Shared Markdown renderer. With html=true, raw HTML tags are also rendered safely (rehype-raw + sanitize).
// In any mode, ```html blocks can be previewed.
export default function MD({ children, html }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={html ? [rehypeRaw, rehypeSanitize] : []}
      components={COMPONENTS}
    >
      {children}
    </Markdown>
  );
}
