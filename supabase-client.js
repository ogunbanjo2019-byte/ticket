(() => {
  const url = String(window.TICKETLY_SUPABASE_URL || '').trim();
  const anonKey = String(window.TICKETLY_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    window.ticketlySupabase = null;
    window.ticketlySupabaseSetupError = 'Add your Supabase project URL and anon/publishable key in frontend/config.js to enable account features.';
    return;
  }
  if (!window.supabase?.createClient) {
    window.ticketlySupabaseSetupError = 'Could not load the Supabase client. Check the network or CDN access.';
    return;
  }
  window.ticketlySupabase = window.supabase.createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
