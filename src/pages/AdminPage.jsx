import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatDistanceToNow, format } from 'date-fns'

const REPORT_STATUS = {
  pending:      { badge:'badge-key',    label:'⏳ Pending' },
  under_review: { badge:'badge-blue',   label:'🔍 Reviewing' },
  resolved:     { badge:'badge-green',  label:'✅ Resolved' },
  dismissed:    { badge:'badge-muted',  label:'Dismissed' },
}

/* ── Admin Inbox Chat ─────────────────────────────────────────────────── */
function InboxThread({ thread, adminId, onSent }) {
  const [input,   setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) })

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setInput('')
    const { error } = await supabase.from('admin_messages').insert({
      sender_id:   adminId,
      receiver_id: thread.userId,
      content:     text,
      from_admin:  true,
    })
    if (error) { toast.error(error.message); setInput(text) }
    else {
      await supabase.from('notifications').insert({
        user_id: thread.userId,
        title:   '📩 Message from Admin',
        body:    text.slice(0, 80),
        type:    'admin_message',
      })
      onSent()
    }
    setSending(false)
  }

  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, marginBottom:12, overflow:'hidden' }}>
      {/* Thread header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom:'1px solid var(--border)', background:'var(--card2)' }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--surface)', border:'1.5px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, flexShrink:0 }}>
          {(thread.name||'?').slice(0,2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:14 }}>{thread.name}</div>
          <div style={{ fontSize:11, color:'var(--sub)' }}>{thread.email}</div>
        </div>
        {thread.blocked && <span style={{ marginLeft:'auto', fontSize:11, color:'var(--red)', fontWeight:700 }}>🚫 BLOCKED</span>}
      </div>

      {/* Messages */}
      <div style={{ maxHeight:240, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {thread.messages.map(m => {
          const isAdmin = m.from_admin
          return (
            <div key={m.id} style={{ display:'flex', justifyContent: isAdmin?'flex-end':'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'8px 12px', borderRadius:14,
                borderBottomRightRadius: isAdmin?3:14,
                borderBottomLeftRadius:  isAdmin?14:3,
                background: isAdmin ? 'var(--key)' : 'var(--card2)',
                color:      isAdmin ? '#07080c' : 'var(--text)',
                border:     isAdmin ? 'none' : '1px solid var(--border)',
                fontSize:13, lineHeight:1.4,
              }}>
                {m.content}
                <div style={{ fontSize:9, opacity:.55, marginTop:2, textAlign:'right' }}>
                  {format(new Date(m.created_at), 'h:mm a · d MMM')}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Reply box */}
      <div style={{ display:'flex', gap:8, padding:'10px 14px', borderTop:'1px solid var(--border)', background:'var(--surface)' }}>
        <input className="f-input" style={{ fontSize:13, padding:'8px 14px' }}
          placeholder="Reply to this user…" value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter' && send()} />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={sending||!input.trim()}>
          {sending ? '…' : '➤ Reply'}
        </button>
      </div>
    </div>
  )
}

/* ── Main AdminPage ────────────────────────────────────────────────────── */
export default function AdminPage() {
  const { user, profile } = useAuth()
  const [tab,      setTab]      = useState('overview')
  const [stats,    setStats]    = useState({ listings:0, users:0, reports:0, active_bookings:0, requests:0 })
  const [reports,  setReports]  = useState([])
  const [users,    setUsers]    = useState([])
  const [items,    setItems]    = useState([])
  const [requests, setRequests] = useState([])
  const [messages, setMessages] = useState([])
  const [inboxMsg, setInboxMsg] = useState('')
  const [sending,  setSending]  = useState({})
  const [loadErr,  setLoadErr]  = useState(null)

  // Role guard
  if (profile && profile.role !== 'admin') {
    return (
      <div style={{ minHeight:'60vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ textAlign:'center', color:'var(--muted)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
          <div style={{ fontWeight:800, fontSize:18, marginBottom:8 }}>Admin Access Only</div>
          <p style={{ fontSize:14 }}>You don't have permission to view this page.</p>
        </div>
      </div>
    )
  }

  useEffect(() => {
    loadAll()
    const ch = supabase.channel('admin-rt')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'admin_messages' }, loadMessages)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'reports' }, loadAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const loadAll = async () => {
    try {
      const [ls, us, rs, bs] = await Promise.all([
        supabase.from('items').select('*', { count:'exact', head:true }),
        supabase.from('profiles').select('*', { count:'exact', head:true }),
        supabase.from('reports')
          .select('*, reporter:reporter_id(full_name,email), against:against_id(full_name,email)')
          .order('created_at', { ascending:false }),
        supabase.from('bookings').select('*', { count:'exact', head:true }).in('status',['pending','approved']),
      ])
      const [pu, its] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending:false }).limit(50),
        supabase.from('items').select('*, profiles:owner_id(full_name,email)').order('created_at', { ascending:false }).limit(30),
      ])
      const { data: reqs } = await supabase.from('item_requests')
        .select('*, requester:requester_id(full_name,email)').order('created_at', { ascending:false }).limit(30)

      setStats({
        listings:        ls.count||0,
        users:           us.count||0,
        reports:         (rs.data||[]).filter(r=>r.status==='pending').length,
        active_bookings: bs.count||0,
        requests:        reqs?.length||0,
      })
      setReports(rs.data||[])
      setUsers(pu.data||[])
      setItems(its.data||[])
      setRequests(reqs||[])
      await loadMessages()
    } catch (err) {
      setLoadErr(err.message)
    }
  }

  const loadMessages = async () => {
    const { data } = await supabase.from('admin_messages')
      .select('*, sender:sender_id(full_name,email)')
      .order('created_at')
      .limit(200)
    setMessages(data||[])
  }

  const updateReport = async (id, status) => {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success(`Report ${status}`); loadAll() }
  }

  const blockUser = async (uid, block) => {
    const { error } = await supabase.from('profiles').update({ blocked: block }).eq('id', uid)
    if (error) { toast.error('Block failed: ' + error.message); return }
    await supabase.from('notifications').insert({
      user_id: uid,
      title:   block ? '🚫 Account Blocked' : '✅ Account Unblocked',
      body:    block
        ? 'Your account has been blocked by an admin. You can send a message to appeal.'
        : 'Your account has been unblocked. You can use CampusKeys again.',
      type: block ? 'blocked' : 'unblocked',
    })
    toast.success(block ? '🚫 User blocked' : '✅ User unblocked')
    loadAll()
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this item? This cannot be undone.')) return
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Item removed'); loadAll() }
  }

  const deleteRequest = async (id) => {
    if (!confirm('Delete this request?')) return
    await supabase.from('item_requests').delete().eq('id', id)
    toast.success('Request removed')
    loadAll()
  }

  const sendDirectToUser = async (userId, text) => {
    if (!text?.trim()) return
    setSending(s=>({...s,[userId]:true}))
    await supabase.from('admin_messages').insert({
      sender_id:   user.id,
      receiver_id: userId,
      content:     text.trim(),
      from_admin:  true,
    })
    await supabase.from('notifications').insert({
      user_id: userId,
      title:   '📩 Message from Admin',
      body:    text.slice(0,80),
      type:    'admin_message',
    })
    setSending(s=>({...s,[userId]:false}))
    toast.success('Message sent!')
    loadMessages()
  }

  const TABS = [
    ['overview','📊','Overview'],
    ['reports', '🚨','Reports'],
    ['users',   '👥','Users'],
    ['listings','📦','Listings'],
    ['requests','📢','Requests'],
    ['inbox',   '📩','Inbox'],
  ]

  // Build inbox threads - group all messages by the non-admin user
  const threads = {}
  messages.forEach(m => {
    const isFromUser = !m.from_admin
    const userId = isFromUser ? m.sender_id : m.receiver_id
    if (userId === user?.id) return
    if (!threads[userId]) {
      threads[userId] = {
        userId,
        name:  isFromUser ? m.sender?.full_name : users.find(u=>u.id===userId)?.full_name,
        email: isFromUser ? m.sender?.email    : users.find(u=>u.id===userId)?.email,
        blocked: users.find(u=>u.id===userId)?.blocked,
        messages: [],
      }
    }
    threads[userId].messages.push(m)
  })
  const inboxThreads = Object.values(threads)
  const unreadCount  = messages.filter(m => !m.from_admin).length

  return (
    <div className="page">
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,rgba(240,192,64,.06),var(--card))', border:'1px solid rgba(240,192,64,.25)', borderRadius:20, padding:20, marginBottom:20 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:3 }}>🛡️ Admin Dashboard</div>
        <div style={{ fontSize:13, color:'var(--sub)' }}>CampusKeys Control Panel · {profile?.full_name}</div>
        {loadErr && <div style={{ marginTop:10, fontSize:12, color:'var(--red)', background:'rgba(248,113,113,.1)', padding:'8px 12px', borderRadius:8 }}>⚠️ {loadErr}</div>}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:20, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
        {TABS.map(([k,ic,lb])=>(
          <div key={k} onClick={()=>setTab(k)}
            style={{ flexShrink:0, padding:'9px 14px', borderRadius:12, fontSize:11, fontWeight:700, cursor:'pointer', transition:'all .2s',
              background: tab===k?'var(--card2)':'var(--card)',
              color:      tab===k?'var(--key)':'var(--muted)',
              border:     `1px solid ${tab===k?'var(--border2)':'var(--border)'}`,
              textTransform:'uppercase', letterSpacing:'.04em',
              display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:15 }}>{ic}</span>{lb}
            {k==='inbox' && unreadCount > 0 && (
              <span style={{ background:'var(--red)', color:'#fff', fontSize:9, borderRadius:100, padding:'1px 5px', minWidth:16, textAlign:'center' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            {k==='reports' && stats.reports > 0 && (
              <span style={{ background:'var(--red)', color:'#fff', fontSize:9, borderRadius:100, padding:'1px 5px', minWidth:16, textAlign:'center' }}>
                {stats.reports}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
            {[
              { n:stats.listings,        l:'Total Listings',  c:'var(--key)',    i:'📦' },
              { n:stats.users,           l:'Students',        c:'var(--green)',  i:'👥' },
              { n:stats.reports,         l:'Pending Reports', c:'var(--red)',    i:'🚨' },
              { n:stats.active_bookings, l:'Active Bookings', c:'var(--blue)',   i:'✅' },
              { n:stats.requests,        l:'Item Requests',   c:'var(--purple)', i:'📢' },
              { n:users.filter(u=>u.blocked).length, l:'Blocked Users', c:'var(--red)', i:'🚫' },
            ].map(({n,l,c,i})=>(
              <div key={l} className="card-flat" style={{ padding:16 }}>
                <div style={{ fontSize:26, marginBottom:4 }}>{i}</div>
                <div style={{ fontSize:26, fontWeight:800, color:c, marginBottom:2 }}>{n}</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>{l}</div>
              </div>
            ))}
          </div>
          <div className="box-info">
            <span>ℹ️</span>
            <span>Return reminders are sent via Gmail 5 hours before each booking's return deadline. Block/unblock users from the Users tab.</span>
          </div>
        </>
      )}

      {/* ── REPORTS ── */}
      {tab === 'reports' && (
        <>
          <div className="sec-title">{reports.length} Reports · {stats.reports} Pending</div>
          {reports.length === 0
            ? <div style={{ textAlign:'center', padding:'48px 0', color:'var(--muted)' }}>No reports yet</div>
            : reports.map(r => {
              const s = REPORT_STATUS[r.status] || REPORT_STATUS.pending
              return (
                <div key={r.id} className="card-flat" style={{ padding:16, marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, marginBottom:2 }}>{r.reason?.replace(/_/g,' ')}</div>
                      <div style={{ fontSize:12, color:'var(--muted)' }}>By: {r.reporter?.full_name || r.reporter?.email}</div>
                      {r.against && <div style={{ fontSize:12, color:'var(--red)' }}>Against: {r.against?.full_name || r.against?.email}</div>}
                    </div>
                    <span className={`badge ${s.badge}`}>{s.label}</span>
                  </div>
                  <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.5, marginBottom:8 }}>{r.description}</p>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix:true })}
                  </div>
                  {r.status === 'pending' && (
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button className="btn btn-red btn-sm" onClick={()=>{ updateReport(r.id,'resolved'); r.against_id && blockUser(r.against_id,true) }}>🚫 Block &amp; Resolve</button>
                      <button className="btn btn-outline btn-sm" onClick={()=>updateReport(r.id,'under_review')}>🔍 Review</button>
                      <button className="btn btn-outline btn-sm" onClick={()=>updateReport(r.id,'dismissed')}>Dismiss</button>
                    </div>
                  )}
                </div>
              )
            })
          }
        </>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && (
        <>
          <div className="sec-title">{users.length} Students · {users.filter(u=>u.blocked).length} Blocked</div>
          {users.map(u => {
            const [msgVal, setMsgVal] = [inboxMsg, setInboxMsg]
            return (
              <div key={u.id} className="card-flat" style={{ padding:'12px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div className="avatar" style={{ width:42, height:42, fontSize:14, opacity:u.blocked?0.5:1, flexShrink:0 }}>
                    {(u.full_name||'?').slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>
                      {u.full_name}
                      {u.verified && <span style={{ color:'var(--key)', marginLeft:4 }}>✓</span>}
                      {u.role === 'admin' && <span style={{ color:'var(--purple)', fontSize:11, marginLeft:6 }}>🛡️ ADMIN</span>}
                      {u.blocked && <span style={{ color:'var(--red)', fontSize:11, marginLeft:6 }}>🚫 BLOCKED</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {u.email} · ⭐{Number(u.avg_rating||0).toFixed(1)} · {u.total_rentals||0} rentals
                    </div>
                  </div>
                  {u.role !== 'admin' && (
                    <button
                      className={`btn btn-sm ${u.blocked?'btn-green':'btn-red'}`}
                      onClick={()=>blockUser(u.id,!u.blocked)}
                      style={{ flexShrink:0 }}>
                      {u.blocked ? '✅ Unblock' : '🚫 Block'}
                    </button>
                  )}
                </div>
                {/* Quick message */}
                {u.role !== 'admin' && (
                  <UserMsgBox userId={u.id} adminId={user.id} userName={u.full_name} onSent={loadMessages} />
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ── LISTINGS ── */}
      {tab === 'listings' && (
        <>
          <div className="sec-title">{items.length} Listings</div>
          {items.map(item=>(
            <div key={item.id} className="card-flat" style={{ padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:26, width:40, height:40, background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{item.emoji||'📦'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize:11, color:'var(--sub)' }}>
                  {item.profiles?.full_name} · ₹{item.rent_per_day}/day ·
                  <span style={{ color: item.status==='available'?'var(--green)':'var(--red)', marginLeft:4 }}>{item.status}</span>
                </div>
              </div>
              <button className="btn btn-red btn-sm" onClick={()=>deleteItem(item.id)}>🗑️</button>
            </div>
          ))}
        </>
      )}

      {/* ── REQUESTS ── */}
      {tab === 'requests' && (
        <>
          <div className="sec-title">{requests.length} Item Requests · {requests.filter(r=>r.status==='open').length} Open</div>
          {requests.length === 0
            ? <div style={{ textAlign:'center', padding:'48px 0', color:'var(--muted)' }}>No requests yet</div>
            : requests.map(req=>(
              <div key={req.id} className="card-flat" style={{ padding:'12px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>{req.title}</div>
                    <div style={{ fontSize:11, color:'var(--sub)' }}>
                      By: {req.requester?.full_name} · {req.category} · ₹{req.max_budget||0}/day max
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                    <span className={`badge ${req.status==='open'?'badge-green':req.status==='fulfilled'?'badge-purple':'badge-muted'}`}>
                      {req.status}
                    </span>
                    <button className="btn btn-red btn-sm" onClick={()=>deleteRequest(req.id)}>🗑️</button>
                  </div>
                </div>
                {req.description && <p style={{ fontSize:12, color:'var(--sub)', lineHeight:1.4 }}>{req.description}</p>}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  {req.offer_count||0} offers · {formatDistanceToNow(new Date(req.created_at), { addSuffix:true })}
                </div>
              </div>
            ))
          }
        </>
      )}

      {/* ── INBOX ── */}
      {tab === 'inbox' && (
        <>
          <div className="sec-title">Messages from Users ({inboxThreads.length} conversations)</div>
          {inboxThreads.length === 0
            ? <div style={{ textAlign:'center', padding:'48px 0', color:'var(--muted)' }}>No messages yet</div>
            : inboxThreads.map(thread => (
              <InboxThread key={thread.userId} thread={thread} adminId={user.id} onSent={loadMessages} />
            ))
          }
        </>
      )}
    </div>
  )
}

/* ── Per-user message box in Users tab ───────────────────────────────── */
function UserMsgBox({ userId, adminId, userName, onSent }) {
  const [val,     setVal]     = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    const text = val.trim()
    if (!text) return
    setSending(true)
    setVal('')
    await supabase.from('admin_messages').insert({
      sender_id:   adminId,
      receiver_id: userId,
      content:     text,
      from_admin:  true,
    })
    await supabase.from('notifications').insert({
      user_id: userId,
      title:   '📩 Message from Admin',
      body:    text.slice(0,80),
      type:    'admin_message',
    })
    toast.success(`Message sent to ${userName?.split(' ')[0]}`)
    onSent()
    setSending(false)
  }

  return (
    <div style={{ display:'flex', gap:8, marginTop:10 }}>
      <input className="f-input" style={{ fontSize:12, padding:'7px 12px' }}
        placeholder={`Send message to ${userName?.split(' ')[0]}…`}
        value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>e.key==='Enter' && send()} />
      <button className="btn btn-outline btn-sm" onClick={send} disabled={sending||!val.trim()}>
        {sending ? '…' : '📩'}
      </button>
    </div>
  )
}
