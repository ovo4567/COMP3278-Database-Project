import React from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import Comments from './Comments'

export default function PostCard({post, onLike}){
  const handleLike = async ()=>{
    try{
      const username = localStorage.getItem('currentUser') || ''
      const res = await api.post(`/messages/${post.id}/like`, { username })
      if(onLike) onLike(post.id, res)
    }catch(e){ console.error(e) }
  }

  const [showComments,setShowComments]=React.useState(false)

  return (
    <article className="card mb-4">
      <div className="flex items-center gap-3 p-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-orange-400" />
        <div>
          <div className="font-semibold">
            <Link to={`/users/${post.username}`}>@{post.username||'anon'}</Link>
          </div>
          <div className="text-xs text-gray-500">{new Date(post.created_at).toLocaleString()}</div>
        </div>
      </div>
      {post.image_url && (
        <img src={post.image_url} alt="post" className="w-full border-y border-[#dbdbdb]" />
      )}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={handleLike} className="text-sm text-[#262626]">
          {post.liked_by_current_user ? 'Unlike' : 'Like'} ({post.like_count||0})
        </button>
          <button onClick={()=>setShowComments(s=>!s)} className="text-sm text-[#262626]">Comments</button>
        </div>
        {post.content && <p className="text-sm text-gray-800">{post.content}</p>}
      </div>
      <div className="px-3 pb-3">
        {showComments && <Comments messageId={post.id} />}
      </div>
    </article>
  )
}
