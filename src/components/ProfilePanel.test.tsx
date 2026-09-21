import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileButton, ProfilePanel } from './ProfilePanel'
import { OnboardingTour } from './OnboardingTour'
import { TOUR_STEPS } from '../board/tour'
import { Toast } from './Toast'
import { createTheme } from '../board/theme'
import { PARTICIPANT_COLORS, type UserProfile } from '../collab/user-profile'

let container: HTMLDivElement
let root: Root
const theme = createTheme(false)
const profile: UserProfile = { id: 'abcdef0123456789', name: 'Анна Петрова', color: PARTICIPANT_COLORS[0] }

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

/** Controlled inputs ignore `.value =`; React listens for the native setter. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ProfileButton', () => {
  it('shows initials over the participant colour and reports its state', () => {
    const onToggle = vi.fn()
    act(() => { root.render(<ProfileButton profile={profile} expanded={false} onToggle={onToggle} />) })
    const button = container.querySelector<HTMLButtonElement>('[data-testid="profile-button"]')!
    // initialsOf is plural in name but returns a single leading letter, so the
    // avatar for "Анна Петрова" reads "А", not "АП".
    expect(button.textContent).toBe('А')
    expect(button.getAttribute('aria-expanded')).toBe('false')

    act(() => { button.click() })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('ProfilePanel', () => {
  function render(current = profile) {
    const onChange = vi.fn()
    act(() => { root.render(<ProfilePanel profile={current} theme={theme} onChange={onChange} />) })
    return onChange
  }

  it('renames without losing the id or the colour', () => {
    const onChange = render()
    type(container.querySelector<HTMLInputElement>('[data-testid="profile-name-input"]')!, 'Б')
    expect(onChange).toHaveBeenCalledWith({ ...profile, name: 'Б' })
  })

  it('caps the name length', () => {
    // The name is rendered into avatars and element bylines; an unbounded string
    // would break those layouts.
    render()
    expect(container.querySelector<HTMLInputElement>('[data-testid="profile-name-input"]')!.maxLength).toBe(40)
  })

  it('recolours without touching the name', () => {
    const onChange = render()
    const other = PARTICIPANT_COLORS[2]
    act(() => { container.querySelector<HTMLButtonElement>(`[data-testid="profile-color-${other.slice(1)}"]`)!.click() })
    expect(onChange).toHaveBeenCalledWith({ ...profile, color: other })
  })

  it('marks the current colour for screen readers, not just visually', () => {
    render()
    const selected = container.querySelector(`[data-testid="profile-color-${PARTICIPANT_COLORS[0].slice(1)}"]`)!
    const other = container.querySelector(`[data-testid="profile-color-${PARTICIPANT_COLORS[1].slice(1)}"]`)!
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(other.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows only a short prefix of the id', () => {
    render()
    expect(container.textContent).toContain('abcdef01')
    expect(container.textContent).not.toContain(profile.id)
  })

  it('says the profile is device-local, because the word implies an account', () => {
    render()
    expect(container.textContent).toContain('только на этом устройстве')
  })
})

describe('OnboardingTour', () => {
  const buttons = () => [...container.querySelectorAll('button')]
  const byText = (text: string) => buttons().find(b => b.textContent === text)!

  it('advances through the steps and finishes on the last one', () => {
    const onNext = vi.fn()
    const onFinish = vi.fn()
    act(() => { root.render(<OnboardingTour step={0} onNext={onNext} onFinish={onFinish} />) })
    expect(container.textContent).toContain(`Тур 1 из ${TOUR_STEPS.length}`)
    act(() => { byText('Далее').click() })
    expect(onNext).toHaveBeenCalledWith(1)

    act(() => { root.render(<OnboardingTour step={TOUR_STEPS.length - 1} onNext={onNext} onFinish={onFinish} />) })
    // The last card commits rather than advancing past the end.
    act(() => { byText('Начать работу').click() })
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('can be skipped from any step', () => {
    const onFinish = vi.fn()
    act(() => { root.render(<OnboardingTour step={1} onNext={vi.fn()} onFinish={onFinish} />) })
    act(() => { byText('Пропустить').click() })
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('falls back to the first card for an out-of-range step', () => {
    // The step index is restored from localStorage, so it can outlive a change
    // to the step list. A blank overlay with no way out would trap the user.
    act(() => { root.render(<OnboardingTour step={99} onNext={vi.fn()} onFinish={vi.fn()} />) })
    expect(container.textContent).toContain(TOUR_STEPS[0][0])
    expect(byText('Пропустить')).toBeTruthy()
  })
})

describe('Toast', () => {
  it('announces itself politely so the message is not missed', () => {
    act(() => { root.render(<Toast message="Сохранено" tone="success" onDismiss={vi.fn()} />) })
    expect(container.querySelector('[data-testid="toast"]')!.getAttribute('aria-live')).toBe('polite')
  })

  it('styles each tone distinctly', () => {
    for (const [tone, expected] of [['error', 'bg-red-50'], ['success', 'bg-emerald-50'], ['info', 'bg-violet-50']] as const) {
      act(() => { root.render(<Toast message="x" tone={tone} onDismiss={vi.fn()} />) })
      expect(container.querySelector('[data-testid="toast"]')!.className).toContain(expected)
    }
  })

  it('can be dismissed before its timeout', () => {
    const onDismiss = vi.fn()
    act(() => { root.render(<Toast message="x" tone="info" onDismiss={onDismiss} />) })
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="Закрыть уведомление"]')!.click() })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
