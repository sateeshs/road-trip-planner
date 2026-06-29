'use client'

import { useEffect, useRef } from 'react'
import type { Message } from 'ai'
import { AssistantMarkdown, TypingDots } from './ChatShared'
import ChatToolResultRenderer from './chat-ui/ChatToolResultRenderer'
import type { ToolInvocationPart } from '@/types'

interface ChatPanelProps {
  messages: Message[]
  input: string
  isLoading: boolean
  collapsed: boolean
  onToggle: () => void
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onSuggestionSelect: (text: string) => void
  onExpand: () => void
}

export default function ChatPanel({
  messages, input, isLoading, collapsed, onToggle,
  onInputChange, onSubmit, onExpand,
}: ChatPanelProps) {
  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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

          <div className="flex items-center gap-1">
            {/* Expand to modal */}
            <button
              onClick={onExpand}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Open full chat window"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Collapse */}
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
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50/40">

          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-8 pb-4 px-4">
              <div className="text-5xl mb-3">🚗</div>
              <p className="text-base font-bold text-gray-900 mb-1">Where are you headed?</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Describe your trip and I&apos;ll plan stops, hotels, and activities.
              </p>
              <button
                onClick={onExpand}
                className="mt-4 text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors"
              >
                Open full chat window ↗
              </button>
            </div>
          )}

          {messages.map(m => {
            // AI SDK 4.x: prefer parts[].type==='text' over content (content may be empty for tool-call messages)
            const textContent = (() => {
              const p = (m as { parts?: Array<{ type: string; text?: string }> }).parts
              if (p) {
                const t = p.filter(x => x.type === 'text').map(x => x.text ?? '').join('')
                if (t.trim()) return t
              }
              return typeof m.content === 'string' ? m.content : ''
            })()

            // Extract completed tool-invocation parts for rich UI rendering
            const toolResultParts = (() => {
              const p = (m as { parts?: ToolInvocationPart[] }).parts ?? []
              return p.filter(
                (part): part is ToolInvocationPart =>
                  part.type === 'tool-invocation' && part.toolInvocation?.state === 'result'
              )
            })()

            // Skip messages with nothing to show
            if (!textContent.trim() && toolResultParts.length === 0 && m.role !== 'user') return null

            return (
              <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role !== 'user' && (
                  <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-sm shrink-0 mt-0.5 shadow-sm">
                    🤖
                  </div>
                )}
                <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex-1'}`}>
                  {m.role === 'user' ? (
                    <div className="bg-blue-600 text-white text-sm leading-relaxed rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm whitespace-pre-wrap">
                      {textContent || m.content}
                    </div>
                  ) : (
                    <div>
                      {/* Rich UI cards for tool results */}
                      {toolResultParts.map(part => (
                        <ChatToolResultRenderer key={part.toolInvocation.toolCallId} part={part} />
                      ))}
                      {/* Text response */}
                      {textContent.trim() && (
                        <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200/80 shadow-sm px-4 py-3">
                          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-2">
                            AI Assistant
                          </p>
                          <AssistantMarkdown content={textContent} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

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
