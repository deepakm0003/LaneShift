/**
 * AnimatedCounter
 * ════════════════
 * Reusable count-up component. Starts when the element enters the viewport
 * (via IntersectionObserver), counting from 0 to `target` with an ease-out
 * cubic curve. Used in HeroSection and DataSection.
 *
 * Props:
 *   target   — final number
 *   duration — ms (default 2000)
 *   prefix   — prepended string (e.g. "$")
 *   suffix   — appended string (e.g. "%", "K")
 *   decimals — decimal places to preserve in output (default 0)
 *   color    — override text color (optional)
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  target: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
  color?: string
  className?: string
}

export default function AnimatedCounter({
  target,
  duration = 2000,
  prefix = '',
  suffix = '',
  decimals = 0,
  color,
  className = '',
}: Props) {
  const [value, setValue] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)

  // Start counter when element enters viewport
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [started])

  // Run the count animation once started
  useEffect(() => {
    if (!started) return

    let startTime: number | null = null

    const step = (ts: number) => {
      if (!startTime) startTime = ts
      const elapsed = ts - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = eased * target
      setValue(parseFloat(current.toFixed(decimals)))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setValue(target)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [started, target, duration, decimals])

  const formatted =
    decimals > 0
      ? value.toFixed(decimals)
      : value.toLocaleString()

  return (
    <span
      ref={ref}
      className={className}
      style={color ? { color } : undefined}
      aria-live="polite"
      aria-label={`${prefix}${formatted}${suffix}`}
    >
      {prefix}{formatted}{suffix}
    </span>
  )
}
