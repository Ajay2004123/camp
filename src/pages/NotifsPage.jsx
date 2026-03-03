import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatDistanceToNow } from 'date-fns'

const TYPE_ICON = {
  booking_request:  '📬',
  booking_approved: '✅',
  booking_rejected: '❌',
  item_returned:    '📦',
  return_reminder:  '⏰',
  review_request:   '⭐',
  report:           '🚨',
  default:          '🔔',
}

export default function NotifsPage() {
  const { user } = useAuth()
  const [notifs,  setNotifs]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('notifications')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setNotifs(data || []); setLoading(false) })

    // Mark all read
    supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
  }, [])

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(n => n.map(x => x.id===id ? { ...x, read:true } : x))
  }

  if (loading) return (
    <div className="page">{[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:72, marginBottom:10 }} />)}</div>
  )

  return (
    <div className="page">
      <div className="sec-title" style={{ marginBottom:16 }}>Notifications</div>
      {notifs.length === 0
        ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>No notifications yet</div>
        : notifs.map(n => (
          <div key={n.id} onClick={() => !n.read && markRead(n.id)} style={{
            background: n.read ? 'var(--card)' : 'rgba(240,192,64,.04)',
            border: `1px solid ${n.read ? 'var(--border)' : 'rgba(240,192,64,.22)'}`,
            borderRadius:14, padding:'14px 16px', marginBottom:8,
            display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer',
            transition:'background .15s',
            ...(n.type === 'return_reminder' ? { borderColor:'rgba(248,113,113,.3)', background:'rgba(248,113,113,.04)' } : {}),
          }}>
            <div style={{ width:40, height:40, background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, border:'1px solid var(--border)' }}>
              {TYPE_ICON[n.type] || TYPE_ICON.default}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:3, color: n.type==='return_reminder'?'var(--red)':'var(--text)' }}>{n.title}</div>
              <div style={{ fontSize:13, color:'var(--sub)', lineHeight:1.5 }}>{n.body}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:5 }}>
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </div>
            </div>
            {!n.read && (
              <div style={{ width:8, height:8, background:'var(--key)', borderRadius:'50%', marginTop:6, flexShrink:0 }} />
            )}
          </div>
        ))
      }
    </div>
  )
}
