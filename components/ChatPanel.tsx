'use client'

import { useEffect, useRef } from 'react'
import type { Message } from 'ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface ChatPanelProps {
  messages: Message[]
  input: string
  isLoading: boolean
  collapsed: boolean
  onToggle: () => void
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onSuggestionSelect: (text: string) => void
}

// Animated typing indicator
function TypingDots() {
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

// Markdown renderer for assistant messages
function AssistantMarkdown({ content }: { content: string }) {
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
        code: ({ node, className, children, ...p }) => className
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

export default function ChatPanel({
  messages, input, isLoading, collapsed, onToggle,
  onInputChange, onSubmit,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-grow textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onInputChange(e)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[1000] bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg rounded-r-xl px-2 py-5 flex flex-col items-center gap-1.5 hover:bg-blue-600 hover:border-blue-600 hover:text-white transition-all group"
        title="Open chat"
      >
        <span className="text-xl">💬</span>
        <span className="text-[10px] font-semibold tracking-widest uppercase [writing-mode:vertical-rl] text-gray-500 group-hover:text-white">
          Chat
        </span>
      </button>
    )
  }

  return (
    <>
      {/* Keyframe for typing dots — injected once */}
      <style>{`
        @keyframes chat-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div className="absolute left-4 top-4 bottom-4 w-[26rem] z-[1000] flex flex-col bg-white border border-gray-200/80 shadow-2xl rounded-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-base shadow-sm">
              🗺️
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">Road Trip Planner</p>
              <p className="text-[11px] text-gray-400 leading-tight">AI-powered · Free</p>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Collapse chat"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50/40">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-8 pb-4 px-4">
              <div className="text-5xl mb-3">🚗</div>
              <p className="text-base font-bold text-gray-900 mb-1">Where are you headed?</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Describe your trip and I&apos;ll plan stops, hotels, and activities.
              </p>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>

              {/* AI avatar */}
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-0.5 shadow-sm">
                  🤖
                </div>
              )}

              {/* Bubble */}
              <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex-1'}`}>
                {m.role === 'user' ? (
                  /* User bubble */
                  <div className="bg-blue-600 text-white text-sm leading-relaxed rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
                    {m.content}
                  </div>
                ) : (
                  /* Assistant card */
                  <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200/80 shadow-sm px-4 py-3">
                    <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-2">
                      AI Assistant
                    </p>
                    <AssistantMarkdown content={m.content} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-0.5 shadow-sm">
                🤖
              </div>
              <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200/80 shadow-sm px-4 py-3">
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-2">
                  AI Assistant
                </p>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <TypingDots />
                  <span>Planning your trip…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-3 py-3">
          <form onSubmit={onSubmit}>
            <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                placeholder="Ask about your trip…"
                rows={1}
                style={{ height: '36px' }}
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none leading-relaxed py-0.5"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                    // Reset height after send
                    setTimeout(() => {
                      if (textareaRef.current) textareaRef.current.style.height = '36px'
                    }, 0)
                  }
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="shrink-0 w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors shadow-sm"
                title="Send (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 11V3M3 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              Enter to send · Shift+Enter for new line
            </p>
          </form>
        </div>

      </div>
    </>
  )
}
