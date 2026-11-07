// The signed-in user: shown in the page's #me element, with a sign-out button when the
// server allows it. When the session ends (any API call answers 401), the user is sent to
// sign in again and comes back to the current page.

const signIn = () => {
  location.href = `/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await originalFetch(input, init);
  const url = typeof input === 'string' ? input : input.url;
  if (res.status === 401 && new URL(url, location.href).pathname.startsWith('/api/')) signIn();
  return res;
};

/** Resolves with { id, name, email, provider, canLogout }. */
export const me = originalFetch('/api/me').then(async (res) => {
  if (res.status === 401) {
    signIn();
    return new Promise(() => {}); // the page is going away
  }
  return res.json();
});

me.then((user) => {
  const el = document.getElementById('me');
  if (!el) return;
  const name = document.createElement('span');
  name.className = 'me-name';
  name.textContent = user.name;
  name.title = user.email || user.name;
  el.append(name);
  if (user.canLogout) {
    const button = document.createElement('button');
    button.textContent = 'Sign out';
    button.addEventListener('click', async () => {
      const res = await originalFetch('/auth/logout', { method: 'POST' });
      const { redirect } = await res.json().catch(() => ({}));
      // with an external provider, going straight back to sign-in would sign the user in again
      if (redirect) location.href = redirect;
      else signIn();
    });
    el.append(button);
  }
});
