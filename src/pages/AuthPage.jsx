import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'

export default function AuthPage() {
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user])

  const handleGoogle = async () => {
    const { error } = await signInWithGoogle()
    if (error) toast.error(error.message)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', padding: '32px 24px',
      background: 'radial-gradient(ellipse at 20% 40%, rgba(240,192,64,.09) 0%, transparent 55%), radial-gradient(ellipse at 85% 75%, rgba(96,165,250,.06) 0%, transparent 55%), var(--bg)',
    }}>
      {/* Badge */}
      <div className="fade-up" style={{ marginBottom: 40 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(240,192,64,.1)', border:'1px solid rgba(240,192,64,.2)', borderRadius:100, padding:'5px 14px', fontSize:12, color:'var(--key)', fontWeight:700, marginBottom:22 }}>
          🔑 College Item Sharing Platform
        </div>

        {/* Logo */}
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:48, fontWeight:800, lineHeight:1, letterSpacing:'-2px', marginBottom:12 }}>
          Campus<span style={{ color:'var(--key)' }}>Keys</span>
        </div>
        <p style={{ color:'var(--sub)', fontSize:16, lineHeight:1.7, maxWidth:320 }}>
          Borrow &amp; lend items within your college community — safely, fairly, and smartly.
        </p>
      </div>

      {/* Feature list */}
      <div className="fade-up-2" style={{ marginBottom:40 }}>
        {[
          ['📦','List items with rent & fine rules'],
          ['📅','Set availability dates'],
          ['✅','Approve bookings & chat'],
          ['⏰','Auto email return reminders'],
          ['⭐','Rate after every rental'],
          ['🛡️','Admin fraud protection'],
        ].map(([ic, txt]) => (
          <div key={txt} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--card)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{ic}</div>
            <span style={{ fontSize:14, color:'var(--sub)' }}>{txt}</span>
          </div>
        ))}
      </div>

      {/* Google Sign In */}
      <div className="fade-up-3">
        <button onClick={handleGoogle} style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:12,
          background:'#fff', color:'#1f1f1f',
          fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:700, fontSize:15,
          padding:'15px 20px', border:'none', borderRadius:13,
          cursor:'pointer', transition:'opacity .15s, transform .15s',
          boxShadow:'0 4px 24px rgba(0,0,0,.3)',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {/* Google G logo */}
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.2 0 5.9 1.1 8.1 2.9l6-6C34.5 3.3 29.6 1 24 1 14.8 1 7 6.6 3.7 14.4l7 5.4C12.4 13.5 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-16.9z"/>
            <path fill="#FBBC05" d="M10.7 28.2A14.8 14.8 0 0 1 9.5 24c0-1.5.3-2.9.7-4.2l-7-5.4A23.9 23.9 0 0 0 .5 24c0 3.9.9 7.5 2.7 10.7l7.5-6.5z"/>
            <path fill="#34A853" d="M24 47c5.8 0 10.7-1.9 14.3-5.2l-7.4-5.7c-2 1.3-4.4 2.1-6.9 2.1-6.3 0-11.6-4-13.5-9.5l-7.5 6.5C7 41.4 15 47 24 47z"/>
          </svg>
          Continue with Google (Gmail)
        </button>

        <p style={{ textAlign:'center', fontSize:13, color:'var(--muted)', marginTop:18, lineHeight:1.65 }}>
          Only <strong style={{ color:'var(--sub)' }}>verified Gmail accounts</strong> are accepted.<br/>
          Your Google identity confirms you're a real student.
        </p>
      </div>

      {/* Stats */}
      <div className="fade-up-3" style={{ display:'flex', justifyContent:'space-around', marginTop:40, paddingTop:28, borderTop:'1px solid var(--border)' }}>
        {[['142','Listings'],['389','Students'],['96%','On-time'],['₹0','Fees']].map(([n,l]) => (
          <div key={l} style={{ textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'var(--key)' }}>{n}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
