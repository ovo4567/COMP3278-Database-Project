import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import PostGrid from '../components/PostGrid'
import PostModal from '../components/PostModal'
import { Link } from 'react-router-dom'

export default function Explore(){
  const [popular, setPopular] = useState([])
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(()=>{
    let ignore = false
    async function load(){
      try{
        const feed = await api.get('/feed?limit=50')
        if(ignore) return
        const sorted = (feed || []).sort((a,b)=> (b.like_count||0) - (a.like_count||0))
        setPopular(sorted.filter(p=>p.image_url))
      }catch(e){
        if(ignore) return
        setPopular([])
      }
      try{
        const res = await api.get('/users')
        if(ignore) return
        setUsers(res || [])
      }catch(e){
        if(ignore) return
        setUsers([])
      }
    }
    load()
    return ()=>{ ignore = true }
  },[])

  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Explore</h1>
        <p className="text-sm text-gray-600">Discover popular posts and new profiles.</p>
        <div className="mt-3 flex gap-2">
          <input value={query} onChange={e=>setQuery(e.target.value)} className="input flex-1" placeholder="Search users" />
          <button className="btn-primary" onClick={()=>{}} disabled>Search</button>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <h2 className="text-lg font-semibold mb-2">Suggested for you</h2>
        <div className="flex flex-wrap gap-2">
          {users
            .filter(u=> !query || u.username.toLowerCase().includes(query.toLowerCase()))
            .slice(0,8)
            .map(u=> (
              <Link key={u.username} to={`/users/${u.username}`} className="badge">@{u.username}</Link>
            ))}
        </div>
      </div>

      <div className="card p-4 mb-4">
        <h2 className="text-lg font-semibold mb-3">Popular posts</h2>
        <PostGrid posts={popular} onSelect={setSelected} />
      </div>

      {selected && (
        <PostModal post={selected} onClose={()=>setSelected(null)} onUpdated={(id,res)=>{
          setPopular(prev=>prev.map(p=> p.id===id ? {...p, like_count: res.like_count, liked_by_current_user: res.liked_by_user} : p))
        }} />
      )}
    </div>
  )
}
