import { createApp, reactive } from 'vue';
import App from './App.vue';

const store = reactive({
  token: localStorage.getItem('wm_token') || '',
  user: JSON.parse(localStorage.getItem('wm_user') || 'null'),
  viewMode: 'auto', // 'auto'(根据role) | 'member'(强制C端视图)
});
function setAuth(token, user) {
  store.token = token; store.user = user; store.viewMode = 'auto';
  localStorage.setItem('wm_token', token);
  localStorage.setItem('wm_user', JSON.stringify(user));
}
function logout() {
  store.token = ''; store.user = null;
  localStorage.removeItem('wm_token'); localStorage.removeItem('wm_user');
}
async function api(method, path, body) {
  const API_BASE = import.meta.env.VITE_API_URL || '';
  const url = API_BASE ? API_BASE + path : '/api' + path;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || '请求失败');
  return data;
}

/** 将相对图片路径转为完整 URL */
function fullImageUrl(path) {
  if (!path || typeof path !== 'string') return '';
  if (path.startsWith('http')) return path;
  const API_BASE = import.meta.env.VITE_API_URL || '';
  const BASE = API_BASE ? API_BASE.replace('/api', '') : '';
  return BASE ? BASE + path : path;
}

export { store, setAuth, logout, api, fullImageUrl };
createApp(App).mount('#app');
