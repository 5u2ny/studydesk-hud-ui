import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/notes.css'
import { installMockAPI } from '@shared/mockAPI'

if (!(window as any).electron) installMockAPI()

createRoot(document.getElementById('root')!).render(<App />)
