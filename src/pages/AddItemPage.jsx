import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const CATS  = ['Electronics','Books','Accessories','Art','Sports','Misc']
const CONDS = ['Like New','Excellent','Good','Fair']
const EMOJIS = { Electronics:'⚡', Books:'📚', Accessories:'⌚', Art:'🎨', Sports:'🏋️', Misc:'📦' }

export default function AddItemPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title:'', category:'Electronics', condition:'Good', description:'',
    rent_per_day:'', fine_per_day:'10', avail_from:'', avail_to:'',
    pickup_location:'',
  })
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const pickFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async () => {
    if (!form.title || !form.rent_per_day || !form.avail_from || !form.avail_to || !form.pickup_location) {
      toast.error('Please fill all required fields')
      return
    }
    setLoading(true)
    try {
      let photo_url = null

      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('items').upload(path, file)
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('items').getPublicUrl(path)
        photo_url = publicUrl
      }

      const { error } = await supabase.from('items').insert({
        owner_id:        user.id,
        title:           form.title.trim(),
        description:     form.description.trim(),
        category:        form.category,
        condition:       form.condition,
        emoji:           EMOJIS[form.category] || '📦',
        photo_url,
        rent_per_day:    parseInt(form.rent_per_day),
        fine_per_day:    parseInt(form.fine_per_day) || 10,
        avail_from:      form.avail_from,
        avail_to:        form.avail_to,
        pickup_location: form.pickup_location.trim(),
        status:          'available',
      })

      if (error) throw error
      setDone(true)
    } catch (err) {
      toast.error(err.message)
    }
    setLoading(false)
  }

  if (done) return (
    <div className="page" style={{ textAlign:'center', paddingTop:64 }}>
      <div className="fade-up">
        <div style={{ fontSize:72, marginBottom:20 }}>🎉</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, marginBottom:10 }}>Item Listed!</div>
        <p style={{ color:'var(--sub)', fontSize:15, marginBottom:32, lineHeight:1.6 }}>
          Your item is live on CampusKeys. You'll receive a Gmail notification when someone requests it.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <button className="btn btn-primary" style={{ width:'auto', padding:'12px 28px', fontSize:14 }} onClick={() => { setDone(false); setForm({ title:'', category:'Electronics', condition:'Good', description:'', rent_per_day:'', fine_per_day:'10', avail_from:'', avail_to:'', pickup_location:'' }); setFile(null); setPreview(null) }}>
            ➕ List Another
          </button>
          <button className="btn btn-outline" style={{ padding:'12px 28px', fontSize:14 }} onClick={() => navigate('/')}>
            Browse Items
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="sec-title" style={{ marginBottom:18 }}>List an Item</div>

      {/* Photo upload */}
      <div className="upload-zone" onClick={() => document.getElementById('photo-in').click()} style={{ marginBottom:18 }}>
        {preview
          ? <img src={preview} alt="" style={{ width:100, height:100, borderRadius:14, objectFit:'cover', margin:'0 auto', display:'block' }} />
          : <>
              <div style={{ fontSize:40, marginBottom:8 }}>📸</div>
              <div style={{ fontSize:14, color:'var(--sub)' }}><strong style={{ color:'var(--key)' }}>Tap to add photo</strong> (optional)</div>
            </>}
        <input id="photo-in" type="file" accept="image/*" style={{ display:'none' }} onChange={pickFile} />
      </div>

      <div className="f-group">
        <label className="f-label">Item Title *</label>
        <input className="f-input" placeholder="e.g. Casio Scientific Calculator" value={form.title} onChange={e => set('title', e.target.value)} />
      </div>

      <div className="f-row">
        <div className="f-group">
          <label className="f-label">Category *</label>
          <select className="f-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="f-group">
          <label className="f-label">Condition</label>
          <select className="f-select" value={form.condition} onChange={e => set('condition', e.target.value)}>
            {CONDS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="f-row">
        <div className="f-group">
          <label className="f-label">Rent / Day (₹) *</label>
          <input className="f-input" type="number" placeholder="50" value={form.rent_per_day} onChange={e => set('rent_per_day', e.target.value)} />
        </div>
        <div className="f-group">
          <label className="f-label">Late Fine / Day (₹)</label>
          <input className="f-input" type="number" placeholder="10" value={form.fine_per_day} onChange={e => set('fine_per_day', e.target.value)} />
        </div>
      </div>

      <div className="f-row">
        <div className="f-group">
          <label className="f-label">Available From *</label>
          <input className="f-input" type="date" value={form.avail_from} min={new Date().toISOString().slice(0,10)} onChange={e => set('avail_from', e.target.value)} />
        </div>
        <div className="f-group">
          <label className="f-label">Available To *</label>
          <input className="f-input" type="date" value={form.avail_to} min={form.avail_from || new Date().toISOString().slice(0,10)} onChange={e => set('avail_to', e.target.value)} />
        </div>
      </div>

      <div className="f-group">
        <label className="f-label">Pickup Location *</label>
        <input className="f-input" placeholder="e.g. Block A, Room 204" value={form.pickup_location} onChange={e => set('pickup_location', e.target.value)} />
      </div>

      <div className="f-group">
        <label className="f-label">Description</label>
        <textarea className="f-textarea" rows={3} placeholder="Describe the item, its condition, any usage notes…" value={form.description} onChange={e => set('description', e.target.value)} />
      </div>

      <div className="box-info" style={{ marginBottom:18 }}>
        <span>ℹ️</span>
        <span>Your item will be visible to all verified students. You'll get a Gmail notification for every booking request.</span>
      </div>

      <button className="btn btn-primary" onClick={submit} disabled={loading}>
        {loading ? <span className="spinner" style={{ width:20, height:20 }} /> : '🔑 List on CampusKeys'}
      </button>
    </div>
  )
}
