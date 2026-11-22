(() => {
  const refreshDate = () => {
    const date = new Date();
    document.querySelectorAll('[data-interface-date]').forEach(element => {
      element.textContent = new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'long',year:'numeric'}).format(date);
      element.dateTime = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    });
  };
  refreshDate();
  setInterval(refreshDate, 60000);
})();
