import React, {useEffect, useState} from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

export default function Comments({messageId}){
  const [comments,setComments]=useState([])
  const [text,setText]=useState('')
  const [loading,setLoading]=useState(false)
  const [hasMore,setHasMore]=useState(true)

  useEffect(()=>{
    setComments([])
    setHasMore(true)
    load(true)
  },[messageId])

  async function load(reset=false){
    try{
      const limit = 20
      const before = reset || comments.length === 0 ? null : comments[0]?.created_at
      const base = `/messages/${messageId}/comments?limit=${limit}`
      const url = before ? `${base}&before=${encodeURIComponent(before)}` : base
      const res = await api.get(url)
      const items = res || []
      if(reset){
        setComments(items)
      }else{
        setComments(prev=>[...items, ...prev])
      }
      if(items.length < limit){
        setHasMore(false)
      }
    }catch(e){ console.error(e) }
  }

  async function submit(e){
    e.preventDefault()
    if(!text) return
    setLoading(true)
    try{
      const username = localStorage.getItem('currentUser') || ''
      if(!username){
        alert('Please log in to comment')
        setLoading(false)
        return
      }
      const res = await api.post(`/messages/${messageId}/comments`, { username, content: text })
      setComments(c=>[...c, res])
      setText('')
    }catch(e){ console.error(e); alert('Failed to comment') }
    finally{ setLoading(false) }
  }

  async function remove(id){
    if(!confirm('Delete comment?')) return
    try{
      await api.del(`/comments/${id}`)
      setComments(c=>c.filter(x=>x.id!==id))
    }catch(e){ console.error(e); alert('Failed to delete') }
  }

  return (
    <div className="mt-3">
      {hasMore && (
        <div className="mb-2">
          <button onClick={()=>load(false)} className="text-xs text-[#0095f6]">View older comments</button>
        </div>
      )}
      <div className="space-y-2 mb-3">
        {comments.map(c=> (
          <div key={c.id} className="p-2 bg-white/5 border border-white/10 rounded-xl">
            <div className="text-sm">
              <Link className="font-medium" to={`/users/${c.username}`}>@{c.username}</Link>
              <span className="text-xs text-slate-400 ml-2">{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <div className="text-sm text-slate-200">{c.content}</div>
            {localStorage.getItem('currentUser')===c.username && (
              <div className="mt-1"><button onClick={()=>remove(c.id)} className="text-xs text-rose-600">Delete</button></div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={e=>setText(e.target.value)} className="input flex-1" placeholder="Add a comment..." />
        <button className="btn-primary" disabled={loading}>Post</button>
      </form>
    </div>
  )
}
