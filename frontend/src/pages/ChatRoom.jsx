import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api, { API_BASE } from '../lib/api'

export default function ChatRoom(){
  const { roomId } = useParams()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const wsRef = useRef(null)
  const [current, setCurrent] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [members, setMembers] = useState([])

  const wsUrl = useMemo(()=>{
    const base = API_BASE.replace(/^http/, 'ws')
    return `${base}/ws?room=${encodeURIComponent(roomId)}`
  },[roomId])

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then((me)=>{
        if(ignore) return
        setCurrent(me?.username || '')
        setAuthChecked(true)
      })
      .catch(()=>{
        if(ignore) return
        setCurrent('')
        setAuthChecked(true)
      })
    return ()=>{ ignore = true }
  },[])

  useEffect(()=>{
    let ignore = false
    async function loadHistory(){
      setLoading(true)
      try{
        const res = await api.get(`/groups/${encodeURIComponent(roomId)}/messages?limit=50`)
        if(ignore) return
        const sorted = (res || []).slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at))
        setMessages(sorted)
      }catch(e){ console.error(e) }
      finally{ if(!ignore) setLoading(false) }
    }
    if(current){
      loadHistory()
    }
    return ()=>{ ignore = true }
  },[roomId, current])

  useEffect(()=>{
    let ignore = false
    async function loadMembers(){
      try{
        const res = await api.get(`/groups/${encodeURIComponent(roomId)}/members`)
        if(ignore) return
        setMembers(res || [])
      }catch(e){
        if(ignore) return
        setMembers([])
      }
    }
    if(current && !roomId.startsWith('dm:')){
      loadMembers()
    }
    return ()=>{ ignore = true }
  },[roomId, current])

  useEffect(()=>{
    if(!current) return
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onopen = ()=> console.log('ws open')
    ws.onmessage = (ev)=>{
      try{
        const data = JSON.parse(ev.data)
        const normalized = {
          user: data.user || data.username || 'anon',
          content: data.content || data.message || '',
          created_at: data.created_at || new Date().toISOString()
        }
        setMessages(m=>[...m, normalized])
      }catch(e){}
    }
    return ()=> ws.close()
  },[roomId, wsUrl])

  const sendMessage = (text)=>{
    const trimmed = text.trim()
    if(!trimmed) return
    const username = localStorage.getItem('currentUser') || ''
    if(wsRef.current && wsRef.current.readyState===WebSocket.OPEN){
      wsRef.current.send(JSON.stringify({type:'message', content:trimmed, username}))
    }
  }

  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Chat Room {roomId}</h1>
        <p className="text-sm text-gray-600">Real-time messages in this room.</p>
      </div>
      {!current && authChecked && (
        <div className="card p-4 mb-4">
          <div className="text-sm text-gray-600">Please log in to view this chat.</div>
        </div>
      )}
      {current && !roomId.startsWith('dm:') && (
        <InvitePanel groupName={roomId} onInvited={()=>{
          api.get(`/groups/${encodeURIComponent(roomId)}/members`).then(setMembers).catch(()=>{})
        }} />
      )}
      {current && !roomId.startsWith('dm:') && (
        <div className="card p-3 mb-4">
          <div className="text-sm font-medium mb-2">Members</div>
          <div className="flex flex-wrap gap-2">
            {members.length === 0 && <span className="text-xs text-gray-500">No members yet.</span>}
            {members.map(m => (
              <span key={m.username} className="badge">@{m.username}</span>
            ))}
          </div>
        </div>
      )}
      <div className="card p-4 mb-4 h-72 overflow-auto">
        {loading && <div className="text-sm text-gray-500 mb-2">Loading history...</div>}
        {!loading && messages.length === 0 && (
          <div className="empty">No messages yet. Say hello!</div>
        )}
        {messages.map((m,i)=> (
          <div key={`${m.created_at}-${i}`} className="mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-pink-400" />
              <strong className="text-sm">{m.user||'anon'}</strong>
              <span className="text-xs text-gray-400">{m.created_at ? new Date(m.created_at).toLocaleTimeString() : ''}</span>
            </div>
            <div className="ml-8 text-sm text-gray-700">{m.content}</div>
          </div>
        ))}
      </div>
      {current && <ChatInput onSend={sendMessage} />}
    </div>
  )
}

function ChatInput({onSend}){
  const [text,setText]=useState('')
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={e=>setText(e.target.value)}
        className="input flex-1"
        placeholder="Type a message"
        onKeyDown={(e)=>{
          if(e.key === 'Enter'){
            e.preventDefault()
            onSend(text)
            setText('')
          }
        }}
      />
      <button onClick={()=>{onSend(text); setText('')}} className="btn-primary">Send</button>
    </div>
  )
}

function InvitePanel({groupName, onInvited}){
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  async function invite(e){
    e.preventDefault()
    if(!username.trim()) return
    setLoading(true)
    try{
      await api.post(`/groups/${encodeURIComponent(groupName)}/members`, { username: username.trim() })
      setUsername('')
      alert('Invited successfully')
      if(onInvited) onInvited()
    }catch(e){
      console.error(e)
      alert('Invite failed (mutual follow required)')
    }finally{
      setLoading(false)
    }
  }

  return (
    <form onSubmit={invite} className="card p-3 mb-4">
      <div className="flex items-center gap-2">
        <input value={username} onChange={e=>setUsername(e.target.value)} className="input flex-1" placeholder="Invite a mutual follower" />
        <button className="btn-secondary" disabled={loading}>{loading ? 'Inviting...' : 'Invite'}</button>
      </div>
    </form>
  )
}
