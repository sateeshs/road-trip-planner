'use client'
/**
 * Shared sub-components used by both ChatPanel (side) and ChatModal (expanded view).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

// ── Typing dots animation ────────────────────────────────────────────────────

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-blue-400 opacity-60"
          style={{ animation: `chat-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  )
}

// ── Markdown renderer ────────────────────────────────────────────────────────

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        h1: ({ node, ...p }) => (
          <h1 className="text-base font-bold text-gray-900 mt-4 mb-2 pb-1.5 border-b-2 border-blue-100 flex items-center gap-2">
            {p.children}
          </h1>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        h2: ({ node, ...p }) => (
          <h2 className="text-sm font-bold text-blue-700 mt-3 mb-1.5 uppercase tracking-wide">
            {p.children}
          </h2>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        h3: ({ node, ...p }) => (
          <h3 className="text-sm font-semibold text-gray-800 mt-2.5 mb-1">
            {p.children}
          </h3>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        p: ({ node, ...p }) => (
          <p className="text-sm text-gray-700 leading-relaxed my-1.5">{p.children}</p>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ul: ({ node, ...p }) => (
          <ul className="my-2 ml-1 space-y-1">{p.children}</ul>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ol: ({ node, ...p }) => (
          <ol className="my-2 ml-4 space-y-1 list-decimal">{p.children}</ol>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        li: ({ node, ...p }) => (
          <li className="text-sm text-gray-700 leading-snug flex items-start gap-2">
            <span className="text-blue-400 mt-1 shrink-0 text-xs">▸</span>
            <span>{p.children}</span>
          </li>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        strong: ({ node, ...p }) => (
          <strong className="font-semibold text-gray-900">{p.children}</strong>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        em: ({ node, ...p }) => (
          <em className="italic text-gray-600">{p.children}</em>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        a: ({ node, ...p }) => (
          <a href={p.href} className="text-blue-600 underline underline-offset-2 hover:text-blue-800" target="_blank" rel="noopener noreferrer">
            {p.children}
          </a>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        blockquote: ({ node, ...p }) => (
          <blockquote className="border-l-4 border-blue-300 pl-3 my-2 text-gray-600 italic bg-blue-50/60 py-1.5 rounded-r-lg">
            {p.children}
          </blockquote>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        code: ({ node, className, children }) => className
          ? <code className="block bg-gray-900 text-green-300 text-xs rounded-lg p-3 my-2 overflow-x-auto font-mono">{children}</code>
          : <code className="bg-gray-100 text-blue-700 text-xs rounded px-1.5 py-0.5 font-mono">{children}</code>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        table: ({ node, ...p }) => (
          <div className="overflow-x-auto my-2.5 rounded-lg border border-gray-200">
            <table className="w-full text-xs border-collapse">{p.children}</table>
          </div>
        ),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        thead: ({ node, ...p }) => <thead className="bg-blue-50 border-b border-blue-100">{p.children}</thead>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        th: ({ node, ...p }) => <th className="px-3 py-2 text-left text-xs font-semibold text-blue-800">{p.children}</th>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        td: ({ node, ...p }) => <td className="px-3 py-2 text-gray-700 border-t border-gray-100">{p.children}</td>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        hr: ({ node, ...p }) => <hr className="my-3 border-gray-200" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
