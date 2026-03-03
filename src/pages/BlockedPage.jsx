import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function BlockedPage() {
  const { user, profile, signOut } = useAuth()
  const [message,  setMessage]  = useState('')
  const [sending,  setSending]  = useState(false)
  const [thread,   setThread]   = useState([])

  useEffect(() => { loadThread() }, [user])

  const loadThread = async () => {
    if (!user) return
    const { data } = await supabase.from('admin_messages')
      .select('*, sender:sender_id(full_name)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: true })
    setThread(data || [])
  }

  const sendMessage = async () => {
    const text = message.trim()
    if (!text) return
    setSending(true)
    // Get admin IDs
    const { data: admins } = await supabase.from('profiles').select('id').eq('role','admin')
    if (!admins?.length) { toast.error('No admins available'); setSending(false); return }

    for (const admin of admins) {
      await supabase.from('admin_messages').insert({
        sender_id:   user.id,
        receiver_id: admin.id,
        content:     text,
        from_admin:  false,
      })
      await supabase.from('notifications').insert({
        user_id: admin.id,
        title:   '📩 Message from Blocked User',
        body:    `${profile?.full_name}: ${text.slice(0,60)}`,
        type:    'admin_message',
      })
    }
    setMessage('')
    toast.success('✅ Message sent to admin')
    loadThread()
    setSending(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 20px' }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        {/* Blocked icon */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:80, marginBottom:16 }}>🚫</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, marginBottom:8, color:'var(--red)' }}>Account Blocked</div>
          <p style={{ fontSize:14, color:'var(--sub)', lineHeight:1.7 }}>
            Your account has been blocked by a CampusKeys admin.<br />
            If you believe this is a mistake, write to admin below.
          </p>
        </div>

        {/* Message to admin */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border2)', borderRadius:20, padding:20, marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>📩 Message Admin</div>

          {/* Thread */}
          {thread.length > 0 && (
            <div style={{ maxHeight:240, overflowY:'auto', marginBottom:14, display:'flex', flexDirection:'column', gap:8 }}>
              {thread.map(msg => {
                const mine = msg.sender_id === user?.id
                return (
                  <div key={msg.id} style={{ display:'flex', justifyContent: mine?'flex-end':'flex-start' }}>
                    <div style={{ maxWidth:'82%', padding:'9px 13px', borderRadius:16, borderBottomRightRadius: mine?3:16, borderBottomLeftRadius: mine?16:3, background: mine?'var(--key)':'var(--card2)', color: mine?'#07080c':'var(--text)', border: mine?'none':'1px solid var(--border)', fontSize:13, lineHeight:1.45 }}>
                      {!mine && <div style={{ fontWeight:700, fontSize:11, marginBottom:3, color:'var(--blue)' }}>🛡️ Admin</div>}
                      {msg.content}
                      <div style={{ fontSize:10, opacity:.6, marginTop:3 }}>{format(new Date(msg.created_at),'h:mm a · d MMM')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <textarea
              className="f-textarea" rows={3}
              placeholder="Explain your situation to admin…"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !message.trim()}>
              {sending ? <span className="spinner" style={{width:20,height:20}} /> : '📩 Send to Admin'}
            </button>
          </div>
        </div>

        <button onClick={signOut} style={{ width:'100%', background:'none', border:'1px solid var(--border)', borderRadius:12, padding:'12px', color:'var(--muted)', fontSize:13, cursor:'pointer' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
