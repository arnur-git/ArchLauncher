const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
let state = { settings: {}, instances: [], accounts: [] }, selectedInstance = null, activeFilter = 'Все';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const loaderClass = x => ({ Forge:'forge', NeoForge:'neo', Fabric:'fabric', Quilt:'quilt' }[x.loader] || '');
const loaderIcon = x => ({ Forge:'⚒', NeoForge:'✧', Fabric:'⚙', Quilt:'◇' }[x.loader] || '▧');
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2900); }
function render() {
  const current = state.instances.find(x => x.id === selectedInstance) || state.instances[0]; selectedInstance = current?.id || null;
  $('#selected-version').textContent = current ? `${current.loader} · ${current.version}` : 'Выбери сборку';
  $('#instance-count').textContent = String(state.instances.length).padStart(2, '0'); $('#filter-count').textContent = `${state.instances.length} СБОРОК`;
  const cards = state.instances.map(x => `<article class="instance-card" data-instance="${esc(x.id)}"><div class="instance-art ${loaderClass(x)}"><img src="assets/world-tile.svg" alt=""><span>${loaderIcon(x)}</span></div><div class="instance-details"><strong>${esc(x.name)}</strong><small>${esc(x.loader)} · ${esc(x.version)}</small></div><span class="small-play">▶</span></article>`).join('');
  $('#home-instances').innerHTML = cards || `<div class="instance-card"><div class="instance-details"><strong>Создай свою первую сборку</strong><small>Начни с чистого Minecraft</small></div></div>`;
  const filtered = state.instances.filter(x => activeFilter === 'Все' || x.loader === activeFilter);
  $('#instance-list').innerHTML = filtered.map(x => `<article class="instance-card" data-instance="${esc(x.id)}"><div class="instance-art ${loaderClass(x)}"><img src="assets/world-tile.svg" alt=""><span>${loaderIcon(x)}</span></div><div class="instance-details"><strong>${esc(x.name)}</strong><small>${esc(x.loader)} · ${esc(x.version)}${x.loaderVersion ? ` · ${esc(x.loaderVersion)}` : ''}</small></div><div class="instance-actions"><button class="mini-button launch" data-launch="${esc(x.id)}">▶ Играть</button><button class="mini-button mods" data-mods="${esc(x.id)}">Моды</button><button class="mini-button delete" data-delete="${esc(x.id)}">Удалить</button></div></article>`).join('');
  $('#empty-state').classList.toggle('show', state.instances.length === 0); $('#instance-list').style.display = state.instances.length ? 'grid' : 'none';
  const account = state.accounts.find(item => item.uuid === state.settings.activeAccountUuid) || state.accounts.at(-1); $('#account-name').textContent = account?.username || 'Без аккаунта'; $('#avatar').textContent = account?.username?.[0]?.toUpperCase() || '?';
  const accountList = $('#saved-accounts');
  if (accountList) accountList.innerHTML = state.accounts.length ? state.accounts.map(item => `<div class="saved-account ${item.uuid === account?.uuid ? 'active' : ''}"><span class="saved-account-icon ${esc(item.type)}">${item.type === 'microsoft' ? '▦' : item.type === 'ely' ? 'E' : '◌'}</span><span class="saved-account-info"><b>${esc(item.username)}</b><small>${item.type === 'microsoft' ? 'Microsoft' : item.type === 'ely' ? 'Ely.by' : 'Офлайн'}${item.uuid === account?.uuid ? ' · активен' : ''}</small></span>${item.uuid === account?.uuid ? '<span class="saved-account-check">✓</span>' : `<button class="mini-button launch" data-select-account="${esc(item.uuid)}">Выбрать</button>`}</div>`).join('') : '<p class="empty-accounts">Сохранённых аккаунтов пока нет. Добавь аккаунт ниже.</p>';
  $$('[data-select-account]').forEach(button => button.onclick = async () => { try { state.settings = await window.arch.selectAccount(button.dataset.selectAccount); render(); toast('Аккаунт переключён'); } catch (e) { toast(e.message || 'Не удалось выбрать аккаунт'); } });
  $('#runtime-info').textContent = state.settings.javaPath ? 'Java готова' : 'Java не установлена'; $('#java-path-label').textContent = state.settings.javaPath || 'Не установлена';
  $('#ram-slider').value = Math.min(4, Math.max(2, Number(state.settings.ram) || 3)); $('#ram-label').textContent = `${Math.min(4, Math.max(2, Number(state.settings.ram) || 3))} ГБ`; $('#data-dir').textContent = state.dataDir;
  $$('.instance-card[data-instance]').forEach(card => card.addEventListener('click', e => { if (e.target.closest('button')) return; selectedInstance = card.dataset.instance; render(); }));
  $$('[data-launch]').forEach(button => button.onclick = () => launch(button.dataset.launch));
  $$('[data-mods]').forEach(button => button.onclick = () => modManager(button.dataset.mods));
  $$('[data-delete]').forEach(button => button.onclick = async () => { state.instances = await window.arch.deleteInstance(button.dataset.delete); render(); toast('Сборка удалена'); });
}
async function modManager(instanceId) {
  const instance = state.instances.find(item => item.id === instanceId); if (!instance) return;
  if (instance.loader === 'Vanilla') { toast('Для модов сначала создай сборку Forge, NeoForge, Fabric или Quilt'); return; }
  let provider = 'Modrinth';
  const renderManager = async () => {
    const mods = await window.arch.listMods(instanceId);
    modal(`<div class="eyebrow">${esc(instance.loader)} · ${esc(instance.version)}</div><h2>Моды сборки</h2><p>Ищи моды на Modrinth или CurseForge. Подходящие версии фильтруются по игре и загрузчику.</p><div class="loader-list"><button class="loader-choice ${provider==='Modrinth'?'selected':''}" id="mods-modrinth">Modrinth</button><button class="loader-choice ${provider==='CurseForge'?'selected':''}" id="mods-curseforge">CurseForge</button></div><div style="display:flex;gap:8px"><input class="input" id="mod-search" placeholder="Название мода"><button class="button secondary small" id="mod-search-button">Искать</button></div><div class="mod-results" id="mod-results"><p>В сборке установлено: ${mods.length} модов</p>${mods.map(name=>`<div class="mod-row"><span>${esc(name)}</span><button class="mini-button delete" data-remove-mod="${esc(name)}">Удалить</button></div>`).join('')||'<p>Модов пока нет.</p>'}</div><div class="modal-footer"><button class="button secondary" id="mods-api-key">Ключ CurseForge</button><button class="button secondary" id="mods-close">Готово</button></div>`);
    $('#mods-modrinth').onclick = () => { provider='Modrinth'; renderManager(); }; $('#mods-curseforge').onclick = () => { provider='CurseForge'; renderManager(); };
    $('#mods-close').onclick = () => $('#modal').classList.remove('show');
    $('#mods-api-key').onclick = () => { modal(`<div class="eyebrow">CURSEFORGE</div><h2>API Key</h2><p>CurseForge требует API Key приложения. Запроси ключ в CurseForge for Studios; он будет зашифрован локально в системном хранилище Windows.</p><label class="form-label">API Key</label><input class="input" type="password" id="curseforge-key" placeholder="Вставь API Key"><div class="modal-footer"><button class="button secondary" id="key-cancel">Отмена</button><button class="button primary" id="key-save">Сохранить</button></div>`); $('#key-cancel').onclick=()=>modManager(instanceId); $('#key-save').onclick=async()=>{try{state.settings=await window.arch.saveSettings({curseforgeApiKey:$('#curseforge-key').value.trim()});toast('Ключ CurseForge сохранён');renderManager();}catch(e){toast(e.message);}}; };
    $$('[data-remove-mod]').forEach(button=>button.onclick=async()=>{try{await window.arch.removeMod({instanceId,filename:button.dataset.removeMod});renderManager();}catch(e){toast(e.message);}});
    $('#mod-search-button').onclick = async () => {
      const results = $('#mod-results'); results.innerHTML='<p>Ищем моды…</p>';
      try { const found=await window.arch.searchMods({instanceId,provider,query:$('#mod-search').value}); results.innerHTML=found.length?found.map(mod=>`<div class="mod-row">${mod.icon?`<img src="${esc(mod.icon)}" width="34" height="34" style="border-radius:7px;object-fit:cover">`:''}<span><b>${esc(mod.title)}</b><small>${esc(mod.description)}</small></span><button class="mini-button launch" data-install-mod="${esc(mod.id)}">＋</button></div>`).join(''):'<p>Моды не найдены для этой версии Minecraft и загрузчика.</p>'; $$('[data-install-mod]').forEach(button=>button.onclick=async()=>{button.disabled=true;button.textContent='…';try{const result=await window.arch.installMod({instanceId,provider,projectId:button.dataset.installMod});toast(`Установлен ${result.name}`);renderManager();}catch(e){button.disabled=false;button.textContent='＋';toast(e.message||'Не удалось установить мод');}}); }
      catch(e){results.innerHTML=`<p>${esc(e.message||'Ошибка поиска')}</p>`;}
    };
  };
  await renderManager();
}
function showPage(name) { $$('.page').forEach(x => x.classList.toggle('active', x.id === `page-${name}`)); $$('.nav').forEach(x => x.classList.toggle('active', x.dataset.page === name)); $('#crumb-title').textContent = ({home:'Главная',instances:'Сборки',settings:'Настройки'})[name]; }
$$('.nav').forEach(btn => btn.onclick = () => showPage(btn.dataset.page));
$$('[data-settings-tab]').forEach(button => button.onclick = () => { const tab = button.dataset.settingsTab; $$('[data-settings-tab]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); }); $$('[data-settings-panel]').forEach(panel => { const active = panel.dataset.settingsPanel === tab; panel.classList.toggle('active', active); panel.hidden = !active; }); }); $('#instances-jump').onclick = $('#all-instances').onclick = () => showPage('instances');
$('#folder-btn').onclick = $('#open-data').onclick = () => window.arch.openFolder();
$('#ram-slider').oninput = async e => { $('#ram-label').textContent = `${e.target.value} ГБ`; state.settings = await window.arch.saveSettings({ ram: Number(e.target.value) }); };
$$('.filter').forEach(btn => btn.onclick = () => { activeFilter = btn.dataset.filter; $$('.filter').forEach(x => x.classList.toggle('active', x === btn)); render(); });
$('#account-open').onclick = () => showPage('settings');
$('#modal-close').onclick = () => $('#modal').classList.remove('show'); $('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.remove('show'); };
function modal(content) { $('#modal-content').innerHTML = content; $('#modal').classList.add('show'); }
function newInstanceModal() {
  modal(`<div class="eyebrow">НОВАЯ ИГРА</div><h2>Создать сборку</h2><p>Своя версия, отдельные игровые файлы и настройки.</p><label class="form-label">Название сборки</label><input class="input" id="inst-name" maxlength="30" placeholder="Например, Survival Plus" value="Мой мир"><label class="form-label">Тип сборки</label><div class="loader-list"><button class="loader-choice selected" data-loader="Vanilla">Vanilla</button><button class="loader-choice" data-loader="Forge">Forge</button><button class="loader-choice" data-loader="NeoForge">NeoForge</button><button class="loader-choice" data-loader="Fabric">Fabric</button><button class="loader-choice" data-loader="Quilt">Quilt</button></div><label class="form-label">Версия игры / модлоадера</label><select class="version-select" id="version-select"><option>Загружаем версии…</option></select><div class="progress" id="version-progress"><span></span></div><div class="modal-footer"><button class="button secondary" id="cancel-instance">Отмена</button><button class="button primary" id="create-instance">Создать</button></div>`);
  let loader = 'Vanilla'; const select = $('#version-select');
  async function versions() { select.innerHTML = '<option>Загружаем…</option>'; const values = await window.arch.getVersions(loader); select.innerHTML = values.length ? values.map(v => `<option value="${esc(v.loaderVersion || v.id)}" data-game="${esc(v.gameVersion)}">${esc(v.label || v.id)}${v.recommended ? ' · рекомендованная' : ''}</option>`).join('') : '<option value="">Не удалось загрузить список</option>'; $('#version-progress').style.display = 'none'; }
  $$('.loader-choice').forEach(btn => btn.onclick = () => { loader = btn.dataset.loader; $$('.loader-choice').forEach(b => b.classList.toggle('selected', b === btn)); versions(); });
  versions(); $('#cancel-instance').onclick = () => $('#modal').classList.remove('show');
  $('#create-instance').onclick = async () => { const opt = select.selectedOptions[0]; if (!opt?.value) return toast('Выбери версию'); const version = opt.dataset.game || opt.value; const list = await window.arch.createInstance({ name: $('#inst-name').value.trim() || 'Моя сборка', version, loader, loaderVersion: loader === 'Vanilla' ? '' : opt.value }); state.instances = list; selectedInstance = list.at(-1).id; $('#modal').classList.remove('show'); showPage('instances'); render(); toast('Сборка создана'); };
}
$('#new-instance').onclick = $('#empty-new').onclick = newInstanceModal;
$('#play-btn').onclick = () => selectedInstance ? launch(selectedInstance) : (showPage('instances'), newInstanceModal());

async function launch(id) {
  const account = state.accounts.find(item => item.uuid === state.settings.activeAccountUuid) || state.accounts.at(-1); if (!account) { toast('Сначала добавь игровой аккаунт'); showPage('settings'); return; }
  try { selectedInstance = id; render(); $('#console').classList.add('show'); $('#console-log').textContent = ''; await window.arch.launchGame({ instanceId: id, accountId: account.uuid }); }
  catch (e) { $('#console').classList.add('show'); $('#console-status').textContent = 'Проблема при загрузке или запуске'; toast(e.message || 'Не удалось запустить игру'); }
}
$('#install-java').onclick = async () => { $('#install-java').textContent = 'Устанавливаем Java 25…'; $('#install-java').disabled = true; try { await window.arch.installJava(25); state = await window.arch.state(); render(); toast('Java 25 установлена'); } catch(e) { toast(e.message); } finally { $('#install-java').textContent = '↓ Установить Java 25'; $('#install-java').disabled = false; } };

async function signInMicrosoft() { try { state.accounts = await window.arch.loginMicrosoft(); if (state.accounts.length) state.settings = await window.arch.saveSettings({ activeAccountUuid: state.accounts.at(-1).uuid }); render(); toast('Аккаунт Microsoft подключён'); } catch(e) { toast(e.message || 'Ошибка входа'); } }
$('#ms-login').onclick = signInMicrosoft;
$('#ely-login').onclick = () => {
  modal(`<div class="eyebrow">АККАУНТ ELY.BY</div><h2>Войти в Ely.by</h2><p>Используй логин или E-mail Ely.by. Пароль отправляется только на официальный сервер авторизации Ely.by и не сохраняется лаунчером. Если включена двухфакторная защита, введи одноразовый код.</p><label class="form-label" for="ely-username">Логин или E-mail</label><input class="input" id="ely-username" autocomplete="username" placeholder="name@example.com"><label class="form-label" for="ely-password">Пароль</label><input class="input" id="ely-password" type="password" autocomplete="current-password" placeholder="Пароль Ely.by"><label class="form-label" for="ely-2fa">Код 2FA <span class="muted">(если включён)</span></label><input class="input" id="ely-2fa" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"><div class="modal-footer"><button class="button secondary" id="ely-cancel">Отмена</button><button class="button primary" id="ely-submit">Войти</button></div>`);
  $('#ely-cancel').onclick = () => $('#modal').classList.remove('show');
  $('#ely-submit').onclick = async () => {
    const button = $('#ely-submit'); button.disabled = true; button.textContent = 'Входим…';
    try {
      state.accounts = await window.arch.loginEly({ username: $('#ely-username').value, password: $('#ely-password').value, twoFactorCode: $('#ely-2fa').value });
      if (state.accounts.length) state.settings = await window.arch.saveSettings({ activeAccountUuid: state.accounts.at(-1).uuid });
      $('#ely-password').value = ''; $('#ely-2fa').value = ''; $('#modal').classList.remove('show'); render(); toast('Аккаунт Ely.by подключён');
    } catch (e) { toast(e.message || 'Ошибка входа Ely.by'); }
    finally { if ($('#ely-submit')) { button.disabled = false; button.textContent = 'Войти'; } }
  };
};
$('#offline-login').onclick = () => { modal(`<div class="eyebrow">ЛОКАЛЬНЫЙ ПРОФИЛЬ</div><h2>Офлайн вход</h2><p>Доступен для одиночной игры и локальных миров. Онлайн-серверы могут требовать лицензию и сетевую авторизацию.</p><label class="form-label">Игровой ник</label><input class="input" id="offline-name" maxlength="16" value="Player" placeholder="Steve"><div class="modal-footer"><button class="button secondary" id="offline-cancel">Отмена</button><button class="button primary" id="offline-save">Продолжить</button></div>`); $('#offline-cancel').onclick = () => $('#modal').classList.remove('show'); $('#offline-save').onclick = async () => { try { state.accounts = await window.arch.loginOffline($('#offline-name').value); if (state.accounts.length) state.settings = await window.arch.saveSettings({ activeAccountUuid: state.accounts.at(-1).uuid }); $('#modal').classList.remove('show'); render(); toast('Офлайн профиль добавлен'); } catch(e) { toast(e.message); } }; };
$('#console-close').onclick = () => $('#console').classList.remove('show');
window.arch.on('game-log', line => { const log = $('#console-log'); log.textContent = (log.textContent + String(line) + '\n').slice(-8000); log.scrollTop = log.scrollHeight; });
window.arch.on('game-status', data => { $('#console').classList.add('show'); $('#console-status').textContent = data.text; });
window.arch.on('game-progress', data => {
  const label = data.type === 'assets' ? 'Игровые ресурсы' : data.type?.includes('classes') ? 'Библиотеки игры' : data.type === 'natives' ? 'Компоненты Java' : 'Подготовка игры';
  const percent = data.total ? Math.floor(data.task / data.total * 100) : 0;
  $('#console-status').textContent = `${label}: ${data.task || 0} / ${data.total || 0} · ${percent}%`;
});
window.arch.on('download-progress', data => {
  if (data.complete) return;
  const size = value => value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} МБ` : `${Math.round((value || 0) / 1024)} КБ`;
  $('#console-status').textContent = `Скачивается ${data.name || 'файл'} · ${size(data.current)}${data.total ? ` / ${size(data.total)}` : ''}`;
});
window.arch.on('game-exit', data => {
  const intelAccessViolation = Number(data.code) === 3221225477;
  const help = $('#graphics-crash-help');
  help.hidden = !intelAccessViolation;
  $('#console-status').textContent = intelAccessViolation ? 'Сбой видеодрайвера (0xC0000005)' : `Игра завершилась · код ${data.code}`;
  if (intelAccessViolation) {
    help.querySelector('p').textContent = 'В логе: Minecraft 26.3, OpenGL на Intel Iris Xe и драйвер 31.0.101.4032. Обнови графический драйвер Intel и перезагрузи компьютер, затем попробуй снова.';
    toast('Похоже на сбой графического драйвера. Подробности и ссылка показаны в консоли.');
  } else toast(`Игра закрылась · код ${data.code}`);
});
$('#update-graphics-driver').onclick = () => window.arch.openExternal('https://www.intel.com/content/www/us/en/download/726609/intel-arc-iris-xe-graphics-whql-windows.html');
window.arch.on('install-progress', data => { if (data.stage === 'java') { $('#install-java').textContent = `${data.text} ${data.percent}%`; if ($('#console').classList.contains('show')) $('#console-status').textContent = `${data.text} ${data.percent}%`; } else if ($('#console').classList.contains('show')) $('#console-status').textContent = data.text; });
window.arch.on('auth-status', data => toast(data.text));
window.arch.state().then(value => { state = value; render(); });
