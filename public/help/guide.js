(() => {
  const search = document.getElementById('helpSearch');
  const topics = Array.from(document.querySelectorAll('[data-help-topic]'));
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function filter() {
    const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const topic of topics) {
      const text = normalize(topic.textContent);
      topic.hidden = !words.every(word => text.includes(word));
      if (!topic.hidden) count++;
      for (const detail of topic.querySelectorAll('details')) {
        detail.open = words.length > 0 && words.every(word => normalize(detail.textContent).includes(word));
      }
    }
    document.getElementById('helpEmpty').hidden = count > 0;
    document.getElementById('helpSearchStatus').textContent = words.length ? count + (count === 1 ? ' tópico encontrado' : ' tópicos encontrados') : '';
  }
  search.addEventListener('input', filter);
  document.getElementById('clearHelpSearch').addEventListener('click', () => {search.value = '';filter();search.focus()});
  document.querySelectorAll('.help-index a').forEach(link => link.addEventListener('click', () => {
    search.value = '';filter();
  }));
})();
