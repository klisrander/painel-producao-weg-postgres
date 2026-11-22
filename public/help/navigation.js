(() => {
  const logo = document.querySelector('[data-help-logo]');
  const status = document.getElementById('helpNavigationStatus');
  let pending = false;
  logo.addEventListener('click', async event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    status.textContent = '';
    logo.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      // Check the current server session on click; a previously open help tab
      // must also handle a session that has expired or ended in another tab.
      const response = await fetch('/api/me', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal: controller.signal
      });
      if (response.ok) location.assign('/');
      else if (response.status !== 401) status.textContent = 'Não foi possível conferir seu acesso. Tente novamente.';
    } catch {
      status.textContent = 'Não foi possível conferir seu acesso. Verifique a conexão e tente novamente.';
    } finally {
      clearTimeout(timeout);
      pending = false;
      logo.removeAttribute('aria-busy');
    }
  });
})();
