import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'

export default function ProfileLanding(){
  const [checking, setChecking] = useState(true)
  const [current, setCurrent] = useState('')
  const navigate = useNavigate()

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then((me)=>{
        if(ignore) return
        const u = me?.username || localStorage.getItem('currentUser') || ''
        setCurrent(u)
        setChecking(false)
        if(u) navigate(`/users/${encodeURIComponent(u)}`, { replace: true })
      })
      .catch(()=>{
        if(ignore) return
        const u = localStorage.getItem('currentUser') || ''
        setCurrent(u)
        setChecking(false)
        if(u) navigate(`/users/${encodeURIComponent(u)}`, { replace: true })
      })
    return ()=>{ ignore = true }
  },[navigate])

  if(checking){
    return (
      <div className="card p-4">
        <div className="text-sm text-slate-300">Loading profile…</div>
      </div>
    )
  }

  if(!current){
    return (
      <div className="card p-4">
        <h1 className="text-xl font-semibold">Profile</h1>
        <p className="text-sm text-slate-300 mt-1">Log in to view and edit your profile.</p>
        <div className="mt-3">
          <Link to="/explore" className="btn-secondary">Go to Explore</Link>
        </div>
      </div>
    )
  }

  return null
}
