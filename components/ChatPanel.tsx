'use client'

import { useEffect, useRef } from 'react'
import type { Message } from 'ai'
import Spinner from './shared/Spinner'

interface ChatPanelProps {
  messages: Message[]
  input: string
  isLoading: boolean
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}

const SUGGESTIONS = [
  'Plan a road trip from Chicago to Nashville for 4 people, July 4-10',
  'Family trip from NYC to Miami, 5 days, 2 adults 2 kids',
  'Road trip from Dallas to New Orleans, weekend trip',
]

export default function ChatPanel({ messages, input, isLoading, onInputChange, onSubmit }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🚗</div>
            <h2 className="text-base font-semibold text-gray-800 mb-1">Plan your road trip</h2>
            <p className="text-sm text-gray-500 mb-6">Tell me where you want to go and I&apos;ll handle the rest.</p>
            <div className="space-y-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                  onClick={() => {
                    const textarea = document.querySelector('textarea')
                    if (textarea) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
                      nativeInputValueSetter?.call(textarea, s)
                      textarea.dispatchEvent(new Event('input', { bubbles: true }))
                    }
                  }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {m.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-gray-500">Claude</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-500">Planning your trip...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="p-4 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={onInputChange}
            placeholder="Where do you want to go?"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Shift+Enter for new line</p>
      </form>
    </div>
  )
}
