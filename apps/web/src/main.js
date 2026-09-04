import { createApp, reactive } from 'vue';
import App from './App.vue';

/** 递归将 decimal 字符串（如 "20.00"）转为 Number，修复 PostgreSQL decimal 返回字符串导致 .toFixed() 崩溃 */
function deepNumConvert(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // 仅转换带小数点的纯数字字符串（PostgreSQL decimal 特征），不碰整数ID、电话号等
    if (/^-?\d+\.\d+$/.test(obj)) return parseFloat(obj);
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.map(deepNumConvert);
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = deepNumConvert(obj[k]);
    return out;
  }
  return obj;
}

const store = reactive({
  token: localStorage.getItem('wm_token') || '',
  user: deepNumConvert(JSON.parse(localStorage.getItem('wm_user') || 'null')),
  viewMode: 'auto', // 'auto'(根据role) | 'member'(强制C端视图)
});
function setAuth(token, user) {
  store.token = token; store.user = deepNumConvert(user); store.viewMode = 'auto';
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
  return deepNumConvert(data);
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
