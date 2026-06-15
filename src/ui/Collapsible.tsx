/**
 * A themed, animated disclosure section. Heavy detail-screen blocks (species
 * care guide, care insights) start collapsed to just their header and reveal
 * their body on click. State is ephemeral (per mount) — there is nothing worth
 * persisting. The height animation uses the CSS grid-rows trick (0fr→1fr) so
 * children stay mounted and measure themselves, no JS height calc needed.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Collapsible({
  title,
  isDark,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  isDark: boolean;
  defaultOpen?: boolean;
  /** Optional pill rendered beside the title (e.g. EXPERIMENTAL / SOURCED). */
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const chevron = (
    <Icon
      name="chevronDown"
      size={18}
      stroke={2}
      style={{
        flexShrink: 0,
        color: isDark ? '#9BAA98' : '#9AA294',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        transition: 'transform .25s ease',
      }}
    />
  );

  const body = (
    <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows .28s ease' }}>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ padding: isDark ? 0 : '0 18px 16px' }}>{children}</div>
      </div>
    </div>
  );

  if (isDark) {
    return (
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="b-tap"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '14px 0',
            background: 'transparent',
            border: 'none',
            borderTop: '1px solid rgba(255,255,255,.09)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span className="b-kicker">{title}</span>
          {badge}
          <span style={{ flex: 1 }} />
          {chevron}
        </button>
        {body}
      </div>
    );
  }

  return (
    <div className="a-card" style={{ marginTop: 16, borderRadius: 22, overflow: 'hidden' }}>
      <button
        type="button"
        className="a-tap"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          padding: '15px 18px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#23302A' }}>{title}</h3>
        {badge}
        <span style={{ flex: 1 }} />
        {chevron}
      </button>
      {body}
    </div>
  );
}
