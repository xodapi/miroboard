import { PARTICIPANT_COLORS, initialsOf, withColor, withName, type UserProfile } from '../collab/user-profile'
import type { Theme } from '../board/theme'

export interface ProfileButtonProps {
  profile: UserProfile
  expanded: boolean
  onToggle: () => void
}

/** The avatar in the header that opens the profile panel. */
export function ProfileButton({ profile, expanded, onToggle }: ProfileButtonProps) {
  return (
    <button
      onClick={onToggle}
      data-testid="profile-button"
      aria-label="Профиль участника"
      aria-expanded={expanded}
      className={`size-8 grid place-items-center rounded-full text-[12px] font-bold text-white shadow-sm transition ring-2 ring-black/5 hover:ring-black/20 ${expanded ? 'ring-black/30' : ''}`}
      style={{ backgroundColor: profile.color }}
      title={`Профиль: ${profile.name}`}
    >
      {initialsOf(profile.name)}
    </button>
  )
}

export interface ProfilePanelProps {
  profile: UserProfile
  theme: Theme
  onChange: (profile: UserProfile) => void
}

/**
 * Name and colour for the local participant, used to sign created elements.
 *
 * This is device-local: nothing here is shared, and the document stores only the
 * author id. The panel says so, because "profile" in a board app usually implies
 * an account and this one deliberately is not.
 */
export function ProfilePanel({ profile, theme, onChange }: ProfilePanelProps) {
  return (
    <div
      className={`absolute right-4 top-14 z-[60] w-72 rounded-2xl border p-3 shadow-xl ${theme.dark ? 'border-slate-600 bg-slate-800' : 'border-black/5 bg-white'}`}
      data-ui
      data-testid="profile-panel"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full text-[14px] font-bold text-white shadow-sm" style={{ backgroundColor: profile.color }}>
          {initialsOf(profile.name)}
        </span>
        <div className="min-w-0">
          <div className={`truncate text-[13px] font-semibold ${theme.dark ? 'text-slate-100' : 'text-slate-800'}`}>{profile.name}</div>
          <div className={`truncate text-[10px] ${theme.textSecondary}`}>Локальный профиль · {profile.id.slice(0, 8)}</div>
        </div>
      </div>

      <label className={`mt-3 block text-[11px] font-medium ${theme.textSecondary}`} htmlFor="profile-name">Имя участника</label>
      <input
        id="profile-name"
        data-testid="profile-name-input"
        value={profile.name}
        maxLength={40}
        onChange={event => onChange(withName(profile, event.target.value))}
        className={`mt-1 h-8 w-full rounded-lg border px-2 text-[12px] outline-none focus:border-violet-400 ${theme.dark ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-black/10 bg-white text-slate-800'}`}
        placeholder="Как вас подписывать"
      />

      <div className={`mt-3 text-[11px] font-medium ${theme.textSecondary}`}>Цвет</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {PARTICIPANT_COLORS.map(candidate => (
          <button
            key={candidate}
            data-testid={`profile-color-${candidate.slice(1)}`}
            onClick={() => onChange(withColor(profile, candidate))}
            aria-label={`Цвет ${candidate}`}
            aria-pressed={profile.color === candidate}
            className={`size-6 rounded-full transition ring-2 ${profile.color === candidate ? (theme.dark ? 'ring-white' : 'ring-slate-800') : 'ring-black/5 hover:ring-black/20'}`}
            style={{ backgroundColor: candidate }}
          />
        ))}
      </div>

      <p className={`mt-3 text-[10px] leading-relaxed ${theme.textSecondary}`}>
        Имя и цвет хранятся только на этом устройстве и используются для подписи
        созданных объектов (<code>createdBy</code>). В файл документа попадает
        идентификатор автора; обезличить его можно при экспорте.
      </p>
    </div>
  )
}
