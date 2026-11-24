import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlaybackProvider } from '@/lib/playback'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delay={250}>
      <PlaybackProvider>
        <App />
      </PlaybackProvider>
    </TooltipProvider>
  </StrictMode>,
)
