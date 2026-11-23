const greeting = document.querySelector('#time-greeting');
if (greeting) {
  const hour = new Date().getHours();
  greeting.textContent = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
}
const client = window.ticketlySupabase;
const authForm = document.querySelector('#auth-form');
const recoveryForm = document.querySelector('#recovery-form');
const emailInput = document.querySelector('#auth-email');
const passwordInput = document.querySelector('#auth-password');
const messageBox = document.querySelector('#auth-message');
const title = document.querySelector('#auth-title');
const subtitle = document.querySelector('#auth-subtitle');
const submit = document.querySelector('#auth-submit');
const signInTab = document.querySelector('#signin-tab');
const signUpTab = document.querySelector('#signup-tab');
let mode = 'signin';
let turnstileWidgetId = null;
let turnstileToken = '';
const turnstileSiteKey = String(window.TICKETLY_TURNSTILE_SITE_KEY || '').trim();
function setupTurnstile() {
  const container = document.querySelector('#turnstile-container');
  if (!turnstileSiteKey) return;
  container.hidden = false;
  const render = () => {
    if (turnstileWidgetId !== null || !window.turnstile?.render) return;
    turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
      sitekey: turnstileSiteKey, theme: 'light', callback: (token) => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = ''; },
      'error-callback': () => { turnstileToken = ''; message('Security check unavailable. Refresh and try again.', 'error'); }
    });
  };
  render();
  const timer = setInterval(() => { render(); if (turnstileWidgetId !== null) clearInterval(timer); }, 150);
  setTimeout(() => clearInterval(timer), 15000);
}
setupTurnstile();
function message(text, kind = 'info') { messageBox.textContent = text; messageBox.dataset.kind = kind; messageBox.hidden = false; }
function clearMessage() { messageBox.hidden = true; messageBox.textContent = ''; }
function setMode(next) {
  mode = next; clearMessage(); recoveryForm.hidden = true; authForm.hidden = false;
  const signingUp = mode === 'signup';
  title.textContent = signingUp ? 'Make it yours.' : 'Welcome back.';
  subtitle.textContent = signingUp ? 'Create an account to keep your plans in one place.' : 'Sign in to get back to the good stuff.';
  submit.innerHTML = signingUp ? 'Create my account <span>↗</span>' : 'Sign in <span>↗</span>';
  signInTab.classList.toggle('active', !signingUp); signUpTab.classList.toggle('active', signingUp);
  signInTab.setAttribute('aria-selected', String(!signingUp)); signUpTab.setAttribute('aria-selected', String(signingUp));
  passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
  document.querySelector('#forgot-password').hidden = signingUp;
}
signInTab.addEventListener('click', () => setMode('signin'));
signUpTab.addEventListener('click', () => setMode('signup'));
document.querySelector('#forgot-password').addEventListener('click', async () => {
  clearMessage();
  if (!client) return message(window.ticketlySupabaseSetupError || 'Supabase is not configured.', 'error');
  if (!emailInput.value.trim()) { emailInput.focus(); return message('Enter your email address first.', 'error'); }
  const { error } = await client.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo: `${location.origin}/login.html?recovery=1` });
  if (error) return message(error.message, 'error');
  message('If that account exists, a password reset link is on its way. Check your inbox.', 'success');
});
authForm.addEventListener('submit', async (event) => {
  event.preventDefault(); clearMessage();
  if (!client) return message(window.ticketlySupabaseSetupError || 'Supabase is not configured.', 'error');
  submit.disabled = true;
  try {
    const email = emailInput.value.trim(); const password = passwordInput.value;
    if (mode === 'signup') {
      if (turnstileSiteKey && !turnstileToken) { message('Complete the security check before creating your account.', 'error'); return; }
      const signupOptions = { emailRedirectTo: `${location.origin}/login.html?confirmed=1` };
      if (turnstileToken) signupOptions.captchaToken = turnstileToken;
      const { data, error } = await client.auth.signUp({ email, password, options: signupOptions });
      if (error) throw error;
      if (data.session) location.assign('/account.html');
      else message('Check your email for a confirmation link to finish creating your account.', 'success');
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const next = new URLSearchParams(location.search).get('next');
      location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account.html');
    }
  } catch (error) { message(error.message || 'Could not complete sign in. Please try again.', 'error'); }
  finally { submit.disabled = false; if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId); turnstileToken = ''; }
});
recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault(); clearMessage();
  if (!client) return message(window.ticketlySupabaseSetupError || 'Supabase is not configured.', 'error');
  const { error } = await client.auth.updateUser({ password: document.querySelector('#new-password').value });
  if (error) return message(error.message, 'error');
  message('Password updated. Your account is ready.', 'success');
  setTimeout(() => location.assign('/account.html'), 900);
});
(async () => {
  const params = new URLSearchParams(location.search);
  if (!client) { message(window.ticketlySupabaseSetupError || 'Supabase client unavailable.', 'error'); return; }
  if (params.has('confirmed')) message('Email confirmed. Sign in to continue.', 'success');
  const { data: { session } } = await client.auth.getSession();
  if (session && !params.has('recovery')) { location.replace('/account.html'); return; }
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { authForm.hidden = true; recoveryForm.hidden = false; title.textContent = 'Choose a new password.'; subtitle.textContent = 'Make it strong, then you’re back in.'; }
  });
  if (params.has('recovery')) { authForm.hidden = true; recoveryForm.hidden = false; title.textContent = 'Choose a new password.'; subtitle.textContent = 'Make it strong, then you’re back in.'; }
})();
