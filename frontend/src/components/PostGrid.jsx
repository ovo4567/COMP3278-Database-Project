import React from 'react'

export default function PostGrid({posts, onSelect}){
  if(!posts || posts.length === 0){
    return <div className="empty">No posts yet.</div>
  }
  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map(p => (
        <button
          key={p.id}
          onClick={()=>onSelect(p)}
          className="group aspect-square bg-white/5 border border-white/10 hover:bg-white/10 overflow-hidden transition duration-300"
          title="Open post"
        >
          {p.image_url ? (
            <img src={p.image_url} alt="post" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">No image</div>
          )}
        </button>
      ))}
    </div>
  )
}
