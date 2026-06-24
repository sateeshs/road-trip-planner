'use client'

import { useEffect, useRef } from 'react'
import type { Message } from 'ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import Spinner from './shared/Spinner'

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

export default function ChatPanel({
  messages, input, isLoading, collapsed, onToggle,
  onInputChange, onSubmit, onSuggestionSelect,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Collapsed state: show only the toggle tab
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[1000] bg-white/90 backdrop-blur-md border border-white/40 shadow-lg rounded-r-xl px-2 py-4 flex flex-col items-center gap-1 hover:bg-blue-600 hover:text-white transition-colors group"
        title="Open chat"
      >
        <span className="text-lg">💬</span>
        <span className="text-xs font-medium [writing-mode:vertical-rl] text-gray-600 group-hover:text-white">Chat</span>
      </button>
    )
  }

  return (
    <div className="absolute left-4 top-4 bottom-4 w-80 z-[1000] flex flex-col bg-white/92 backdrop-blur-xl border border-white/40 shadow-2xl rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100/80 bg-white/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺️</span>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Road Trip Planner</h1>
            <p className="text-xs text-gray-400">AI-powered · Free</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          title="Collapse chat"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">🚗</div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Where are you headed?</p>
            <p className="text-xs text-gray-500">Describe your trip and I&apos;ll plan everything — stops, hotels, and activities.</p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-100/80 text-gray-800 rounded-bl-sm'
            }`}>
              {m.role === 'assistant' && (
                <p className="text-xs font-medium text-gray-400 mb-1">AI Assistant</p>
              )}
              {m.role === 'assistant' ? (
                <div className="text-sm leading-relaxed space-y-1.5">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      h1: ({ node, ..._ }) => <h1 className="text-base font-bold text-gray-900 mt-3 mb-1 border-b border-gray-200 pb-1">{_.children}</h1>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      h2: ({ node, ..._ }) => <h2 className="text-sm font-bold text-gray-900 mt-2.5 mb-1">{_.children}</h2>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      h3: ({ node, ..._ }) => <h3 className="text-sm font-semibold text-gray-800 mt-2 mb-0.5">{_.children}</h3>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      p: ({ node, ..._ }) => <p className="my-1 leading-relaxed">{_.children}</p>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ul: ({ node, ..._ }) => <ul className="my-1 ml-4 space-y-0.5 list-disc">{_.children}</ul>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ol: ({ node, ..._ }) => <ol className="my-1 ml-4 space-y-0.5 list-decimal">{_.children}</ol>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      li: ({ node, ..._ }) => <li className="leading-snug">{_.children}</li>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      strong: ({ node, ..._ }) => <strong className="font-semibold text-gray-900">{_.children}</strong>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      em: ({ node, ..._ }) => <em className="italic text-gray-700">{_.children}</em>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      a: ({ node, ..._ }) => <a href={_.href} className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noopener noreferrer">{_.children}</a>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      blockquote: ({ node, ..._ }) => <blockquote className="border-l-2 border-blue-400 pl-3 my-1 text-gray-600 italic">{_.children}</blockquote>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      code: ({ node, className, children, ..._ }) => className
                        ? <code className="block bg-gray-800 text-green-300 text-xs rounded-lg p-2 my-1 overflow-x-auto">{children}</code>
                        : <code className="bg-gray-200 text-gray-800 text-xs rounded px-1 py-0.5">{children}</code>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      table: ({ node, ..._ }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse border border-gray-300 rounded">{_.children}</table></div>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      thead: ({ node, ..._ }) => <thead className="bg-blue-50">{_.children}</thead>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      th: ({ node, ..._ }) => <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-gray-700">{_.children}</th>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      td: ({ node, ..._ }) => <td className="border border-gray-300 px-2 py-1.5 text-gray-700">{_.children}</td>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      hr: ({ node, ..._ }) => <hr className="my-2 border-gray-200" />,
                    }}
                  >{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100/80 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-2">
              <Spinner size="sm" />
              <span className="text-xs text-gray-500">Planning your trip...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="p-3 border-t border-gray-100/80 bg-white/50">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={onInputChange}
            placeholder="Where do you want to go?"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  )
}
