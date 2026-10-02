// ฟังก์ชันช่วยทั่วไป
(function () {
  const U = {};

  U.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // h('div.cls#id', {attrs, on:{click}}, children...)
  U.h = function (tag, attrs, ...children) {
    const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) {
      for (const part of m[2].match(/[.#][\w-]+/g)) {
        if (part[0] === '.') el.classList.add(part.slice(1));
        else el.id = part.slice(1);
      }
    }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      children.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k in el && typeof v !== 'string') el[k] = v;
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return el;
  };

  U.debounce = (fn, ms) => {
    let t;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); return fn(...a); };
    return d;
  };

  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- วันที่ภาษาไทย ----------
  U.MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  U.MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  U.DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  U.thaiDigits = (s) => String(s).replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[d]);
  U.parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  U.isoDate = (dt = new Date()) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  U.thaiDate = (iso) => { if (!iso) return ''; const d = U.parseDate(iso); return `${d.getDate()} ${U.MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; };
  U.thaiDateShort = (iso) => { if (!iso) return ''; const d = U.parseDate(iso); return `${d.getDate()} ${U.MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`; };
  U.thaiDay = (iso) => U.DAYS[U.parseDate(iso).getDay()];
  U.thaiMonthYear = (ym) => { const [y, m] = ym.split('-').map(Number); return `${U.MONTHS[m - 1]} ${y + 543}`; };
  U.thaiDateTime = (ts) => { const d = new Date(ts); return `${U.thaiDateShort(U.isoDate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // แทนค่าตัวแปร {ชื่อ} ในข้อความ
  U.fillVars = (text, vars) => String(text || '').replace(/\{([^{}\n]+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));

  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  U.safeFileName = (s) => String(s).replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'report';

  // ---------- หน่วยวัด ----------
  // 1 twip = 1/20 pt ; 1 pt = 96/72 px ; 1 cm = 96/2.54 px ; 1 EMU = 1/360000 cm
  U.PX_PER_PT = 96 / 72;
  U.PX_PER_CM = 96 / 2.54;
  U.tw2px = (tw) => (tw / 20) * U.PX_PER_PT;
  U.cm2px = (cm) => cm * U.PX_PER_CM;
  U.cm2emu = (cm) => Math.round(cm * 360000);
  U.cm2tw = (cm) => Math.round((cm / 2.54) * 1440);

  // ---------- ไฟล์ ----------
  U.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  };
  U.blobToBase64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  U.base64ToBytes = (b64) => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  U.base64ToBlob = (b64, type) => new Blob([U.base64ToBytes(b64)], { type });
  U.pickFiles = (accept, multiple = true, capture) => new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.multiple = multiple;
    if (capture) inp.capture = capture;
    inp.style.display = 'none';
    inp.onchange = () => { res(Array.from(inp.files || [])); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
  U.fmtBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  // ---------- การแจ้งเตือน / กล่องโต้ตอบ ----------
  U.toast = (msg, type = 'info', ms = 3200) => {
    let box = document.getElementById('toasts');
    if (!box) { box = U.h('div#toasts'); document.body.appendChild(box); }
    const t = U.h('div.toast.' + type, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  U.modal = ({ title, body, actions = [], wide = false, onClose }) => {
    const back = U.h('div.modal-back');
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    const box = U.h('div.modal' + (wide ? '.wide' : ''),
      U.h('div.modal-head', U.h('h3', title), U.h('button.icon-btn', { title: 'ปิด', on: { click: () => close(null) } }, '✕')),
      U.h('div.modal-body', body),
      actions.length ? U.h('div.modal-foot', actions.map((a) => U.h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), { on: { click: async () => { if (a.onClick) { const r = await a.onClick(); if (r === false) return; } close(a.value); } } }, a.label))) : null);
    back.appendChild(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    document.body.appendChild(back);
    return { close, el: box };
  };

  U.confirm = (msg, { ok = 'ตกลง', danger = false, title = 'ยืนยัน' } = {}) => new Promise((res) => {
    U.modal({ title, body: U.h('p', msg), actions: [{ label: 'ยกเลิก', value: false }, { label: ok, value: true, primary: !danger, danger }], onClose: (v) => res(!!v) });
  });

  U.prompt = (msg, def = '', { title = 'กรอกข้อมูล', ok = 'ตกลง' } = {}) => new Promise((res) => {
    const inp = U.h('input.input', { value: def });
    let val = null;
    const m = U.modal({ title, body: [U.h('p', msg), inp], actions: [{ label: 'ยกเลิก' }, { label: ok, primary: true, onClick: () => { val = inp.value; } }], onClose: () => res(val) });
    setTimeout(() => inp.focus(), 50);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { val = inp.value; m.close(); } });
  });

  // แสดงสถานะกำลังทำงาน
  U.busy = (msg) => {
    const el = U.h('div.busy', U.h('div.busy-box', U.h('div.spinner'), U.h('div.busy-msg', msg)));
    document.body.appendChild(el);
    return { set: (m) => { el.querySelector('.busy-msg').textContent = m; }, done: () => el.remove() };
  };

  window.U = U;
})();
