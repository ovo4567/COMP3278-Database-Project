import React from 'react'

export default function Activity(){
  return (
    <div>
      <div className="card p-4 mb-4">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-gray-600">Likes, comments, and follows will appear here.</p>
      </div>
      <div className="empty">No activity yet.</div>
    </div>
  )
}
