import React, { useState, useEffect } from 'react'
import { ipc } from '@shared/ipc-client'
import { BookOpen, CheckCircle2, Clock3, Command, GraduationCap, KeyRound, MailWarning, Settings } from 'lucide-react'

interface Props { onComplete: () => void }

type Step = 'welcome' | 'accessibility' | 'optional'

export function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep]           = useState<Step>('welcome')
  const [granted, setGranted]     = useState(false)
  const [checking, setChecking]   = useState(false)

  // Poll for accessibility permission once user clicks "Grant"
  useEffect(() => {
    if (step !== 'accessibility' || granted) return
    if (!checking) return
    const t = setInterval(async () => {
      const ok = await ipc.invoke<boolean>('permission:checkAccessibility')
      if (ok) { setGranted(true); clearInterval(t) }
    }, 1000)
    return () => clearInterval(t)
  }, [step, checking, granted])

  function openAccessibility() {
    ipc.invoke('permission:openAccessibilitySettings')
    setChecking(true)
  }

  return (
    <div className="onboarding">
      {step === 'welcome' && (
        <div className="onboarding-step">
          <div className="onboarding-icon"><GraduationCap size={28} aria-hidden="true" /></div>
          <h2 className="onboarding-title">Welcome to Focus OS Student Edition</h2>
          <ul className="onboarding-list">
            <li><Clock3 size={14} aria-hidden="true" /> Focus timer with a compact academic HUD</li>
            <li><Command size={14} aria-hidden="true" /> Capture highlighted text from any app</li>
            <li><BookOpen size={14} aria-hidden="true" /> Local notes, courses, deadlines, and study items</li>
            <li><MailWarning size={14} aria-hidden="true" /> Rule-based critical email alerts only</li>
            <li><CheckCircle2 size={14} aria-hidden="true" /> Student workflows that stay local and private</li>
          </ul>
          <button className="onboarding-btn" onClick={() => setStep('accessibility')}>Get started</button>
        </div>
      )}

      {step === 'accessibility' && (
        <div className="onboarding-step">
          <div className="onboarding-icon"><KeyRound size={28} aria-hidden="true" /></div>
          <h2 className="onboarding-title">Accessibility Permission</h2>
          <p className="onboarding-body">
            Focus OS needs Accessibility access to capture highlighted text from other apps using <kbd>⌘⇧C</kbd>.
            Your captured text never leaves your Mac.
          </p>
          {!granted ? (
            <>
              <button className="onboarding-btn" onClick={openAccessibility}>
                {checking ? 'Waiting for permission…' : 'Open System Settings'}
              </button>
              {checking && <p className="onboarding-hint">Enable Focus OS in System Settings, Privacy &amp; Security, Accessibility, then return here</p>}
              <button className="onboarding-link" onClick={() => setStep('optional')}>Skip for now</button>
            </>
          ) : (
            <>
              <p className="onboarding-granted">Accessibility granted</p>
              <button className="onboarding-btn" onClick={() => setStep('optional')}>Continue</button>
            </>
          )}
        </div>
      )}

      {step === 'optional' && (
        <div className="onboarding-step">
          <div className="onboarding-icon"><Settings size={28} aria-hidden="true" /></div>
          <h2 className="onboarding-title">Optional Setup</h2>
          <p className="onboarding-body">
            You can connect Gmail for critical alerts and configure optional AI later.
            Core courses, deadlines, captures, and study flows work without AI.
          </p>
          <button className="onboarding-btn" onClick={onComplete}>Start using Focus OS</button>
        </div>
      )}
    </div>
  )
}
