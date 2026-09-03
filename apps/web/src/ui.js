import { reactive } from 'vue';

/* ===== 弹窗系统：替代 alert / confirm / prompt ===== */
const modal = reactive({
  visible: false,
  type: 'alert',
  title: '',
  message: '',
  placeholder: '',
  defaultValue: '',
  resolve: null,
});

/** 提示框（替代 alert） */
export function $alert(message, title = '提示') {
  return new Promise(resolve => {
    modal.visible = true;
    modal.type = 'alert';
    modal.title = title;
    modal.message = message;
    modal.resolve = resolve;
  });
}

/** 确认框（替代 confirm） */
export function $confirm(message, title = '确认操作') {
  return new Promise(resolve => {
    modal.visible = true;
    modal.type = 'confirm';
    modal.title = title;
    modal.message = message;
    modal.resolve = resolve;
  });
}

/** 输入框（替代 prompt） */
export function $prompt(message, defaultValue = '', placeholder = '', title = '请输入') {
  return new Promise(resolve => {
    modal.visible = true;
    modal.type = 'prompt';
    modal.title = title;
    modal.message = message;
    modal.placeholder = placeholder;
    modal.defaultValue = defaultValue;
    modal.resolve = resolve;
  });
}

function closeModal(val) {
  if (modal.resolve) modal.resolve(val);
  modal.visible = false;
  modal.resolve = null;
}

export function useModal() {
  return { modal, closeModal };
}

/* ===== 图片上传封装 ===== */
export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('wm_token') || '';
  const res = await fetch('/api/upload/image', {
    method: 'POST',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || '上传失败');
  return data.url;
}

/** 触发文件选择并上传，返回 URL */
export function pickAndUploadImage(accept = 'image/*') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return reject(new Error('未选择文件'));
      try {
        const url = await uploadImage(file);
        resolve(url);
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

/* ===== CSV 工具 ===== */
/** 解析 CSV 文本为对象数组（支持简单引号转义） */
export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || '').trim(); });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** 对象数组转 CSV 文本 */
export function toCSV(rows, headers) {
  if (!rows.length) return '';
  const cols = headers || Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

/** 下载 CSV 文件 */
export function downloadCSV(filename, rows, headers) {
  const csv = '\ufeff' + toCSV(rows, headers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导出 Excel(.xls) 文件，零依赖，使用 SpreadsheetML XML 格式 */
export function exportXLSX(filename, headers, rows) {
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const headerXml = headers.map(h => `<Cell><Data Type="String">${esc(h)}</Data></Cell>`).join('');
  const rowsXml = rows.map(r => `<Row>${r.map(c => {
    const n = Number(c);
    if (!isNaN(n) && c !== '' && c !== null && c !== undefined) {
      return `<Cell><Data Type="Number">${n}</Data></Cell>`;
    }
    return `<Cell><Data Type="String">${esc(c)}</Data></Cell>`;
  }).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Worksheet ss:Name="${esc(filename)}">\n<Table>\n<Row>${headerXml}</Row>\n${rowsXml}\n</Table>\n</Worksheet>\n</Workbook>`;
  const blob = new Blob(['\ufeff' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.xls';
  a.click();
  URL.revokeObjectURL(url);
}

/** 读取本地 CSV 文件 */
export function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseCSV(reader.result));
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

/** 触发文件选择并读取 CSV */
export function pickCSVFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return reject(new Error('未选择文件'));
      try { resolve(await readCSVFile(file)); } catch (e) { reject(e); }
    };
    input.click();
  });
}
