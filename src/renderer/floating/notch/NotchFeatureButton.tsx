import React from 'react'
import { cn } from '@shared/lib/utils'
import type { NotchFeatureId } from './notchModel'

export interface NotchDockItem {
  id: NotchFeatureId
  label: string
  title: string
  icon: React.ReactNode
  badge?: number
}

export function NotchFeatureButton({
  item,
  active,
  setRef,
  onClick,
}: {
  item: NotchDockItem
  active: boolean
  setRef: (node: HTMLButtonElement | null) => void
  onClick: () => void
}) {
  return (
    <button
      ref={setRef}
      className={cn('studydesk-notch-feature-button', active && 'active')}
      data-feature={item.id}
      onClick={onClick}
      aria-label={item.label}
      aria-expanded={active}
      aria-controls={`notch-popover-${item.id}`}
      title={item.label}
    >
      {item.icon}
      {!!item.badge && <span aria-hidden="true">{item.badge > 99 ? '99+' : item.badge}</span>}
    </button>
  )
}

