(function (root) {
  const titles = {
    dashboard: 'Visão geral', 'entry-producao': 'Lançar produção',
    'entry-perturbacao': 'Registrar perturbação',
    'history-producao': 'Histórico de produção', 'history-perturbacao': 'Histórico de perturbações',
    management: 'Evolução dos 3 turnos', projection: 'Projeção Zero Atraso',
    goals: 'Metas e turnos', administracao: 'Usuários e permissões',
    auditoria: 'Auditoria', semacesso: 'Meu acesso'
  };
  let authenticated = false, lastPage = '';
  const get = id => document.getElementById(id);
  function loading(active) {
    document.body.classList.toggle('is-authenticating', active);
    get('loginForm')?.setAttribute('aria-busy', String(active));
    const status = get('authProgress');
    if (status) status.textContent = active ? 'Validando seu acesso…' : '';
  }
  function navigate(key, focus = false) {
    document.body.dataset.currentPage = key;
    const heading = get('pageTitle');
    if (heading) {
      heading.textContent = titles[key] || 'Painel de produção';
      if (focus) heading.focus({preventScroll: true});
    }
    if (authenticated && key !== lastPage) {
      get('workspaceContent')?.scrollIntoView?.({block: 'start', behavior: 'auto'});
    }
    lastPage = key;
  }
  function entered() {
    loading(false);
    document.body.classList.add('is-authenticated');
    if (!authenticated) {
      get('app')?.classList.add('workspace-enter');
      get('pageTitle')?.focus({preventScroll: true});
    }
    authenticated = true;
  }
  function exited() {
    loading(false);
    authenticated = false;
    lastPage = '';
    document.body.classList.remove('is-authenticated');
    get('app')?.classList.remove('workspace-enter');
    get('loginForm')?.querySelector('[name="username"]')?.focus({preventScroll: true});
  }
  root.PanelExperience = {loading, navigate, entered, exited};
})(globalThis);
