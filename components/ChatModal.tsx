'use client'
/**
 * ChatModal — full-screen expanded chat view.
 * Uses useTripContext() directly (same source as ChatPanel) — always in sync.
 * Renders message content from UIMessage.parts (AI SDK 4.x) with m.content fallback.
 */

import { useEffect, useRef } from 'react'
import { useTripContext } from '@/contexts/TripContext'
import { AssistantMarkdown, TypingDots } from './ChatShared'
import ChatToolResultRenderer from './chat-ui/ChatToolResultRenderer'
import type { ToolInvocationPart } from '@/types'

interface ChatModalProps {
  onClose: () => void
}

/** Extract displayable text from a UIMessage, preferring parts over content. */
function getMessageText(m: { content: string; parts?: Array<{ type: string; text?: string }> }): string {
  // AI SDK 4.x: text lives in parts[].type === 'text'
  if (m.parts && m.parts.length > 0) {
    const text = m.parts
      .filter(p => p.type === 'text')
      .map(p => p.text ?? '')
      .join('')
    if (text.trim()) return text
  }
  // Fallback to legacy content field
  return typeof m.content === 'string' ? m.content : ''
}

/** Tool invocation parts to show step labels while planning. */
function getToolSteps(m: { parts?: Array<{ type: string; toolInvocation?: { toolName: string; state: string } }> }): string[] {
  if (!m.parts) return []
  const LABELS: Record<string, string> = {
    suggest_route_stops:  '🗺️ Planning route…',
    search_attractions:   '🎯 Finding attractions…',
    search_hotels:        '🏨 Searching hotels…',
    explore_surroundings: '🌲 Exploring activities…',
    check_hotel_availability: '🔍 Checking availability…',
    build_booking_summary: '📋 Building booking…',
  }
  return m.parts
    .filter(p => p.type === 'tool-invocation' && p.toolInvocation)
    .map(p => LABELS[p.toolInvocation!.toolName] ?? `⚙️ ${p.toolInvocation!.toolName}`)
    .filter((v, i, a) => a.indexOf(v) === i)  // dedupe
}

export default function ChatModal({ onClose }: ChatModalProps) {
  const { messages, input, isLoading, handleInputChange, handleSubmit } = useTripContext()

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    handleInputChange(e)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  // Only render messages that have something to show
  const visibleMessages = messages.filter(m => {
    if (m.role === 'user') return true
    const text = getMessageText(m as Parameters<typeof getMessageText>[0])
    const steps = getToolSteps(m as Parameters<typeof getToolSteps>[0])
    const hasToolResults = ((m as { parts?: ToolInvocationPart[] }).parts ?? [])
      .some(p => p.type === 'tool-invocation' && p.toolInvocation?.state === 'result')
    return text.trim().length > 0 || steps.length > 0 || hasToolResults
  })

  const aiResponseCount = visibleMessages.filter(m => m.role !== 'user').length

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[3500] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[3600] flex items-center justify-center p-4 sm:p-8 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-5xl h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col border border-gray-200" style={{ overflow: 'hidden' }}>

          {/* ── Header ── */}
          <div className="flex-none flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-xl shadow-sm">
                🗺️
              </div>
              <div>
                <p className="text-base font-bold text-gray-900 leading-tight">Road Trip Planner</p>
                <p className="text-xs text-gray-400">
                  AI-powered · Free · {aiResponseCount} AI response{aiResponseCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1">
                  {messages.length} message{messages.length !== 1 ? 's' : ''}
                </span>
              )}
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Close (Esc)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6 bg-gray-50/40">

            {visibleMessages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-16">
                <div className="text-6xl mb-4">🚗</div>
                <p className="text-xl font-bold text-gray-900 mb-2">Where are you headed?</p>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                  Describe your trip and the AI will plan stops, hotels, and activities.
                  Your conversation from the map panel appears here automatically.
                </p>
              </div>
            )}

            {visibleMessages.map((m, idx) => {
              const text  = getMessageText(m as Parameters<typeof getMessageText>[0])
              const steps = getToolSteps(m as Parameters<typeof getToolSteps>[0])
              const responseNum = visibleMessages.slice(0, idx + 1).filter(x => x.role !== 'user').length

              return (
                <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                  {/* AI avatar */}
                  {m.role !== 'user' && (
                    <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center text-lg flex-none mt-1 shadow-sm">
                      🤖
                    </div>
                  )}

                  <div className={m.role === 'user' ? 'max-w-[60%]' : 'flex-1 min-w-0 max-w-[80%]'}>
                    {m.role === 'user' ? (
                      /* User bubble */
                      <div>
                        <div className="flex justify-end mb-1.5">
                          <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">You</span>
                        </div>
                        <div className="bg-blue-600 text-white text-sm leading-relaxed rounded-2xl rounded-br-md px-5 py-3 shadow-sm whitespace-pre-wrap">
                          {text || m.content}
                        </div>
                      </div>
                    ) : (
                      /* Assistant card */
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">AI Assistant</span>
                          <span className="text-[10px] text-gray-300">· #{responseNum}</span>
                        </div>
                        {/* Rich UI cards for completed tool results */}
                        {((m as { parts?: ToolInvocationPart[] }).parts ?? [])
                          .filter((p): p is ToolInvocationPart =>
                            p.type === 'tool-invocation' && p.toolInvocation?.state === 'result'
                          )
                          .map(part => (
                            <ChatToolResultRenderer key={part.toolInvocation.toolCallId} part={part} />
                          ))
                        }
                        <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200 shadow-sm px-6 py-4">
                          {/* Tool steps (shown when no text yet) */}
                          {steps.length > 0 && !text && (
                            <div className="space-y-1 mb-3">
                              {steps.map((s, i) => (
                                <div key={i} className="text-xs text-gray-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 flex-none" />
                                  {s}
                                </div>
                              ))}
                            </div>
                          )}
                          {text ? (
                            <AssistantMarkdown content={text} />
                          ) : (
                            <p className="text-xs text-gray-400 italic">Processing…</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User avatar */}
                  {m.role === 'user' && (
                    <div className="w-9 h-9 rounded-2xl bg-gray-100 flex items-center justify-center text-lg flex-none mt-6 shadow-sm">
                      🧑
                    </div>
                  )}
                </div>
              )
            })}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-4 justify-start">
                <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center text-lg flex-none mt-1 shadow-sm">
                  🤖
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">AI Assistant</span>
                  </div>
                  <div className="bg-white rounded-2xl rounded-bl-md border border-gray-200 shadow-sm px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <TypingDots />
                      <span>Planning your trip…</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input ── */}
          <div className="flex-none bg-white border-t border-gray-100 px-6 py-4">
            <form onSubmit={handleSubmit}>
              <div className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  placeholder="Ask about your trip — stops, hotels, activities, routing…"
                  rows={1}
                  style={{ height: '40px' }}
                  className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none leading-relaxed py-0.5"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.currentTarget.form?.requestSubmit()
                      setTimeout(() => {
                        if (textareaRef.current) textareaRef.current.style.height = '40px'
                      }, 0)
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex-none w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors shadow-sm"
                  title="Send (Enter)"
                >
                  <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                    <path d="M7 11V3M3 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <p className="text-[10px] text-gray-400">Enter to send · Shift+Enter for new line · Esc to close</p>
                {isLoading && (
                  <p className="text-[10px] text-blue-500 font-medium animate-pulse">Thinking…</p>
                )}
              </div>
            </form>
          </div>

        </div>
      </div>
    </>
  )
}
