import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RegistryProvider } from '@effect/atom-react'

import { App } from './app'

const container = document.getElementById('root')

if (container === null) {
  throw new Error('Missing #root container')
}

createRoot(container).render(
  <RegistryProvider>
    <StrictMode>
      <App />
    </StrictMode>
  </RegistryProvider>,
)
