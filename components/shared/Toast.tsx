'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onDismiss: () => void
  duration?: number
}

export default function Toast({ message, type = 'info', onDismiss, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [onDismiss, duration])

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-gray-800',
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${colors[type]} text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="text-white/70 hover:text-white ml-2">&times;</button>
    </div>
  )
}
