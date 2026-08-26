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
  const res = await fetch('/api' + path, {
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

export { store, setAuth, logout, api };
createApp(App).mount('#app');
