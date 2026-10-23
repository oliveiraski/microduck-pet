const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const wins = require('./wins')

// janelinha de 160px, renderizar na cpu sai mais barato que manter o processo da gpu
app.disableHardwareAcceleration()

// 80x76 pixels logicos * 2
const W = 160, H = 152
// espaco livre que o pato precisa em cima de uma plataforma
const HEAD = 84
let win, tray, ps, ownId = ''
let tbRects = [], iconRects = [], iconAt = 0, lastWorld = '', media = [], wlist = []
// janela do video que ta tocando (ou null)
let watching = null, lastWatch = '', audio = [], music = false, seenVideo = 0, seenMusic = 0, busy = [], lastBusy = '[]'

if (!app.requestSingleInstanceLock()) app.quit()

function createWindow() {
  const b = screen.getPrimaryDisplay().bounds
  win = new BrowserWindow({
    width: W, height: H,
    x: b.x + Math.round(b.width / 2 - W / 2),
    y: b.y + b.height - H,
    frame: false, transparent: true, resizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: false, focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadFile(path.join(__dirname, 'index.html'))
  ownId = String(win.getNativeWindowHandle().readBigUInt64LE(0))
}

function send(ch, v) {
  if (win && !win.isDestroyed()) win.webContents.send(ch, v)
}

const dip = (r) => screen.screenToDipRect(null, r)

// tira [a, b] dos pedacos
function cut(parts, a, b) {
  const out = []
  for (const [x1, x2] of parts) {
    if (b <= x1 || a >= x2) { out.push([x1, x2]); continue }
    if (a > x1) out.push([x1, a])
    if (b < x2) out.push([b, x2])
  }
  return out
}

function world() {
  const displays = screen.getAllDisplays()
  const segs = [], solids = []
  // fora de qualquer monitor (tipo janela maximizada em y -8) nao vira plataforma
  const top = (y) => {
    const d = displays.find(d => y >= d.bounds.y && y <= d.bounds.y + d.bounds.height)
    return d ? d.bounds.y : 1e9
  }

  // chao = fundo de cada monitor (o pato anda por dentro da barra de tarefas)
  for (const d of displays) {
    const b = d.bounds
    segs.push({ id: 'floor' + d.id, kind: 'floor', x1: b.x, x2: b.x + b.width, y: b.y + b.height, wl: b.x })
  }

  let list = []
  try { list = wins.list(new Set([ownId])).map(w => ({ ...dip(w), id: w.id, title: w.title, exe: w.exe })) } catch (_) {}
  wlist = list

  const covered = (y, upto) => {
    let parts = null
    return (p) => {
      parts = p
      for (let j = 0; j < upto; j++) {
        const o = list[j]
        if (o.y <= y - 1 && o.y + o.height > y - 1) parts = cut(parts, o.x, o.x + o.width)
      }
      return parts
    }
  }

  list.forEach((w, i) => {
    if (w.y - HEAD < top(w.y)) return
    const parts = covered(w.y, i)([[w.x, w.x + w.width]])
    for (const [a, b] of parts) {
      if (b - a >= 30) segs.push({ id: w.id, kind: 'win', x1: a, x2: b, y: w.y, wl: w.x, wr: w.x + w.width, wb: w.y + w.height })
    }
  })

  // icones da area de trabalho ficam atras de todas as janelas
  iconRects.forEach((r0, i) => {
    const r = dip(r0)
    if (r.y - HEAD < top(r.y)) return
    const x1 = r.x + 16, x2 = r.x + r.width - 16
    for (const [a, b] of covered(r.y, list.length)([[x1, x2]])) {
      if (b - a >= 12) segs.push({ id: 'icon' + i, kind: 'icon', x1: a, x2: b, y: r.y, wl: r.x })
    }
  })

  // widgets (player do rainmeter etc): obstaculo e plataforma igual botao da barra
  let wid = []
  try { wid = wins.widgets() } catch (_) {}
  wid.forEach((r0, i) => {
    const r = dip(r0)
    solids.push({ x: r.x, y: r.y, w: r.width, h: r.height })
    if (r.y - HEAD >= top(r.y)) segs.push({ id: 'wid' + i, kind: 'tb', x1: r.x, x2: r.x + r.width, y: r.y, wl: r.x })
  })

  // botoes da barra: obstaculo e plataforma
  tbRects.forEach((r0, i) => {
    const r = dip({ x: r0[0], y: r0[1], width: r0[2], height: r0[3] })
    const b = { x: r.x + 8, y: r.y + 10, w: r.width - 16, h: r.height - 10 }
    if (b.w < 8) return
    solids.push(b)
    segs.push({ id: 'tb' + i, kind: 'tb', x1: b.x, x2: b.x + b.w, y: b.y, wl: b.x })
  })

  return { segs, solids }
}

const BROWSER = /^(chrome|msedge|firefox|brave|opera|vivaldi|arc|zen)$/
const PIP = /picture.in.picture|imagem sobre imagem|picture-in-picture/i
const MUSIC = /youtube music|spotify|deezer|soundcloud|tidal|apple music/i
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim()

const MUSIC_APP = /spotify|deezer|tidal|amazonmusic|applemusic|itunes|foobar|winamp|musicbee|aimp|soundcloud/
const PLAYER = /^(vlc|mpc-hc64|mpc-hc|mpc-be64|mpc-be|potplayermini64|potplayermini|mpv|wmplayer|video\.ui|netflix|stremio|kodi|plex|primevideo|disneyplus)$/
const box = (w) => ({ x: w.x, y: w.y, width: w.width, height: w.height })

// o que ta tocando: video numa janela visivel (assiste junto) ou musica (danca)
function classify() {
  let video = null, music = false
  const done = new Set()
  for (const m of media) {
    const app = (m.app || '').toLowerCase()
    const mine = wlist.filter(w => w.exe && app.includes(w.exe))
    mine.forEach(w => done.add(w.exe))
    if (MUSIC_APP.test(app)) { music = true; continue }
    const t = norm(m.title || '').slice(0, 24)
    let w = mine.find(w => PIP.test(w.title))
    if (!w && t.length >= 3) w = wlist.find(w => norm(w.title).includes(t))
    // navegador com titulo que nao bate = tocando em outra aba, conta como musica
    if (!w && mine.length && !(BROWSER.test(mine[0].exe) && t)) w = mine[0]
    if (!w || MUSIC.test(w.title)) { music = true; continue }
    if (!video) video = box(w)
  }
  // site/player que nao avisa o windows: vai pelo som que o programa ta fazendo
  for (const exe of audio) {
    if (MUSIC_APP.test(exe)) { music = true; continue }
    if (done.has(exe) || !(BROWSER.test(exe) || PLAYER.test(exe))) continue
    const w = wlist.find(w => w.exe === exe)
    if (!w || MUSIC.test(w.title)) { music = true; continue }
    if (!video) video = box(w)
  }
  return { video, music }
}

// programa fazendo som que nao eh jogo
const NOT_GAME = /^(signalrgb|sunshine|msedgewebview2|discord|teams|ms-teams|zoom|slack|whatsapp|telegram|obs64|obs32|steam|steamwebhelper|explorer|electron|orca|audiodg|nvcontainer|code)$/
const busySeen = new Map()

// monitores ocupados (jogo ou video), pro pato ir pro outro
function busyDisplays(video) {
  const ds = screen.getAllDisplays()
  if (ds.length < 2) return []
  const now = Date.now()
  const dispOf = (r) => {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    return ds.find(d => cx >= d.bounds.x && cx < d.bounds.x + d.bounds.width && cy >= d.bounds.y && cy < d.bounds.y + d.bounds.height)
  }
  if (video) { const d = dispOf(video); if (d) busySeen.set(d.id, now) }
  for (const d of ds) {
    const b = d.bounds
    // so a janela de cima de cada monitor conta
    const w = wlist.find(w => dispOf(w) === d)
    if (!w) continue
    const full = w.x <= b.x + 1 && w.y <= b.y + 1 && w.x + w.width >= b.x + b.width - 1 && w.y + w.height >= b.y + b.height - 1
    const game = audio.includes(w.exe) && !BROWSER.test(w.exe) && !PLAYER.test(w.exe) && !MUSIC_APP.test(w.exe) &&
      !NOT_GAME.test(w.exe) && w.width * w.height >= b.width * b.height * 0.4
    if (full || game) busySeen.set(d.id, now)
  }
  // segura um pouco pq o som do jogo tem pausa
  const out = ds.filter(d => now - (busySeen.get(d.id) || 0) < 8000).map(d => ({ x1: d.bounds.x, x2: d.bounds.x + d.bounds.width }))
  return out.length === ds.length ? [] : out
}

function tick() {
  if (Date.now() - iconAt > 3000) {
    iconAt = Date.now()
    try { iconRects = wins.icons() } catch (_) { iconRects = [] }
  }
  const w = world()
  const k = JSON.stringify(w)
  if (k !== lastWorld) { lastWorld = k; send('world', w) }
  // segura uns segundos pq o som do video tem pausas
  const c = classify(), now = Date.now()
  if (c.video) { seenVideo = now; watching = c.video } else if (now - seenVideo > 6000) watching = null
  if (c.music) seenMusic = now
  const mus = now - seenMusic < 6000
  if (mus !== music) { music = mus; send('music', music) }
  const wk = watching ? [watching.x, watching.y, watching.width, watching.height].map(v => Math.round(v / 20)).join() : ''
  if (wk !== lastWatch) { lastWatch = wk; send('watch', watching) }
  busy = busyDisplays(watching)
  const bk = JSON.stringify(busy)
  if (bk !== lastBusy) { lastBusy = bk; send('busy', busy) }
}

function startTaskbarReader() {
  ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'shell.ps1')], { windowsHide: true })
  let buf = ''
  ps.stdout.setEncoding('utf8')
  ps.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      try {
        const v = JSON.parse(line)
        tbRects = v.tb || []
        media = v.media || []
        audio = v.audio || []
      } catch (_) {}
    }
  })
  ps.on('exit', () => { ps = null })
}

ipcMain.handle('info', () => {
  const b = win.getBounds()
  return { x: b.x, y: b.y, w: W, h: H, primary: screen.getPrimaryDisplay().bounds, world: world(), watching, music, busy }
})

ipcMain.handle('cursor', () => screen.getCursorScreenPoint())

// setBounds em vez de setPosition pq com escala fracionada a janela vai crescendo
ipcMain.on('move', (_e, x, y) => {
  if (win && !win.isDestroyed()) win.setBounds({ x: Math.round(x), y: Math.round(y), width: W, height: H })
})

ipcMain.on('through', (_e, on) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(on, { forward: true })
})

const HEROS = [['naruto', 'Naruto'], ['flash', 'Flash'], ['ironman', 'Homem de Ferro'], ['spiderman', 'Homem-Aranha'],
  ['batman', 'Batman'], ['superman', 'Superman'], ['hulk', 'Hulk'], ['thor', 'Thor'], ['cap', 'Capitão América']]
const DOS = [['work', 'Trabalhar'], ['beach', 'Praia'], ['hammock', 'Rede'], ['ride', 'Cavalgar'], ['skate', 'Skate'],
  ['guitar', 'Violão'], ['book', 'Ler'], ['paint', 'Pintar'], ['fishing', 'Pescar'], ['bubbles', 'Bolhas de sabão'],
  ['plant', 'Regar planta'], ['gym', 'Malhar'], ['icecream', 'Sorvete']]
const THEMES = [['creme', 'Creme'], ['ciano', 'Ciano'], ['grafite', 'Grafite'], ['lilas', 'Lilás']]

ipcMain.on('icon', (_e, url, theme) => {
  const img = nativeImage.createFromDataURL(url)
  if (tray) return tray.setImage(img)
  tray = new Tray(img)
  tray.setToolTip('microduck')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Quack', click: () => send('cmd', 'quack') },
    { label: 'Dançar', click: () => send('cmd', 'dance') },
    { label: 'Mortal', click: () => send('cmd', 'flip') },
    { label: 'Portal', click: () => send('cmd', 'portal') },
    { label: 'Heróis', submenu: HEROS.map(([id, label]) => ({ label, click: () => send('cmd', 'hero:' + id) })) },
    { label: 'Fazer', submenu: DOS.map(([id, label]) => ({ label, click: () => send('cmd', id) })) },
    { label: 'Dormir', click: () => send('cmd', 'sleep') },
    { label: 'Acordar', click: () => send('cmd', 'wake') },
    { label: 'Cor', submenu: THEMES.map(([id, label]) => ({ label, type: 'radio', checked: id === theme, click: () => send('cmd', 'theme:' + id) })) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ]))
  tray.on('click', () => send('cmd', 'quack'))
})

app.whenReady().then(() => {
  createWindow()
  startTaskbarReader()
  setInterval(tick, 250)
  // widget "sempre no topo" pode ficar na frente dele, entao traz a janela pra frente de vez em quando
  setInterval(() => { if (win && !win.isDestroyed()) win.moveTop() }, 1500)
})

app.on('will-quit', () => { if (ps) ps.kill() })
app.on('window-all-closed', () => app.quit())
