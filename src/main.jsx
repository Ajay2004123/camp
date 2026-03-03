import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        gutter={12}
        toastOptions={{
          duration: 3500,
          style: {
            background: '#1e2235',
            color: '#eef0f6',
            border: '1px solid #2f3550',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '14px',
            fontWeight: '600',
            borderRadius: '12px',
            padding: '12px 18px',
          },
          success: { iconTheme: { primary: '#34d399', secondary: '#07080c' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#07080c' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
