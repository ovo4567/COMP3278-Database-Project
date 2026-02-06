import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

export default function Messages(){
  const [rooms, setRooms] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState('')
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then((me)=>{
        if(ignore) return
        setCurrent(me?.username || '')
        setAuthChecked(true)
        loadRooms()
      })
      .catch(()=>{
        if(ignore) return
        setCurrent('')
        setAuthChecked(true)
      })
    return ()=>{ ignore = true }
  },[])

  async function loadRooms(){
    try{
      // use conversation-backed API
      const res = await api.get('/conversations')
      setRooms(res || [])
    }catch(e){ console.error(e) }
  }

  async function createRoom(e){
    e.preventDefault()
    if(!name.trim()) return
    setLoading(true)
    try{
      await api.post('/groups', { name: name.trim(), description: description.trim() || null })
      setName('')
      setDescription('')
      await loadRooms()
    }catch(e){
      console.error(e)
      alert('Failed to create room')
    }finally{
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-slate-300">Join a room or create a new one.</p>
      </div>

      {!current && authChecked && (
        <div className="card p-4 mb-4">
          <div className="text-sm text-slate-300">Please log in to view your rooms.</div>
        </div>
      )}

      {current && (
        <form onSubmit={createRoom} className="card p-4 mb-6">
          <div className="mb-2">
            <input value={name} onChange={e=>setName(e.target.value)} className="input" placeholder="Room name" />
          </div>
          <div className="mb-2">
            <input value={description} onChange={e=>setDescription(e.target.value)} className="input" placeholder="Description (optional)" />
          </div>
          <button className="btn-primary" disabled={loading}>{loading? 'Creating...':'Create room'}</button>
        </form>
      )}

      {current && (
        <ul className="space-y-3">
          {rooms.length === 0 && (
            <li className="empty">No rooms yet. Create one to get started.</li>
          )}
          {rooms.map(r=> (
            <li key={r.id} className="card p-3 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.title || r.name || (`${r.type}:${r.id}`)}</div>
                  {r.metadata && <div className="text-sm text-slate-400">{r.metadata}</div>}
                </div>
                <Link to={`/rooms/${encodeURIComponent(`conv:${r.id}`)}`} className="btn-ghost">Open</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
