// /s/<token>: joins the project a share link points to, then opens it.
// The server only serves this page to signed-in users; joining is a POST, so another site
// cannot make a browser join a project.

import './session.mjs';

const token = decodeURIComponent(location.pathname.split('/')[2] || '');
const message = document.getElementById('message');

const res = await fetch('/api/share/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token })
});
const body = await res.json().catch(() => ({}));
if (res.ok) {
  location.replace(`/p/${encodeURIComponent(body.projectId)}`);
} else if (body.reason === 'deleted') {
  document.querySelector('h1').textContent = 'This project is no longer available';
  message.textContent = 'The owner deleted the project this link points to.';
} else {
  document.querySelector('h1').textContent = 'This link does not work';
  message.textContent = body.error || `Something went wrong (${res.status}).`;
}
