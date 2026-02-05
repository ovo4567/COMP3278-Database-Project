import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../lib/api'

const items = [
  { to: '/explore', label: 'Explore', icon: '🧭' },
  { to: '/search', label: 'Search', icon: '🔍' },
  { to: '/create', label: 'Create', icon: '➕' },
  { to: '/activity', label: 'Activity', icon: '❤️' },
]

export default function BottomNav(){
  const [current, setCurrent] = useState('')
  const location = useLocation()

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then(me=>{ if(!ignore) setCurrent(me?.username || '') })
      .catch(()=>{ if(!ignore) setCurrent('') })
    return ()=>{ ignore = true }
  },[])

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#dbdbdb]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {items.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className={`text-sm ${location.pathname.startsWith(item.to) ? 'text-black' : 'text-[#8e8e8e]'}`}
          >
            <span className="block text-center text-lg">{item.icon}</span>
            <span className="block text-[10px]">{item.label}</span>
          </Link>
        ))}
        <Link
          to={current ? `/users/${current}` : '/profile'}
          className={`text-sm ${location.pathname.includes('/users') || location.pathname === '/profile' ? 'text-black' : 'text-[#8e8e8e]'}`}
        >
          <span className="block text-center text-lg">👤</span>
          <span className="block text-[10px]">Profile</span>
        </Link>
      </div>
    </nav>
  )
}
