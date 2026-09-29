'use client'

import { useState, useRef, useEffect, useCallback, type TouchEvent } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 15.9 Native Mobile Gesture System — Left-Edge Back Swipe Navigation
 * Triggers onBack (defaults to router.back()) when swiping right from the extreme left edge (0–24px).
 */
export function useBackSwipe(onBack?: () => void) {
  const router = useRouter()
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const [isSwiping, setIsSwiping] = useState(false)
  const [dragProgress, setDragProgress] = useState(0) // 0 to 1

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    // Only activate if touch starts within 24px of the left screen edge
    if (touch.clientX <= 24) {
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
      setIsSwiping(true)
      setDragProgress(0)
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    if (!touch) return

    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y

    // Cancel if vertical gesture dominates
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      touchStartRef.current = null
      setIsSwiping(false)
      setDragProgress(0)
      return
    }

    if (deltaX > 0) {
      // Clamped progress up to 100px
      const progress = Math.min(1, deltaX / 100)
      setDragProgress(progress)
    }
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    if (!touch) {
      touchStartRef.current = null
      setIsSwiping(false)
      setDragProgress(0)
      return
    }

    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const elapsedSec = (Date.now() - touchStartRef.current.time) / 1000
    const velocityX = deltaX / Math.max(0.01, elapsedSec) // px per second

    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.5
    // Threshold: either dragged > 80px or quick flick with velocity > 400px/s (0.4m/s)
    if (isHorizontal && (deltaX > 80 || (deltaX > 30 && velocityX > 400))) {
      if (onBack) {
        onBack()
      } else {
        router.back()
      }
    }

    touchStartRef.current = null
    setIsSwiping(false)
    setDragProgress(0)
  }, [onBack, router])

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }

  // Expose handlers at top-level AND nested under backSwipeHandlers as non-enumerable so spreading result never passes backSwipeHandlers to DOM
  const result = {
    ...handlers,
  }

  Object.defineProperty(result, 'backSwipeHandlers', { value: handlers, enumerable: false, configurable: true })
  Object.defineProperty(result, 'isSwiping', { value: isSwiping, enumerable: false, configurable: true })
  Object.defineProperty(result, 'dragProgress', { value: dragProgress, enumerable: false, configurable: true })

  return result as typeof handlers & {
    backSwipeHandlers: typeof handlers
    isSwiping: boolean
    dragProgress: number
  }
}

/**
 * 15.9 Pull-To-Refresh for Mobile Feeds
 * Detects pull down from scroll-top = 0 to trigger async refresh
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only start if at top of page or element
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartY.current === null || isRefreshing) return
    const currentY = e.touches[0].clientY
    const delta = currentY - touchStartY.current

    if (delta > 0 && window.scrollY === 0) {
      setIsPulling(true)
      // Logarithmic / dampened drag resistance
      const dampened = Math.min(80, delta * 0.45)
      setPullDistance(dampened)
    } else {
      setIsPulling(false)
      setPullDistance(0)
    }
  }, [isRefreshing])

  const handleTouchEnd = useCallback(async () => {
    if (touchStartY.current === null) return
    touchStartY.current = null

    if (pullDistance >= 50 && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setIsPulling(false)
        setPullDistance(0)
      }
    } else {
      setIsPulling(false)
      setPullDistance(0)
    }
  }, [pullDistance, isRefreshing, onRefresh])

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    pullHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  }
}

/**
 * 15.8 Touch Gestures & Physics for the Bottom Drawer
 * Supports 3-stage snapping (Hidden: 100%, Peek: 30%, Full: 0%) and vertical velocity dismiss (> 0.5m/s).
 */
export type DrawerStage = 'hidden' | 'peek' | 'full'

interface UseDrawerPhysicsProps {
  stage: DrawerStage
  onStageChange: (stage: DrawerStage) => void
  onDismiss: () => void
}

export function useDrawerPhysics({ stage, onStageChange, onDismiss }: UseDrawerPhysicsProps) {
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const touchStartRef = useRef<{ y: number; time: number } | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = {
      y: touch.clientY,
      time: Date.now(),
    }
    setIsDragging(true)
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.touches[0]
    if (!touch) return

    const deltaY = touch.clientY - touchStartRef.current.y
    // Allow dragging downwards or upwards
    setDragOffsetY(deltaY)
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    const deltaY = touch ? touch.clientY - touchStartRef.current.y : dragOffsetY
    const elapsedSec = (Date.now() - touchStartRef.current.time) / 1000
    const velocityY = deltaY / Math.max(0.01, elapsedSec) // px per second

    setIsDragging(false)
    setDragOffsetY(0)
    touchStartRef.current = null

    // Velocity > 500px/s (0.5m/s) downwards => Dismiss
    if (velocityY > 500 || deltaY > 180) {
      onDismiss()
      return
    }

    // Velocity < -500px/s upwards => Snap to Full
    if (velocityY < -500 || deltaY < -120) {
      onStageChange('full')
      return
    }

    // Threshold-based transitions between peek and full
    if (stage === 'peek') {
      if (deltaY < -60) {
        onStageChange('full')
      } else if (deltaY > 80) {
        onDismiss()
      }
    } else if (stage === 'full') {
      if (deltaY > 100) {
        onStageChange('peek')
      }
    }
  }, [dragOffsetY, stage, onDismiss, onStageChange])

  // Compute CSS translateY percentage or offset
  const getTransformStyle = () => {
    if (stage === 'hidden') return 'translateY(100%)'
    if (isDragging) {
      const basePercent = stage === 'peek' ? 30 : 0
      return `translateY(calc(${basePercent}% + ${dragOffsetY}px))`
    }
    return stage === 'peek' ? 'translateY(30%)' : 'translateY(0%)'
  }

  return {
    isDragging,
    getTransformStyle,
    drawerTouchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  }
}
