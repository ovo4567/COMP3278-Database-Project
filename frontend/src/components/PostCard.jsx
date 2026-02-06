import React from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import Comments from './Comments'

export default function PostCard({post, onLike}){
  const handleLike = async ()=>{
    try{
      const username = localStorage.getItem('currentUser') || ''
      if(!username){
        alert('Please log in to like posts')
        return
      }
      const res = await api.post(`/messages/${post.id}/like`, { username })
      if(onLike) onLike(post.id, res)
    }catch(e){ console.error(e) }
  }

  const [showComments,setShowComments]=React.useState(false)

  return (
    <article className="card mb-4 card-hover">
      <div className="flex items-center gap-3 p-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
        <div>
          <div className="font-semibold">
            <Link to={`/users/${post.username}`}>@{post.username||'anon'}</Link>
          </div>
          <div className="text-xs text-slate-400">{new Date(post.created_at).toLocaleString()}</div>
        </div>
      </div>
      {post.image_url && (
        <img src={post.image_url} alt="Post image" className="w-full border-y border-white/10 object-cover transition-transform duration-500 hover:scale-[1.01]" loading="lazy" />
      )}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={handleLike}
            className="icon-btn"
            aria-pressed={!!post.liked_by_current_user}
            aria-label={post.liked_by_current_user ? 'Unlike post' : 'Like post'}
          >
            <span aria-hidden>{post.liked_by_current_user ? '💗' : '🤍'}</span>
            <span>{post.like_count||0}</span>
          </button>
          <button
            onClick={()=>setShowComments(s=>!s)}
            className="icon-btn"
            aria-expanded={showComments}
            aria-controls={`comments-${post.id}`}
          >
            <span aria-hidden>💬</span>
            <span>Comments</span>
          </button>
        </div>
        {post.content && <p className="text-sm text-slate-100">{post.content}</p>}
      </div>
      <div className="px-3 pb-3">
        {showComments && <div id={`comments-${post.id}`}><Comments messageId={post.id} /></div>}
      </div>
    </article>
  )
}
