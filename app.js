const $ = (selector) => document.querySelector(selector);
const apiBase = String(window.TICKETLY_API_BASE_URL || '').replace(/\/$/, '');
const eventsList = $('#events-list');
const emptyState = $('#empty-state');
const toast = $('#toast');
let allEvents = [];
let activeCategory = 'all';
let toastTimer;
let currentEvent = null;
let cameraStream = null;
let scannerFrame = null;
const favoriteStore = 'ticketly-followed-events-v1';
const favorites = new Set(JSON.parse(localStorage.getItem(favoriteStore) || '[]'));

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function apiUrl(path) { return `${apiBase}${path}`; }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3200); }
function getCountry() { return $('#country-select').value; }
function categoryOf(item) {
  const segment = item.classifications?.find((entry) => entry.primary)?.segment?.name || item.classifications?.[0]?.segment?.name || 'Live event';
  if (/sport/i.test(segment)) return 'Sports';
  if (/comedy/i.test(segment)) return 'Comedy';
  if (/family/i.test(segment)) return 'Family';
  if (/arts|theatre|theater/i.test(segment)) return 'Arts & Theatre';
  if (/music|rock|pop|country|jazz|hip.?hop|rap|r&b|metal|alternative|folk|blues|reggae|latin/i.test(segment)) return 'Concerts';
  return segment;
}
function mapEvent(item) {
  const start = item.dates?.start || {};
  const venue = item._embedded?.venues?.[0] || {};
  const date = start.localDate || '';
  const dateObject = date ? new Date(`${date}T12:00:00`) : null;
  const image = item.images?.find((candidate) => candidate.ratio === '16_9' && candidate.width >= 600)?.url || item.images?.[0]?.url || '';
  return { id: item.id, title: item.name || 'Live event', venue: venue.name || 'Venue details on provider page', city: [venue.city?.name, venue.country?.name].filter(Boolean).join(', ') || 'Location on provider page', category: categoryOf(item), date, dateLabel: dateObject ? dateObject.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Date TBA', time: start.localTime ? new Date(`1970-01-01T${start.localTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Time TBA', image, url: item.url || '', priceRange: item.priceRanges?.[0] || null };
}
function updateCount() { const badge = $('#saved-count'); badge.textContent = String(favorites.size); badge.hidden = !favorites.size; }
function renderEvents() {
  const term = $('#search-input').value.trim().toLowerCase();
  const filtered = allEvents.filter((event) => (!term || `${event.title} ${event.venue} ${event.city} ${event.category}`.toLowerCase().includes(term)) && (activeCategory === 'all' || event.category.toLowerCase().includes(activeCategory.toLowerCase())));
  eventsList.innerHTML = filtered.map((event) => {
    const index = allEvents.indexOf(event);
    const picture = event.image ? `<img src="${escapeHtml(event.image)}" alt="" loading="lazy" />` : '';
    return `<article class="event-card"><div class="event-thumb">${picture}<span class="event-date">${escapeHtml(event.dateLabel)}</span></div><div class="event-info"><p class="event-type">${escapeHtml(event.category)}</p><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.venue)}</p><p>${escapeHtml(event.city)} · ${escapeHtml(event.time)}</p><div class="event-actions"><button type="button" data-details="${index}">Event details</button><button type="button" class="save-event ${favorites.has(event.id) ? 'saved' : ''}" data-favorite="${index}" aria-label="${favorites.has(event.id) ? 'Unfollow' : 'Follow'} ${escapeHtml(event.title)}">${favorites.has(event.id) ? '♥ Following' : '♡ Follow'}</button></div></div></article>`;
  }).join('');
  emptyState.hidden = filtered.length !== 0;
  $('#result-count').textContent = filtered.length ? `${filtered.length} listing${filtered.length === 1 ? '' : 's'}` : 'No listings';
  eventsList.querySelectorAll('[data-details]').forEach((button) => button.addEventListener('click', () => openEventDetails(allEvents[Number(button.dataset.details)])));
  eventsList.querySelectorAll('[data-favorite]').forEach((button) => button.addEventListener('click', () => toggleFavorite(allEvents[Number(button.dataset.favorite)])));
}
function toggleFavorite(event) {
  if (favorites.has(event.id)) favorites.delete(event.id); else favorites.add(event.id);
  localStorage.setItem(favoriteStore, JSON.stringify([...favorites]));
  updateCount(); renderEvents(); renderMyEvents();
  showToast(favorites.has(event.id) ? 'Event added to your followed list.' : 'Event removed from your followed list.');
}
function setFeatured(event) {
  if (!event) return;
  $('#feature-title').textContent = event.title;
  $('#feature-meta').textContent = `${event.dateLabel} · ${event.venue} · ${event.city}`;
  $('#feature-category').textContent = event.category.toUpperCase();
  const image = $('#feature-image');
  image.src = event.image || 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1400&q=85';
  image.alt = event.image ? `Event listing: ${event.title}` : '';
  $('#feature-link').onclick = (click) => { click.preventDefault(); openEventDetails(event); };
}
async function loadEvents() {
  const status = $('#live-status');
  status.textContent = 'Loading event listings…';
  const params = new URLSearchParams({ countryCode: getCountry(), size: '24' });
  const city = $('#city-input').value.trim();
  const keyword = $('#search-input').value.trim();
  if (city) params.set('city', city);
  if (keyword) params.set('keyword', keyword);
  const classifications = { Concerts: 'Music', Sports: 'Sports', Comedy: 'Comedy', Family: 'Family', 'Arts & Theatre': 'Theatre' };
  if (activeCategory !== 'all' && classifications[activeCategory]) params.set('classificationName', classifications[activeCategory]);
  try {
    const response = await fetch(apiUrl(`/api/live-events?${params}`));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Event listings are unavailable.');
    allEvents = (payload.events || []).map(mapEvent).filter((event) => event.url);
    status.textContent = payload.configured === false ? 'Add a Discovery API key to load listings' : `${allEvents.length} provider event listing${allEvents.length === 1 ? '' : 's'}`;
    status.parentElement.querySelector('i').style.background = allEvents.length ? '#42d499' : '#ffb33d';
    if (allEvents.length) setFeatured(allEvents[0]);
    renderEvents(); renderMyEvents();
  } catch (error) {
    status.textContent = 'Event listings unavailable';
    allEvents = []; renderEvents(); renderMyEvents();
    console.warn('Event discovery unavailable:', error.message);
  }
}
function openEventDetails(event) {
  currentEvent = event;
  $('#dialog-title').textContent = event.title;
  $('#dialog-category').textContent = event.category.toUpperCase();
  $('#dialog-meta').textContent = `${event.dateLabel} · ${event.venue} · ${event.city} · ${event.time}`;
  const image = $('#dialog-image'); image.src = event.image || ''; image.alt = event.image ? event.title : '';
  const provider = $('#dialog-provider-link');
  provider.href = event.url || '#';
  provider.onclick = (click) => { if (!event.url) { click.preventDefault(); showToast('The official ticket link is not available for this listing.'); } };
  $('#dialog-save-button').onclick = () => { closeEventDetails(); openTicketForm(event); };
  $('#event-dialog').hidden = false; document.body.style.overflow = 'hidden'; $('#dialog-close')?.focus();
}
function closeEventDetails() { $('#event-dialog').hidden = true; document.body.style.overflow = ''; }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => { screen.hidden = screen.id !== id; });
  document.querySelectorAll('.bottom-link').forEach((link) => link.classList.toggle('selected', link.dataset.screen === id));
  if (id === 'my-events') renderMyEvents();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function getSession() {
  if (!window.ticketlySupabase) return null;
  const { data } = await window.ticketlySupabase.auth.getSession();
  return data.session || null;
}
async function renderMyEvents() {
  const host = $('#my-events-list');
  if (!host) return;
  const followed = [...favorites].map((id) => allEvents.find((event) => event.id === id)).filter(Boolean);
  let ticketCards = [];
  const session = await getSession();
  $('#login-my-events').hidden = Boolean(session);
  if (session) {
    const { data, error } = await window.ticketlySupabase.from('purchased_tickets').select('id,event_title,venue,event_date,quantity,barcode').order('event_date', { ascending: true, nullsFirst: false });
    if (!error) ticketCards = data || [];
    else console.warn('Could not load saved tickets:', error.message);
  }
  const followedHtml = followed.map((event) => `<article class="saved-event-card"><div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.dateLabel)} · ${escapeHtml(event.venue)}</p></div><button type="button" data-open-saved="${escapeHtml(event.id)}">View listing</button></article>`).join('');
  const ticketsHtml = ticketCards.map((ticket) => `<article class="saved-event-card"><div><p class="event-type">PURCHASED TICKET DETAILS · ${Number(ticket.quantity) || 1} TICKET(S)</p><h3>${escapeHtml(ticket.event_title)}</h3><p>${escapeHtml(ticket.venue)}${ticket.event_date ? ` · ${escapeHtml(ticket.event_date)}` : ''}${ticket.barcode ? ` · Code ending ${escapeHtml(ticket.barcode.slice(-4))}` : ''}</p></div><div class="ticket-card-actions"><a class="secondary-button" href="/account.html#account-tickets">Manage</a><button type="button" data-issuer-action>Transfer / sell</button></div></article>`).join('');
  const signInNote = !session ? '<div class="saved-event-empty">Sign in to see the purchased ticket details saved to your account.</div>' : (!ticketCards.length ? '<div class="saved-event-empty">No purchased ticket details saved yet. Add details for a ticket you already bought.</div>' : '');
  host.innerHTML = `${followedHtml}${ticketsHtml}${signInNote}`;
  host.querySelectorAll('[data-open-saved]').forEach((button) => button.addEventListener('click', () => { const event = allEvents.find((item) => item.id === button.dataset.openSaved); if (event) openEventDetails(event); else showToast('Refresh event listings to view this event.'); }));
  host.querySelectorAll('[data-issuer-action]').forEach((button) => button.addEventListener('click', () => showToast('Ticket transfer or resale must be completed through the original ticket issuer.')));
}
function openTicketForm(event = null) {
  if (!window.ticketlySupabase) { showToast(window.ticketlySupabaseSetupError || 'Connect Supabase and sign in to save ticket details.'); location.assign('/login.html?next=%2Faccount.html'); return; }
  getSession().then((session) => {
    if (!session) { location.assign('/login.html?next=%2Faccount.html'); return; }
    const form = $('#ticket-form'); form.reset();
    if (event) { form.elements.title.value = event.title; form.elements.venue.value = event.venue; form.elements.date.value = event.date || ''; }
    $('#ticket-dialog').hidden = false; document.body.style.overflow = 'hidden';
  });
}
function closeTicketDialog() { stopScanner(); $('#ticket-dialog').hidden = true; document.body.style.overflow = ''; }
function stopScanner() { if (scannerFrame) cancelAnimationFrame(scannerFrame); scannerFrame = null; if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop()); cameraStream = null; $('#scan-video').hidden = true; }
async function scanLoop() {
  const video = $('#scan-video');
  if (!cameraStream || video.readyState < 2) { scannerFrame = requestAnimationFrame(scanLoop); return; }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'pdf417'] });
    const codes = await detector.detect(video);
    if (codes[0]) { $('#ticket-form').elements.barcode.value = codes[0].rawValue; stopScanner(); showToast('Code captured only. It has not been validated.'); return; }
  } catch (error) { console.warn('Barcode detection error:', error); }
  scannerFrame = requestAnimationFrame(scanLoop);
}
async function saveTicket(event) {
  event.preventDefault();
  const client = window.ticketlySupabase;
  if (!client) return showToast(window.ticketlySupabaseSetupError || 'Supabase is not configured.');
  const session = await getSession();
  if (!session) { location.assign('/login.html?next=%2Faccount.html'); return; }
  const data = new FormData(event.currentTarget);
  const record = { user_id: session.user.id, event_title: String(data.get('title')).trim(), venue: String(data.get('venue')).trim(), event_date: data.get('date') || null, quantity: Number(data.get('quantity')), barcode: String(data.get('barcode') || '').trim() || null };
  const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
  const { error } = await client.from('purchased_tickets').insert(record);
  button.disabled = false;
  if (error) { showToast(error.message); return; }
  closeTicketDialog(); showToast('Purchased ticket details saved privately.'); await renderMyEvents();
}
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); activeCategory = activeCategory || 'all'; loadEvents(); });
$('#clear-search').addEventListener('click', () => { $('#search-input').value = ''; $('#search-input').focus(); loadEvents(); });
$('#clear-filters').addEventListener('click', () => { $('#search-input').value = ''; $('#city-input').value = ''; activeCategory = 'all'; document.querySelectorAll('.pill').forEach((pill) => pill.classList.toggle('active', pill.dataset.category === 'all')); loadEvents(); });
$('#country-select').addEventListener('change', () => { $('#country-label').textContent = getCountry(); loadEvents(); });
$('#city-input').addEventListener('change', loadEvents);
document.querySelectorAll('.pill').forEach((pill) => pill.addEventListener('click', () => { activeCategory = pill.dataset.category; document.querySelectorAll('.pill').forEach((item) => item.classList.toggle('active', item === pill)); loadEvents(); }));
document.querySelectorAll('.bottom-link').forEach((button) => button.addEventListener('click', async () => {
  if (button.dataset.screen === 'account-screen') {
    const session = await getSession();
    location.assign(session ? '/account.html' : '/login.html');
    return;
  }
  showScreen(button.dataset.screen);
}));
$('#saved-nav').addEventListener('click', () => showScreen('my-events'));
$('#add-ticket-button').addEventListener('click', () => openTicketForm());
$('#ticket-form').addEventListener('submit', saveTicket);
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', closeEventDetails));
document.querySelectorAll('[data-close-ticket]').forEach((button) => button.addEventListener('click', closeTicketDialog));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeEventDetails(); closeTicketDialog(); } });
$('#start-scan').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) return showToast('Camera scanning is unsupported here. You can enter the code manually.');
  try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); const video = $('#scan-video'); video.srcObject = cameraStream; video.hidden = false; await video.play(); scannerFrame = requestAnimationFrame(scanLoop); }
  catch { showToast('Allow camera access over HTTPS, or enter the barcode manually.'); }
});
(async () => {
  updateCount();
  if (window.ticketlySupabase) {
    const session = await getSession();
    if (session) { $('#account-link').textContent = (session.user.email || 'Account').slice(0, 1).toUpperCase(); $('#account-link').href = '/account.html'; }
    window.ticketlySupabase.auth.onAuthStateChange(() => renderMyEvents());
  }
  await loadEvents();
})();
