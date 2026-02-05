import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

export default function PostModal({post, onClose, onUpdated}){
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [likeCount, setLikeCount] = useState(post.like_count || 0)
  const [liked, setLiked] = useState(!!post.liked_by_current_user)

  useEffect(()=>{
    let ignore = false
    api.get(`/messages/${post.id}/comments?limit=50`)
      .then(res=>{ if(!ignore) setComments((res || []).slice().reverse()) })
      .catch(()=>{ if(!ignore) setComments([]) })
    return ()=>{ ignore = true }
  },[post.id])

  async function toggleLike(){
    try{
      const username = localStorage.getItem('currentUser') || ''
      const res = await api.post(`/messages/${post.id}/like`, { username })
      setLikeCount(res.like_count)
      setLiked(res.liked_by_user)
      if(onUpdated) onUpdated(post.id, res)
    }catch(e){
      console.error(e)
    }
  }

  async function submitComment(e){
    e.preventDefault()
    if(!text.trim()) return
    try{
      const username = localStorage.getItem('currentUser') || ''
      const res = await api.post(`/messages/${post.id}/comments`, { username, content: text.trim() })
      setComments(prev=>[res, ...prev])
      setText('')
    }catch(e){
      console.error(e)
      alert('Failed to comment')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-[90vw] max-w-4xl h-[80vh] rounded-xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="grid grid-cols-1 md:grid-cols-2 h-full">
          <div className="bg-black flex items-center justify-center">
            {post.image_url ? (
              <img src={post.image_url} alt="post" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-white text-sm">No image</div>
            )}
          </div>
          <div className="flex flex-col">
            <div className="p-4 border-b border-[#dbdbdb] flex items-center justify-between">
              <Link to={`/users/${post.username}`} className="font-medium text-sm" onClick={onClose}>@{post.username}</Link>
              <button onClick={onClose} className="text-sm text-gray-500">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <div className="text-sm mb-3"><span className="font-medium">@{post.username}</span> {post.content || ''}</div>
              <div className="space-y-2">
                {comments.map(c => (
                  <div key={c.id} className="text-sm">
                    <Link to={`/users/${c.username}`} className="font-medium" onClick={onClose}>@{c.username}</Link> {c.content}
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-[#dbdbdb] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <button onClick={toggleLike} className="text-sm">{liked ? '💗' : '🤍'}</button>
                  <button className="text-sm">💬</button>
                  <button className="text-sm">✈️</button>
                </div>
                <button className="text-sm">🔖</button>
              </div>
              <div className="text-sm text-gray-700 mb-1">Liked by <strong>@{post.username}</strong> and {Math.max(likeCount-1, 0)} others</div>
              <div className="text-xs text-gray-500 mb-2">{new Date(post.created_at).toLocaleString()}</div>
              <form onSubmit={submitComment} className="flex gap-2">
                <input value={text} onChange={e=>setText(e.target.value)} className="input flex-1" placeholder="Add a comment..." />
                <button className="btn-primary">Post</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
