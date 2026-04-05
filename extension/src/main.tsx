import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const mount = document.getElementById('root') || document.createElement('div')
if (!mount.parentElement) document.body.appendChild(mount)

createRoot(mount).render(<App />)
