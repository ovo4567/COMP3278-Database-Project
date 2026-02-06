import React, { useEffect, useState } from 'react'
import PostComposer from '../components/PostComposer'
import api from '../lib/api'
import { useNavigate } from 'react-router-dom'

export default function Create(){
  const [current, setCurrent] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const navigate = useNavigate()

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then(me=>{ if(!ignore){ setCurrent(me?.username || ''); setAuthChecked(true) } })
      .catch(()=>{ if(!ignore){ setCurrent(''); setAuthChecked(true) } })
    return ()=>{ ignore = true }
  },[])

  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Create</h1>
        <p className="text-sm text-slate-300">Share a photo to your profile.</p>
      </div>
      {!current && authChecked && (
        <div className="card p-4">
          <div className="text-sm text-slate-300">Please log in to create a post.</div>
        </div>
      )}
      {current && (
        <PostComposer onPosted={()=> navigate(`/users/${current}`)} />
      )}
    </div>
  )
}
