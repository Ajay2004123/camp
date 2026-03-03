import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { format } from 'date-fns'

export default function ChatPage() {
  const { bookingId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [booking,   setBooking]   = useState(null)
  const [messages,  setMessages]  = useState([])
  const [input,     setInput]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [recording, setRecording] = useState(false)
  const [otherUser, setOtherUser] = useState(null)

  const endRef    = useRef(null)
  const mediaRef  = useRef(null)
  const chunksRef = useRef([])

  useEffect(() => {
    loadBooking()
    loadMessages()

    // Subscribe to new messages in real-time
    const ch = supabase.channel(`chat-${bookingId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `booking_id=eq.${bookingId}`
      }, payload => {
        setMessages(prev => {
          // avoid duplicate if we already have it
          if (prev.find(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
        // Mark incoming message as read
        if (payload.new.sender_id !== user?.id) {
          supabase.from('messages').update({ read: true }).eq('id', payload.new.id)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [bookingId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadBooking = async () => {
    const { data } = await supabase.from('bookings')
      .select('*, items(*), borrower:borrower_id(id,full_name,email), owner:owner_id(id,full_name,email)')
      .eq('id', bookingId).single()
    if (data) {
      setBooking(data)
      setOtherUser(data.borrower_id === user.id ? data.owner : data.borrower)
    }
  }

  const loadMessages = async () => {
    const { data, error } = await supabase.from('messages')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })

    if (!error) {
      setMessages(data || [])
      // Mark all received messages as read
      if (data?.length) {
        await supabase.from('messages')
          .update({ read: true })
          .eq('booking_id', bookingId)
          .neq('sender_id', user.id)
      }
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setSending(true)
    setInput('')
    const { data, error } = await supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id:  user.id,
      content:    text,
      type:       'text',
    }).select().single()

    if (error) {
      toast.error('Failed to send: ' + error.message)
      setInput(text)
    }
    // Real-time will add it — but if channel fails, add manually
    if (data) {
      setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data])
    }
    setSending(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e => chunksRef.current.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const fileName = `voice/${user.id}/${Date.now()}.webm`
        const { data: up } = await supabase.storage.from('voices').upload(fileName, blob)
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('voices').getPublicUrl(fileName)
          const { data: msg } = await supabase.from('messages').insert({
            booking_id: bookingId, sender_id: user.id,
            type: 'voice', voice_url: publicUrl,
            content: '🎤 Voice message',
          }).select().single()
          if (msg) setMessages(prev => prev.find(m=>m.id===msg.id) ? prev : [...prev, msg])
        }
      }
      mr.start()
      setRecording(true)
    } catch {
      alert('Microphone permission needed for voice messages')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    setRecording(false)
  }

  const initials = (name) => name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'
  const isMe = (senderId) => senderId === user.id

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', background:'rgba(14,16,24,.96)', backdropFilter:'blur(20px)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button onClick={() => navigate('/bookings')} style={{ background:'none', border:'none', color:'var(--text)', fontSize:22, cursor:'pointer', padding:'0 4px', lineHeight:1 }}>←</button>
        <div className="avatar" style={{ width:40, height:40, fontSize:14 }}>
          {initials(otherUser?.full_name || '')}
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>{otherUser?.full_name || 'Loading…'}</div>
          <div style={{ fontSize:12, color:'var(--sub)' }}>📦 {booking?.items?.title || ''}</div>
        </div>
      </div>

      {/* Booking context bar */}
      {booking && (
        <div style={{ padding:'8px 16px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
          <span className="badge badge-muted" style={{ fontSize:10 }}>
            {format(new Date(booking.from_date),'d MMM')} → {format(new Date(booking.to_date),'d MMM')}
          </span>
          <span className="badge badge-key" style={{ fontSize:10 }}>₹{booking.total_rent}</span>
          <span className={`badge ${booking.status==='approved'?'badge-green':'badge-key'}`} style={{ fontSize:10 }}>
            {booking.status === 'approved' ? '✅ Approved' : booking.status === 'pending' ? '⏳ Pending' : booking.status}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 8px', display:'flex', flexDirection:'column', gap:8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--muted)', padding:'40px 0', fontSize:14 }}>
            👋 Say hello! Arrange pickup details here.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe(msg.sender_id) ? 'flex-end' : 'flex-start' }}>
            {msg.type === 'voice' ? (
              <div style={{
                maxWidth:'72%', background: isMe(msg.sender_id) ? 'var(--key)' : 'var(--card2)',
                color: isMe(msg.sender_id) ? '#07080c' : 'var(--text)',
                borderRadius:18, borderBottomRightRadius: isMe(msg.sender_id)?4:18,
                borderBottomLeftRadius: isMe(msg.sender_id)?18:4,
                padding:'10px 14px', display:'flex', alignItems:'center', gap:10,
              }}>
                <button onClick={() => new Audio(msg.voice_url).play()}
                  style={{ width:32, height:32, borderRadius:'50%', background:'rgba(0,0,0,.15)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:14, color:'inherit', flexShrink:0 }}>▶</button>
                <div style={{ display:'flex', gap:2, alignItems:'center', flex:1 }}>
                  {[...Array(14)].map((_,i) => (
                    <div key={i} className="wave-bar" style={{ height:`${6+Math.sin(i)*8}px`, animationDelay:`${i*0.06}s` }} />
                  ))}
                </div>
                <span style={{ fontSize:11, opacity:.7 }}>🎤</span>
              </div>
            ) : (
              <div style={{
                maxWidth:'78%', padding:'10px 14px', borderRadius:18,
                borderBottomRightRadius: isMe(msg.sender_id)?4:18,
                borderBottomLeftRadius:  isMe(msg.sender_id)?18:4,
                background: isMe(msg.sender_id) ? 'var(--key)' : 'var(--card2)',
                color: isMe(msg.sender_id) ? '#07080c' : 'var(--text)',
                border: isMe(msg.sender_id) ? 'none' : '1px solid var(--border)',
                fontSize:14, lineHeight:1.5, fontWeight:500,
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            )}
            <span style={{ fontSize:10, color:'var(--muted)', margin:'2px 4px' }}>
              {format(new Date(msg.created_at), 'h:mm a')}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Recording indicator */}
      {recording && (
        <div style={{ padding:'8px 16px', background:'rgba(248,113,113,.1)', borderTop:'1px solid rgba(248,113,113,.2)', display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--red)' }}>
          <div style={{ width:8, height:8, background:'var(--red)', borderRadius:'50%', animation:'pulse 1s infinite' }} />
          Recording… Release to send
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding:'10px 14px', background:'rgba(14,16,24,.96)', backdropFilter:'blur(20px)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexShrink:0, paddingBottom:`max(10px, env(safe-area-inset-bottom))` }}>
        <input className="f-input" style={{ borderRadius:22, padding:'11px 16px' }}
          placeholder="Type a message…"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button
          onMouseDown={startRecording} onMouseUp={stopRecording}
          onTouchStart={startRecording} onTouchEnd={stopRecording}
          style={{ width:44, height:44, borderRadius:'50%', background: recording?'var(--red)':'var(--card)', border:`1.5px solid ${recording?'var(--red)':'var(--border2)'}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, transition:'all .2s', flexShrink:0 }}>
          🎤
        </button>
        <button onClick={send} disabled={sending || !input.trim()} style={{ width:44, height:44, borderRadius:'50%', background:'var(--key)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18, opacity: !input.trim()?0.4:1, transition:'opacity .15s', flexShrink:0 }}>
          ➤
        </button>
      </div>
    </div>
  )
}
