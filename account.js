const client = window.ticketlySupabase;
const list = document.querySelector('#account-ticket-list');
const messageBox = document.querySelector('#account-message');
const ticketForm = document.querySelector('#account-ticket-form');
const fileInput = document.querySelector('#ticket-attachment');
let currentUser;
let ticketsById = new Map();
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function notify(text, error = false) { messageBox.textContent = text; messageBox.dataset.kind = error ? 'error' : 'success'; messageBox.hidden = false; }
function safeFilename(name) { return String(name).normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'ticket-file'; }
async function removeStoredFile(path) { if (!path) return; const { error } = await client.storage.from('ticket-attachments').remove([path]); if (error) console.error('Private attachment cleanup failed', error.message); }
async function renderTicket(ticket) {
  let attachment = '<small class="barcode-ending">NO FILE ATTACHED</small>';
  if (ticket.attachment_path) {
    const { data, error } = await client.storage.from('ticket-attachments').createSignedUrl(ticket.attachment_path, 90);
    attachment = error ? '<small class="barcode-ending">ATTACHMENT UNAVAILABLE</small>' : `<a class="ticket-file-link" href="${escapeHtml(data.signedUrl)}" target="_blank" rel="noopener" aria-label="Open private ticket attachment for ${escapeHtml(ticket.event_title)}">Open private attachment ↗</a>`;
  }
  const barcode = ticket.barcode ? `<small class="barcode-ending">BARCODE ON FILE · •••• ${escapeHtml(ticket.barcode.slice(-4))}</small>` : '<small class="barcode-ending">NO BARCODE SAVED</small>';
  return `<article class="account-ticket-card"><div class="ticket-date-tile">${ticket.event_date ? `<span>${new Date(`${ticket.event_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span><strong>${new Date(`${ticket.event_date}T12:00:00`).getDate()}</strong>` : '<span>DATE</span><strong>—</strong>'}</div><div class="account-ticket-info"><span class="ticket-card-label">SAVED TICKET · ${ticket.quantity} ${ticket.quantity === 1 ? 'TICKET' : 'TICKETS'}</span><h3>${escapeHtml(ticket.event_title)}</h3><p>${escapeHtml(ticket.venue)}${ticket.event_date ? ` · ${new Date(`${ticket.event_date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}</p>${barcode}${attachment}</div><div class="ticket-actions"><button class="ticket-edit" type="button" data-ticket-edit="${ticket.id}">Edit</button><button class="ticket-delete" type="button" data-ticket-delete="${ticket.id}" aria-label="Remove ${escapeHtml(ticket.event_title)}">Remove</button></div></article>`;
}
async function loadTickets() {
  list.innerHTML = '<div class="ticket-loading">Loading your saved tickets…</div>';
  const { data, error } = await client.from('purchased_tickets').select('id,event_title,venue,event_date,quantity,barcode,attachment_path,created_at').order('event_date', { ascending: true, nullsFirst: false });
  if (error) { list.innerHTML = '<div class="account-empty"><h3>Tickets could not be loaded.</h3><p>Check that the latest database setup SQL has been run in Supabase.</p></div>'; console.error('Ticket query failed', error); return; }
  const tickets = data || [];
  ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  document.querySelector('#ticket-count').textContent = String(tickets.length).padStart(2, '0');
  document.querySelector('#next-event').textContent = tickets.find((ticket) => ticket.event_date && ticket.event_date >= new Date().toISOString().slice(0, 10))?.event_title || 'Let’s make a plan';
  if (!tickets.length) { list.innerHTML = '<div class="account-empty"><span class="empty-ticket-icon">✦</span><h3>Your next big night starts here.</h3><p>Add details for a ticket you’ve already purchased and keep your plans handy.</p><button type="button" class="account-add-button" id="empty-add-ticket">Add your first ticket <span>↗</span></button></div>'; document.querySelector('#empty-add-ticket').addEventListener('click', () => openTicketForm()); return; }
  list.innerHTML = (await Promise.all(tickets.map(renderTicket))).join('');
  list.querySelectorAll('[data-ticket-edit]').forEach((button) => button.addEventListener('click', () => openTicketForm(ticketsById.get(button.dataset.ticketEdit))));
  list.querySelectorAll('[data-ticket-delete]').forEach((button) => button.addEventListener('click', async () => {
    const ticket = ticketsById.get(button.dataset.ticketDelete);
    if (!confirm('Remove this saved ticket and its attached file from your account?')) return;
    const { error } = await client.from('purchased_tickets').delete().eq('id', ticket.id);
    if (error) { notify(error.message, true); return; }
    await removeStoredFile(ticket.attachment_path);
    notify('Ticket details removed.'); await loadTickets();
  }));
}
function openTicketForm(ticket = null) {
  ticketForm.reset();
  ticketForm.elements.id.value = ticket?.id || '';
  ticketForm.elements.title.value = ticket?.event_title || '';
  ticketForm.elements.venue.value = ticket?.venue || '';
  ticketForm.elements.event_date.value = ticket?.event_date || '';
  ticketForm.elements.quantity.value = String(ticket?.quantity || 1);
  ticketForm.elements.barcode.value = ticket?.barcode || '';
  document.querySelector('#ticket-form-title').textContent = ticket ? 'Edit your ticket details' : 'Add a purchased ticket';
  document.querySelector('#ticket-form-submit').textContent = ticket ? 'Save ticket changes' : 'Save to my tickets';
  document.querySelector('#current-attachment').textContent = ticket?.attachment_path ? 'A private file is attached. Upload a new file to replace it.' : 'Optional: JPG, PNG, WebP or PDF; maximum 8 MB.';
  ticketForm.hidden = false; ticketForm.scrollIntoView({ behavior: 'smooth', block: 'center' }); ticketForm.elements.title.focus();
}
document.querySelector('#toggle-add-ticket').addEventListener('click', () => openTicketForm());
document.querySelector('#close-add-ticket').addEventListener('click', () => { ticketForm.hidden = true; });
ticketForm.addEventListener('submit', async (event) => {
  event.preventDefault(); messageBox.hidden = true;
  const data = new FormData(ticketForm);
  const file = fileInput.files?.[0] || null;
  if (file && !ALLOWED_TYPES.has(file.type)) return notify('Choose a JPG, PNG, WebP, or PDF file.', true);
  if (file && file.size > MAX_FILE_BYTES) return notify('Files must be 8 MB or smaller.', true);
  const ticketId = String(data.get('id') || '');
  const previous = ticketId ? ticketsById.get(ticketId) : null;
  const record = { user_id: currentUser.id, event_title: String(data.get('title')).trim(), venue: String(data.get('venue')).trim(), event_date: data.get('event_date') || null, quantity: Number(data.get('quantity')), barcode: String(data.get('barcode') || '').trim() || null };
  const submit = document.querySelector('#ticket-form-submit'); submit.disabled = true;
  let savedTicket = previous;
  try {
    if (previous) {
      const { data: updated, error } = await client.from('purchased_tickets').update(record).eq('id', previous.id).select('id').single();
      if (error) throw error;
      savedTicket = { ...previous, ...record, id: updated.id };
    } else {
      const { data: inserted, error } = await client.from('purchased_tickets').insert(record).select('id').single();
      if (error) throw error;
      savedTicket = { ...record, id: inserted.id, attachment_path: null };
    }
    if (file) {
      const path = `${currentUser.id}/${savedTicket.id}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
      const { error: uploadError } = await client.storage.from('ticket-attachments').upload(path, file, { contentType: file.type, cacheControl: '0', upsert: false });
      if (uploadError) throw uploadError;
      const { error: updateError } = await client.from('purchased_tickets').update({ attachment_path: path }).eq('id', savedTicket.id);
      if (updateError) { await removeStoredFile(path); throw updateError; }
      await removeStoredFile(previous?.attachment_path);
    }
    ticketForm.reset(); ticketForm.hidden = true; notify(previous ? 'Ticket details updated securely.' : 'Ticket details saved to your account.'); await loadTickets();
  } catch (error) {
    notify(error.message || 'Could not save ticket details. Please try again.', true);
    console.error('Ticket save failed', error);
  } finally { submit.disabled = false; }
});
document.querySelector('#signout-button').addEventListener('click', async () => {
  const { error } = await client.auth.signOut();
  if (error) return notify(error.message, true);
  location.replace('/login.html');
});
(async () => {
  if (!client) { list.innerHTML = `<div class="account-empty"><h3>Account setup needed</h3><p>${escapeHtml(window.ticketlySupabaseSetupError || 'Supabase configuration is missing.')} Follow the included setup guide.</p><a class="account-add-button" href="/login.html">Go to sign in</a></div>`; return; }
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) { location.replace(`/login.html?next=${encodeURIComponent('/account.html')}`); return; }
  currentUser = session.user;
  document.querySelector('#account-email').textContent = currentUser.email || 'Ticketly member';
  document.querySelector('#account-avatar').textContent = (currentUser.email || 'T').charAt(0).toUpperCase();
  await loadTickets();
  client.auth.onAuthStateChange((event, nextSession) => { if (event === 'SIGNED_OUT' || !nextSession) location.replace('/login.html'); });
})();
