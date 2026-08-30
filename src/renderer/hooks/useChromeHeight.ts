import { useEffect, useRef } from 'react'

/** Reports overlay chrome height so the chrome WebContentsView can be sized without moving the page. */
export function useChromeHeight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height)
      if (height > 0) void window.browsy.setChromeHeight(height)
    }

    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}
