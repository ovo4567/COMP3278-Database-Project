import React, { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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

  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false })
  const containerRef = React.useRef(null)
  const itemRefs = React.useRef([])

  useEffect(()=>{
    let ignore = false
    api.get('/auth/me')
      .then(me=>{ if(!ignore) setCurrent(me?.username || '') })
      .catch(()=>{ if(!ignore) setCurrent('') })
    return ()=>{ ignore = true }
  },[])

  const itemsWithProfile = [
    ...items,
    { to: '/profile', label: 'Profile', icon: '👤' },
  ]

  const activeIndex = React.useMemo(()=>{
    const path = location.pathname
    return itemsWithProfile.findIndex((item)=>{
      if(item.to === '/explore') return path === '/' || path.startsWith('/explore')
      if(item.to === '/search') return path.startsWith('/friends') || path.startsWith('/search')
      if(item.to === '/profile') return path.startsWith('/users') || path.startsWith('/profile')
      return path.startsWith(item.to)
    })
  },[location.pathname])

  useEffect(()=>{
    function measure(){
      const el = itemRefs.current[activeIndex]
      const container = containerRef.current
      if(!el || !container){
        setIndicator((prev)=> ({...prev, visible: false}))
        return
      }

      const left = el.offsetLeft
      const width = el.offsetWidth
      const barWidth = Math.max(18, Math.min(34, Math.round(width * 0.42)))
      const barLeft = Math.round(left + (width / 2) - (barWidth / 2))
      setIndicator({ left: barLeft, width: barWidth, visible: true })
    }

    // next frame to ensure layout is ready
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return ()=>{
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  },[activeIndex, location.pathname])

  // Note: /profile is a frontend landing route that redirects to /users/:username when logged in.

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t glass-nav">
      <div ref={containerRef} className="relative max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {indicator.visible && (
          <div
            className="absolute bottom-1 h-[2px] rounded-full bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-violet-300 transition-all duration-300"
            style={{ left: indicator.left, width: indicator.width }}
            aria-hidden
          />
        )}

        {itemsWithProfile.map((item, idx) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-item text-sm ${isActive ? 'nav-item-active neon-glow-soft' : 'nav-item-inactive'}`
            }
            aria-label={item.label}
            ref={(el)=>{ itemRefs.current[idx] = el }}
          >
            {({ isActive }) => (
              <>
                <span className={`block text-center text-lg leading-none transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}>{item.icon}</span>
                <span className="block text-[10px]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
