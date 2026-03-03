import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useDesktop } from '../App'

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { desktop, setDesktop } = useDesktop()
  const navigate  = useNavigate()
  const [myItems, setMyItems]     = useState([])
  const [reviews, setReviews]     = useState([])
  const [showReport, setShowReport] = useState(false)
  const [reportData, setReportData] = useState({ against_email:'', reason:'fake_listing', description:'' })

  useEffect(() => {
    if (!user) return
    supabase.from('items').select('*').eq('owner_id', user.id).order('created_at', { ascending:false })
      .then(({ data }) => setMyItems(data || []))
    supabase.from('reviews').select('*, reviewer:reviewer_id(full_name), items(title)')
      .eq('reviewee_id', user.id).order('created_at', { ascending:false })
      .then(({ data }) => setReviews(data || []))
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  const submitReport = async () => {
    if (!reportData.against_email || !reportData.description) {
      toast.error('Please fill all fields'); return
    }
    const { data: against } = await supabase.from('profiles').select('id').eq('email', reportData.against_email).single()
    await supabase.from('reports').insert({
      reporter_id:  user.id,
      against_id:   against?.id || null,
      reason:       reportData.reason,
      description:  reportData.description,
    })
    // Notify admin
    const { data: admins } = await supabase.from('profiles').select('id').eq('role','admin')
    if (admins?.length) {
      await Promise.all(admins.map(a =>
        supabase.from('notifications').insert({
          user_id: a.id,
          title:   '🚨 New Fraud Report',
          body:    `${profile?.full_name} reported ${reportData.against_email}: ${reportData.reason}`,
          type:    'report',
        })
      ))
    }
    setShowReport(false)
    toast.success('🚨 Report submitted. Admins will review within 24 hours.')
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('items').delete().eq('id', id)
    setMyItems(i => i.filter(x => x.id !== id))
    toast.success('Item deleted')
  }

  const initials = (name) => name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'

  return (
    <div className="page">
      {/* Profile hero */}
      <div className="fade-up" style={{ background:'linear-gradient(135deg,var(--card2),var(--card))', border:'1px solid var(--border2)', borderRadius:22, padding:'24px 20px', marginBottom:18, textAlign:'center' }}>
        <div className="avatar" style={{ width:80, height:80, fontSize:28, margin:'0 auto 14px', border:'3px solid var(--bg)' }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
            : initials(profile?.full_name || user?.email || '')}
        </div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, marginBottom:4 }}>{profile?.full_name || 'Student'}</div>
        <div style={{ fontSize:13, color:'var(--sub)', marginBottom:14 }}>{user?.email}</div>
        <div style={{ display:'flex', justifyContent:'center', gap:8, flexWrap:'wrap', marginBottom:18 }}>
          {profile?.verified && <span className="badge badge-key">✅ Verified Gmail</span>}
          {(profile?.avg_rating || 0) >= 4.5 && <span className="badge badge-green">🏆 Trusted</span>}
          {profile?.role === 'admin' && <span className="badge badge-purple">🛡️ Admin</span>}
        </div>
        <div style={{ display:'flex', borderTop:'1px solid var(--border)', paddingTop:16 }}>
          {[
            [myItems.length,       'Listed'],
            [profile?.total_rentals||0, 'Rentals'],
            [Number(profile?.avg_rating||0).toFixed(1)+'⭐', 'Rating'],
            [reviews.length,       'Reviews'],
          ].map(([n,l]) => (
            <div key={l} style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'var(--key)' }}>{n}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* My Listings */}
      {myItems.length > 0 && (
        <>
          <div className="sec-title">My Listings</div>
          {myItems.map(item => (
            <div key={item.id} className="card-flat" style={{ padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:26, width:40, height:40, background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{item.emoji || '📦'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize:12, color:'var(--sub)' }}>₹{item.rent_per_day}/day · <span className={item.status==='available'?'':''}style={{ color: item.status==='available'?'var(--green)':'var(--red)' }}>{item.status}</span></div>
              </div>
              <button className="btn btn-red btn-sm" onClick={() => deleteItem(item.id)}>🗑️</button>
            </div>
          ))}
        </>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <>
          <div className="sec-title" style={{ marginTop:20 }}>Reviews Received</div>
          {reviews.map(r => (
            <div key={r.id} className="card-flat" style={{ padding:14, marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{r.reviewer?.full_name}</span>
                <span style={{ color:'var(--key)', fontSize:14 }}>{'⭐'.repeat(r.stars)}</span>
              </div>
              {r.comment && <p style={{ fontSize:13, color:'var(--sub)', lineHeight:1.5 }}>{r.comment}</p>}
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>for: {r.items?.title}</div>
            </div>
          ))}
        </>
      )}

      {/* View Mode Toggle */}
      <div className="sec-title" style={{ marginTop:24 }}>Display Settings</div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>
            {desktop ? '🖥️' : '📱'}
          </div>
          <div>
            <div style={{ fontWeight:600, fontSize:15 }}>{desktop ? 'Desktop Mode' : 'Mobile Mode'}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Switch to {desktop ? 'mobile' : 'full desktop'} layout</div>
          </div>
        </div>
        {/* Toggle Switch */}
        <div onClick={() => setDesktop(d => !d)} style={{ width:52, height:28, borderRadius:100, background: desktop ? 'var(--key)' : 'var(--surface)', border:`1.5px solid ${desktop ? 'var(--key)' : 'var(--border2)'}`, cursor:'pointer', position:'relative', transition:'all .25s', flexShrink:0 }}>
          <div style={{ position:'absolute', top:3, left: desktop ? 26 : 3, width:20, height:20, borderRadius:'50%', background: desktop ? '#07080c' : 'var(--muted)', transition:'left .25s', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>
            {desktop ? '🖥' : '📱'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="sec-title" style={{ marginTop:24 }}>Account & Safety</div>
      {[
        { icon:'🚨', label:'Report a User / Listing', danger:false, action: () => setShowReport(true) },
        { icon:'🔐', label:'Sign Out', danger:true, action: handleSignOut },
      ].map(({ icon, label, danger, action }) => (
        <div key={label} onClick={action} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, marginBottom:8, cursor:'pointer', transition:'background .15s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, fontSize:15, fontWeight:600, color: danger?'var(--red)':'var(--text)' }}>
            <div style={{ width:36, height:36, background:'var(--surface)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>{icon}</div>
            {label}
          </div>
          <span style={{ color:'var(--muted)' }}>›</span>
        </div>
      ))}

      {/* Report Modal */}
      {showReport && (
        <div className="sheet-overlay" onClick={() => setShowReport(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:6 }}>🚨 Report a User</div>
            <p style={{ fontSize:13, color:'var(--sub)', marginBottom:20, lineHeight:1.6 }}>
              All reports are reviewed by admins within 24 hours. Repeat offenders are blocked.
            </p>
            <div className="f-group">
              <label className="f-label">User's Email</label>
              <input className="f-input" placeholder="reported@gmail.com" value={reportData.against_email}
                onChange={e => setReportData(d => ({ ...d, against_email: e.target.value }))} />
            </div>
            <div className="f-group">
              <label className="f-label">Reason</label>
              <select className="f-select" value={reportData.reason} onChange={e => setReportData(d => ({ ...d, reason: e.target.value }))}>
                <option value="fake_listing">Fake / misleading listing</option>
                <option value="not_returned">Did not return item</option>
                <option value="scam">Scam / fraud attempt</option>
                <option value="harassment">Harassment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="f-group">
              <label className="f-label">Details *</label>
              <textarea className="f-textarea" rows={3} placeholder="Describe what happened…"
                value={reportData.description} onChange={e => setReportData(d => ({ ...d, description: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={submitReport}>Submit Report</button>
          </div>
        </div>
      )}
    </div>
  )
}
