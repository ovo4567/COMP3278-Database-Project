import React, {useState} from 'react'
import api from '../lib/api'

export default function PostComposer({onPosted}){
  const [content,setContent]=useState('')
  const [image,setImage]=useState(null)
  const [imageUrl,setImageUrl]=useState('')
  const [loading,setLoading]=useState(false)

  async function submit(e){
    e.preventDefault()
    if(!content && !image && !imageUrl) return
    setLoading(true)
    try{
      const username = localStorage.getItem('currentUser') || ''
      if(!username){
        alert('Please log in before posting')
        setLoading(false)
        return
      }
      let image_url = null
      if(image){
        const form = new FormData()
        form.append('file', image)
        const uploadRes = await api.post('/upload', form, {multipart:true})
        image_url = uploadRes.url
      }else if(imageUrl){
        image_url = imageUrl
      }

      const body = { username, content, image_url }
      const res = await api.post('/groups/global/messages', body)
      setContent('')
      setImage(null)
      setImageUrl('')
      if(onPosted) onPosted(res)
    }catch(err){
      console.error(err)
      alert('Failed to post')
    }finally{ setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="card p-3 mb-4">
      <textarea value={content} onChange={e=>setContent(e.target.value)} rows={3} className="textarea mb-3" placeholder="Write a caption..." />
      <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="input mb-3" placeholder="Paste image URL (optional)" />
      <div className="flex items-center gap-2">
        <label className="btn-secondary cursor-pointer">
          <input type="file" accept="image/*" onChange={e=>setImage(e.target.files[0])} className="hidden" />
          Add photo
        </label>
        <button className="ml-auto btn-primary" disabled={loading}>{loading? 'Posting...':'Post'}</button>
      </div>
    </form>
  )
}
