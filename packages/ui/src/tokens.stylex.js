import * as stylex from '@stylexjs/stylex'

export const palette = stylex.defineVars({
  bg0: 'var(--bg-0)',
  bg1: 'var(--bg-1)',
  bg2: 'var(--bg-2)',
  fg0: 'var(--fg-0)',
  fg1: 'var(--fg-1)',
  fg2: 'var(--fg-2)',
  line: 'var(--line)',
  halo: 'var(--halo)',
})

export const font = stylex.defineVars({
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
})

export const typeScale = stylex.defineVars({
  sm: '0.875rem',
  base: 'clamp(0.95rem, 0.9326rem + 0.087vw, 1rem)',
  lg: 'clamp(1.30625rem, 1.2823rem + 0.1196vw, 1.375rem)',
  xl: 'clamp(1.425rem, 1.3989rem + 0.1304vw, 1.5rem)',
  xxl: 'clamp(1.6625rem, 1.6321rem + 0.1522vw, 1.75rem)',
  xxxl: 'clamp(2.1rem, 1.85rem + 1.25vw, 3rem)',
})

export const space = stylex.defineVars({
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  xxl: '24px',
  huge: '48px',
})
