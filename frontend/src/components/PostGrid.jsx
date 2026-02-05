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
          className="aspect-square bg-[#efefef] overflow-hidden"
          title="Open post"
        >
          {p.image_url ? (
            <img src={p.image_url} alt="post" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">No image</div>
          )}
        </button>
      ))}
    </div>
  )
}
