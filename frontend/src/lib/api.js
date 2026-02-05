export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function request(path, {method='GET', body=null, multipart=false}={}){
  const url = API_BASE + path
  const opts = { method, credentials: 'include' }
  if(body){
    if(multipart){ opts.body = body }
    else { opts.headers = {'Content-Type':'application/json'}; opts.body = JSON.stringify(body) }
  }
  const res = await fetch(url, opts)
  if(!res.ok){ const text = await res.text(); throw new Error(text||res.statusText) }
  const ct = res.headers.get('content-type')||''
  if(ct.includes('application/json')) return res.json()
  return res.text()
}

export default {
  get: (p)=> request(p),
  post: (p, body, opts={})=> request(p, {method:'POST', body, multipart: opts && opts.multipart}),
  put: (p, body)=> request(p, {method:'PUT', body}),
  del: (p)=> request(p, {method:'DELETE'})
}
