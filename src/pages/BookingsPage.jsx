import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { sendEmail, EMAIL } from '../lib/email'
import { useAuth } from '../hooks/useAuth'
import { format, parseISO, differenceInCalendarDays, isPast, parseJSON } from 'date-fns'

const fmt = d => format(parseISO(d), 'd MMM yyyy')

const STATUS = {
  pending:   { bg:'rgba(240,192,64,.1)',  color:'var(--key)',   label:'⏳ Pending',   badge:'badge-key' },
  approved:  { bg:'rgba(52,211,153,.1)',  color:'var(--green)', label:'✅ Approved',  badge:'badge-green' },
  rejected:  { bg:'rgba(248,113,113,.1)', color:'var(--red)',   label:'❌ Rejected',  badge:'badge-red' },
  returned:  { bg:'rgba(96,165,250,.1)',  color:'var(--blue)',  label:'📬 Returned',  badge:'badge-blue' },
  completed: { bg:'rgba(167,139,250,.1)', color:'var(--purple)',label:'🏆 Done',      badge:'badge-purple' },
}

/* ── Star Rating Component ──────────────────────────────────────────────── */
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:4 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} className="star-btn"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          style={{ fontSize:36 }}>
          {n <= (hover || value) ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  )
}

/* ── Rating Modal ────────────────────────────────────────────────────────── */
function RatingModal({ booking, onClose, onDone }) {
  const { user } = useAuth()
  const [stars,   setStars]   = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      // Insert review
      const { error: reviewErr } = await supabase.from('reviews').insert({
        booking_id:  booking.id,
        reviewer_id: user.id,
        reviewee_id: booking.owner_id,
        item_id:     booking.item_id,
        stars,
        comment,
      })
      if (reviewErr) throw reviewErr

      // Try to update booking - may fail due to RLS, that's ok
      await supabase.from('bookings')
        .update({ rated_by_borrower: true, status: 'completed' })
        .eq('id', booking.id)
        .eq('borrower_id', user.id)

      // Notify owner
      await supabase.from('notifications').insert({
        user_id: booking.owner_id,
        title: '⭐ New Review',
        body: `You received a ${stars}-star review for "${booking.items?.title}"`,
        type: 'review',
      }).maybeSingle()

      toast.success('⭐ Review submitted! Thank you.')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to submit review')
    }
    setLoading(false)
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:52, marginBottom:10 }}>⭐</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:6 }}>Rate your experience</div>
          <p style={{ fontSize:14, color:'var(--sub)' }}>How was borrowing <strong style={{ color:'var(--text)' }}>{booking.items?.title}</strong>?</p>
        </div>

        <div style={{ marginBottom:20 }}>
          <StarPicker value={stars} onChange={setStars} />
          <div style={{ textAlign:'center', marginTop:8, fontSize:14, color:'var(--sub)' }}>
            {['','Terrible 😞','Poor 😕','OK 😐','Good 😊','Excellent 🤩'][stars]}
          </div>
        </div>

        <div className="f-group">
          <label className="f-label">Your Review (optional)</label>
          <textarea className="f-textarea" rows={3} placeholder="Share your experience with this item and owner…"
            value={comment} onChange={e => setComment(e.target.value)} />
        </div>

        <button className="btn btn-primary" onClick={submit} disabled={loading}>
          {loading ? <span className="spinner" style={{ width:20, height:20 }} /> : '⭐ Submit Review'}
        </button>
      </div>
    </div>
  )
}

/* ── Booking Card ────────────────────────────────────────────────────────── */
function BCard({ booking, isMine, onAction, onChat, onRate }) {
  const s  = STATUS[booking.status] || STATUS.pending
  const overdue = booking.status === 'approved' && isPast(parseISO(booking.to_date))
  const lateDays = overdue ? differenceInCalendarDays(new Date(), parseISO(booking.to_date)) : 0
  const fine     = lateDays * (booking.fine_per_day || 0)

  return (
    <div className="card-flat" style={{ padding:16, marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {booking.items?.title || 'Item'}
          </div>
          <div style={{ fontSize:12, color:'var(--sub)' }}>
            {isMine ? `From: ${booking.owner_profile?.full_name}` : `To: ${booking.borrower_profile?.full_name}`}
          </div>
        </div>
        <span className={`badge ${s.badge}`}>{s.label}</span>
      </div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
        <span className="badge badge-muted">📅 {fmt(booking.from_date)} → {fmt(booking.to_date)}</span>
        <span className="badge badge-key">₹{booking.total_rent}</span>
        {booking.status === 'approved' && <span className="badge badge-muted">📍 {booking.pickup_location}</span>}
      </div>

      {overdue && (
        <div className="box-warn" style={{ marginBottom:10 }}>
          <span>⚠️</span>
          <span>Overdue by <strong>{lateDays} day{lateDays>1?'s':''}</strong>! Fine: <strong>₹{fine}</strong></span>
        </div>
      )}

      {booking.status === 'approved' && (
        <div className="box-info" style={{ marginBottom:10 }}>
          <span>⏰</span>
          <span>Return reminder email will be sent 5 hours before <strong>{fmt(booking.to_date)}</strong></span>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingTop:10, borderTop:'1px solid var(--border)' }}>
        {/* Owner actions */}
        {!isMine && booking.status === 'pending' && (
          <>
            <button className="btn btn-green btn-sm" onClick={() => onAction('approve', booking)}>✅ Approve</button>
            <button className="btn btn-red btn-sm"   onClick={() => onAction('reject',  booking)}>❌ Reject</button>
          </>
        )}
        {/* Borrower: mark returned */}
        {isMine && booking.status === 'approved' && (
          <button className="btn btn-outline btn-sm" onClick={() => onAction('return', booking)}>📬 Mark Returned</button>
        )}
        {/* Chat */}
        {(booking.status === 'approved' || booking.status === 'returned' || booking.status === 'completed') && (
          <button className="btn btn-outline btn-sm" onClick={() => onChat(booking.id)}>💬 Chat</button>
        )}
        {/* Rate */}
        {isMine && booking.status === 'returned' && !booking.rated_by_borrower && (
          <button className="btn btn-primary btn-sm" style={{ width:'auto', padding:'8px 16px', fontSize:12 }} onClick={() => onRate(booking)}>⭐ Rate</button>
        )}
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function BookingsPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [borrows,  setBorrows]  = useState([])
  const [lends,    setLends]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [rateBook, setRateBook] = useState(null)
  const [tab,      setTab]      = useState('borrow')

  const load = async () => {
    setLoading(true)
    const [b, l] = await Promise.all([
      supabase.from('bookings')
        .select('*, items(*), owner_profile:owner_id(full_name,email)')
        .eq('borrower_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('bookings')
        .select('*, items(*), borrower_profile:borrower_id(full_name,email)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
    ])
    setBorrows(b.data || [])
    setLends(l.data   || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleAction = async (action, booking) => {
    if (action === 'approve') {
      await supabase.from('bookings').update({ status:'approved', approved_at: new Date().toISOString() }).eq('id', booking.id)
      await supabase.from('items').update({ status:'rented' }).eq('id', booking.item_id)
      await supabase.from('notifications').insert({
        user_id: booking.borrower_id,
        title: '✅ Booking Approved!',
        body: `Your booking for "${booking.items?.title}" has been approved. Check your Gmail!`,
        type: 'booking_approved',
        meta: { booking_id: booking.id },
      })
      await sendEmail(EMAIL.BOOKING_APPROVED, booking.borrower_profile?.email || '', {
        borrower_name:  booking.borrower_profile?.full_name || 'Student',
        owner_name:     profile?.full_name,
        item_title:     booking.items?.title,
        from_date:      fmt(booking.from_date),
        to_date:        fmt(booking.to_date),
        total_rent:     booking.total_rent,
        fine_per_day:   booking.fine_per_day,
        pickup_location: booking.pickup_location,
      })
      toast.success('✅ Booking approved! Borrower notified via Gmail.')
    }

    if (action === 'reject') {
      await supabase.from('bookings').update({ status:'rejected' }).eq('id', booking.id)
      await sendEmail(EMAIL.BOOKING_REJECTED, booking.borrower_profile?.email || '', {
        borrower_name: booking.borrower_profile?.full_name || 'Student',
        owner_name:    profile?.full_name,
        item_title:    booking.items?.title,
      })
      toast.success('Booking rejected.')
    }

    if (action === 'return') {
      const today     = new Date()
      const dueDate   = parseISO(booking.to_date)
      const lateDays  = Math.max(0, differenceInCalendarDays(today, dueDate))
      const fine      = lateDays * booking.fine_per_day

      await supabase.from('bookings').update({
        status: 'returned',
        returned_at: today.toISOString(),
        late_days: lateDays,
        fine_charged: fine,
      }).eq('id', booking.id)

      await supabase.from('items').update({ status:'available' }).eq('id', booking.item_id)

      // Notify owner
      await supabase.from('notifications').insert({
        user_id: booking.owner_id,
        title: '📬 Item Returned',
        body: `"${booking.items?.title}" has been returned. ${lateDays > 0 ? `Fine: ₹${fine}` : 'On time!'}`,
        type: 'item_returned',
      })

      await sendEmail(EMAIL.ITEM_RETURNED, booking.owner_profile?.email || '', {
        owner_name:    booking.owner_profile?.full_name,
        borrower_name: profile?.full_name,
        item_title:    booking.items?.title,
        late_days:     lateDays,
        fine_charged:  fine,
      })
      await sendEmail(EMAIL.REVIEW_REQUEST, user.email, {
        name:       profile?.full_name,
        item_title: booking.items?.title,
      })

      toast.success(`📬 Marked as returned! ${lateDays > 0 ? `Fine: ₹${fine}` : 'On time — great!'}`)
    }

    load()
  }

  return (
    <div className="page">
      <div className="sec-title" style={{ marginBottom:16 }}>My Bookings</div>

      {/* Tab switcher */}
      <div style={{ display:'flex', background:'var(--surface)', borderRadius:12, padding:4, marginBottom:20, border:'1px solid var(--border)' }}>
        {[['borrow','📦 Borrowed'],['lend','🤝 Lent']].map(([k,l]) => (
          <div key={k} onClick={() => setTab(k)} style={{
            flex:1, padding:'10px', borderRadius:10, textAlign:'center',
            fontSize:13, fontWeight:700, cursor:'pointer', transition:'all .2s',
            background: tab===k ? 'var(--card2)' : 'transparent',
            color: tab===k ? 'var(--key)' : 'var(--muted)',
            border: tab===k ? '1px solid var(--border2)' : '1px solid transparent',
          }}>{l}</div>
        ))}
      </div>

      {loading
        ? [1,2].map(i => <div key={i} className="skeleton" style={{ height:140, marginBottom:10 }} />)
        : tab === 'borrow'
          ? borrows.length === 0
            ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>No borrowings yet</div>
            : borrows.map(b => <BCard key={b.id} booking={b} isMine onAction={handleAction} onChat={id => navigate(`/chat/${id}`)} onRate={setRateBook} />)
          : lends.length === 0
            ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>No lending activity yet</div>
            : lends.map(b => <BCard key={b.id} booking={b} isMine={false} onAction={handleAction} onChat={id => navigate(`/chat/${id}`)} onRate={() => {}} />)
      }

      {rateBook && <RatingModal booking={rateBook} onClose={() => setRateBook(null)} onDone={load} />}
    </div>
  )
}
