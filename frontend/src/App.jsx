import React from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import NavBar from './components/NavBar'
import BottomNav from './components/BottomNav'
import Explore from './pages/Explore'
import Create from './pages/Create'
import Activity from './pages/Activity'
import Messages from './pages/Messages'
import ChatRoom from './pages/ChatRoom'
import Profile from './pages/Profile'
import Friends from './pages/Friends'
import ProfileLanding from './pages/ProfileLanding'

export default function App(){
  const location = useLocation()

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-5xl mx-auto p-4 pb-20">
        <div key={location.pathname} className="animate-fade-up">
          <Routes location={location}>
          <Route path="/" element={<Explore/>} />
          <Route path="/explore" element={<Explore/>} />
          <Route path="/search" element={<Friends/>} />
          <Route path="/create" element={<Create/>} />
          <Route path="/activity" element={<Activity/>} />
          <Route path="/messages" element={<Messages/>} />
          <Route path="/rooms/:roomId" element={<ChatRoom/>} />
          <Route path="/profile" element={<ProfileLanding/>} />
          <Route path="/users/:username" element={<Profile/>} />
          <Route path="/friends" element={<Friends/>} />
          </Routes>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
