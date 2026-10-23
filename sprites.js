// sprites do microduck, montados com formas simples num grid 32x40
;(function () {
  const SW = 32, SH = 40
  const BASE = { o: '#1e1a24', n: '#2c2c33', N: '#4b4b54', m: '#bcbdc3', e: '#111115', h: '#ffffff', M: '#4a1a10', j: '#e0383e', J: '#9e2a2e' }
  // as cores dos microducks de verdade
  const THEMES = {
    creme: { s: '#f1ebdf', S: '#cbc1ad', f: '#a9aaaf', F: '#7d7e84', k: '#f26a1b', K: '#b8470c', r: '#f5a623', R: '#c47c0d', p: '#f5a623', P: '#e2551a' },
    ciano: { s: '#8ed6e4', S: '#58a8b9', f: '#a9aaaf', F: '#7d7e84', k: '#f26a1b', K: '#b8470c', r: '#f5a623', R: '#c47c0d', p: '#ef6a2a', P: '#f5b323' },
    grafite: { s: '#6c6e75', S: '#4a4c52', f: '#cfd0d4', F: '#9a9ba0', k: '#f6d02c', K: '#c29d10', r: '#8e6ae0', R: '#6648b5', p: '#f6d02c', P: '#8e6ae0' },
    lilas: { s: '#b9a3e3', S: '#8f77c3', f: '#cfd0d4', F: '#9a9ba0', k: '#f6d02c', K: '#c29d10', r: '#7fd6ea', R: '#4fa9bf', p: '#f6d02c', P: '#9a7fd6' }
  }
  let theme = 'creme'
  // fone de ouvido quando ta tocando musica
  let phones = false
  let PAL = { ...BASE, ...THEMES[theme] }

  const grid = () => Array.from({ length: SH }, () => Array(SW).fill('.'))
  const put = (g, x, y, c) => { if (c && x >= 0 && y >= 0 && y < g.length && x < g[0].length) g[y][x] = c }
  const paint = (c, ...a) => typeof c === 'function' ? c(...a) : c

  function ellipse(g, cx, cy, rx, ry, c) {
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) put(g, x, y, paint(c, dx, dy))
    }
  }

  // retangulo com raio por canto [tl, tr, br, bl]
  function rrect(g, x0, y0, x1, y1, rs, c) {
    const [tl, tr, br, bl] = typeof rs === 'number' ? [rs, rs, rs, rs] : rs
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let r = 0, cx = 0, cy = 0
      if (x < x0 + tl && y < y0 + tl) { r = tl; cx = x0 + tl; cy = y0 + tl }
      else if (x > x1 - tr && y < y0 + tr) { r = tr; cx = x1 - tr; cy = y0 + tr }
      else if (x > x1 - br && y > y1 - br) { r = br; cx = x1 - br; cy = y1 - br }
      else if (x < x0 + bl && y > y1 - bl) { r = bl; cx = x0 + bl; cy = y1 - bl }
      if (r && (x - cx) ** 2 + (y - cy) ** 2 > r * r + 0.6) continue
      put(g, x, y, paint(c, x, y))
    }
  }

  function line(g, x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n)
      put(g, x, y, c); put(g, x + 1, y, c)
    }
  }

  function leg(g, l) {
    line(g, l.hx, l.hy, l.kx, l.ky, 'n')
    line(g, l.kx, l.ky, l.fx + 1, l.fy - 3, 'n')
    const pc = l.back ? 'S' : 's'
    for (const [dx, dy] of [[0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]]) put(g, l.kx + dx, l.ky + dy, pc)
    if (!l.back) { put(g, l.hx, l.hy, 'm'); put(g, l.hx + 1, l.hy, 'm') }
    for (let x = l.fx; x <= l.fx + 3; x++) put(g, x, l.fy - 2, 'p')
    for (let x = l.fx - 1; x <= l.fx + 4; x++) { put(g, x, l.fy - 1, 'p'); put(g, x, l.fy, 'P') }
  }

  function legsFor(pose, i, hy) {
    if (pose === 'walk') {
      const bd = [-3, 0, 3, 0][i], bl = [0, 2, 0, 0][i], fd = [3, 0, -3, 0][i], fl = [0, 0, 0, 2][i]
      return [
        { back: true, hx: 10, hy, kx: 11 + Math.round(bd / 2), ky: 32 - bl, fx: 9 + bd, fy: 38 - bl },
        { hx: 16, hy, kx: 18 + Math.round(fd / 2), ky: 32 - fl, fx: 15 + fd, fy: 38 - fl }
      ]
    }
    if (pose === 'sit') return [
      { back: true, hx: 10, hy, kx: 14, ky: 31, fx: 13, fy: 38 },
      { hx: 16, hy, kx: 20, ky: 31, fx: 19, fy: 38 }
    ]
    if (pose === 'dangle') return [
      { back: true, hx: 10, hy, kx: 10, ky: 31, fx: 9, fy: 37 },
      { hx: 16, hy, kx: 17, ky: 31, fx: 16, fy: 37 }
    ]
    if (pose === 'fall') return [
      { back: true, hx: 10, hy, kx: 7, ky: 31, fx: 4, fy: 35 },
      { hx: 16, hy, kx: 20, ky: 31, fx: 21, fy: 35 }
    ]
    return [
      { back: true, hx: 10, hy, kx: 11, ky: 32, fx: 9, fy: 38 },
      { hx: 16, hy, kx: 18, ky: 32, fx: 15, fy: 38 }
    ]
  }

  function head(g, hx, hy, o) {
    // casco + lateral cinza
    rrect(g, hx, hy, hx + 22, hy + 11, [6, 4, 1, 3], (x, y) => (y >= hy + 10 || x <= hx + 1) ? 'S' : 's')
    rrect(g, hx + 8, hy + 3, hx + 21, hy + 10, [3, 1, 0, 0], (x, y) => y === hy + 10 ? 'F' : 'f')
    put(g, hx + 11, hy + 7, 'F'); put(g, hx + 11, hy + 8, 'F')

    // olho = anel da camera
    const ex = hx + 16.5, ey = hy + 7
    ellipse(g, ex, ey, 3.3, 3.3, (dx, dy) => dx + dy > 0.7 ? 'R' : 'r')
    const eyes = o.eyes || 'open'
    if (eyes !== 'closed') { ellipse(g, ex, ey, 1.5, 1.5, 'e'); put(g, hx + 16, hy + 6, 'h') }
    if (eyes === 'blink') ellipse(g, ex, ey, 3.3, 3.3, (dx, dy) => dy < 0.1 ? 's' : dy < 0.45 ? 'S' : null)
    if (eyes === 'closed') {
      ellipse(g, ex, ey, 3.3, 3.3, (dx, dy) => dy < 0.3 ? 's' : 'S')
      for (let x = hx + 14; x <= hx + 19; x++) put(g, x, hy + 7, 'o')
    }

    // bico
    for (let y = hy + 8; y <= hy + 10; y++) { put(g, hx + 22, y, 'k'); put(g, hx + 23, y, 'k') }
    if (o.beak === 'open') {
      for (let x = hx + 2; x <= hx + 24; x++) put(g, x, hy + 11, 'k')
      rrect(g, hx + 10, hy + 12, hx + 23, hy + 13, 0, 'M')
      for (let x = hx + 6; x <= hx + 24; x++) put(g, x, hy + 14, 'k')
      for (let x = hx + 6; x <= hx + 23; x++) put(g, x, hy + 15, 'K')
    } else {
      for (let x = hx + 2; x <= hx + 24; x++) put(g, x, hy + 11, 'k')
      for (let x = hx + 3; x <= hx + 23; x++) put(g, x, hy + 12, 'K')
    }

    if (phones) {
      // arco por cima da cabeca e a concha do lado
      for (let x = hx + 9; x <= hx + 17; x++) { put(g, x, hy - 1, 'J'); put(g, x, hy, 'j') }
      put(g, hx + 8, hy, 'j'); put(g, hx + 18, hy, 'j'); put(g, hx + 8, hy + 1, 'j')
      rrect(g, hx + 6, hy + 2, hx + 10, hy + 8, 1, (x) => x === hx + 6 ? 'J' : 'j')
    }
  }

  function build(o = {}) {
    const pose = o.pose || 'stand', step = o.step || 0
    let b = o.bob || 0
    if (pose === 'walk') b += [1, 0, 1, 0][step]
    if (pose === 'sit') b += 7
    if (pose === 'dangle') b -= 1
    const g = grid()

    rrect(g, 7, 20 + b, 19, 25 + b, [2, 2, 1, 1], (x, y) => y >= 24 + b ? 'S' : 's')
    put(g, 17, 22 + b, 'S'); put(g, 17, 23 + b, 'S')
    rrect(g, 8, 26 + b, 19, 28 + b, 1, (x, y) => y === 26 + b ? 'N' : 'n')
    for (const l of legsFor(pose, step, 27 + b)) leg(g, l)

    // pescoco de servo
    for (let y = 13 + b; y <= 20 + b; y++) {
      const x0 = y < 17 + b ? 14 : 13
      for (let x = x0; x < x0 + 4; x++) put(g, x, y, x === x0 ? 'N' : 'n')
    }
    put(g, 15, 15 + b, 'm'); put(g, 14, 18 + b, 'm')

    head(g, 5, 1 + b, o)
    return outline(g)
  }

  function outline(g) {
    const out = g.map(r => r.slice())
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] !== '.') continue
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => g[y + ay] && g[y + ay][x + ax] && g[y + ay][x + ax] !== '.')) out[y][x] = 'o'
    }
    return out
  }

  // cavalinho 40x32, 4 quadros de galope. pes no fundo da linha 30
  const HPAL = { o: '#1e1a24', e: '#111115', a: '#9a6638', A: '#6e4626', d: '#3a2618', u: '#c08d5e', x: '#d23a3a', X: '#8e2a20' }
  function horse(step) {
    const g = Array.from({ length: 32 }, () => Array(40).fill('.'))
    const oy = step === 2 ? 0 : 1
    // [quadril x, pe x, pe y], as de indice par ficam do outro lado
    const L = [
      [[9, 4, 29], [12, 8, 30], [25, 30, 29], [27, 34, 30]],
      [[9, 9, 30], [12, 12, 30], [25, 26, 30], [27, 29, 30]],
      [[9, 14, 29], [12, 16, 28], [25, 22, 28], [27, 24, 29]],
      [[9, 10, 30], [12, 13, 30], [25, 27, 30], [27, 28, 30]]
    ][step]
    L.forEach(([hx, fx, fy], i) => {
      line(g, hx, 18 + oy, fx, fy - 2, i % 2 ? 'a' : 'A')
      for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1]]) put(g, fx + dx, fy + dy, 'd')
    })
    const tx = [2, 3, 4, 3][step]
    line(g, 6, 12 + oy, 3, 16 + oy, 'd')
    line(g, 3, 16 + oy, tx, 23 + oy, 'd')
    ellipse(g, 17.5, 15 + oy, 11.5, 6, (dx, dy) => dy > 0.55 ? 'A' : 'a')
    for (let i = 0; i < 5; i++) line(g, 23 + i, 13 + oy, 28 + i, 4 + oy, 'a')
    rrect(g, 28, 1 + oy, 36, 7 + oy, [2, 3, 1, 1], 'a')
    rrect(g, 33, 4 + oy, 38, 8 + oy, [0, 2, 2, 1], 'u')
    put(g, 37, 6 + oy, 'd')
    put(g, 29, oy, 'a'); put(g, 30, oy, 'a')
    put(g, 31, 3 + oy, 'e')
    line(g, 22, 11 + oy, 27, 2 + oy, 'd')
    put(g, 29, 1 + oy, 'd')
    rrect(g, 12, 8 + oy, 21, 10 + oy, [2, 1, 0, 0], 'x')
    for (let y = 11; y <= 19; y++) put(g, 17, y + oy, 'X')
    return outline(g)
  }

  // gira 90 graus anti-horario: pe fica pra direita, bico pra cima (pra escalar parede)
  function rotate(g) {
    const h = g.length, w = g[0].length
    return Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => g[x][w - 1 - y]))
  }

  const FRAMES = {
    idle0: {}, idle1: { bob: 1 }, blink: { eyes: 'blink' }, land: { bob: 2, eyes: 'blink' },
    quack: { beak: 'open' },
    sit: { pose: 'sit' }, sitblink: { pose: 'sit', eyes: 'blink' }, sitopen: { pose: 'sit', beak: 'open' },
    sleep: { pose: 'sit', eyes: 'closed' }, sleep2: { pose: 'sit', bob: 1, eyes: 'closed' },
    dangle: { pose: 'dangle', beak: 'open' }, fall: { pose: 'fall', eyes: 'blink' },
    walk0: { pose: 'walk', step: 0 }, walk1: { pose: 'walk', step: 1 },
    walk2: { pose: 'walk', step: 2 }, walk3: { pose: 'walk', step: 3 }
  }

  function toCanvas(g, flip, pal) {
    const h = g.length, w = g[0].length
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const cx = cv.getContext('2d')
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = g[y][x]
      if (c === '.') continue
      cx.fillStyle = pal[c]
      cx.fillRect(flip ? w - 1 - x : x, y, 1, 1)
    }
    return cv
  }

  // fantasias dos herois: so troca as cores
  const SKINS = {
    naruto: { s: '#f5a03c', S: '#c86a14', n: '#26262d', N: '#3a3a44' },
    flash: { s: '#d6262e', S: '#9e1a20', f: '#f5c518', F: '#c99a0c', p: '#f5c518', P: '#c99a0c', n: '#9e1a20', N: '#d6262e' },
    ironman: { s: '#b3202a', S: '#7e141c', f: '#f2c14e', F: '#c79a2a', r: '#bff6ff', R: '#7fd6ea', p: '#f2c14e', P: '#c79a2a', n: '#7e141c', N: '#b3202a', k: '#f2c14e', K: '#c79a2a' },
    spiderman: { s: '#d0262e', S: '#94181e', f: '#2a4fb0', F: '#1c3780', r: '#ffffff', R: '#d8d8d8', n: '#2a4fb0', N: '#3a62c8', p: '#d0262e', P: '#94181e' },
    batman: { s: '#3a3a44', S: '#26262d', f: '#8a8f9a', F: '#6b707a', r: '#ffffff', R: '#cfcfcf', p: '#26262d', P: '#1a1a1f', n: '#26262d', N: '#3a3a44', k: '#f6d02c', K: '#c29d10' },
    superman: { s: '#2457c5', S: '#183c8f', p: '#d42a2a', P: '#9e1f1f', n: '#183c8f', N: '#2457c5' },
    hulk: { s: '#5fae3e', S: '#3f7f2a', f: '#7fcf5a', F: '#5aa53c', p: '#7b3fa0', P: '#5a2c78', n: '#7b3fa0', N: '#9a5ac0' },
    thor: { s: '#9aa0aa', S: '#6e737c', f: '#d9c08c', F: '#b39a68', p: '#3a3a44', P: '#26262d', n: '#26262d', N: '#3a3a44' },
    cap: { s: '#2457c5', S: '#183c8f', f: '#fafafa', F: '#cfcfcf', p: '#d42a2a', P: '#9e1f1f', n: '#d42a2a', N: '#e04a4a' }
  }

  let cache = {}
  function get(name, flip, rot, skin) {
    const k = name + (flip ? '<' : '>') + (rot ? 'r' : '') + (skin || '')
    if (cache[k]) return cache[k]
    let g = build(FRAMES[name])
    if (rot) g = rotate(g)
    return (cache[k] = toCanvas(g, flip, skin ? { ...PAL, ...SKINS[skin] } : PAL))
  }

  // linha do topo da cabeca no quadro (pra desenhar coisas na cabeca)
  function headY(name) {
    const o = FRAMES[name] || {}
    let b = o.bob || 0
    if (o.pose === 'walk') b += [1, 0, 1, 0][o.step || 0]
    if (o.pose === 'sit') b += 7
    if (o.pose === 'dangle') b -= 1
    return 1 + b
  }

  const horses = {}
  function getHorse(step, flip) {
    const k = step + (flip ? '<' : '>')
    return horses[k] || (horses[k] = toCanvas(horse(step), flip, HPAL))
  }

  // balde de pipoca
  const BUCKET = [
    '..o.oo..',
    '.oyoyyo.',
    'oyyYyyYo',
    'ohhhhhho',
    'orwrwrwo',
    'orwrwrwo',
    '.orwrwo.',
    '.orwrwo.',
    '.oooooo.'
  ]
  const PROP = { o: '#1e1a24', y: '#fff3c4', Y: '#f2c14e', h: '#ffffff', r: '#e0383e', w: '#fafafa' }
  let bucket = null
  function getBucket() {
    if (bucket) return bucket
    bucket = document.createElement('canvas')
    bucket.width = 8
    bucket.height = BUCKET.length
    const cx = bucket.getContext('2d')
    BUCKET.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return
      cx.fillStyle = PROP[c]
      cx.fillRect(x, y, 1, 1)
    }))
    return bucket
  }

  function setPhones(v) {
    if (v === phones) return
    phones = v
    cache = {}
  }

  function setTheme(t) {
    if (!THEMES[t]) return
    theme = t
    PAL = { ...BASE, ...THEMES[t] }
    cache = {}
  }

  globalThis.Sprites = {
    SW, SH, FRAMES, THEMES, build, rotate, get, headY, setTheme, setPhones, bucket: getBucket, horse: getHorse,
    get theme() { return theme },
    get PAL() { return PAL },
    icon: () => {
      const cv = document.createElement('canvas')
      cv.width = cv.height = 32
      cv.getContext('2d').drawImage(get('idle0'), 0, 0, 32, 40, 4, 0, 26, 32)
      return cv.toDataURL('image/png')
    }
  }
})()
