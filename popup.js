const kwEl = document.getElementById('kw');
const tplEl = document.getElementById('tpl');
const addBtn = document.getElementById('add');
const listEl = document.getElementById('list');
const clearAllBtn = document.getElementById('clearAll');

function loadList() {
  chrome.storage.local.get({templates: {}}, data => {
    const templates = data.templates || {};
    renderList(templates);
  });
}

function renderList(templates) {
  listEl.innerHTML = '';
  const keys = Object.keys(templates).sort((a,b)=>a.localeCompare(b));
  if (keys.length === 0) {
    listEl.innerHTML = '<div class="empty">No templates yet. Add one above.</div>';
    return;
  }
  keys.forEach(k => {
    const t = templates[k];
    const div = document.createElement('div');
    div.className = 'template';
    div.innerHTML = `
      <div class="tpl-row">
        <div class="keyword">#${escapeHtml(k)}</div>
        <button class="del" data-key="${escapeHtml(k)}">Delete</button>
      </div>
      <pre style="white-space:pre-wrap; margin:6px 0 0 0;">${escapeHtml(t)}</pre>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', e => {
      const key = e.currentTarget.dataset.key;
      chrome.storage.local.get({templates:{}}, data=>{
        const templates = data.templates || {};
        delete templates[key];
        chrome.storage.local.set({templates}, () => loadList());
      });
    });
  });
}

addBtn.addEventListener('click', ()=>{
  const key = kwEl.value.trim();
  const tpl = tplEl.value;
  if (!key.match(/^[\w-]+$/)) {
    alert('Keyword required. Use letters, numbers, underscore or hyphen only (no spaces).');
    return;
  }
  chrome.storage.local.get({templates:{}}, data=>{
    const templates = data.templates || {};
    templates[key] = tpl;
    chrome.storage.local.set({templates}, ()=> {
      kwEl.value = '';
      tplEl.value = '';
      loadList();
    });
  });
});

clearAllBtn.addEventListener('click', ()=>{
  if (!confirm('Delete ALL templates?')) return;
  chrome.storage.local.set({templates:{}} , () => loadList());
});

function escapeHtml(s) {
  return (s+'').replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});
}

loadList();
