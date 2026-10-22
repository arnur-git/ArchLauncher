const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const { createServer } = require('http');
const { randomBytes, randomUUID, createHash } = require('crypto');
const { URL } = require('url');
const { Client } = require('minecraft-launcher-core');
const AUTHLIB_INJECTOR_VERSION = '1.2.8';

let win;
const root = path.join(app.getPath('appData'), 'ArchLauncher');
const instancesPath = path.join(root, 'instances.json');
const settingsPath = path.join(root, 'settings.json');
const accountsPath = path.join(root, 'accounts.json');
const defaults = { ram: 3, javaPath: '', javaRuntimes: {}, elyClientId: '', elyClientSecret: '', activeAccountUuid: '' };
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); };
function readAccounts() {
  const saved = readJson(accountsPath, []);
  if (Array.isArray(saved)) return saved;
  const offline = Array.isArray(saved.offlineAccounts) ? saved.offlineAccounts : [];
  if (saved.encrypted && safeStorage.isEncryptionAvailable()) {
    try { return [...offline, ...JSON.parse(safeStorage.decryptString(Buffer.from(saved.encrypted, 'base64')))]; }
    catch { return offline; }
  }
  return offline;
}
function writeAccounts(accounts) {
  const offlineAccounts = accounts.filter(account => account.type === 'offline').map(({ uuid, username, type }) => ({ uuid, username, type }));
  const authenticated = accounts.filter(account => account.type !== 'offline');
  if (authenticated.length && !safeStorage.isEncryptionAvailable()) throw new Error('Безопасное системное хранилище недоступно; онлайн-токены не сохранены.');
  const saved = { offlineAccounts };
  if (authenticated.length) saved.encrypted = safeStorage.encryptString(JSON.stringify(authenticated)).toString('base64');
  writeJson(accountsPath, saved);
}
function readSettings() { const raw = { ...defaults, ...readJson(settingsPath, {}) }; for (const [field, key] of [['elyClientSecret','elyClientSecretEncrypted'],['curseforgeApiKey','curseforgeApiKeyEncrypted']]) if (raw[key] && safeStorage.isEncryptionAvailable()) { try { raw[field] = safeStorage.decryptString(Buffer.from(raw[key], 'base64')); } catch { raw[field] = ''; } } return raw; }
function writeSettings(settings) { const raw = { ...settings }; for (const [field, key] of [['elyClientSecret','elyClientSecretEncrypted'],['curseforgeApiKey','curseforgeApiKeyEncrypted']]) { const secret = raw[field]; delete raw[field]; if (secret) { if (!safeStorage.isEncryptionAvailable()) throw new Error('Безопасное системное хранилище недоступно; секрет не сохранён.'); raw[key] = safeStorage.encryptString(secret).toString('base64'); } } writeJson(settingsPath, raw); return { ...raw, elyClientSecret: settings.elyClientSecret || '', curseforgeApiKey: settings.curseforgeApiKey || '' }; }

function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1050, minHeight: 680, backgroundColor: '#0b0c10', title: 'ArchLauncher', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(() => { fs.mkdirSync(root, { recursive: true }); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const send = (channel, data) => win?.webContents.send(channel, data);
function redactLog(data, account) { let text = String(data); for (const secret of [account?.accessToken, account?.refreshToken, account?.authorization?.access_token, account?.authorization?.client_token]) if (secret) text = text.split(secret).join('[token]'); return text; }
ipcMain.handle('get-state', () => { const settings = readSettings(); delete settings.elyClientSecret; delete settings.elyClientSecretEncrypted; delete settings.curseforgeApiKey; delete settings.curseforgeApiKeyEncrypted; return { settings, instances: readJson(instancesPath, []), accounts: readAccounts().map(({ accessToken, refreshToken, authorization, ...safe }) => safe), dataDir: root }; });
ipcMain.handle('save-settings', (_, value) => { const next = writeSettings({ ...readSettings(), ...value }); delete next.elyClientSecret; delete next.elyClientSecretEncrypted; return next; });
ipcMain.handle('create-instance', (_, instance) => { const list = readJson(instancesPath, []); const item = { id: Date.now().toString(), name: instance.name || 'Новая сборка', version: instance.version || '1.21.4', loader: instance.loader || 'Vanilla', loaderVersion: instance.loaderVersion || '', createdAt: new Date().toISOString() }; list.push(item); writeJson(instancesPath, list); return list; });
ipcMain.handle('delete-instance', (_, id) => { const list = readJson(instancesPath, []).filter(x => x.id !== id); writeJson(instancesPath, list); return list; });
ipcMain.handle('open-folder', () => shell.openPath(root));
ipcMain.handle('open-external', (_, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('save-account', (_, account) => { const list = readAccounts().filter(a => a.uuid !== account.uuid); list.push(account); writeAccounts(list); return list.map(({ accessToken, refreshToken, authorization, ...safe }) => safe); });
ipcMain.handle('select-account', (_, uuid) => {
  const account = readAccounts().find(item => item.uuid === String(uuid));
  if (!account) throw new Error('Аккаунт не найден. Обнови список аккаунтов.');
  const settings = writeSettings({ ...readSettings(), activeAccountUuid: account.uuid });
  delete settings.elyClientSecret; delete settings.elyClientSecretEncrypted; delete settings.curseforgeApiKey; delete settings.curseforgeApiKeyEncrypted;
  return settings;
});

ipcMain.handle('login-offline', (_, username) => {
  const name = String(username || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Ник должен содержать 3–16 латинских букв, цифр или _');
  const hash = createHash('md5').update(`OfflinePlayer:${name}`).digest(); hash[6] = (hash[6] & 0x0f) | 0x30; hash[8] = (hash[8] & 0x3f) | 0x80;
  const account = { uuid: hash.toString('hex'), username: name, type: 'offline', accessToken: '', refreshToken: '' };
  const list = readAccounts().filter(a => a.uuid !== account.uuid); list.push(account); writeAccounts(list);
  return list.map(({ accessToken, refreshToken, ...safe }) => safe);
});

ipcMain.handle('login-ely-password', async (_, credentials) => {
  const username = String(credentials?.username || '').trim();
  const password = String(credentials?.password || '');
  const twoFactorCode = String(credentials?.twoFactorCode || '').trim();
  if (!username || !password) throw new Error('Введи логин и пароль Ely.by.');
  if (twoFactorCode && !/^\d{6,8}$/.test(twoFactorCode)) throw new Error('Код 2FA должен содержать 6–8 цифр.');

  const clientToken = randomUUID();
  const response = await fetch('https://authserver.ely.by/auth/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password: twoFactorCode ? `${password}:${twoFactorCode}` : password, clientToken, requestUser: true }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Ely.by вернул некорректный ответ. Попробуй ещё раз.'); }
  if (!result || typeof result !== 'object') throw new Error('Ely.by вернул некорректный ответ. Попробуй ещё раз.');
  if (!response.ok) {
    if (String(result.errorMessage || '').toLowerCase().includes('two factor')) throw new Error('Для аккаунта включена 2FA. Введи пароль и одноразовый код из приложения-аутентификатора.');
    if (String(result.errorMessage || '').toLowerCase().includes('invalid email or password')) throw new Error(twoFactorCode ? 'Неверный логин, пароль или код 2FA.' : 'Неверный логин или пароль Ely.by.');
    throw new Error(result.errorMessage || result.error || `Ошибка входа Ely.by (HTTP ${response.status}).`);
  }

  const profile = result.selectedProfile;
  if (!profile?.id || !profile?.name || !result.accessToken || !result.clientToken) throw new Error('Ely.by не вернул игровой профиль.');
  const uuid = String(profile.id).replace(/-/g, '');
  const account = {
    uuid, username: profile.name, type: 'ely', accessToken: result.accessToken,
    authorization: {
      access_token: result.accessToken,
      client_token: result.clientToken,
      uuid,
      name: profile.name,
      user_properties: JSON.stringify(result.user?.properties || []),
      meta: { type: 'mojang' },
    },
  };
  const list = readAccounts().filter(item => item.uuid !== account.uuid);
  list.push(account);
  writeAccounts(list);
  return list.map(({ accessToken, refreshToken, authorization, ...safe }) => safe);
});

ipcMain.handle('login-microsoft', async () => {
  send('auth-status', { text: 'Открываем безопасный вход Microsoft…' });
  try {
    const { Auth } = require('msmc');
    const auth = new Auth('select_account');
    const manager = await auth.launch('electron');
    const result = await manager.getMinecraft();
    const profile = result.profile || result;
    const account = { uuid: profile.id || profile.uuid, username: profile.name || profile.username, type: 'microsoft', accessToken: result.mcToken || result.access_token || '', refreshToken: result.refresh_token || '', authorization: result.mclc() };
    const list = readAccounts().filter(a => a.uuid !== account.uuid); list.push(account); writeAccounts(list);
    send('auth-status', { text: 'Аккаунт Microsoft подключён' });
    return list.map(({ accessToken, refreshToken, authorization, ...safe }) => safe);
  } catch (e) { send('auth-status', { text: 'Не удалось выполнить вход Microsoft' }); throw new Error(e.message || 'Ошибка входа Microsoft'); }
});

function postForm(url, fields) { return new Promise((resolve, reject) => { const target = new URL(url); const body = new URLSearchParams(fields).toString(); const req = https.request({ hostname: target.hostname, path: target.pathname + target.search, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => { let text = ''; res.on('data', c => text += c); res.on('end', () => { let json; try { json = JSON.parse(text); } catch { return reject(new Error('Неверный ответ Ely.by')); } if (res.statusCode >= 400) return reject(new Error(json.error_description || json.errorMessage || 'Ошибка Ely.by')); resolve(json); }); }); req.on('error', reject); req.end(body); }); }
ipcMain.handle('login-ely', async (_, credentials) => {
  const settings = readSettings();
  if (!settings.elyClientId || !settings.elyClientSecret) throw new Error('Сначала укажи Ely.by Client ID и Client Secret в настройках лаунчера.');
  const state = randomBytes(24).toString('hex');
  const redirectUri = 'http://127.0.0.1:34567/oauth/ely';
  const server = createServer();
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(new Error('Время ожидания входа истекло')); }, 180000);
    server.on('request', async (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/oauth/ely') { res.writeHead(404).end(); return; }
      if (url.searchParams.get('state') !== state) { res.writeHead(400).end('State mismatch'); clearTimeout(timer); server.close(); reject(new Error('Не удалось проверить Ely.by state')); return; }
      const code = url.searchParams.get('code');
      if (!code) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Вход отменён. Можно закрыть эту вкладку.'); clearTimeout(timer); server.close(); reject(new Error(url.searchParams.get('error_description') || 'Вход Ely.by отменён')); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<meta charset="utf-8"><body style="font:16px sans-serif;background:#101116;color:white;padding:50px"><h2>Готово! Вернись в ArchLauncher.</h2>');
      clearTimeout(timer); server.close(); resolve(code);
    });
    server.on('error', err => { clearTimeout(timer); reject(err); });
    server.listen(34567, '127.0.0.1', () => {
      const authUrl = new URL('https://account.ely.by/oauth2/v1');
      authUrl.search = new URLSearchParams({ client_id: settings.elyClientId, redirect_uri: redirectUri, response_type: 'code', scope: 'account_info offline_access minecraft_server_session', state }).toString();
      shell.openExternal(authUrl.toString());
    });
  });
  const tokens = await postForm('https://account.ely.by/api/oauth2/v1/token', { client_id: settings.elyClientId, client_secret: settings.elyClientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code: result });
  const profile = await requestJson('https://account.ely.by/api/account/v1/info', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const account = { uuid: profile.uuid, username: profile.username, type: 'ely', accessToken: tokens.access_token, refreshToken: tokens.refresh_token || '' };
  const list = readAccounts().filter(a => a.uuid !== account.uuid); list.push(account); writeAccounts(list);
  return list.map(({ accessToken, refreshToken, ...safe }) => safe);
});

async function requestJson(url, options = {}) {
  const headers = { 'User-Agent':'ArchLauncher/1.1.2 (Minecraft launcher)', ...(options.headers || {}) };
  const response = await fetch(url, { redirect: 'follow', ...options, headers });
  if (!response.ok) throw new Error(`Сервер вернул HTTP ${response.status}`);
  return response.json();
}
ipcMain.handle('get-versions', async (_, loader) => {
  try {
    if (loader === 'Fabric' || loader === 'Quilt') {
      const base = loader === 'Fabric' ? 'https://meta.fabricmc.net/v2/versions' : 'https://meta.quiltmc.org/v3/versions';
      const [games, loaders] = await Promise.all([requestJson(`${base}/game`), requestJson(`${base}/loader`)]);
      const stableLoaders = loaders.filter(item => item.stable);
      return games.filter(game => game.stable).slice(0, 80).flatMap(game => stableLoaders.slice(0, 2).map(runtime => ({ id: runtime.version, gameVersion: game.version, loaderVersion: runtime.version, label: `${game.version} · ${runtime.version}` })));
    }
    if (loader === 'NeoForge') {
      const data = await requestJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
      const versions = data.versions || [];
      return versions.slice(-80).reverse().map(v => { const [major, minor] = v.split('.'); return { id: v, gameVersion: `${Number(major) >= 20 ? '1.' : ''}${major}.${minor}` }; });
    }
    if (loader === 'Forge') {
      const data = await requestJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      return Object.entries(data.promos || {}).filter(([k]) => k.endsWith('-latest') || k.endsWith('-recommended')).map(([id, version]) => ({ id: `${id.split('-')[0]}-${version}`, gameVersion: id.split('-')[0], recommended: id.endsWith('-recommended') }));
    }
    const data = await requestJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    return data.versions.filter(v => v.type === 'release').slice(0, 80).map(v => ({ id: v.id, gameVersion: v.id }));
  } catch (e) { return []; }
});

const modrinthLoader = loader => ({ Fabric:'fabric', Quilt:'quilt', Forge:'forge', NeoForge:'neoforge' }[loader] || 'fabric');
const curseforgeLoader = loader => ({ Forge:1, Fabric:4, Quilt:5, NeoForge:6 }[loader] || 0);
function getInstance(id) { const item = readJson(instancesPath, []).find(value => value.id === id); if (!item) throw new Error('Сборка не найдена'); return item; }
ipcMain.handle('search-mods', async (_, { instanceId, provider, query }) => {
  const instance = getInstance(instanceId);
  if (provider === 'Modrinth') {
    const facets = JSON.stringify([['project_type:mod'], [`versions:${instance.version}`], [`categories:${modrinthLoader(instance.loader)}`]]);
    const url = new URL('https://api.modrinth.com/v2/search'); url.search = new URLSearchParams({ query: String(query || ''), facets, limit: '30', index: 'downloads' }).toString();
    const result = await requestJson(url.toString());
    return (result.hits || []).map(mod => ({ id:mod.project_id, title:mod.title, description:mod.description, icon:mod.icon_url, downloads:mod.downloads, provider:'Modrinth' }));
  }
  if (provider === 'CurseForge') {
    const apiKey = readSettings().curseforgeApiKey;
    if (!apiKey) throw new Error('Добавь CurseForge API Key в настройках модов. Его можно запросить на сайте CurseForge for Studios.');
    const url = new URL('https://api.curseforge.com/v1/mods/search'); url.search = new URLSearchParams({ gameId:'432', classId:'6', searchFilter:String(query || ''), gameVersion:instance.version, modLoaderType:String(curseforgeLoader(instance.loader)), pageSize:'30', sortField:'6', sortOrder:'desc' }).toString();
    const result = await requestJson(url.toString(), { headers:{ 'x-api-key':apiKey, Accept:'application/json' } });
    return (result.data || []).map(mod => ({ id:String(mod.id), title:mod.name, description:mod.summary, icon:mod.logo?.url, downloads:mod.downloadCount, provider:'CurseForge' }));
  }
  throw new Error('Неизвестный каталог модов');
});
ipcMain.handle('install-mod', async (_, { instanceId, provider, projectId }) => {
  const instance = getInstance(instanceId); const modsDir = path.join(root, 'instances', instance.id, 'mods'); fs.mkdirSync(modsDir, { recursive:true });
  let file;
  if (provider === 'Modrinth') {
    const url = new URL(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`); url.search = new URLSearchParams({ game_versions:JSON.stringify([instance.version]), loaders:JSON.stringify([modrinthLoader(instance.loader)]) }).toString();
    const versions = await requestJson(url.toString());
    const version = versions.find(item => item.version_type === 'release') || versions[0];
    if (!version) throw new Error('Подходящая версия мода для этой сборки не найдена');
    for (const dependency of version.dependencies || []) if (dependency.dependency_type === 'required' && dependency.project_id) {
      const depUrl = new URL(`https://api.modrinth.com/v2/project/${encodeURIComponent(dependency.project_id)}/version`); depUrl.search = new URLSearchParams({ game_versions:JSON.stringify([instance.version]), loaders:JSON.stringify([modrinthLoader(instance.loader)]) }).toString();
      const depVersions = await requestJson(depUrl.toString()); const dep = depVersions.find(item => item.version_type === 'release') || depVersions[0];
      if (!dep) throw new Error(`Не найдена обязательная зависимость: ${dependency.project_id}`);
      const depFile = dep.files?.find(item => item.primary) || dep.files?.[0];
      if (depFile) await downloadTo(depFile.url, path.join(modsDir, path.basename(depFile.filename)));
    }
    file = version.files?.find(item => item.primary) || version.files?.[0];
    if (!file) throw new Error('У этой версии мода нет файла для загрузки');
  } else if (provider === 'CurseForge') {
    const apiKey = readSettings().curseforgeApiKey; if (!apiKey) throw new Error('В настройках не указан CurseForge API Key');
    const headers = { 'x-api-key':apiKey, Accept:'application/json' };
    const url = new URL(`https://api.curseforge.com/v1/mods/${encodeURIComponent(projectId)}/files`); url.search = new URLSearchParams({ gameVersion:instance.version, modLoaderType:String(curseforgeLoader(instance.loader)), pageSize:'50' }).toString();
    const result = await requestJson(url.toString(), { headers }); const item = result.data?.find(value => value.releaseType === 1) || result.data?.[0];
    if (!item) throw new Error('Подходящая версия мода для этой сборки не найдена');
    const download = await requestJson(`https://api.curseforge.com/v1/mods/${encodeURIComponent(projectId)}/files/${item.id}/download-url`, { headers });
    if (!download.data) throw new Error('CurseForge не разрешил загрузить этот файл');
    file = { url:download.data, filename:item.fileName };
  } else throw new Error('Неизвестный каталог модов');
  const destination = path.join(modsDir, path.basename(file.filename)); await downloadTo(file.url, destination);
  return { name:path.basename(destination), directory:modsDir };
});
ipcMain.handle('list-mods', (_, instanceId) => { const modsDir = path.join(root, 'instances', getInstance(instanceId).id, 'mods'); return fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter(name => name.toLowerCase().endsWith('.jar')) : []; });
ipcMain.handle('remove-mod', (_, { instanceId, filename }) => { const modsDir = path.join(root, 'instances', getInstance(instanceId).id, 'mods'); const safeName = path.basename(filename); if (safeName !== filename || !safeName.toLowerCase().endsWith('.jar')) throw new Error('Некорректный файл мода'); fs.rmSync(path.join(modsDir, safeName), { force:true }); return true; });

ipcMain.handle('install-java', async (_, major = 25) => installJavaRuntime(Number(major)));
function findFile(dir, wanted) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isFile() && item.name.toLowerCase() === wanted) return full; if (item.isDirectory()) { const found = findFile(full, wanted); if (found) return found; } } return null; }

async function installJavaRuntime(major) {
  if (!Number.isInteger(major) || major < 8 || major > 99) throw new Error(`Неподдерживаемая версия Java: ${major}`);
  const destination = path.join(root, 'runtime', `java-${major}`);
  try {
    const alreadyInstalled = findFile(destination, 'java.exe');
    if (alreadyInstalled && detectJavaMajor(alreadyInstalled) === major) return alreadyInstalled;
  } catch {}
  send('install-progress', { stage: 'java', percent: 5, text: `Подбираем Java ${major} для Windows…` });
  try {
    const manifest = await requestJson(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jre&os=windows`);
    const url = manifest?.[0]?.binary?.package?.link;
    if (!url) throw new Error(`Сборка Java ${major} не найдена`);
    const zip = path.join(root, `java-${major}.zip`);
    fs.mkdirSync(destination, { recursive: true });
    await downloadTo(url, zip, ({ received, total }) => send('install-progress', { stage: 'java', percent: total ? Math.min(90, Math.round(received / total * 90)) : 20, text: `Скачиваем Java ${major}…` }));
    send('install-progress', { stage: 'java', percent: 92, text: `Распаковываем Java ${major}…` });
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`], { windowsHide: true });
    await new Promise((resolve, reject) => { ps.on('close', code => code === 0 ? resolve() : reject(new Error('Не удалось распаковать Java'))); ps.on('error', reject); });
    await fs.promises.rm(zip, { force: true });
    const javaExe = findFile(destination, 'java.exe');
    if (!javaExe) throw new Error('java.exe не найден после установки');
    if (detectJavaMajor(javaExe) !== major) throw new Error(`В архиве установлена не Java ${major}`);
    const settings = readSettings();
    settings.javaRuntimes = { ...(settings.javaRuntimes || {}), [major]: javaExe };
    settings.javaPath = javaExe;
    writeSettings(settings);
    send('install-progress', { stage: 'java', percent: 100, text: `Java ${major} готова` });
    return javaExe;
  } catch (error) {
    send('install-progress', { stage: 'error', percent: 0, text: error.message });
    throw error;
  }
}

function detectJavaMajor(javaPath) {
  const result = require('child_process').spawnSync(javaPath, ['-version'], { encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/version\s+"(?:1\.)?(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function getMinecraftMetadata(version) {
  const manifest = await requestJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  const entry = manifest.versions.find(item => item.id === version);
  if (!entry) throw new Error(`Версия Minecraft ${version} не найдена в манифесте Mojang`);
  return requestJson(entry.url);
}

async function javaForMinecraft(version) {
  send('game-status', { running: true, text: 'Проверяем версию Java…' });
  const metadata = await getMinecraftMetadata(version);
  const major = Number(metadata.javaVersion?.majorVersion || 21);
  const settings = readSettings();
  const saved = settings.javaRuntimes?.[major];
  if (saved && fs.existsSync(saved) && detectJavaMajor(saved) === major) return { path: saved, major };
  if (settings.javaPath && fs.existsSync(settings.javaPath) && detectJavaMajor(settings.javaPath) === major) return { path: settings.javaPath, major };
  if (detectJavaMajor('java') === major) return { path: 'java', major };
  send('game-status', { running: true, text: `Minecraft ${version} требует Java ${major}. Скачиваем…` });
  const pathToJava = await installJavaRuntime(major);
  return { path: pathToJava, major };
}

async function downloadTo(url, destination, onProgress) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Загрузка завершилась с HTTP ${response.status}`);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  const total = Number(response.headers.get('content-length') || 0);
  let received = 0;
  const progress = new (require('stream').Transform)({ transform(chunk, encoding, callback) { received += chunk.length; onProgress?.({ received, total }); callback(null, chunk); } });
  try {
    await require('stream/promises').pipeline(require('stream').Readable.fromWeb(response.body), progress, fs.createWriteStream(temporary));
    await fs.promises.rename(temporary, destination);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return destination;
}

async function prepareLoader(instance, gameDir, javaPath) {
  if (instance.loader === 'Vanilla') return { number: instance.version, type: 'release' };
  if (instance.loader === 'Fabric' || instance.loader === 'Quilt') {
    const base = instance.loader === 'Fabric' ? 'https://meta.fabricmc.net/v2/versions/loader' : 'https://meta.quiltmc.org/v3/versions/loader';
    const profile = await requestJson(`${base}/${encodeURIComponent(instance.version)}/${encodeURIComponent(instance.loaderVersion)}/profile/json`);
    const versionId = profile.id || `${instance.loader.toLowerCase()}-${instance.loaderVersion}-${instance.version}`;
    profile.id = versionId;
    const directory = path.join(gameDir, 'versions', versionId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${versionId}.json`), JSON.stringify(profile, null, 2));
    return { number: instance.version, type: 'release', custom: versionId };
  }
  if (instance.loader === 'Forge') {
    const installer = path.join(root, 'cache', `forge-${instance.loaderVersion}-installer.jar`);
    const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${instance.loaderVersion}/forge-${instance.loaderVersion}-installer.jar`;
    send('game-status', { running: true, text: 'Подготавливаем Forge…' });
    await downloadTo(url, installer);
    return { number: instance.version, type: 'release', forge: installer };
  }
  if (instance.loader === 'NeoForge') {
    const build = instance.loaderVersion;
    const installer = path.join(root, 'cache', `neoforge-${build}-installer.jar`);
    const versionId = `neoforge-${build}`;
    const versionJson = path.join(gameDir, 'versions', versionId, `${versionId}.json`);
    if (!fs.existsSync(versionJson)) {
      send('game-status', { running: true, text: 'Устанавливаем NeoForge…' });
      await downloadTo(`https://maven.neoforged.net/releases/net/neoforged/neoforge/${build}/neoforge-${build}-installer.jar`, installer);
      await new Promise((resolve, reject) => { const proc = spawn(javaPath || 'java', ['-jar', installer, '--installClient', gameDir], { cwd: gameDir, windowsHide: true }); proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Установщик NeoForge завершился с кодом ${code}`))); proc.on('error', reject); proc.stdout.on('data', data => send('game-log', String(data))); proc.stderr.on('data', data => send('game-log', String(data))); });
    }
    if (!fs.existsSync(versionJson)) throw new Error('NeoForge не создал игровой профиль. Проверь выбранную версию и Java.');
    return { number: instance.version, type: 'release', custom: versionId };
  }
  throw new Error('Неизвестный загрузчик сборки');
}

async function refreshElyAuthorization(account) {
  const authorization = account.authorization;
  const accessToken = authorization?.access_token || account.accessToken;
  const clientToken = authorization?.client_token;
  if (!accessToken || !clientToken) return authorization || {
    access_token: accessToken || '0',
    client_token: 'archlauncher',
    uuid: String(account.uuid).replace(/-/g, ''),
    name: account.username,
    user_properties: '[]',
    meta: { type: 'mojang' },
  };

  const response = await fetch('https://authserver.ely.by/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ accessToken, clientToken, requestUser: true }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Ely.by вернул некорректный ответ при обновлении сессии.'); }
  if (!response.ok) {
    const message = String(result?.errorMessage || result?.error || 'ошибка авторизации');
    if (response.status === 401 || /expired|invalid token/i.test(message)) {
      throw new Error('Сессия Ely.by истекла. Переподключи аккаунт Ely.by в настройках и запусти игру снова.');
    }
    throw new Error(`Не удалось обновить игровую сессию Ely.by: ${message}`);
  }
  if (!result?.accessToken || !result?.clientToken) throw new Error('Ely.by не вернул обновлённую игровую сессию. Переподключи аккаунт Ely.by.');

  const profile = result.selectedProfile || {};
  const previousUuid = account.uuid;
  const uuid = String(profile.id || authorization.uuid || account.uuid).replace(/-/g, '');
  const username = profile.name || authorization.name || account.username;
  account.uuid = uuid;
  account.username = username;
  account.accessToken = result.accessToken;
  account.authorization = {
    ...authorization,
    access_token: result.accessToken,
    client_token: result.clientToken,
    uuid,
    name: username,
    user_properties: JSON.stringify(result.user?.properties || []),
    meta: { ...(authorization.meta || {}), type: 'mojang' },
  };
  const accounts = readAccounts().filter(item => item.uuid !== previousUuid && item.uuid !== uuid);
  accounts.push(account);
  writeAccounts(accounts);
  return account.authorization;
}

ipcMain.handle('launch-game', async (_, payload) => {
  const instance = (readJson(instancesPath, [])).find(x => x.id === payload.instanceId);
  if (!instance) throw new Error('Сборка не найдена');
  const account = readAccounts().find(x => x.uuid === payload.accountId);
  if (!account) throw new Error('Сначала добавьте игровой аккаунт');
  const settings = readSettings();
  const gameDir = path.join(root, 'instances', instance.id); fs.mkdirSync(gameDir, { recursive: true });
  const java = await javaForMinecraft(instance.version);
  const version = await prepareLoader(instance, gameDir, java.path);
  const auth = account.type === 'ely'
    ? await refreshElyAuthorization(account)
    : account.authorization || { access_token: account.accessToken || '0', client_token: 'archlauncher', uuid: account.uuid.replace(/-/g, ''), name: account.username, user_properties: '{}', meta: { type: 'mojang' } };
  const maxRam = Math.min(4, Math.max(2, Number(settings.ram) || 3));
  const options = { root: gameDir, version, memory: { min: '1G', max: `${maxRam}G` }, authorization: auth, javaPath: java.path, forge: instance.loader === 'Forge' ? path.join(root, 'cache', `forge-${instance.loaderVersion}-installer.jar`) : undefined, customArgs: ['-XX:CICompilerCount=2', '-XX:TieredStopAtLevel=1'], overrides: { maxSockets: 16 } };
  if (account.type === 'ely') {
    const injector = path.join(root, 'cache', `authlib-injector-${AUTHLIB_INJECTOR_VERSION}.jar`);
    if (!fs.existsSync(injector)) {
      send('game-status', { running: true, text: 'Подготавливаем авторизацию Ely.by…' });
      await downloadTo(`https://github.com/yushijinhun/authlib-injector/releases/download/v${AUTHLIB_INJECTOR_VERSION}/authlib-injector-${AUTHLIB_INJECTOR_VERSION}.jar`, injector);
    }
    const signature = await fs.promises.open(injector, 'r');
    let validJar = false;
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await signature.read(header, 0, 4, 0);
      validJar = bytesRead >= 4 && header[0] === 0x50 && header[1] === 0x4b;
    } finally { await signature.close(); }
    if (!validJar) {
      await fs.promises.rm(injector, { force: true });
      throw new Error('Файл authlib-injector повреждён. Запусти игру ещё раз, чтобы скачать его заново.');
    }
    options.customArgs.unshift(`-javaagent:${injector}=ely.by`);
  }
  const launcher = new Client();
  launcher.on('debug', data => send('game-log', redactLog(data, account)));
  launcher.on('data', data => send('game-log', redactLog(data, account)));
  launcher.on('progress', data => send('game-progress', data));
  let downloadTick;
  let latestDownload;
  launcher.on('download-status', data => {
    latestDownload = data;
    if (!downloadTick) downloadTick = setTimeout(() => { send('download-progress', latestDownload); downloadTick = null; }, 150);
  });
  launcher.on('close', code => send('game-exit', { code }));
  send('game-status', { running: true, text: `Запускаем ${instance.name}…` });
  const gameProcess = await launcher.launch(options);
  if (!gameProcess) {
    send('game-status', { running: false, text: 'Не удалось запустить игру. Смотри сообщение об ошибке ниже.' });
    throw new Error('Загрузка или запуск Minecraft завершились с ошибкой. Подробности оставил в консоли.');
  }
  return true;
});
