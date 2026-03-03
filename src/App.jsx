import { Routes, Route, Navigate, useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useEffect, useState, createContext, useContext } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'

import AuthPage      from './pages/AuthPage'
import BrowsePage    from './pages/BrowsePage'
import BookingsPage  from './pages/BookingsPage'
import AddItemPage   from './pages/AddItemPage'
import ChatPage      from './pages/ChatPage'
import NotifsPage    from './pages/NotifsPage'
import ProfilePage   from './pages/ProfilePage'
import AdminPage     from './pages/AdminPage'
import RequestsPage  from './pages/RequestsPage'
import BlockedPage   from './pages/BlockedPage'

/* ── Desktop Mode Context ────────────────────────────────────────────────── */
export const DesktopCtx = createContext({ desktop: false, setDesktop: () => {} })
export const useDesktop = () => useContext(DesktopCtx)

/* ── Shell with header + bottom nav ─────────────────────────────────────── */
function Shell() {
  const { user, profile, signOut } = useAuth()
  const { desktop } = useDesktop()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [unread, setUnread]     = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [recentNotifs, setRecentNotifs] = useState([])

  const isChat = location.pathname.startsWith('/chat')

  useEffect(() => {
    if (!user) return
    const fetchCount = async () => {
      const { count } = await supabase.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('read', false)
      setUnread(count || 0)
    }
    fetchCount()
    const ch = supabase.channel('notif-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnread(n => n + 1))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user])

  const loadRecentNotifs = async () => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending:false }).limit(5)
    setRecentNotifs(data || [])
  }

  const nav = [
    { path:'/',            icon:'🏠', label:'Browse'   },
    { path:'/requests',    icon:'📢', label:'Requests'  },
    { path:'/bookings',    icon:'📦', label:'Bookings'  },
    { path:'/add',         icon:'➕', label:'List'      },
    { path:'/profile',     icon:'👤', label:'Profile'   },
  ]

  const initials = (name) => name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'

  /* ── Desktop Layout ── */
  if (desktop && !isChat) {
    return (
      <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
        <aside style={{ width:240, flexShrink:0, background:'var(--card)', borderRight:'1px solid var(--border)', position:'fixed', top:0, bottom:0, left:0, display:'flex', flexDirection:'column', zIndex:200 }}>
          <div style={{ padding:'22px 20px', borderBottom:'1px solid var(--border)' }}>
            <div onClick={() => navigate('/')} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:22 }}>Campus<span style={{ color:'var(--key)' }}>Keys</span></span>
              <span style={{ fontSize:20 }}>🔑</span>
            </div>
          </div>
          <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:4 }}>
            {nav.map(({ path, icon, label }) => {
              const active = location.pathname === path
              return (
                <div key={path} onClick={() => navigate(path)} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:12, cursor:'pointer', background: active?'rgba(240,192,64,.12)':'transparent', color: active?'var(--key)':'var(--sub)', fontWeight: active?700:500, fontSize:14, transition:'all .15s' }}>
                  <span style={{ fontSize:18 }}>{icon}</span>{label}
                </div>
              )
            })}
            <div onClick={() => navigate('/notifs')} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:12, cursor:'pointer', color:'var(--sub)', fontWeight:500, fontSize:14, position:'relative' }}>
              <span style={{ fontSize:18 }}>🔔</span>Alerts
              {unread > 0 && <span style={{ marginLeft:'auto', background:'var(--red)', color:'#fff', fontSize:10, fontWeight:800, borderRadius:100, padding:'2px 7px' }}>{unread > 9?'9+':unread}</span>}
            </div>
            {profile?.role === 'admin' && (
              <div onClick={() => navigate('/admin')} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderRadius:12, cursor:'pointer', color:'var(--key)', fontWeight:600, fontSize:14 }}>
                <span style={{ fontSize:18 }}>🛡️</span>Admin
              </div>
            )}
          </nav>
          <div style={{ padding:'16px 14px', borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--key)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#07080c', flexShrink:0 }}>
                {initials(profile?.full_name || '')}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.full_name || 'Student'}</div>
                <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
              </div>
            </div>
          </div>
        </aside>
        <div style={{ marginLeft:240, flex:1, display:'flex', flexDirection:'column' }}>
          <header style={{ position:'sticky', top:0, zIndex:100, background:'rgba(7,8,12,.9)', backdropFilter:'blur(24px)', padding:'14px 28px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--sub)' }}>
              {[...nav, {path:'/notifs',label:'Alerts'},{path:'/admin',label:'Admin'}].find(n => n.path === location.pathname)?.label || 'CampusKeys'}
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ position:'relative' }}>
                <button onClick={() => { setNotifOpen(o=>!o); loadRecentNotifs() }} style={{ width:38, height:38, borderRadius:10, background:'var(--card)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:17, position:'relative' }}>
                  🔔
                  {unread > 0 && <span style={{ position:'absolute', top:6, right:6, width:8, height:8, background:'var(--red)', borderRadius:'50%', border:'1.5px solid var(--bg)' }} />}
                </button>
                {notifOpen && (
                  <div style={{ position:'absolute', top:46, right:0, width:300, background:'var(--card2)', border:'1px solid var(--border2)', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,.4)', zIndex:300, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:14 }}>Notifications</div>
                    {recentNotifs.length === 0
                      ? <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No notifications</div>
                      : recentNotifs.map(n => (
                        <div key={n.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                          <div style={{ fontWeight:600 }}>{n.title}</div>
                          <div style={{ color:'var(--sub)', fontSize:12, marginTop:2 }}>{n.body}</div>
                        </div>
                      ))
                    }
                    <div onClick={() => { navigate('/notifs'); setNotifOpen(false) }} style={{ padding:'10px 16px', textAlign:'center', fontSize:13, color:'var(--key)', cursor:'pointer', fontWeight:600 }}>View all →</div>
                  </div>
                )}
              </div>
              <div onClick={() => navigate('/profile')} style={{ width:38, height:38, borderRadius:10, background:'var(--key)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#07080c', cursor:'pointer' }}>
                {initials(profile?.full_name || '')}
              </div>
            </div>
          </header>
          <main style={{ flex:1, padding:'28px', maxWidth:1200 }}>
            <Outlet />
          </main>
        </div>
      </div>
    )
  }

  /* ── Mobile Layout ── */
  return (
    <div className="app-shell">
      {!isChat && (
        <header style={{ position:'sticky', top:0, zIndex:200, background:'rgba(7,8,12,.9)', backdropFilter:'blur(24px)', padding:'13px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
          <div onClick={() => navigate('/')} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:20, letterSpacing:'-.5px' }}>
              Campus<span style={{ color:'var(--key)' }}>Keys</span>
            </span>
            <span style={{ fontSize:18 }}>🔑</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => navigate('/notifs')} style={{ width:38, height:38, borderRadius:10, background:'var(--card)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:17, position:'relative' }}>
              🔔
              {unread > 0 && (
                <>
                  <span style={{ position:'absolute', top:6, right:6, width:8, height:8, background:'var(--red)', borderRadius:'50%', border:'1.5px solid var(--bg)' }} />
                  <span style={{ position:'absolute', top:6, right:6, width:8, height:8, background:'var(--red)', borderRadius:'50%', animation:'ping 1.5s infinite' }} />
                </>
              )}
            </button>
            {profile?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} style={{ width:38, height:38, borderRadius:10, background:'rgba(240,192,64,.1)', border:'1px solid rgba(240,192,64,.25)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:17 }}>🛡️</button>
            )}
          </div>
        </header>
      )}
      <main style={{ paddingBottom: isChat ? 0 : 80 }}>
        <Outlet />
      </main>
      {!isChat && (
        <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'rgba(14,16,24,.96)', backdropFilter:'blur(24px)', borderTop:'1px solid var(--border)', display:'flex', zIndex:200, padding:'4px 0 8px' }}>
          {nav.map(({ path, icon, label }) => {
            const active = location.pathname === path
            return (
              <div key={path} onClick={() => navigate(path)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'8px 4px 5px', cursor:'pointer', gap:3, fontSize:10, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase', color: active?'var(--key)':'var(--muted)', transition:'color .15s' }}>
                <span style={{ fontSize:20, transform: active?'scale(1.15)':'scale(1)', transition:'transform .15s' }}>{icon}</span>
                {label}
              </div>
            )
          })}
        </nav>
      )}
    </div>
  )
}

/* ── Blocked Guard ───────────────────────────────────────────────────────── */
function BlockedGuard({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (profile?.blocked) return <BlockedPage />
  return children
}

/* ── Private Guard ───────────────────────────────────────────────────────── */
function Private({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div className="spinner" style={{ width:32, height:32 }} />
    </div>
  )
  if (!user) return <Navigate to="/auth" replace />
  if (profile?.blocked) return <BlockedScreen />
  return children
}

/* ── Floating View Switcher ──────────────────────────────────────────────── */
function ViewSwitcher() {
  const { desktop, setDesktop } = useDesktop()
  const location = useLocation()
  const { profile } = useAuth()
  if (location.pathname === '/auth' || profile?.blocked) return null
  return (
    <div style={{ position:'fixed', bottom: desktop?20:90, right:16, zIndex:9998, background:'var(--card2)', border:'1px solid var(--border2)', borderRadius:100, padding:'7px 14px', display:'flex', gap:4, boxShadow:'0 4px 20px rgba(0,0,0,.4)', cursor:'pointer' }}
      onClick={() => setDesktop(d => !d)}>
      <span style={{ fontSize:12, fontWeight:700, color: !desktop?'var(--key)':'var(--muted)', padding:'2px 7px', borderRadius:100, background: !desktop?'rgba(240,192,64,.12)':'transparent', transition:'all .2s' }}>📱 Mobile</span>
      <span style={{ fontSize:12, fontWeight:700, color: desktop?'var(--key)':'var(--muted)', padding:'2px 7px', borderRadius:100, background: desktop?'rgba(240,192,64,.12)':'transparent', transition:'all .2s' }}>🖥️ Desktop</span>
    </div>
  )
}

/* ── Root ─────────────────────────────────────────────────────────────────── */
export default function App() {
  const [desktop, setDesktop] = useState(false)
  return (
    <DesktopCtx.Provider value={{ desktop, setDesktop }}>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </DesktopCtx.Provider>
  )
}

function AppInner() {
  const location = useLocation()
  return (
    <>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<Private><BlockedGuard><Shell /></BlockedGuard></Private>}>
          <Route index              element={<BrowsePage />} />
          <Route path="requests"    element={<RequestsPage />} />
          <Route path="bookings"    element={<BookingsPage />} />
          <Route path="add"         element={<AddItemPage />} />
          <Route path="requests"    element={<RequestsPage />} />
          <Route path="chat/:bookingId" element={<ChatPage />} />
          <Route path="notifs"      element={<NotifsPage />} />
          <Route path="profile"     element={<ProfilePage />} />
          <Route path="admin"       element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ViewSwitcherWrapper />
    </>
  )
}

function ViewSwitcherWrapper() {
  return <ViewSwitcher />
}
