import React, {useEffect, useState} from 'react'
import PostComposer from '../components/PostComposer'
import PostCard from '../components/PostCard'
import api from '../lib/api'

export default function Feed(){
  const [posts,setPosts]=useState([])
  const [loading,setLoading]=useState(false)
  const [followingOnly,setFollowingOnly]=useState(false)
  const [cursor,setCursor]=useState(null)
  const [hasMore,setHasMore]=useState(true)
  const [current,setCurrent]=useState('')
  const [authChecked,setAuthChecked]=useState(false)

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
    if(!authChecked || !current) return
    load(true)
  },[followingOnly, authChecked, current])

  async function load(reset=false){
    setLoading(true)
    try{
      const limit = 20
      const before = reset ? null : cursor
      const base = followingOnly ? `/feed?following=1&limit=${limit}` : `/feed?limit=${limit}`
      const url = before ? `${base}&before=${encodeURIComponent(before)}` : base
      const res = await api.get(url)
      const items = res || []
      if(reset){
        setPosts(items)
      }else{
        setPosts(p=>[...p, ...items])
      }
      if(items.length < limit){
        setHasMore(false)
      }else{
        const last = items[items.length - 1]
        setCursor(last?.created_at || null)
        setHasMore(true)
      }
    }catch(e){ console.error(e) }
    setLoading(false)
  }

  function handleNew(post){
    // prepend
    setPosts(p=>[post,...p])
  }

  function handleLike(id, res){
    if(!res) return
    setPosts(p=>p.map(x=> x.id===id ? {...x, like_count: res.like_count, liked_by_current_user: res.liked_by_user} : x))
  }

  function toggleFollowing(){
    setCursor(null)
    setHasMore(true)
    setPosts([])
    setFollowingOnly(f=>!f)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="card p-3 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Home</h1>
              <p className="text-xs text-gray-500">Instagram-style feed</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={followingOnly} onChange={()=>{toggleFollowing()}} />
              <span>Following</span>
            </label>
          </div>
        </div>

        {!current && authChecked && (
          <div className="card p-4 mb-4">
            <div className="text-sm text-gray-600">Please log in to view the feed.</div>
          </div>
        )}

        {current && <PostComposer onPosted={handleNew} />}

        {current && loading && <div className="text-sm text-gray-500">Loading feed...</div>}
        {current && !loading && posts.length === 0 && (
          <div className="empty">No posts yet. Be the first to share something.</div>
        )}
        {current && posts.map(p=> <PostCard key={p.id} post={p} onLike={handleLike} />)}
        {current && hasMore && !loading && (
          <div className="mt-4">
            <button onClick={()=>load(false)} className="btn-ghost w-full">Load more</button>
          </div>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="card p-4 sticky top-20">
          <h3 className="font-semibold mb-3">Suggestions</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>@trending</span>
              <span className="text-[#0095f6]">Follow</span>
            </div>
            <div className="flex items-center justify-between">
              <span>@design</span>
              <span className="text-[#0095f6]">Follow</span>
            </div>
            <div className="flex items-center justify-between">
              <span>@photography</span>
              <span className="text-[#0095f6]">Follow</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
