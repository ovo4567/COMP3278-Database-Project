import React, {useEffect, useState} from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../lib/api'
import PostGrid from '../components/PostGrid'
import PostModal from '../components/PostModal'

export default function Profile(){
  const { username } = useParams()
  const [user,setUser]=useState(null)
  const [followers,setFollowers]=useState([])
  const [following,setFollowing]=useState([])
  const [isFollowing,setIsFollowing]=useState(false)
  const [isRequested,setIsRequested]=useState(false)
  const [isMutual,setIsMutual]=useState(false)
  const [current,setCurrent]=useState('')
  const [posts,setPosts]=useState([])
  const [editing,setEditing]=useState(false)
  const [form,setForm]=useState({display_name:'', bio:'', website:'', location:'', avatar_url:''})
  const [loadingPosts,setLoadingPosts]=useState(false)
  const [selected,setSelected]=useState(null)
  const [showFollowers,setShowFollowers]=useState(false)
  const [showFollowing,setShowFollowing]=useState(false)

  useEffect(()=>{ load() },[username])
  async function load(){
    try{
      const me = await api.get('/auth/me')
      setCurrent(me?.username || '')

      const u = await api.get(`/users/${username}`)
      setUser(u)
      setForm({
        display_name: u.display_name || '',
        bio: u.bio || '',
        website: u.website || '',
        location: u.location || '',
        avatar_url: u.avatar_url || ''
      })
      const f = await api.get(`/users/${username}/followers`)
      const fw = await api.get(`/users/${username}/following`)
      setFollowers(f||[])
      setFollowing(fw||[])
      const meName = me?.username || localStorage.getItem('currentUser')
      setIsFollowing( (f||[]).some(x=> x.username === meName) )
      setIsMutual(
        (f||[]).some(x=> x.username === meName) && (fw||[]).some(x=> x.username === meName)
      )
      const out = me?.username ? await api.get('/follow/requests/outgoing') : []
      setIsRequested((out || []).some(x=> x.username === username))
      await loadPosts()
    }catch(e){ console.error(e) }
  }

  async function loadPosts(){
    setLoadingPosts(true)
    try{
      const res = await api.get(`/users/${encodeURIComponent(username)}/messages`)
      setPosts(res || [])
    }catch(e){ console.error(e) }
    finally{ setLoadingPosts(false) }
  }

  async function follow(){
    try{
      await api.post(`/users/${username}/follow`)
      await load()
    }catch(e){ alert('Failed to follow') }
  }

  async function unfollow(){
    try{
      await api.post(`/users/${username}/unfollow`)
      await load()
    }catch(e){ alert('Failed to unfollow') }
  }

  async function saveProfile(e){
    e.preventDefault()
    try{
      const updated = await api.put(`/users/${username}/profile`, {
        display_name: form.display_name || null,
        bio: form.bio || null,
        website: form.website || null,
        location: form.location || null,
        avatar_url: form.avatar_url || null,
      })
      setUser(updated)
      setEditing(false)
    }catch(e){
      console.error(e)
      alert('Failed to update profile')
    }
  }

  function handleLike(id, res){
    if(!res) return
    setPosts(p=>p.map(x=> x.id===id ? {...x, like_count: res.like_count, liked_by_current_user: res.liked_by_user} : x))
  }

  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-slate-300">@{username}</p>
      </div>

      {user && (
        <div className="card p-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-pink-400" />
            <div>
              <div className="font-medium text-lg">{user.display_name || user.username}</div>
              <div className="text-sm text-slate-400">@{user.username}</div>
              {user.bio && <div className="mt-2 text-sm">{user.bio}</div>}
              <div className="mt-2 text-sm text-slate-300">
                {user.website && <div>Website: {user.website}</div>}
                {user.location && <div>Location: {user.location}</div>}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-4 text-sm">
            <button className="text-left" onClick={()=>setShowFollowers(true)}><strong>{followers.length}</strong> followers</button>
            <button className="text-left" onClick={()=>setShowFollowing(true)}><strong>{following.length}</strong> following</button>
            <div><strong>{user.post_count||0}</strong> posts</div>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {current && current !== username && (
          <>
            {isFollowing ? (
              <button onClick={unfollow} className="btn-danger">Unfollow</button>
            ) : isRequested ? (
              <button className="btn-ghost" disabled>Requested</button>
            ) : (
              <button onClick={follow} className="btn-secondary">Follow</button>
            )}
            {isMutual && (
              <button onClick={async ()=>{
                try{
                  const group = await api.post(`/dm/${username}`)
                  const convId = group?.conversation?.id
                  if(convId){
                    window.location.href = `/rooms/${encodeURIComponent(`conv:${convId}`)}`
                  }else{
                    window.location.href = `/rooms/${encodeURIComponent(group.name)}`
                  }
                }catch(e){
                  alert('Mutual follow required to start a chat')
                }
              }} className="btn-ghost">Message</button>
            )}
          </>
        )}
        {current === username && (
          <button onClick={()=>setEditing(e=>!e)} className="btn-primary">
            {editing ? 'Cancel' : 'Edit Profile'}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={saveProfile} className="card p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={form.display_name} onChange={e=>setForm({...form, display_name:e.target.value})} className="input" placeholder="Display name" />
            <input value={form.avatar_url} onChange={e=>setForm({...form, avatar_url:e.target.value})} className="input" placeholder="Avatar URL" />
            <input value={form.website} onChange={e=>setForm({...form, website:e.target.value})} className="input" placeholder="Website" />
            <input value={form.location} onChange={e=>setForm({...form, location:e.target.value})} className="input" placeholder="Location" />
          </div>
          <textarea value={form.bio} onChange={e=>setForm({...form, bio:e.target.value})} className="textarea mt-3" rows={3} placeholder="Bio" />
          <div className="mt-3">
            <button type="submit" className="btn-secondary">Save</button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Posts</h2>
        {loadingPosts && <div className="text-sm text-slate-400">Loading posts...</div>}
        {!loadingPosts && (
          <PostGrid posts={posts.filter(p=>p.image_url)} onSelect={setSelected} />
        )}
      </div>

      {selected && (
        <PostModal post={selected} onClose={()=>setSelected(null)} onUpdated={handleLike} />
      )}

      {showFollowers && (
        <Modal title="Followers" onClose={()=>setShowFollowers(false)}>
          {followers.length === 0 && <div className="empty">No followers yet.</div>}
          <div className="space-y-2">
            {followers.map(f=> (
              <Link key={f.username} to={`/users/${f.username}`} className="block text-sm" onClick={()=>setShowFollowers(false)}>@{f.username}</Link>
            ))}
          </div>
        </Modal>
      )}

      {showFollowing && (
        <Modal title="Following" onClose={()=>setShowFollowing(false)}>
          {following.length === 0 && <div className="empty">Not following anyone yet.</div>}
          <div className="space-y-2">
            {following.map(f=> (
              <Link key={f.username} to={`/users/${f.username}`} className="block text-sm" onClick={()=>setShowFollowing(false)}>@{f.username}</Link>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({title, onClose, children}){
  useEffect(()=>{
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e){
      if(e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return ()=>{
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKeyDown)
    }
  },[onClose])

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="card w-[90vw] max-w-md p-4 animate-scale-in"
        onClick={e=>e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">{title}</div>
          <button onClick={onClose} className="icon-btn text-gray-600" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
