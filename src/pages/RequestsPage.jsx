import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { format, parseISO } from 'date-fns'

const CATS = ['Electronics','Books','Accessories','Art','Sports','Misc']
const fmt  = d => format(parseISO(d), 'd MMM yyyy')

/* ─────────────────────────────────────────────────────────────────────────
   DIRECT MESSAGE CHAT MODAL  (for request conversations)
───────────────────────────────────────────────────────────────────────── */
function DirectChatModal({ requestId, otherUser, onClose }) {
  const { user, profile } = useAuth()
  const [msgs,    setMsgs]    = useState([])
  const [input,   setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const endRef   = useRef(null)
  const chRef    = useRef(null)

  const roomId = [user.id, otherUser.id].sort().join('_') + '_req_' + requestId

  useEffect(() => {
    loadMsgs()
    chRef.current = supabase.channel(`dm-${roomId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'direct_messages',
          filter: `room_id=eq.${roomId}` },
        p => setMsgs(prev => prev.find(m=>m.id===p.new.id) ? prev : [...prev, p.new]))
      .subscribe()
    return () => { if(chRef.current) supabase.removeChannel(chRef.current) }
  }, [roomId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs])

  const loadMsgs = async () => {
    const { data } = await supabase.from('direct_messages')
      .select('*').eq('room_id', roomId).order('created_at')
    setMsgs(data || [])
    // mark read
    await supabase.from('direct_messages').update({ read:true })
      .eq('room_id', roomId).neq('sender_id', user.id)
  }

  const send = async () => {
    if (!input.trim()) return
    setSending(true)
    const text = input.trim()
    setInput('')
    const { data, error } = await supabase.from('direct_messages').insert({
      room_id:    roomId,
      sender_id:  user.id,
      receiver_id: otherUser.id,
      content:    text,
    }).select().single()
    if (error) { toast.error(error.message); setInput(text) }
    else if (data) setMsgs(prev => prev.find(m=>m.id===data.id) ? prev : [...prev, data])
    // notify other user
    await supabase.from('notifications').insert({
      user_id: otherUser.id,
      title:   `💬 ${profile?.full_name}`,
      body:    text.slice(0, 80),
      type:    'direct_message',
      meta:    { room_id: roomId },
    })
    setSending(false)
  }

  const initials = n => n ? n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'
  const mine = id => id === user.id

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" style={{ height:'80vh', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexShrink:0 }}>
          <div style={{ width:42, height:42, borderRadius:'50%', background:'var(--key)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#07080c', flexShrink:0 }}>
            {initials(otherUser.full_name)}
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:15 }}>{otherUser.full_name}</div>
            <div style={{ fontSize:11, color:'var(--sub)' }}>
              <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:'var(--green)', marginRight:4 }}/>
              Direct Message
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', fontSize:22, color:'var(--muted)', cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, paddingBottom:8 }}>
          {msgs.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--muted)', padding:'30px 0', fontSize:13 }}>
              👋 Start the conversation about this item request!
            </div>
          )}
          {msgs.map(m => (
            <div key={m.id} style={{ display:'flex', justifyContent: mine(m.sender_id)?'flex-end':'flex-start' }}>
              <div style={{
                maxWidth:'78%', padding:'9px 13px', borderRadius:16,
                borderBottomRightRadius: mine(m.sender_id)?3:16,
                borderBottomLeftRadius:  mine(m.sender_id)?16:3,
                background: mine(m.sender_id) ? 'var(--key)' : 'var(--card2)',
                color:      mine(m.sender_id) ? '#07080c' : 'var(--text)',
                border:     mine(m.sender_id) ? 'none' : '1px solid var(--border)',
                fontSize:13, lineHeight:1.5,
              }}>
                {m.content}
                <div style={{ fontSize:9, opacity:.55, marginTop:2, textAlign:'right' }}>
                  {format(new Date(m.created_at), 'h:mm a')}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{ display:'flex', gap:8, flexShrink:0, paddingTop:10, borderTop:'1px solid var(--border)' }}>
          <input className="f-input" style={{ borderRadius:22, padding:'10px 16px' }}
            placeholder="Type a message…" value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter' && !e.shiftKey && send()} />
          <button onClick={send} disabled={sending||!input.trim()}
            style={{ width:42, height:42, borderRadius:'50%', background:'var(--key)', border:'none', cursor:'pointer', fontSize:16, opacity:!input.trim()?0.4:1, flexShrink:0 }}>
            ➤
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   OFFERS PANEL  (requester sees who offered, can chat & accept)
───────────────────────────────────────────────────────────────────────── */
function OffersPanel({ request, onClose, onFulfilled }) {
  const { user } = useAuth()
  const [offers,   setOffers]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [chatWith, setChatWith] = useState(null)

  useEffect(() => {
    supabase.from('request_offers')
      .select('*, offerer:offerer_id(id, full_name, email, verified, avg_rating, total_rentals)')
      .eq('request_id', request.id)
      .order('created_at')
      .then(({ data }) => { setOffers(data||[]); setLoading(false) })
  }, [request.id])

  const accept = async (offer) => {
    await supabase.from('item_requests').update({ status:'fulfilled', fulfilled_by: offer.offerer_id }).eq('id', request.id)
    await supabase.from('notifications').insert({
      user_id: offer.offerer_id,
      title:   '🎉 Your Offer Was Accepted!',
      body:    `${request.requester?.full_name} accepted your offer for "${request.title}". Add the item to listings so they can book it!`,
      type:    'offer_accepted',
    })
    toast.success('✅ Offer accepted! They\'ve been notified to list the item.')
    onFulfilled()
    onClose()
  }

  const initials = n => n ? n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'
  const isRequester = request.requester_id === user.id

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:4 }}>
          🤝 Offers for "{request.title}"
        </div>
        <p style={{ fontSize:13, color:'var(--sub)', marginBottom:20, lineHeight:1.5 }}>
          {isRequester
            ? 'Chat with offerers, ask questions, then accept the best one!'
            : 'People who offered to provide this item.'}
        </p>

        {loading
          ? <div className="skeleton" style={{ height:80, borderRadius:14 }} />
          : offers.length === 0
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)' }}>No offers yet</div>
            : offers.map(off => (
              <div key={off.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:16, marginBottom:10 }}>
                <div style={{ display:'flex', gap:12, marginBottom:10 }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--surface)', border:'2px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, flexShrink:0 }}>
                    {initials(off.offerer?.full_name)}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14 }}>{off.offerer?.full_name}</div>
                    <div style={{ fontSize:11, color:'var(--sub)' }}>
                      ⭐ {Number(off.offerer?.avg_rating||0).toFixed(1)} · {off.offerer?.total_rentals||0} rentals
                      {off.offerer?.verified && <span style={{ color:'var(--key)', marginLeft:4 }}>✓ Verified</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:800, color:'var(--key)', fontSize:15 }}>₹{off.offered_rent}/day</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>offered rent</div>
                  </div>
                </div>

                {off.note && (
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', fontSize:13, color:'var(--sub)', lineHeight:1.5, marginBottom:10 }}>
                    "{off.note}"
                  </div>
                )}

                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-outline btn-sm" style={{ flex:1 }}
                    onClick={() => setChatWith(off.offerer)}>
                    💬 Chat
                  </button>
                  {isRequester && request.status === 'open' && (
                    <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                      onClick={() => accept(off)}>
                      ✅ Accept
                    </button>
                  )}
                </div>
              </div>
            ))
        }

        {chatWith && (
          <DirectChatModal
            requestId={request.id}
            otherUser={chatWith}
            onClose={() => setChatWith(null)}
          />
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   REQUEST CARD
───────────────────────────────────────────────────────────────────────── */
function RequestCard({ req, currentUserId, onOffer, onViewOffers, onChat }) {
  const isOwn = req.requester_id === currentUserId
  const urgencyColor = req.urgency === 'urgent' ? 'var(--red)' : req.urgency === 'flexible' ? 'var(--green)' : 'var(--key)'
  const urgencyLabel = req.urgency === 'urgent' ? '🔴 Urgent' : req.urgency === 'flexible' ? '🟢 Flexible' : '🟡 Normal'
  const budget = req.max_budget || req.max_rent_per_day || 0
  const days   = req.duration_days || req.days || 1
  const needBy = req.needed_by || req.need_date

  return (
    <div className="card" style={{ padding:16, marginBottom:12 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, marginBottom:4 }}>{req.title}</div>
          <div style={{ fontSize:12, color:'var(--sub)', display:'flex', alignItems:'center', gap:6 }}>
            <span>👤 {req.requester?.full_name}</span>
            {req.requester?.verified && <span style={{ color:'var(--key)', fontWeight:700 }}>✓</span>}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end', flexShrink:0 }}>
          <span className="badge badge-muted" style={{ fontSize:10 }}>{req.category}</span>
          <span style={{ fontSize:11, fontWeight:700, color: urgencyColor }}>{urgencyLabel}</span>
        </div>
      </div>

      {req.description && (
        <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.5, marginBottom:10 }}>{req.description}</p>
      )}

      {/* Meta */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
        <span className="badge badge-key">₹{budget}/day budget</span>
        <span className="badge badge-muted">📅 ~{days} day{days>1?'s':''}</span>
        {needBy && <span className="badge badge-muted">⏰ By {fmt(needBy)}</span>}
      </div>

      {/* Fulfilled banner */}
      {req.status === 'fulfilled' && (
        <div style={{ background:'rgba(52,211,153,.08)', border:'1px solid rgba(52,211,153,.2)', borderRadius:10, padding:'8px 12px', fontSize:12, color:'var(--green)', marginBottom:10 }}>
          ✅ This request has been fulfilled!
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid var(--border)', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className={`badge ${req.status==='open'?'badge-green':req.status==='fulfilled'?'badge-purple':'badge-muted'}`}>
            {req.status==='open'?'● Open':req.status==='fulfilled'?'✅ Fulfilled':'● Closed'}
          </span>
          {(req.offer_count||0) > 0 && (
            <span style={{ fontSize:11, color:'var(--muted)', cursor:'pointer', textDecoration:'underline' }}
              onClick={() => onViewOffers(req)}>
              {req.offer_count} offer{req.offer_count!==1?'s':''}
            </span>
          )}
        </div>

        <div style={{ display:'flex', gap:6 }}>
          {/* Non-owners can chat with requester directly */}
          {!isOwn && (
            <button className="btn btn-outline btn-sm"
              onClick={() => onChat(req.requester, req.id)}
              title="Chat with requester">
              💬
            </button>
          )}
          {/* Owner sees offers */}
          {isOwn && (req.offer_count||0) > 0 && (
            <button className="btn btn-outline btn-sm" onClick={() => onViewOffers(req)}>
              🤝 View Offers
            </button>
          )}
          {/* Others can offer */}
          {!isOwn && req.status === 'open' && (
            <button className="btn btn-primary btn-sm" onClick={() => onOffer(req)}>
              🤝 I Have This!
            </button>
          )}
          {/* Your request badge */}
          {isOwn && (
            <span className="badge" style={{ background:'rgba(167,139,250,.15)', color:'var(--purple)', border:'1px solid rgba(167,139,250,.3)' }}>
              👤 Your Request
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   OFFER MODAL
───────────────────────────────────────────────────────────────────────── */
function OfferModal({ request, onClose, onOfferSent }) {
  const { user, profile } = useAuth()
  const maxBudget = request.max_budget || request.max_rent_per_day || ''
  const [note,    setNote]    = useState('')
  const [rent,    setRent]    = useState(maxBudget)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!rent) { toast.error('Please enter your rent price'); return }
    setLoading(true)
    try {
      // Check if already offered
      const { data: existing } = await supabase.from('request_offers')
        .select('id').eq('request_id', request.id).eq('offerer_id', user.id).maybeSingle()
      if (existing) { toast.error('You already made an offer for this request'); setLoading(false); return }

      const { error } = await supabase.from('request_offers').insert({
        request_id:   request.id,
        offerer_id:   user.id,
        note:         note.trim(),
        offered_rent: Number(rent),
      })
      if (error) throw error

      await supabase.from('item_requests')
        .update({ offer_count: (request.offer_count || 0) + 1 })
        .eq('id', request.id)

      await supabase.from('notifications').insert({
        user_id: request.requester_id,
        title:   '🤝 New Offer on Your Request!',
        body:    `${profile?.full_name} can provide "${request.title}" for ₹${rent}/day — tap to chat!`,
        type:    'request_offer',
        meta:    { request_id: request.id },
      })

      toast.success('🎉 Offer sent! The requester has been notified.')
      onOfferSent()
      onClose()
    } catch (err) {
      toast.error(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:48, marginBottom:10 }}>🤝</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:6 }}>I Can Help!</div>
          <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.6 }}>
            Let <strong style={{ color:'var(--text)' }}>{request.requester?.full_name}</strong> know you have <strong style={{ color:'var(--text)' }}>{request.title}</strong>
          </p>
        </div>

        <div className="f-group">
          <label className="f-label">Your rent per day (₹) *</label>
          <input type="number" className="f-input" value={rent} onChange={e=>setRent(e.target.value)}
            placeholder={`Their max: ₹${maxBudget}`} min={0} />
        </div>
        <div className="f-group">
          <label className="f-label">Describe your item (optional)</label>
          <textarea className="f-textarea" rows={3}
            placeholder="Condition, brand, availability, pickup location, any special notes…"
            value={note} onChange={e=>setNote(e.target.value)} />
        </div>

        <div className="box-info" style={{ marginBottom:16 }}>
          <span>💡</span>
          <span>After they accept your offer, add the item to the Browse listing — they can book it directly!</span>
        </div>

        <button className="btn btn-primary" onClick={submit} disabled={loading||!rent}>
          {loading ? <span className="spinner" style={{ width:20, height:20 }} /> : '🤝 Send Offer'}
        </button>
        <button className="btn btn-outline" style={{ marginTop:8 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   NEW REQUEST MODAL
───────────────────────────────────────────────────────────────────────── */
function NewRequestModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    title:'', category:'Electronics', description:'',
    max_budget:'', duration_days:1, needed_by:'', urgency:'normal',
  })
  const [loading, setLoading] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const submit = async () => {
    if (!form.title.trim() || !form.max_budget) {
      toast.error('Title and budget are required'); return
    }
    setLoading(true)
    try {
      const { error } = await supabase.from('item_requests').insert({
        requester_id:    user.id,
        title:           form.title.trim(),
        category:        form.category,
        description:     form.description.trim(),
        max_budget:      Number(form.max_budget),
        max_rent_per_day:Number(form.max_budget),
        duration_days:   Number(form.duration_days),
        days:            Number(form.duration_days),
        needed_by:       form.needed_by||null,
        need_date:       form.needed_by||null,
        urgency:         form.urgency,
        status:          'open',
        offer_count:     0,
      })
      if (error) throw error
      toast.success('📢 Request posted! You\'ll be notified when someone offers.')
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:6 }}>📢 Post a Request</div>
        <p style={{ fontSize:13, color:'var(--sub)', marginBottom:20, lineHeight:1.6 }}>
          Tell the community what you need. Owners will offer to provide it.
        </p>

        <div className="f-group">
          <label className="f-label">What do you need? *</label>
          <input className="f-input" placeholder="e.g. Scientific Calculator, DSLR Camera…"
            value={form.title} onChange={e=>set('title',e.target.value)} />
        </div>
        <div className="f-row">
          <div className="f-group">
            <label className="f-label">Category</label>
            <select className="f-select" value={form.category} onChange={e=>set('category',e.target.value)}>
              {CATS.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="f-group">
            <label className="f-label">Duration (days)</label>
            <input type="number" className="f-input" min={1} max={90}
              value={form.duration_days} onChange={e=>set('duration_days',e.target.value)} />
          </div>
        </div>
        <div className="f-row">
          <div className="f-group">
            <label className="f-label">Max budget/day (₹) *</label>
            <input type="number" className="f-input" min={0} placeholder="50"
              value={form.max_budget} onChange={e=>set('max_budget',e.target.value)} />
          </div>
          <div className="f-group">
            <label className="f-label">Need by (optional)</label>
            <input type="date" className="f-input" value={form.needed_by}
              onChange={e=>set('needed_by',e.target.value)} />
          </div>
        </div>
        <div className="f-group">
          <label className="f-label">Urgency</label>
          <div style={{ display:'flex', gap:8 }}>
            {[['normal','🟡 Normal'],['urgent','🔴 Urgent'],['flexible','🟢 Flexible']].map(([v,l])=>(
              <div key={v} onClick={()=>set('urgency',v)}
                style={{ flex:1, textAlign:'center', padding:'9px 4px', borderRadius:10, cursor:'pointer', fontSize:12, fontWeight:700,
                  border:`1.5px solid ${form.urgency===v?'var(--key)':'var(--border)'}`,
                  background: form.urgency===v?'rgba(240,192,64,.1)':'var(--surface)',
                  color: form.urgency===v?'var(--key)':'var(--sub)' }}>
                {l}
              </div>
            ))}
          </div>
        </div>
        <div className="f-group">
          <label className="f-label">Additional details (optional)</label>
          <textarea className="f-textarea" rows={2} placeholder="Specific requirements, condition preference…"
            value={form.description} onChange={e=>set('description',e.target.value)} />
        </div>

        <button className="btn btn-primary" onClick={submit} disabled={loading}>
          {loading ? <span className="spinner" style={{ width:20, height:20 }} /> : '📢 Post Request'}
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────────────── */
export default function RequestsPage() {
  const { user } = useAuth()
  const [requests,   setRequests]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showNew,    setShowNew]    = useState(false)
  const [offerReq,   setOfferReq]   = useState(null)
  const [offersReq,  setOffersReq]  = useState(null)   // view offers panel
  const [chatUser,   setChatUser]   = useState(null)   // { user, requestId }
  const [filter,     setFilter]     = useState('open')
  const [search,     setSearch]     = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('item_requests')
      .select('*, requester:requester_id(id, full_name, email, verified, avg_rating)')
      .order('created_at', { ascending:false })
    if (error) toast.error(error.message)
    else setRequests(data||[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('req-live')
      .on('postgres_changes', { event:'*', schema:'public', table:'item_requests' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const filtered = requests.filter(r =>
    (filter==='all' || r.status===filter) &&
    ((r.title||'').toLowerCase().includes(search.toLowerCase()) ||
     (r.category||'').toLowerCase().includes(search.toLowerCase()))
  )

  const myRequests  = requests.filter(r => r.requester_id === user?.id).length
  const openCount   = requests.filter(r => r.status === 'open').length
  const totalOffers = requests.reduce((s,r) => s + (r.offer_count||0), 0)

  return (
    <div className="page">
      {/* Hero */}
      <div className="fade-up" style={{ background:'linear-gradient(135deg,var(--card2),var(--card))', border:'1px solid var(--border2)', borderRadius:22, padding:'20px 20px 18px', marginBottom:20, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-10, top:-10, fontSize:80, opacity:.06, transform:'rotate(15deg)', userSelect:'none' }}>📢</div>
        <div style={{ fontSize:11, fontWeight:800, color:'var(--blue)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:7 }}>📢 Community Board</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, lineHeight:1.2, marginBottom:6 }}>Item Requests</div>
        <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.55, marginBottom:14 }}>
          Need something not listed? Post a request — the community will offer to help. Chat, negotiate, and arrange directly.
        </p>
        <div style={{ display:'flex', gap:16, marginBottom:16, paddingBottom:16, borderBottom:'1px solid var(--border)' }}>
          {[[openCount,'Open'],[totalOffers,'Offers'],[myRequests,'Mine']].map(([n,l])=>(
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:800, color:'var(--key)' }}>{n}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{l}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" style={{ width:'auto', padding:'10px 22px', fontSize:13 }} onClick={()=>setShowNew(true)}>
          📢 Post a Request
        </button>
      </div>

      {/* How it works */}
      <div style={{ background:'rgba(96,165,250,.06)', border:'1px solid rgba(96,165,250,.15)', borderRadius:14, padding:'12px 14px', marginBottom:18, fontSize:12, color:'var(--sub)', lineHeight:1.7 }}>
        <strong style={{ color:'var(--blue)' }}>💡 How it works:</strong> Post what you need →
        Owners click <strong>"I Have This!"</strong> to offer →
        You see all offers, click <strong>💬</strong> to chat &amp; negotiate →
        Accept the best offer → Owner lists the item → You book it!
      </div>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:10 }}>
        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:14, pointerEvents:'none' }}>🔍</span>
        <input className="f-input" style={{ paddingLeft:42 }} placeholder="Search requests…"
          value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:6, marginBottom:18, alignItems:'center' }}>
        {[['open','● Open'],['fulfilled','✅ Fulfilled'],['all','All']].map(([k,l])=>(
          <div key={k} onClick={()=>setFilter(k)} style={{ flexShrink:0, padding:'7px 14px', borderRadius:100, border: filter===k?'none':'1.5px solid var(--border2)', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s', background: filter===k?'var(--key)':'var(--card)', color: filter===k?'#07080c':'var(--sub)' }}>
            {l}
          </div>
        ))}
        <div style={{ marginLeft:'auto', fontSize:12, color:'var(--muted)' }}>{filtered.length} results</div>
      </div>

      {/* List */}
      {loading
        ? [1,2,3].map(i=><div key={i} className="skeleton" style={{ height:170, marginBottom:12 }} />)
        : filtered.length === 0
          ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--muted)' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
              <div style={{ fontWeight:700, marginBottom:8 }}>No requests found</div>
              <p style={{ fontSize:13, lineHeight:1.6 }}>Be the first to post a request!</p>
              <button className="btn btn-primary" style={{ width:'auto', padding:'10px 20px', marginTop:16 }} onClick={()=>setShowNew(true)}>
                📢 Post a Request
              </button>
            </div>
          )
          : filtered.map(req=>(
            <RequestCard
              key={req.id}
              req={req}
              currentUserId={user?.id}
              onOffer={setOfferReq}
              onViewOffers={setOffersReq}
              onChat={(u, rId) => setChatUser({ user:u, requestId:rId })}
            />
          ))
      }

      {showNew   && <NewRequestModal onClose={()=>setShowNew(false)} onCreated={load} />}
      {offerReq  && <OfferModal request={offerReq} onClose={()=>setOfferReq(null)} onOfferSent={load} />}
      {offersReq && <OffersPanel request={offersReq} onClose={()=>setOffersReq(null)} onFulfilled={load} />}
      {chatUser  && (
        <DirectChatModal
          requestId={chatUser.requestId}
          otherUser={chatUser.user}
          onClose={()=>setChatUser(null)}
        />
      )}
    </div>
  )
}
