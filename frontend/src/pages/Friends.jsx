import React, {useEffect, useState} from 'react'
import api from '../lib/api'
import { useSearchParams } from 'react-router-dom'

export default function Friends(){
  const [params, setParams] = useSearchParams()
  const [query,setQuery]=useState('')
  const [results,setResults]=useState([])
  const [current,setCurrent]=useState('')
  const [following,setFollowing]=useState(new Set())
  const [followers,setFollowers]=useState(new Set())
  const [incoming,setIncoming]=useState([])
  const [outgoing,setOutgoing]=useState(new Set())

  useEffect(()=>{
    let ignore = false
    async function loadMe(){
      try{
        const me = await api.get('/auth/me')
        if(ignore) return
        setCurrent(me.username || '')
        if(me.username){
          const fw = await api.get(`/users/${encodeURIComponent(me.username)}/following`)
          if(ignore) return
          setFollowing(new Set((fw || []).map(x=>x.username)))
          const fr = await api.get(`/users/${encodeURIComponent(me.username)}/followers`)
          if(ignore) return
          setFollowers(new Set((fr || []).map(x=>x.username)))
          const inc = await api.get('/follow/requests/incoming')
          if(ignore) return
          setIncoming(inc || [])
          const out = await api.get('/follow/requests/outgoing')
          if(ignore) return
          setOutgoing(new Set((out || []).map(x=>x.username)))
        }
      }catch(e){
        if(ignore) return
        setCurrent('')
        setFollowing(new Set())
        setFollowers(new Set())
        setIncoming([])
        setOutgoing(new Set())
      }
    }
    loadMe()
    return ()=>{ ignore = true }
  },[])

  useEffect(()=>{
    const q = (params.get('q') || '').trim()
    if(!q) return
    setQuery(q)
    // auto-run when navigated here from global search
    api.get(`/users?query=${encodeURIComponent(q)}`)
      .then((res)=> setResults(res || []))
      .catch(()=> setResults([]))
  },[params])

  async function search(){
    try{
      const q = query.trim()
      setParams(q ? { q } : {})
      const res = await api.get(`/users?query=${encodeURIComponent(q)}`)
      setResults(res || [])
    }catch(e){ console.error(e) }
  }

  async function follow(username){
    try{
      await api.post(`/users/${username}/follow`)
      setOutgoing(prev=> new Set(prev).add(username))
    }catch(e){ console.error(e); alert('Failed') }
  }

  async function unfollow(username){
    try{
      await api.post(`/users/${username}/unfollow`)
      setFollowing(prev=>{
        const next = new Set(prev)
        next.delete(username)
        return next
      })
      setOutgoing(prev=>{
        const next = new Set(prev)
        next.delete(username)
        return next
      })
    }catch(e){ console.error(e); alert('Failed') }
  }

  async function startChat(username){
    try{
      const group = await api.post(`/dm/${username}`)
      const convId = group?.conversation?.id
      if(convId){
        window.location.href = `/rooms/${encodeURIComponent(`conv:${convId}`)}`
      }else{
        window.location.href = `/rooms/${encodeURIComponent(group.name)}`
      }
    }catch(e){
      console.error(e)
      alert('Mutual follow required to start a chat')
    }
  }

  async function accept(username){
    try{
      await api.post(`/follow/requests/${username}/accept`)
      setIncoming(prev=> prev.filter(r=> r.username !== username))
      setFollowers(prev=> new Set(prev).add(username))
    }catch(e){ console.error(e); alert('Failed') }
  }

  async function decline(username){
    try{
      await api.post(`/follow/requests/${username}/decline`)
      setIncoming(prev=> prev.filter(r=> r.username !== username))
    }catch(e){ console.error(e); alert('Failed') }
  }

  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Friends</h1>
        <p className="text-sm text-slate-300">Search and follow people.</p>
      </div>
      {current && incoming.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="text-sm font-medium mb-2">Follow Requests</div>
          <div className="space-y-2">
            {incoming.map(r=> (
              <div key={r.username} className="flex items-center justify-between">
                <div className="text-sm">@{r.username}</div>
                <div className="flex gap-2">
                  <button onClick={()=>accept(r.username)} className="btn-secondary">Accept</button>
                  <button onClick={()=>decline(r.username)} className="btn-danger">Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card p-4 mb-4 flex gap-2">
        <input
          value={query}
          onChange={e=>setQuery(e.target.value)}
          className="input flex-1"
          placeholder="Search users"
          aria-label="Search users"
          onKeyDown={(e)=>{
            if(e.key === 'Enter'){
              e.preventDefault()
              search()
            }
          }}
        />
        <button onClick={search} className="btn-primary">Search</button>
      </div>
      <div className="space-y-3">
        {results.length===0 && <div className="empty">Search users by username.</div>}
        {results.map(u=> (
          <div key={u.username} className="card p-3 card-hover flex items-center justify-between">
            <div>
              <a className="font-medium" href={`/users/${u.username}`}>{u.display_name||u.username}</a>
              <div className="text-xs text-slate-400">@{u.username}</div>
              {followers.has(u.username) && following.has(u.username) && (
                <div className="mt-1"><span className="badge">Mutual</span></div>
              )}
            </div>
            <div>
              {current && current !== u.username && (
                <div className="flex items-center gap-2">
                  {following.has(u.username) ? (
                    <button onClick={()=>unfollow(u.username)} className="btn-danger">Unfollow</button>
                  ) : outgoing.has(u.username) ? (
                    <button className="btn-ghost" disabled>Requested</button>
                  ) : (
                    <button onClick={()=>follow(u.username)} className="btn-secondary">Follow</button>
                  )}
                  {followers.has(u.username) && following.has(u.username) && (
                    <button onClick={()=>startChat(u.username)} className="btn-ghost">Message</button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
