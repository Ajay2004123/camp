import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { sendEmail, EMAIL } from '../lib/email'
import { useAuth } from '../hooks/useAuth'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'

const fmt  = d => format(parseISO(d), 'd MMM')
const CATS = ['All','Electronics','Books','Accessories','Art','Sports','Misc']

function ItemCard({ item, onBook, currentUserId }) {
  const isOwner = item.owner_id === currentUserId

  return (
    <div className="card" style={{ padding:16, marginBottom:12, cursor: isOwner ? 'default' : 'pointer' }}
      onClick={() => !isOwner && onBook(item)}>
      <div style={{ display:'flex', gap:14, marginBottom:14 }}>
        <div style={{ width:72, height:72, background:'var(--surface)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:34, flexShrink:0, border:'1px solid var(--border)', overflow:'hidden' }}>
          {item.photo_url
            ? <img src={item.photo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : (item.emoji || '📦')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.title}</div>
          <div style={{ fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            {item.profiles?.full_name}
            {item.profiles?.verified && <span style={{ background:'linear-gradient(135deg,var(--key),var(--green))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', fontWeight:800, fontSize:13 }}>✓ Verified</span>}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
            <span className="badge badge-key">₹{item.rent_per_day}/day</span>
            {isOwner
              ? <span className="badge" style={{ background:'rgba(167,139,250,.15)', color:'var(--purple)', border:'1px solid rgba(167,139,250,.3)' }}>👤 Your Item</span>
              : <span className="badge badge-red">⚠ ₹{item.fine_per_day}/day late</span>
            }
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:5 }}>🏆 {item.profiles?.total_rentals || 0} rentals</div>
        </div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
        <span className="badge badge-muted">📅 {fmt(item.avail_from)} → {fmt(item.avail_to)}</span>
        <span className="badge badge-muted">📍 {item.pickup_location}</span>
      </div>

      {isOwner && (
        <div style={{ background:'rgba(96,165,250,.08)', border:'1px solid rgba(96,165,250,.2)', borderRadius:10, padding:'8px 12px', marginBottom:10, fontSize:12, color:'var(--blue)' }}>
          ℹ️ You cannot borrow your own item
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:12, borderTop:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:12, color:'var(--sub)' }}>⭐ {Number(item.avg_rating||0).toFixed(1)} ({item.review_count||0})</span>
          <span className={`badge ${item.status==='available'?'badge-green':'badge-red'}`}>{item.status==='available'?'● Available':'● Rented'}</span>
        </div>
        {isOwner
          ? <span className="badge" style={{ background:'rgba(167,139,250,.15)', color:'var(--purple)', border:'1px solid rgba(167,139,250,.3)', fontWeight:700 }}>👤 Your Listing</span>
          : item.status === 'available'
            ? <button className="btn btn-primary btn-sm" onClick={e=>{e.stopPropagation();onBook(item)}}>Request →</button>
            : <span className="badge badge-muted">Unavailable</span>
        }
      </div>
    </div>
  )
}

/* ── Home Chat Section ───────────────────────────────────────────────────── */
function HomeChatSection() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [msgNotif, setMsgNotif] = useState(null)
  const endRef = useRef(null)
  const notifTimer = useRef(null)

  const initials = (name) => name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'

  useEffect(() => {
    if (!user) return
    loadConversations()
    // Subscribe to new messages for notifications
    const ch = supabase.channel('home-chat-notif')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' },
        async payload => {
          const msg = payload.new
          if (msg.sender_id === user.id) return
          // Get sender name
          const { data: sender } = await supabase.from('profiles').select('full_name').eq('id', msg.sender_id).single()
          const name = sender?.full_name || 'Someone'
          showNotification(name, msg.content, msg.booking_id)
          loadConversations()
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  const showNotification = (sender, text, bookingId) => {
    setMsgNotif({ sender, text, bookingId })
    clearTimeout(notifTimer.current)
    notifTimer.current = setTimeout(() => setMsgNotif(null), 5000)
  }

  const loadConversations = async () => {
    const { data } = await supabase.from('bookings')
      .select('id, items(title, emoji), borrower:borrower_id(id, full_name), owner:owner_id(id, full_name), status')
      .or(`borrower_id.eq.${user.id},owner_id.eq.${user.id}`)
      .in('status', ['pending','approved','returned'])
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setConversations(data)
  }

  const loadMessages = async (bookingId) => {
    const { data } = await supabase.from('messages').select('*').eq('booking_id', bookingId).order('created_at')
    setMessages(data || [])
    await supabase.from('messages').update({ read:true }).eq('booking_id', bookingId).neq('sender_id', user.id)
  }

  const channelRef = useRef(null)

  const openConv = (conv) => {
    setActiveConv(conv)
    loadMessages(conv.id)
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const ch = supabase.channel(`home-chat-${conv.id}-${Date.now()}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`booking_id=eq.${conv.id}` },
        payload => {
          setMessages(prev => prev.find(m=>m.id===payload.new.id) ? prev : [...prev, payload.new])
        })
      .subscribe()
    channelRef.current = ch
  }

  const send = async () => {
    if (!input.trim() || !activeConv) return
    const text = input.trim()
    setInput('')
    const { data, error } = await supabase.from('messages').insert({
      booking_id: activeConv.id,
      sender_id:  user.id,
      content:    text,
      type:       'text',
    }).select().single()
    if (error) {
      toast.error('Send failed: ' + (error.message || 'Unknown error'))
      setInput(text)
      return
    }
    if (data) setMessages(prev => prev.find(m=>m.id===data.id) ? prev : [...prev, data])
  }

  const getOther = (conv) => conv.borrower?.id === user.id ? conv.owner : conv.borrower

  return (
    <div style={{ marginBottom:24 }}>
      <div className="sec-title" style={{ marginBottom:12 }}>💬 Messages</div>

      {/* Message notification toast */}
      {msgNotif && (
        <div onClick={() => { setMsgNotif(null); const c = conversations.find(x=>x.id===msgNotif.bookingId); if(c) openConv(c) }}
          style={{ position:'fixed', bottom:100, right:16, zIndex:9999, background:'var(--card2)', border:'1px solid var(--border2)', borderRadius:16, padding:'12px 16px', boxShadow:'0 8px 32px rgba(0,0,0,.5)', cursor:'pointer', maxWidth:280, animation:'fadeUp .3s ease' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--key)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, color:'#07080c', flexShrink:0 }}>
              {initials(msgNotif.sender)}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:13 }}>{msgNotif.sender}</div>
              <div style={{ fontSize:12, color:'var(--sub)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:190 }}>{msgNotif.text}</div>
            </div>
            <button onClick={e=>{e.stopPropagation();setMsgNotif(null)}} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16, marginLeft:'auto' }}>×</button>
          </div>
        </div>
      )}

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, overflow:'hidden' }}>
        {/* Conversation list */}
        <div style={{ display:'flex', overflowX:'auto', gap:12, padding:'14px 14px 10px', borderBottom:'1px solid var(--border)', scrollbarWidth:'none' }}>
          {conversations.length === 0 ? (
            <div style={{ fontSize:13, color:'var(--muted)', padding:'4px 0' }}>No active conversations yet</div>
          ) : conversations.map(conv => {
            const other = getOther(conv)
            const isActive = activeConv?.id === conv.id
            return (
              <div key={conv.id} onClick={() => openConv(conv)}
                style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background: isActive ? 'var(--key)' : 'var(--surface)', border: isActive ? '2.5px solid var(--key)' : '2px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color: isActive ? '#07080c' : 'var(--text)', transition:'all .15s', position:'relative' }}>
                  {initials(other?.full_name || '')}
                  <div style={{ position:'absolute', bottom:1, right:1, width:10, height:10, borderRadius:'50%', background:'var(--green)', border:'2px solid var(--card)' }} />
                </div>
                <div style={{ fontSize:10, color: isActive ? 'var(--key)' : 'var(--sub)', fontWeight:isActive?700:500, maxWidth:52, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'center' }}>
                  {other?.full_name?.split(' ')[0] || '?'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Chat window */}
        {activeConv ? (
          <>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{getOther(activeConv)?.full_name}</div>
              <span className="badge badge-muted" style={{ fontSize:10 }}>📦 {activeConv.items?.title || 'Item'}</span>
            </div>
            <div style={{ height:220, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
              {messages.length === 0
                ? <div style={{ textAlign:'center', color:'var(--muted)', padding:'30px 0', fontSize:13 }}>👋 Start the conversation</div>
                : messages.map(msg => {
                    const mine = msg.sender_id === user.id
                    return (
                      <div key={msg.id} style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth:'78%', padding:'9px 13px', borderRadius:16, borderBottomRightRadius: mine?4:16, borderBottomLeftRadius: mine?16:4, background: mine ? 'var(--key)' : 'var(--card2)', color: mine ? '#07080c' : 'var(--text)', border: mine ? 'none' : '1px solid var(--border)', fontSize:13, lineHeight:1.5 }}>
                          {msg.content}
                        </div>
                      </div>
                    )
                  })
              }
              <div ref={endRef} />
            </div>
            <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
              <input className="f-input" style={{ borderRadius:22, padding:'9px 14px', fontSize:13 }} placeholder="Type a message…"
                value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()} />
              <button onClick={send} disabled={!input.trim()} style={{ width:40, height:40, borderRadius:'50%', background:'var(--key)', border:'none', cursor:'pointer', fontSize:16, opacity:!input.trim()?0.4:1, flexShrink:0 }}>➤</button>
            </div>
          </>
        ) : (
          <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
            Select a conversation above to start chatting
          </div>
        )}
      </div>
    </div>
  )
}

function BookModal({ item, onClose }) {
  const { user, profile } = useAuth()
  // Hard block: owner cannot book their own item
  if (item.owner_id === user?.id) return null
  const today = new Date().toISOString().slice(0,10)
  const [from,    setFrom]    = useState(item.avail_from > today ? item.avail_from : today)
  const [to,      setTo]      = useState(item.avail_to)
  const [loading, setLoading] = useState(false)

  const days  = Math.max(1, differenceInCalendarDays(parseISO(to), parseISO(from)) + 1)
  const total = days * item.rent_per_day

  const confirm = async () => {
    setLoading(true)
    try {
      const { data: booking, error } = await supabase.from('bookings').insert({
        item_id:         item.id,
        borrower_id:     user.id,
        owner_id:        item.owner_id,
        from_date:       from,
        to_date:         to,
        rent_per_day:    item.rent_per_day,
        fine_per_day:    item.fine_per_day,
        total_rent:      total,
        status:          'pending',
        pickup_location: item.pickup_location,
      }).select().single()

      if (error) throw error

      // Notify owner in-app
      await supabase.from('notifications').insert({
        user_id: item.owner_id,
        title:   '📬 New Booking Request',
        body:    `${profile?.full_name} wants to borrow "${item.title}" (${fmt(from)} → ${fmt(to)})`,
        type:    'booking_request',
        meta:    { booking_id: booking.id },
      })

      // Email borrower
      await sendEmail(EMAIL.BOOKING_CONFIRMED, user.email, {
        borrower_name:  profile?.full_name,
        owner_name:     item.profiles?.full_name,
        item_title:     item.title,
        from_date:      fmt(from),
        to_date:        fmt(to),
        total_rent:     total,
        fine_per_day:   item.fine_per_day,
        pickup_location: item.pickup_location,
      })

      // Email owner
      await sendEmail(EMAIL.OWNER_NEW_REQUEST, item.profiles?.email || '', {
        owner_name:    item.profiles?.full_name,
        borrower_name: profile?.full_name,
        item_title:    item.title,
        from_date:     fmt(from),
        to_date:       fmt(to),
        total_rent:    total,
      })

      toast.success('📦 Booking requested! Check your Gmail for confirmation.')
      onClose()
    } catch (err) {
      toast.error(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Item header */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ width:80, height:80, background:'var(--surface)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:38, margin:'0 auto 14px', border:'1px solid var(--border)', overflow:'hidden' }}>
            {item.photo_url ? <img src={item.photo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (item.emoji||'📦')}
          </div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:6 }}>{item.title}</div>
          <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>{item.description}</p>
        </div>

        {/* Meta rows */}
        {[
          ['Owner',     `${item.profiles?.full_name}${item.profiles?.verified?' ✓':''}`],
          ['Condition', item.condition || 'Good'],
          ['Daily Rent', `₹${item.rent_per_day}`],
          ['Late Fine',  `₹${item.fine_per_day}/day overdue`],
          ['Pickup',     `📍 ${item.pickup_location}`],
          ['Rating',     `⭐ ${Number(item.avg_rating||0).toFixed(1)} (${item.review_count||0} reviews)`],
        ].map(([k,v]) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)', fontSize:14 }}>
            <span style={{ color:'var(--muted)' }}>{k}</span>
            <span style={{ fontWeight:600, color: k==='Daily Rent'?'var(--key)':k==='Late Fine'?'var(--red)':'var(--text)', textAlign:'right' }}>{v}</span>
          </div>
        ))}

        {/* Date picker */}
        <div className="f-row" style={{ marginTop:16 }}>
          <div className="f-group">
            <label className="f-label">From Date</label>
            <input type="date" className="f-input" value={from} min={item.avail_from} max={item.avail_to}
              onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="f-group">
            <label className="f-label">To Date</label>
            <input type="date" className="f-input" value={to} min={from} max={item.avail_to}
              onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {/* Cost summary */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:16, marginBottom:14 }}>
          <div className="sec-title" style={{ marginBottom:12 }}>Booking Summary</div>
          {[
            [`Duration`, `${days} day${days>1?'s':''}`],
            [`Rent (${days} × ₹${item.rent_per_day})`, `₹${total}`],
            [`Late fine (if delayed)`, `₹${item.fine_per_day}/day`],
          ].map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--sub)', marginBottom:8 }}>
              <span>{k}</span><span style={{ color:'var(--text)' }}>{v}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontWeight:800, fontSize:15, paddingTop:10, borderTop:'1px solid var(--border)', marginTop:4 }}>
            <span>Total</span><span style={{ color:'var(--key)' }}>₹{total}</span>
          </div>
        </div>

        <div className="box-warn" style={{ marginBottom:18 }}>
          <span>⚠️</span>
          <span>Return by <strong>{fmt(to)}</strong>. A reminder email will arrive 5 hours before the deadline. Late returns: ₹{item.fine_per_day}/day fine.</span>
        </div>

        <button className="btn btn-primary" onClick={confirm} disabled={loading || item.status !== 'available'}>
          {loading ? <span className="spinner" style={{ width:20, height:20 }} /> : `📦 Confirm Booking — ₹${total}`}
        </button>
      </div>
    </div>
  )
}

export default function BrowsePage() {
  const { user } = useAuth()
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [cat,     setCat]     = useState('All')
  const [modal,   setModal]   = useState(null)

  useEffect(() => {
    supabase.from('items')
      .select('*, profiles:owner_id(full_name,email,verified,total_rentals,avg_rating)')
      .eq('status','available')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        else setItems(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = items.filter(i =>
    (cat==='All' || i.category===cat) &&
    (i.title.toLowerCase().includes(search.toLowerCase()) ||
      (i.profiles?.full_name||'').toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="page">
      {/* Hero */}
      <div className="fade-up" style={{ background:'linear-gradient(135deg,var(--card2),var(--card))', border:'1px solid var(--border2)', borderRadius:22, padding:'20px 20px 18px', marginBottom:20, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-16, top:-16, fontSize:96, opacity:.06, transform:'rotate(18deg)', userSelect:'none' }}>🔑</div>
        <div style={{ fontSize:11, fontWeight:800, color:'var(--key)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:7 }}>🔑 CampusKeys</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, lineHeight:1.2, marginBottom:6 }}>Borrow smarter,<br/>lend with trust</div>
        <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.55 }}>Verified Gmail · Fair fines · Email reminders</p>
        <div style={{ display:'flex', marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          {[['142','Listings'],['389','Students'],['96%','On-time'],['₹0','Fees']].map(([n,l]) => (
            <div key={l} style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--key)' }}>{n}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Home Chat Section */}
      <HomeChatSection />

      {/* Search */}
      <div style={{ position:'relative', marginBottom:12 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:14, pointerEvents:'none' }}>🔍</span>
        <input className="f-input" style={{ paddingLeft:42 }} placeholder="Search items or owners…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Category pills */}
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4, marginBottom:18, scrollbarWidth:'none' }}>
        {CATS.map(c => (
          <div key={c} onClick={() => setCat(c)} style={{ flexShrink:0, padding:'8px 16px', borderRadius:100, border: cat===c?'none':'1.5px solid var(--border2)', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s', background: cat===c?'var(--key)':'var(--card)', color: cat===c?'#07080c':'var(--sub)' }}>{c}</div>
        ))}
      </div>

      <div className="sec-title">{filtered.length} Items Available</div>

      {loading
        ? [1,2,3].map(i => <div key={i} className="skeleton" style={{ height:170, marginBottom:12 }} />)
        : filtered.length === 0
          ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>No items found</div>
          : filtered.map(item => <ItemCard key={item.id} item={item} onBook={setModal} currentUserId={user?.id} />)
      }

      {modal && <BookModal item={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
