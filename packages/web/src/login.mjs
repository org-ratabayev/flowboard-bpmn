// Sign-in with just a name (dev auth). Returns to the page that sent the user here.

const $ = (id) => document.getElementById(id);

/** Only same-site paths, so the link cannot send the user to another site after signing in. */
function returnTo() {
  const target = new URLSearchParams(location.search).get('returnTo') || '/';
  return target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\') ? target : '/';
}

try { $('name').value = localStorage.getItem('bpmn-author') || ''; } catch { /* storage blocked */ }

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').hidden = true;
  const res = await fetch('/auth/dev/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: $('name').value })
  });
  if (res.ok) {
    try { localStorage.setItem('bpmn-author', $('name').value.trim()); } catch { /* storage blocked */ }
    location.href = returnTo();
    return;
  }
  const body = await res.json().catch(() => ({}));
  $('error').textContent = body.error || `Sign-in failed (${res.status})`;
  $('error').hidden = false;
});
