import { useEffect, useRef, useState } from 'react'

/**
 * useCounter
 * ══════════
 * Counts from 0 to `target` over `duration` ms using requestAnimationFrame.
 * Uses an ease-out curve so it feels like a system rapidly processing then
 * locking onto the final value — not a linear ticker.
 *
 * @param target   Final value (e.g. 298450)
 * @param duration Animation duration in ms (default 2200)
 * @param startDelay ms before the counter begins (default 600)
 */
export function useCounter(
  target: number,
  duration = 2200,
  startDelay = 600,
): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let startTime: number | null = null

    const delayId = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp
        const elapsed = timestamp - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Ease-out cubic: fast start, decelerates to lock in
        const eased = 1 - Math.pow(1 - progress, 3)
        setValue(Math.round(eased * target))

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          setValue(target)
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }, startDelay)

    return () => {
      clearTimeout(delayId)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, startDelay])

  return value
}
