import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { apiRequest, saveToken } from '../api.js';
import { errorMessage } from '../utils/admin.js';

export function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      // Use the dedicated admin endpoint. /auth/login is a compatibility alias,
      // while the API guide recommends this route for the admin panel.
      const result = await apiRequest('/auth/admin/login', { method: 'POST', body: { email, password } });
      const { accessToken, user } = result.data || {};
      if (!accessToken) throw new Error('The server did not return an access token.');
      saveToken(accessToken);
      onLogin(accessToken, user);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-brand"><div className="brand-mark"><span>e</span></div><span>edhyaa<span className="brand-dot">.</span></span></div>
        <div className="story-copy"><span className="eyebrow">ADMIN STUDIO</span><h1>Your store,<br />beautifully in control.</h1><p>One workspace for your catalogue, customers, orders, and store operations.</p></div>
        <div className="story-foot"><div className="story-line" /><span>Edhyaa Store administration</span></div>
      </section>
      <section className="login-panel">
        <div className="login-top"><span>ADMIN PORTAL</span><span>SECURE ACCESS</span></div>
        <div className="login-form-wrap">
          <div className="login-greeting"><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your<br />workspace</h2><p>Use your admin credentials to continue.</p></div>
          <form className="login-form" onSubmit={submit}>
            <label htmlFor="admin-email">Email address</label>
            <input id="admin-email" type="email" autoComplete="username" placeholder="you@edhyaa.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>Sign in <ArrowRight size={17} /></>}</button>
          </form>
          <div className="login-note">Your admin session is protected with secure authentication.</div>
        </div>
        <div className="login-footer"><span>© {new Date().getFullYear()} Edhyaa</span><span>Contact your administrator for access</span></div>
      </section>
    </main>
  );
}
