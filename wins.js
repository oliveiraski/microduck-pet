// le as janelas abertas (ordem z, de cima pra baixo) pro pato poder subir nelas
const koffi = require('koffi')
const path = require('path')

const user32 = koffi.load('user32.dll')
const dwm = koffi.load('dwmapi.dll')

const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
const EnumProc = koffi.proto('bool __stdcall EnumProc(void *hwnd, intptr_t lp)')
const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumProc *cb, intptr_t lp)')
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)')
const IsIconic = user32.func('bool __stdcall IsIconic(void *hwnd)')
const GetWindowLongW = user32.func('long __stdcall GetWindowLongW(void *hwnd, int idx)')
const GetWindowTextLengthW = user32.func('int __stdcall GetWindowTextLengthW(void *hwnd)')
const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *hwnd, uint16_t *buf, int max)')
const GetClassNameW = user32.func('int __stdcall GetClassNameW(void *hwnd, uint16_t *buf, int max)')
const GetFrame = dwm.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ RECT *out, uint32_t size)')
const GetCloaked = dwm.func('long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ int *out, uint32_t size)')

const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 cls, str16 name)')
const SendMessageW = user32.func('intptr_t __stdcall SendMessageW(void *hwnd, uint32_t msg, uintptr_t wp, void *lp)')
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)')
const POINT = koffi.struct('POINT', { x: 'long', y: 'long' })
const ClientToScreen = user32.func('bool __stdcall ClientToScreen(void *hwnd, _Inout_ POINT *pt)')
const kernel32 = koffi.load('kernel32.dll')
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *h)')
const VirtualAllocEx = kernel32.func('void * __stdcall VirtualAllocEx(void *proc, void *addr, size_t size, uint32_t type, uint32_t prot)')
const VirtualFreeEx = kernel32.func('bool __stdcall VirtualFreeEx(void *proc, void *addr, size_t size, uint32_t type)')
const WriteProcessMemory = kernel32.func('bool __stdcall WriteProcessMemory(void *proc, void *addr, RECT *buf, size_t size, _Out_ size_t *n)')
const ReadProcessMemory = kernel32.func('bool __stdcall ReadProcessMemory(void *proc, void *addr, _Out_ RECT *buf, size_t size, _Out_ size_t *n)')
const QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *proc, uint32_t flags, uint16_t *buf, _Inout_ uint32_t *size)')

const SKIP = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow', 'XamlExplorerHostIslandWindow'])
const WS_EX_TOOLWINDOW = 0x80
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const DWMWA_CLOAKED = 14

// nome do exe (sem .exe) por pid, com cache
const exes = new Map()
function exeOf(h) {
  const pid = [0]
  GetWindowThreadProcessId(h, pid)
  if (exes.has(pid[0])) return exes.get(pid[0])
  let name = ''
  const p = OpenProcess(0x1000, false, pid[0])
  if (p) {
    const b = Buffer.alloc(1024), n = [512]
    if (QueryFullProcessImageNameW(p, 0, b, n)) name = path.basename(b.toString('utf16le', 0, n[0] * 2)).replace(/\.exe$/i, '').toLowerCase()
    CloseHandle(p)
  }
  if (exes.size > 500) exes.clear()
  exes.set(pid[0], name)
  return name
}

function list(skipIds) {
  const out = []
  const buf = Buffer.alloc(1024)
  EnumWindows((h) => {
    try {
      if (!IsWindowVisible(h) || IsIconic(h)) return true
      const id = String(koffi.address(h))
      if (skipIds.has(id)) return true
      if (GetWindowLongW(h, -20) & WS_EX_TOOLWINDOW) return true
      if (GetWindowTextLengthW(h) === 0) return true
      const cl = [0]
      GetCloaked(h, DWMWA_CLOAKED, cl, 4)
      if (cl[0]) return true
      const n = GetClassNameW(h, buf, 256)
      if (SKIP.has(buf.toString('utf16le', 0, n * 2))) return true
      const r = {}
      if (GetFrame(h, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) !== 0) return true
      if (r.right - r.left < 80 || r.bottom - r.top < 40) return true
      const tn = GetWindowTextW(h, buf, 512)
      const title = buf.toString('utf16le', 0, tn * 2)
      out.push({ id, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, title, exe: exeOf(h) })
    } catch (_) {}
    return true
  }, 0)
  return out
}

// widgets que ficam por cima de tudo (rainmeter etc), sao toolwindow entao o list() pula
const WIDGETS = new Set(['RainmeterMeterWindow'])
function widgets() {
  const out = []
  const buf = Buffer.alloc(512)
  EnumWindows((h) => {
    try {
      if (!IsWindowVisible(h)) return true
      const n = GetClassNameW(h, buf, 256)
      if (!WIDGETS.has(buf.toString('utf16le', 0, n * 2))) return true
      const cl = [0]
      GetCloaked(h, DWMWA_CLOAKED, cl, 4)
      if (cl[0]) return true
      const r = {}
      if (GetFrame(h, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) !== 0) return true
      if (r.right - r.left < 30 || r.bottom - r.top < 20) return true
      out.push({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top })
    } catch (_) {}
    return true
  }, 0)
  return out
}

// a listview da area de trabalho fica dentro do explorer, entao tem que ler a memoria dele
function desktopList() {
  let dv = null
  const pm = FindWindowExW(null, null, 'Progman', null)
  if (pm) dv = FindWindowExW(pm, null, 'SHELLDLL_DefView', null)
  let w = null
  while (!dv && (w = FindWindowExW(null, w, 'WorkerW', null))) dv = FindWindowExW(w, null, 'SHELLDLL_DefView', null)
  return dv ? FindWindowExW(dv, null, 'SysListView32', null) : null
}

function icons() {
  const lv = desktopList()
  if (!lv) return []
  const pid = [0]
  GetWindowThreadProcessId(lv, pid)
  const proc = OpenProcess(0x0008 | 0x0010 | 0x0020, false, pid[0])
  if (!proc) return []
  const out = []
  const mem = VirtualAllocEx(proc, null, 16, 0x3000, 0x04)
  try {
    if (!mem) return out
    const count = Number(SendMessageW(lv, 0x1004, 0, null))
    const origin = { x: 0, y: 0 }
    ClientToScreen(lv, origin)
    const n = [0]
    for (let i = 0; i < Math.min(count, 300); i++) {
      // LVM_GETITEMRECT com left = LVIR_ICON
      WriteProcessMemory(proc, mem, { left: 1, top: 0, right: 0, bottom: 0 }, 16, n)
      if (!SendMessageW(lv, 0x100E, i, mem)) continue
      const r = {}
      ReadProcessMemory(proc, mem, r, 16, n)
      out.push({ x: r.left + origin.x, y: r.top + origin.y, width: r.right - r.left, height: r.bottom - r.top })
    }
  } finally {
    if (mem) VirtualFreeEx(proc, mem, 0, 0x8000)
    CloseHandle(proc)
  }
  return out
}

module.exports = { list, icons, widgets }
