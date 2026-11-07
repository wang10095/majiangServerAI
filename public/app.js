const state = { accessToken: localStorage.getItem('accessToken'), refreshToken: localStorage.getItem('refreshToken'), user: null, room: null, socket: null };
const $ = (selector) => document.querySelector(selector);
const eventLog = $('#eventLog');

function log(label, value, kind = '') {
  const entry = document.createElement('div'); entry.className = `log-entry ${kind}`;
  const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const message = document.createElement('span'); message.textContent = `${label} ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  entry.append(time, message); eventLog.prepend(entry);
}

function toast(message, error = false) {
  const element = $('#toast'); element.textContent = message; element.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.className = 'toast'; }, 2600);
}

async function request(path, options = {}, allowRefresh = true) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && allowRefresh && state.refreshToken && path !== '/auth/refresh' && path !== '/auth/logout') {
    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });
      const refreshPayload = await refreshResponse.json().catch(() => ({}));
      if (refreshResponse.ok && refreshPayload.data) {
        saveSession(refreshPayload.data);
        const retryHeaders = { ...options.headers };
        delete retryHeaders.Authorization;
        return request(path, { ...options, headers: retryHeaders }, false);
      }
    } catch (error) { log('REFRESH', error instanceof Error ? error.message : '刷新登录状态失败', 'error'); }
  }
  if (!response.ok) { const detail = payload.error || payload.detail || payload.message || `HTTP ${response.status}`; const message = typeof detail === 'object' ? (detail.message || JSON.stringify(detail)) : detail; log('ERROR', message, 'error'); throw new Error(Array.isArray(message) ? message.join(', ') : message); }
  log(options.method || 'GET', `${path} → ${response.status}`); return payload.data;
}

function saveSession(auth) {
  Object.assign(state, { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user });
  localStorage.setItem('accessToken', auth.accessToken); localStorage.setItem('refreshToken', auth.refreshToken);
  renderSession(); connectSocket();
}

function clearSession() {
  Object.assign(state, { accessToken: null, refreshToken: null, user: null, room: null });
  localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); state.socket?.disconnect(); state.socket = null;
  renderSession(); renderRoom();
}

function renderSession() {
  $('#displayName').textContent = state.user?.displayName || '尚未登录';
  $('#username').textContent = state.user ? `@${state.user.username}` : '使用游客账号快速开始';
  $('#avatar').textContent = (state.user?.displayName || '?').slice(0, 1).toUpperCase(); $('#logoutButton').disabled = !state.accessToken;
}

function renderRoom() {
  $('#roomTicket').hidden = !state.room;
  if (state.room) { $('#roomName').textContent = state.room.name; $('#roomCode').textContent = state.room.code; }
}

function connectSocket() {
  state.socket?.disconnect(); if (!state.accessToken || typeof io === 'undefined') return;
  state.socket = io('/platform', { auth: { token: state.accessToken } });
  state.socket.on('connect', () => { $('#socketStatus').textContent = '已连接'; log('SOCKET', `connected ${state.socket.id}`); });
  state.socket.on('disconnect', (reason) => { $('#socketStatus').textContent = '未连接'; log('SOCKET', `disconnected: ${reason}`, 'muted'); });
  state.socket.on('connect_error', (error) => log('SOCKET', error.message, 'error'));
  state.socket.on('chat:message', (message) => log('MESSAGE', message));
}

async function loadProfile() {
  if (!state.accessToken) return;
  try {
    state.user = await request('/users/me'); renderSession();
    $('#profileForm').elements.displayName.value = state.user.displayName || ''; $('#profileForm').elements.avatarUrl.value = state.user.avatarUrl || '';
  } catch (error) { if (/Unauthorized|401/i.test(error.message)) clearSession(); throw error; }
}

async function checkHealth() {
  try {
    const health = await request('/health'); $('#healthBadge').className = 'health online'; $('#healthText').textContent = '服务运行正常';
    $('#dbStatus').textContent = health.info?.database?.status === 'up' ? '正常' : '异常'; $('#redisStatus').textContent = health.info?.redis?.status === 'up' ? '正常' : '异常';
  } catch { $('#healthBadge').className = 'health error'; $('#healthText').textContent = '服务检查失败'; $('#dbStatus').textContent = '异常'; $('#redisStatus').textContent = '异常'; }
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab,.tab-content').forEach((element) => element.classList.remove('active')); tab.classList.add('active'); document.querySelector(`[data-content="${tab.dataset.tab}"]`).classList.add('active');
}));

$('#guestButton').addEventListener('click', async () => { try { saveSession(await request('/auth/guest', { method:'POST', body:JSON.stringify({ displayName:`游客${String(Date.now()).slice(-4)}` }) })); toast('游客登录成功'); } catch (error) { toast(error.message, true); } });
$('#registerForm').addEventListener('submit', async (event) => { event.preventDefault(); try { saveSession(await request('/auth/register', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) })); toast('注册成功'); } catch (error) { toast(error.message, true); } });
$('#loginForm').addEventListener('submit', async (event) => { event.preventDefault(); try { saveSession(await request('/auth/login', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) })); toast('登录成功'); } catch (error) { toast(error.message, true); } });
$('#profileForm').addEventListener('submit', async (event) => { event.preventDefault(); const data = Object.fromEntries([...new FormData(event.currentTarget)].filter(([,value]) => value)); try { state.user = await request('/users/me', { method:'PATCH', body:JSON.stringify(data) }); renderSession(); toast('资料已更新'); } catch (error) { toast(error.message, true); } });
$('#refreshProfile').addEventListener('click', () => loadProfile().then(() => toast('资料已刷新')).catch((error) => toast(error.message, true)));

$('#createRoomForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); data.maxPlayers = Number(data.maxPlayers);
  try { state.room = await request('/rooms', { method:'POST', body:JSON.stringify(data) }); renderRoom(); state.socket?.emit('channel:join', { scope:'ROOM', targetId:state.room.id }); toast(`房间 ${state.room.code} 已创建`); } catch (error) { toast(error.message, true); }
});
$('#joinRoomForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const code = new FormData(event.currentTarget).get('code');
  try { state.room = await request('/rooms/join', { method:'POST', body:JSON.stringify({ code }) }); renderRoom(); state.socket?.emit('channel:join', { scope:'ROOM', targetId:state.room.id }); toast(`已加入 ${state.room.name}`); } catch (error) { toast(error.message, true); }
});

$('#logoutButton').addEventListener('click', async () => { try { if (state.refreshToken) await request('/auth/logout', { method:'POST', body:JSON.stringify({ refreshToken:state.refreshToken }) }); } catch (error) { log('LOGOUT', error.message, 'error'); } clearSession(); toast('已退出'); });
$('#clearLog').addEventListener('click', () => { eventLog.innerHTML = ''; });

checkHealth(); if (state.accessToken) loadProfile().then(connectSocket).catch(() => clearSession()); renderSession();