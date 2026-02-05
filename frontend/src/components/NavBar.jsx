import React, {useEffect, useState} from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'

export default function NavBar(){
  const [users,setUsers]=useState([])
  const [current,setCurrent]=useState(localStorage.getItem('currentUser')||'')
  const [showAuth,setShowAuth]=useState(false)
  const [isRegister,setIsRegister]=useState(false)
  const [form,setForm]=useState({username:'', password:'', display_name:''})

  useEffect(()=>{ api.get('/users').then(u=>setUsers(u||[])).catch(()=>{}) },[])

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then((u)=>{
        if(ignore) return
        if(u && u.username){
          setCurrentUser(u.username)
        }
      })
      .catch(()=>{
        if(ignore) return
        setCurrentUser('')
      })
    return ()=>{ ignore = true }
  },[])

  function setCurrentUser(username){
    setCurrent(username)
    if(username){
      localStorage.setItem('currentUser', username)
    }else{
      localStorage.removeItem('currentUser')
    }
  }

  async function handleAuth(e){
    e.preventDefault()
    try{
      if(isRegister){
        if(!form.password || form.password.length < 6){
          alert('Password must be at least 6 characters')
          return
        }
        if(!form.username || form.username.length < 1){
          alert('Username required')
          return
        }
        await api.post('/auth/register', {username: form.username, password: form.password, display_name: form.display_name})
      }else{
        if(!form.username || !form.password){
          alert('Username and password required')
          return
        }
        await api.post('/auth/login', {username: form.username, password: form.password})
      }
      setCurrentUser(form.username)
      setShowAuth(false)
      // refresh user list
      const u = await api.get('/users')
      setUsers(u||[])
    }catch(err){
      alert(err.message || 'Auth failed')
    }
  }

  async function logout(){
    try{
      await api.post('/auth/logout')
    }catch(e){}
    setCurrentUser('')
  }

  return (
    <nav className="sticky top-0 z-20 bg-white border-b border-[#dbdbdb]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          InstaClone
        </Link>
        <div className="hidden md:block w-64">
          <input className="input bg-[#fafafa]" placeholder="Search" />
        </div>
        <div className="flex items-center gap-4">
          {current ? (
            <div className="flex items-center gap-3">
              <div className="text-sm text-[#262626] bg-[#efefef] px-2 py-1 rounded-full">@{current}</div>
              <button onClick={logout} className="btn-secondary">Logout</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={()=>{setIsRegister(false); setShowAuth(true)}} className="btn-primary">Login</button>
              <button onClick={()=>{setIsRegister(true); setShowAuth(true)}} className="btn-secondary">Register</button>
            </div>
          )}
        </div>
      </div>

      {showAuth && (
        <div className="max-w-5xl mx-auto p-4">
          <form onSubmit={handleAuth} className="card p-4 max-w-md">
            <h3 className="text-lg font-semibold mb-2">{isRegister? 'Register' : 'Login'}</h3>
            <div className="mb-2">
              <input placeholder="Username" value={form.username} onChange={e=>setForm({...form, username:e.target.value})} className="input" />
            </div>
            <div className="mb-2">
              <input type="password" placeholder="Password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} className="input" />
            </div>
            {isRegister && (
              <div className="mb-2">
                <input placeholder="Display name" value={form.display_name} onChange={e=>setForm({...form, display_name:e.target.value})} className="input" />
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">{isRegister? 'Create account' : 'Login'}</button>
              <button type="button" onClick={()=>setShowAuth(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </nav>
  )
}
