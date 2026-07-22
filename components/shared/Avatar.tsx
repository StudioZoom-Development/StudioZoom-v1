interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  photoURL?: string
}

const SIZE_MAP = {
  sm: { wh: '24px', font: 'var(--text-xs)' },
  md: { wh: '32px', font: 'var(--text-xs)' },
  lg: { wh: '40px', font: 'var(--text-sm)' },
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function Avatar({ name, size = 'md', photoURL }: AvatarProps) {
  const { wh, font } = SIZE_MAP[size]

  if (photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt={name}
        style={{
          width: wh, height: wh, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      title={name}
      style={{
        width: wh, height: wh, borderRadius: '50%',
        background: 'var(--color-primary-muted)',
        color: 'var(--color-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: font, fontWeight: 700, flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {getInitials(name)}
    </div>
  )
}
