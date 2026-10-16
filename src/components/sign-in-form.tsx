'use client';
import { useState } from 'react';
export function SignInForm() {
  const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  return <form className="sign-in__form" onSubmit={async(event)=>{event.preventDefault();setBusy(true); const form=new FormData(event.currentTarget);try{const response=await fetch('/api/auth/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.get('email'),password:form.get('password')})});const result=await response.json();if(response.ok) window.location.assign('/dashboard');else setMessage(result.error?.message || 'Unable to sign in.');}catch{setMessage('Unable to connect. Please retry.');}finally{setBusy(false);}}}>
    <label>Email<input name="email" type="email" autoComplete="username" required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
    <button disabled={busy}>{busy?'Signing in…':'Sign in'}</button><p role="status">{message}</p>
  </form>;
}
