let events = [];
let liveEventCount = 0;
const grid = document.querySelector('#events-grid');
const emptyState = document.querySelector('#empty-state');
const resultCount = document.querySelector('#result-count');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const locationFilter = document.querySelector('#location-filter');
const dateFilter = document.querySelector('#date-filter');
const categoryFilter = document.querySelector('#category-filter');
const toast = document.querySelector('#toast');
const liveStatus = document.querySelector('#live-status');
const ticketModal = document.querySelector('#ticket-modal');
const ticketForm = document.querySelector('#ticket-form');
const ticketList = document.querySelector('#purchased-ticket-list');
const barcodeInput = document.querySelector('#ticket-barcode');
const scannerVideo = document.querySelector('#barcode-video');
const apiBase = String(window.TICKETLY_API_BASE_URL || '').replace(/\/$/, '');
let toastTimer;
let cameraStream;
let scannerFrame;

function apiUrl(path) { return `${apiBase}${path}`; }
function categoryFromSegment(segment = '') {
  const value = segment.toLowerCase();
  if (value.includes('sport')) return 'Sports';
  if (value.includes('arts') || value.includes('theatre') || value.includes('theater') || value.includes('comedy')) return 'Theater';
  if (value.includes('family')) return 'Family';
  return 'Pop';
}
function liveEventFromApi(item) {
  const start = item.dates?.start || {};
  const venue = item._embedded?.venues?.[0] || {};
  const dateObject = start.localDate ? new Date(`${start.localDate}T${start.localTime || '12:00:00'}`) : new Date();
  const classification = item.classifications?.find((entry) => entry.primary) || item.classifications?.[0];
  return {
    title: item.name || 'Live event', venue: venue.name || 'Venue details on provider page',
    city: venue.city?.name || 'Location on provider page', category: categoryFromSegment(classification?.segment?.name),
    dateLabel: dateObject.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    date: String(dateObject.getDate()).padStart(2, '0'), dateType: [0, 6].includes(dateObject.getDay()) ? 'weekend' : 'month',
    time: start.localTime ? new Date(`1970-01-01T${start.localTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Time TBA',
    price: item.priceRanges?.[0]?.min ? `From $${Math.round(item.priceRanges[0].min)}` : 'See tickets',
    image: item.images?.find((image) => image.ratio === '16_9')?.url || item.images?.[0]?.url || '', live: true, url: item.url || '#',
    eventDate: start.localDate || ''
  };
}
async function loadLiveEvents() {
  try {
    const response = await fetch(apiUrl('/api/live-events?size=24&countryCode=US'));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Live events are unavailable.');
    events = (payload.events || []).map(liveEventFromApi).filter((event) => event.url !== '#');
    liveEventCount = events.length;
    liveStatus.textContent = payload.configured === false ? 'Live listings need backend provider setup' : `${liveEventCount} live events loaded`;
    if (liveEventCount) liveStatus.classList.add('live-status-active');
    renderEvents();
  } catch (error) {
    liveStatus.textContent = 'Live event service unavailable';
    console.warn(error.message);
    renderEvents();
  }
}
function eventCard(event) {
  const tagClass = event.category.toLowerCase();
  const action = `<a class="event-link event-ticket-button live-ticket-link" href="${event.url}" target="_blank" rel="noopener noreferrer">Official tickets <span>↗</span></a>`;
  return `<article class="event-card live-event-card"><div class="event-image">${event.image ? `<img src="${event.image}" alt="${event.title}" loading="lazy" />` : ''}<span class="event-tag ${tagClass}">${event.category}</span><span class="live-badge">LIVE</span><span class="event-date"><small>${event.dateLabel}</small><strong>${event.date}</strong></span></div><div class="event-details"><h3>${event.title}</h3><span class="event-venue">${event.venue}</span><span class="event-location">${event.city} · ${event.time}</span><div class="event-footer"><span class="event-price"><strong>${event.price}</strong></span>${action}</div><small class="provider-note">Official provider link · opens in a new tab</small><button type="button" class="save-event-button" data-save-event="${events.indexOf(event)}">Add purchased ticket details</button></div></article>`;
}
function getFilteredEvents() {
  const term = searchInput.value.trim().toLowerCase();
  const city = locationFilter.value, date = dateFilter.value, category = categoryFilter.value;
  return events.filter((event) => `${event.title} ${event.venue} ${event.city} ${event.category}`.toLowerCase().includes(term) && (city === 'all' || event.city === city) && (date === 'all' || event.dateType === date) && (category === 'all' || event.category === category));
}
function renderEvents() {
  const filtered = getFilteredEvents();
  grid.innerHTML = filtered.map(eventCard).join('');
  emptyState.hidden = filtered.length > 0;
  resultCount.innerHTML = `Showing <strong>${filtered.length}</strong> ${filtered.length === 1 ? 'event' : 'events'}${liveEventCount ? ` <span class="live-count">· ${liveEventCount} live</span>` : ''}`;
  grid.querySelectorAll('[data-save-event]').forEach((button) => button.addEventListener('click', () => openTicketForm(events[Number(button.dataset.saveEvent)])));
}
function showToast(message) {
  toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
async function openTicketForm(event = {}) {
  if (!window.ticketlySupabase) { showToast(window.ticketlySupabaseSetupError || 'Account service is not configured.'); return; }
  const { data: { session } } = await window.ticketlySupabase.auth.getSession();
  if (!session) { location.assign('/login.html?next=' + encodeURIComponent('/account.html')); return; }
  ticketForm.reset();
  document.querySelector('#ticket-event').value = event.title || '';
  document.querySelector('#ticket-venue').value = event.venue || '';
  document.querySelector('#ticket-date').value = event.eventDate || '';
  ticketModal.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => document.querySelector('#ticket-event').focus(), 50);
}
function closeTicketModal() {
  stopScanner(); ticketModal.hidden = true; document.body.classList.remove('modal-open');
}
ticketModal.querySelectorAll('[data-close-ticket]').forEach((element) => element.addEventListener('click', closeTicketModal));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !ticketModal.hidden) closeTicketModal(); });
ticketForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const client = window.ticketlySupabase;
  if (!client) return showToast(window.ticketlySupabaseSetupError || 'Account service is not configured.');
  const { data: { session } } = await client.auth.getSession();
  if (!session) { location.assign('/login.html?next=' + encodeURIComponent('/account.html')); return; }
  const data = new FormData(ticketForm);
  const record = { user_id: session.user.id, event_title: String(data.get('title')).trim(), venue: String(data.get('venue')).trim(), event_date: data.get('date') || null, quantity: Number(data.get('quantity')), barcode: String(data.get('barcode') || '').trim() || null };
  const button = ticketForm.querySelector('[type="submit"]'); button.disabled = true;
  const { error } = await client.from('purchased_tickets').insert(record);
  button.disabled = false;
  if (error) { showToast(error.message); return; }
  renderPurchasedTickets(); closeTicketModal(); showToast('Ticket details saved to your account.');
});
async function renderPurchasedTickets() {
  const client = window.ticketlySupabase;
  if (!client) { ticketList.innerHTML = '<div class="empty-tickets"><h3>Sign in to see your tickets</h3><p>Set up Supabase account credentials to save your ticket details securely.</p><a class="outline-button" href="/login.html">Sign in or create account</a></div>'; return; }
  const { data: { session } } = await client.auth.getSession();
  if (!session) { ticketList.innerHTML = '<div class="empty-tickets"><h3>Your tickets, all together.</h3><p>Sign in to see saved tickets or add details for a ticket you purchased.</p><a class="outline-button" href="/login.html">Sign in or create account</a></div>'; return; }
  const { data, error } = await client.from('purchased_tickets').select('id,event_title,venue,event_date,quantity,barcode').order('event_date', { ascending: true, nullsFirst: false });
  if (error) { ticketList.innerHTML = `<div class="empty-tickets"><h3>Tickets are unavailable</h3><p>${escapeHtml(error.message)}. Ensure the setup SQL has been run.</p></div>`; return; }
  const tickets = data || [];
  ticketList.innerHTML = tickets.length ? tickets.map((ticket) => `<article class="purchased-ticket"><div><span class="card-kicker">SAVED TICKET · ${ticket.quantity} ${ticket.quantity === 1 ? 'ticket' : 'tickets'}</span><h3>${escapeHtml(ticket.event_title)}</h3><p>${escapeHtml(ticket.venue)}${ticket.event_date ? ` · ${escapeHtml(ticket.event_date)}` : ''}</p>${ticket.barcode ? `<small>Barcode on file · ending ${escapeHtml(ticket.barcode.slice(-4))}</small>` : '<small>No barcode added</small>'}</div><button type="button" class="remove-ticket" data-remove-ticket="${ticket.id}">Open account</button></article>`).join('') : '<div class="empty-tickets"><h3>No tickets saved yet</h3><p>Add details for a ticket you have already purchased.</p><button type="button" class="outline-button" id="add-first-ticket">Add a ticket</button></div>';
  ticketList.querySelectorAll('[data-remove-ticket]').forEach((button) => button.addEventListener('click', () => location.assign('/account.html#account-tickets')));
  document.querySelector('#add-first-ticket')?.addEventListener('click', () => openTicketForm());
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function stopScanner() { if (scannerFrame) cancelAnimationFrame(scannerFrame); scannerFrame = null; if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop()); cameraStream = null; scannerVideo.hidden = true; }
async function scanFrame() {
  if (!cameraStream || scannerVideo.readyState < 2) { scannerFrame = requestAnimationFrame(scanFrame); return; }
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'pdf417'] });
    const codes = await detector.detect(scannerVideo);
    if (codes.length) { barcodeInput.value = codes[0].rawValue; stopScanner(); showToast('Code captured. Save the ticket details to keep it.'); return; }
  } catch (error) { console.warn('Barcode scan frame failed', error); }
  scannerFrame = requestAnimationFrame(scanFrame);
}
document.querySelector('#start-barcode-scan').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) { showToast('Camera barcode scanning is not supported here. Enter the barcode manually.'); return; }
  try { cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); scannerVideo.srcObject = cameraStream; scannerVideo.hidden = false; await scannerVideo.play(); scannerFrame = requestAnimationFrame(scanFrame); }
  catch { showToast('Camera access unavailable. Allow camera access over HTTPS or enter the code manually.'); }
});
searchForm.addEventListener('submit', (event) => { event.preventDefault(); renderEvents(); document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' }); showToast(`${getFilteredEvents().length} ${getFilteredEvents().length === 1 ? 'event' : 'events'} found.`); });
[locationFilter, dateFilter, categoryFilter].forEach((control) => control.addEventListener('change', renderEvents));
document.querySelector('#clear-filters').addEventListener('click', () => { searchInput.value = ''; locationFilter.value = 'all'; dateFilter.value = 'all'; categoryFilter.value = 'all'; renderEvents(); });
document.querySelectorAll('.trend-card').forEach((card) => card.addEventListener('click', () => { categoryFilter.value = card.dataset.category; renderEvents(); document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
document.querySelectorAll('.city-card').forEach((card) => card.addEventListener('click', () => { locationFilter.value = card.dataset.city; renderEvents(); document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.target}`).scrollBy({ left: button.dataset.scroll === 'next' ? 350 : -350, behavior: 'smooth' })));
document.querySelector('#view-all').addEventListener('click', () => { searchInput.value = ''; locationFilter.value = 'all'; dateFilter.value = 'all'; categoryFilter.value = 'all'; renderEvents(); showToast('Showing all live events.'); });
document.querySelectorAll('[data-toast]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.toast)));
document.querySelector('.search-toggle').addEventListener('click', () => { document.querySelector('#search-input').focus(); document.querySelector('.hero').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
document.querySelector('#add-ticket-nav').addEventListener('click', () => openTicketForm());
document.querySelector('#purchased-nav').addEventListener('click', () => { if (window.ticketlySupabase) window.ticketlySupabase.auth.getSession().then(({ data }) => location.assign(data.session ? '/account.html#account-tickets' : '/login.html?next=%2Faccount.html')); else location.assign('/login.html'); });
const accountLink = document.querySelector('#account-link');
if (window.ticketlySupabase) window.ticketlySupabase.auth.getSession().then(({ data }) => { if (data.session) { accountLink.textContent = 'My account'; accountLink.href = '/account.html'; document.querySelector('#mobile-account-link').textContent = 'My account'; document.querySelector('#mobile-account-link').href = '/account.html'; } });
const menuButton = document.querySelector('.menu-button'); const mobileNav = document.querySelector('#mobile-nav');
menuButton.addEventListener('click', () => { const open = mobileNav.classList.toggle('open'); menuButton.setAttribute('aria-expanded', String(open)); });
mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { mobileNav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); }));
renderPurchasedTickets(); renderEvents(); loadLiveEvents();
