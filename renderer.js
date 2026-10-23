const S = 2, LW = 80, LH = 76
// centro do sprite no canvas quando ta em pe (sobra espaco em volta pros moveis e o cavalo)
const CX = 40, CY = 54
// linha do chao no canvas
const GY = CY + 19
const G = 2000, SPEED = 36, CLIMB = 55, RIDE = 120
const JUMP_UP = 110, JUMP_SIDE = 170, HALF = 12
const OUT = '#1e1a24'

const view = document.getElementById('c')
view.width = LW * S
view.height = LH * S
const vctx = view.getContext('2d')
vctx.imageSmoothingEnabled = false
const buf = document.createElement('canvas')
buf.width = LW
buf.height = LH
const ctx = buf.getContext('2d', { willReadFrequently: true })
ctx.imageSmoothingEnabled = false

let world = { segs: [], solids: [] }
let primary = null
// ax, ay = ponto entre os pes, em coordenadas da tela
let ax = 0, ay = 0, face = 1
let sup = null
const vel = { x: 0, y: 0 }
let st = { name: 'idle', t: 0, dur: 2 }
let blinkIn = 2, blinkT = 0
let lastTouch = performance.now()
let drag = null
let parts = [], partIn = 0
let lastWin = { x: 0, y: 0 }, lastSprite = { sx: 0, sy: 0 }
// retangulo da janela do video quando tem algo passando
let watching = null
// tem musica tocando (spotify etc): ele danca
let music = false

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]

function go(name, extra = {}) { st = { name, t: 0, ...extra } }
const AIR = new Set(['drag', 'fall', 'jump', 'climb'])

// ---- mundo ----

const floors = () => world.segs.filter(s => s.kind === 'floor')

function supportAt(x, y, prefer) {
  let best = null
  for (const s of world.segs) {
    if (x < s.x1 - 1 || x > s.x2 + 1 || Math.abs(s.y - y) > 6) continue
    if (prefer && s.id === prefer) return s
    if (!best || Math.abs(s.y - y) < Math.abs(best.y - y)) best = s
  }
  return best
}

function below(x, y) {
  let best = null
  for (const s of world.segs) if (x >= s.x1 && x <= s.x2 && s.y > y + 6 && (!best || s.y < best.y)) best = s
  return best
}

function above(x, y) {
  let best = null
  for (const s of world.segs) if (x >= s.x1 && x <= s.x2 && s.y < y - 6 && (!best || s.y > best.y)) best = s
  return best
}

function stand(s) { sup = { id: s.id, off: ax - s.wl }; ay = s.y }

function dropOff(vx = 0) {
  sup = null
  vel.x = vx
  vel.y = 0
  parts = []
  go('fall')
}

function respawn() {
  const f = floors().find(f => primary && f.x1 <= primary.x + 10 && f.x2 >= primary.x + 10) || floors()[0]
  if (!f) return
  ax = (f.x1 + f.x2) / 2
  ay = f.y - 300
  dropOff()
}

function onWorld(w) {
  world = w
  if (st.name === 'climb') {
    const s = world.segs.find(s => s.id === st.id)
    if (!s) return dropOff()
    if (s.kind === 'win') st.wall = st.side > 0 ? s.wl : s.wr
    st.top = s.y
    return
  }
  // cavalo/skate cuidam da propria altura
  if (!sup || AIR.has(st.name) || st.name === 'ride') return
  const same = world.segs.filter(s => s.id === sup.id)
  if (!same.length) return dropOff()
  // anda junto com a janela se ela mexer
  const nx = same[0].wl + sup.off
  const s = same.find(s => nx >= s.x1 - 2 && nx <= s.x2 + 2)
  ax = nx
  if (!s) return dropOff()
  ay = s.y
}

// ---- acoes ----

function walkTo(tx, plan) {
  if (Math.abs(tx - ax) < 2) return plan ? doPlan(plan) : go('idle', { dur: 1 })
  face = tx > ax ? 1 : -1
  go('walk', { tx, plan })
}

// monitor com jogo ou video: ele fica no outro
let busy = []
const isBusy = (x) => busy.some(b => x >= b.x1 && x < b.x2)
const freeFloors = () => floors().filter(f => !isBusy((f.x1 + f.x2) / 2))

// ta na tela ocupada: vai pra outra (andando ou de portal)
function flee() {
  if (!isBusy(ax)) return false
  const ff = freeFloors()
  if (!ff.length) return false
  const f = ff.sort((a, b) => Math.abs((a.x1 + a.x2) / 2 - ax) - Math.abs((b.x1 + b.x2) / 2 - ax))[0]
  const tx = rnd(f.x1 + 80, f.x2 - 80)
  if (Math.random() < 0.6 && portal({ id: f.id, x: tx, y: f.y })) return true
  const cur = supportAt(ax, ay, sup && sup.id)
  if (cur && (cur.kind === 'win' || cur.kind === 'icon') && below(ax, ay)) { ay += 2; dropOff(face * 40); return true }
  walkTo(tx, { kind: 'flee' })
  return true
}

function wander() {
  const fl = busy.length && freeFloors().length ? freeFloors() : floors()
  const mn = Math.min(...fl.map(f => f.x1)), mx = Math.max(...fl.map(f => f.x2))
  let tx
  if (fl.length > 1 && Math.random() < 0.3) {
    // passeio pro outro monitor
    const other = fl.filter(f => ax < f.x1 || ax > f.x2)
    const f = other.length ? pick(other) : pick(fl)
    tx = rnd(f.x1 + 60, f.x2 - 60)
  } else {
    tx = ax + (Math.random() < 0.5 ? -1 : 1) * rnd(60, 380)
  }
  tx = clamp(tx, mn + 20, mx - 20)
  // nao passeia pra tela ocupada
  if (isBusy(tx) && !isBusy(ax)) tx = ax + (ax - tx) * 0.5
  walkTo(clamp(tx, mn + 20, mx - 20))
}

function jumpTo(tx, ty) {
  const peak = Math.min(ay, ty) - 26
  const vUp = Math.sqrt(2 * G * (ay - peak))
  const t = vUp / G + Math.sqrt(2 * Math.max(1, ty - peak) / G)
  vel.y = -vUp
  vel.x = (tx - ax) / t
  if (Math.abs(vel.x) > 1) face = vel.x > 0 ? 1 : -1
  sup = null
  go('jump', { crouch: 0.14 })
}

function startClimb(wall, side, top, id) {
  sup = null
  face = side
  go('climb', { wall, side, top, id, cy: ay - 16 })
}

function doPlan(p) {
  if (p.kind === 'watch') return watchHere()
  if (p.kind === 'flee') return go('idle', { dur: 1 })
  if (p.kind === 'scene') return scene(p.what) || quack(true)
  const s = world.segs.find(s => s.id === p.id)
  if (!s) return go('idle', { dur: 1 })
  if (p.kind === 'climb') return startClimb(p.side > 0 ? s.wl : s.wr, p.side, s.y, s.id)
  jumpTo(clamp(p.tx, s.x1 + 6, s.x2 - 6), s.y)
}

// procura algo pra subir: janela (escalando) ou plataforma perto (pulando)
function findPlan() {
  const cur = supportAt(ax, ay, sup && sup.id)
  if (!cur) return null
  const opts = []
  for (const s of world.segs) {
    if (s.y >= ay - 20 || s.x2 - s.x1 < 12 || isBusy((s.x1 + s.x2) / 2)) continue
    if (Math.min(Math.abs(s.x1 - ax), Math.abs(s.x2 - ax)) > 800) continue
    if (ay - s.y <= JUMP_UP) {
      const tx = clamp(ax, s.x1 + 8, s.x2 - 8)
      const dir = tx >= ax ? 1 : -1
      const from = clamp(tx - dir * rnd(40, 90), cur.x1 + 4, cur.x2 - 4)
      if (Math.abs(tx - from) <= JUMP_SIDE) opts.push({ kind: 'jump', from, tx, id: s.id, w: s.kind === 'icon' ? 3 : 1 })
    }
    if (s.kind === 'win' && s.wb >= ay - 70) {
      if (Math.abs(s.x1 - s.wl) < 2) {
        const from = s.wl - HALF - 2
        if (from >= cur.x1 && from <= cur.x2) opts.push({ kind: 'climb', from, side: 1, id: s.id, w: 2 })
      }
      if (Math.abs(s.x2 - s.wr) < 2) {
        const from = s.wr + HALF + 2
        if (from >= cur.x1 && from <= cur.x2) opts.push({ kind: 'climb', from, side: -1, id: s.id, w: 2 })
      }
    }
  }
  if (!opts.length) return null
  const bag = opts.flatMap(o => Array(o.w).fill(o))
  return pick(bag)
}

function quack(hop) {
  go('quack', { hop })
  quackSound()
}

// auto = cochilo sozinho, curtinho. pela bandeja dorme ate clicar
function sleep(auto) { partIn = 0.4; parts = []; go('sleep', { dur: auto ? rnd(15, 30) : Infinity }) }
function wake() { parts = []; blinkT = 0.3; go('idle', { dur: 1 }) }
function dance() { parts = []; partIn = 0; go('dance', { dur: music ? rnd(6, 12) : rnd(3.5, 6) }); tune() }
function flip() { go('flip', { dur: 0.75 }); quackSound(0.6) }
function spin() { go('spin', { dur: 1.3 }) }

const videoX = () => watching.x + watching.width / 2

// com 2 monitores assiste do outro, na beirada do lado do video, pra nao atrapalhar
function otherSpot(vf) {
  const fl = floors().filter(f => f !== vf)
  if (!fl.length) return null
  const vx = videoX()
  const dist = f => Math.max(0, f.x1 - vx, vx - f.x2)
  const f = fl.sort((a, b) => dist(a) - dist(b))[0]
  const free = x => x >= f.x1 + 30 && x <= f.x2 - 30 && !world.solids.some(b => x >= b.x - HALF - 4 && x <= b.x + b.w + HALF + 4)
  const c = []
  for (let x = f.x1 + 40; x <= f.x2 - 40; x += 16) c.push(x)
  for (const b of world.solids) c.push(b.x - HALF - 6, b.x + b.w + HALF + 6)
  const cost = x => Math.abs(x - vx) * 0.5 + Math.abs(x - ax) * 0.2 +
    world.solids.filter(b => b.x < Math.max(x, ax) && b.x + b.w > Math.min(x, ax)).length * 60
  const ok = c.filter(free).sort((a, b) => cost(a) - cost(b))
  return ok.length ? ok[0] : null
}

// lugar no chao perto do video: do lado da janela ou no cantinho dela
function watchSpot() {
  const v = watching
  const f = floors().find(f => videoX() >= f.x1 && videoX() <= f.x2)
  if (!f) return null
  const o = otherSpot(f)
  if (o != null) return o
  const free = x => x >= f.x1 + 30 && x <= f.x2 - 30 && !world.solids.some(b => x >= b.x - HALF - 4 && x <= b.x + b.w + HALF + 4)
  const c = [f.x1 + 70, f.x2 - 70]
  for (let x = v.x - 36; x <= v.x + v.width + 36; x += 16) c.push(x)
  for (const b of world.solids) c.push(b.x - HALF - 6, b.x + b.w + HALF + 6)
  // perto da borda do video, perto dele e sem ter que atravessar a barra pulando icone
  const edgeD = x => Math.min(Math.abs(x - v.x), Math.abs(x - v.x - v.width))
  const cost = x => edgeD(x) * 0.6 + Math.abs(x - ax) * 0.4 +
    world.solids.filter(b => b.x < Math.max(x, ax) && b.x + b.w > Math.min(x, ax)).length * 120
  const ok = c.filter(free).sort((a, b) => cost(a) - cost(b))
  return ok.length ? ok[0] : null
}

// hora do filme: desce pro chao, vai pra perto do video e senta com pipoca olhando pra ele
function goWatch() {
  const cur = supportAt(ax, ay, sup && sup.id)
  if (!cur) return watchHere()
  // em cima de janela/icone: pula pra baixo (o +2 eh pra nao pousar no mesmo lugar)
  if ((cur.kind === 'win' || cur.kind === 'icon') && below(ax, ay)) { ay += 2; return dropOff(face * 40) }
  const x = watching && watchSpot()
  if (x == null || x === false || (cur.kind !== 'floor' && cur.kind !== 'tb')) return watchHere()
  walkTo(x, { kind: 'watch' })
}

function watchHere() {
  if (watching) face = videoX() > ax ? 1 : -1
  parts = []
  go('watch', { eatAt: rnd(1.5, 3), eat: -1 })
}

function next() {
  lazy = false
  if (watching) return goWatch()
  const bored = (performance.now() - lastTouch) / 1000
  // so cochila depois de muito tempo largado, e raramente
  if (bored > 1800 && Math.random() < 0.05) return sleep(true)
  if (flee()) return
  // com musica ele continua fazendo as coisas dele (de fone), so danca mais vezes
  if (music && Math.random() < 0.15) return dance()
  const r = Math.random()
  if (r < 0.03) return portal() || wander()
  if (r < 0.15) return wander()
  if (r < 0.25) {
    const p = findPlan()
    if (p) return walkTo(p.from, p)
    return wander()
  }
  if (r < 0.30) return go('sit', { dur: rnd(4, 9) })
  if (r < 0.32) return quack(false)
  if (r < 0.34) return flip()
  if (r < 0.36) return spin()
  if (r < 0.38) return hero(pick(HERO_KINDS)) || wander()
  if (r < 0.45) return scene(pick(KINDS)) || wander()
  // no resto do tempo vai pro canto e fica de boa no pc, na rede etc
  chill()
}

// chegou no fim do chao atual
function edge(nx) {
  const cur = supportAt(ax, ay, sup && sup.id)
  // vao pequeno ate a proxima plataforma (tipo entre icones): pula por cima
  const gap = world.segs.find(s => s !== cur && Math.abs(s.y - ay) <= 20 &&
    (face > 0 ? s.x1 >= nx - 2 && s.x1 <= nx + 40 : s.x2 <= nx + 2 && s.x2 >= nx - 40))
  if (gap && Math.random() < 0.75) return jumpTo(face > 0 ? gap.x1 + 8 : gap.x2 - 8, gap.y)
  if (below(nx, ay)) return dropOff(face * 110)
  const up = above(nx, ay)
  if (up && ay - up.y <= JUMP_UP) return jumpTo(nx + face * 16, up.y)
  if (up && cur && up.kind === 'floor') return startClimb(face > 0 ? cur.x2 : cur.x1, face, up.y, up.id)
  face = -face
  go('idle', { dur: rnd(0.8, 2) })
}

function blocked(nx) {
  const fx = nx + face * HALF
  return world.solids.find(b => b.y < ay - 3 && b.y + b.h > ay - 60 && fx >= b.x && fx <= b.x + b.w)
}

// icone da barra no caminho: pula por cima ou sobe nele
function hop(b) {
  const over = face > 0 ? b.x + b.w + 14 : b.x - 14
  const clear = !world.solids.some(o => over >= o.x - HALF && over <= o.x + o.w + HALF && o.y < ay - 3)
  // coisa alta (widget) nao da pra pular por cima, sobe nela
  if (clear && b.h < 50 && Math.random() < 0.6) return jumpTo(over, ay)
  jumpTo(face > 0 ? b.x + 10 : b.x + b.w - 10, b.y)
}

// ---- fisica ----

function physics(dt) {
  const py = ay
  vel.y += G * dt
  ax += vel.x * dt
  ay += vel.y * dt
  const fl = floors()
  if (fl.length) {
    const mn = Math.min(...fl.map(f => f.x1)) + HALF, mx = Math.max(...fl.map(f => f.x2)) - HALF
    if (ax < mn) { ax = mn; vel.x = Math.abs(vel.x) * 0.5 }
    if (ax > mx) { ax = mx; vel.x = -Math.abs(vel.x) * 0.5 }
    if (ay > Math.max(...fl.map(f => f.y)) + 400) return respawn()
  }
  if (vel.y <= 0) return
  let land = null
  for (const s of world.segs) {
    if (ax >= s.x1 && ax <= s.x2 && s.y >= py - 0.5 && s.y <= ay && (!land || s.y < land.y)) land = s
  }
  if (!land) return
  ay = land.y
  if (st.name === 'fall' && vel.y > 750) { vel.y = -vel.y * 0.3; vel.x *= 0.6; return }
  ax = clamp(ax, land.x1, land.x2)
  vel.x = vel.y = 0
  stand(land)
  go('land')
}

function update(dt) {
  st.t += dt
  switch (st.name) {
    case 'idle':
      if (st.t > st.dur) next()
      break
    case 'sit':
      if (st.t > st.dur) go('idle', { dur: 0.6 })
      break
    case 'walk': {
      const sp = st.plan && (st.plan.kind === 'watch' || st.plan.kind === 'flee') ? SPEED * 2.2 : SPEED
      const nx = ax + face * sp * dt
      const b = blocked(nx)
      if (b) { hop(b); break }
      const cur = supportAt(ax, ay, sup && sup.id)
      if (!cur) { dropOff(); break }
      if (nx >= cur.x1 && nx <= cur.x2) ax = nx
      else {
        const cont = supportAt(nx, ay)
        if (cont) { ax = nx; stand(cont) } else { edge(nx); break }
      }
      if (sup) sup.off = ax - (supportAt(ax, ay, sup.id) || cur).wl
      if ((face > 0 && ax >= st.tx) || (face < 0 && ax <= st.tx)) {
        ax = st.tx
        if (st.plan) doPlan(st.plan); else go('idle', { dur: rnd(1, 2.5) })
      }
      break
    }
    case 'quack':
      if (st.t > 0.9) go('idle', { dur: rnd(1, 2.5) })
      break
    case 'dance':
      partIn -= dt
      if (partIn <= 0) { partIn = 0.45; parts.push({ t: 0, x: rnd(-14, 14), kind: 'note' }) }
      if (st.t > st.dur) { parts = []; if (music) go('idle', { dur: rnd(0.3, 1) }); else quack(true) }
      break
    case 'flip':
    case 'spin':
      if (st.t > st.dur) go('land')
      break
    case 'watch':
      // fica virado pro video, com folga pra nao ficar trocando de lado
      if (watching && Math.abs(videoX() - ax) > 24) face = videoX() > ax ? 1 : -1
      if (st.eat < 0 && st.t > st.eatAt) { st.eat = st.t; parts.push({ t: 0, kind: 'pop' }) }
      if (st.eat >= 0 && st.t - st.eat > 1.1) { st.eat = -1; st.eatAt = st.t + rnd(2, 5) }
      break
    case 'sleep':
      partIn -= dt
      if (partIn <= 0) { partIn = 1.3; parts.push({ t: 0, x: 0, kind: 'z' }) }
      if (st.t > st.dur) wake()
      break
    case 'jump':
      if (st.t > st.crouch) physics(dt)
      break
    case 'fall':
      physics(dt)
      break
    case 'climb':
      st.cy -= CLIMB * dt
      if (st.cy - 14 <= st.top) {
        ax = st.wall + st.side * 18
        ay = st.top
        const s = supportAt(ax, ay, st.id)
        if (s) { ax = clamp(ax, s.x1, s.x2); stand(s); go('land') } else dropOff()
      }
      break
    case 'land':
      if (st.t > 0.3) go('idle', { dur: watching || isBusy(ax) ? 0.1 : rnd(0.6, 1.5) })
      break
    case 'scene':
      sceneUpdate(dt)
      break
    case 'ride':
      rideUpdate(dt)
      break
    case 'portal':
    case 'portalout':
      portalUpdate()
      break
    case 'hero':
      heroUpdate(dt)
      break
  }
  for (const p of parts) p.t += dt
  parts = parts.filter(p => p.t < (p.kind === 'pop' ? 0.4 : p.kind === 'puff' ? 0.45 : 2.6))
}

function tickBlink(dt) {
  if (blinkT > 0) blinkT -= dt
  blinkIn -= dt
  if (blinkIn <= 0) { blinkT = 0.12; blinkIn = rnd(2, 6) }
}

function frame() {
  const t = st.t, b = blinkT > 0
  switch (st.name) {
    case 'walk': return 'walk' + (Math.floor(t * 8) % 4)
    case 'climb': return 'walk' + (Math.floor(t * 6) % 4)
    case 'quack': return 'quack'
    case 'sit': return b ? 'sitblink' : 'sit'
    case 'watch': {
      const e = st.eat >= 0 ? t - st.eat : -1
      if (e > 0.35 && e < 1.05) return Math.floor(e * 8) % 2 ? 'sit' : 'sitopen'
      return b ? 'sitblink' : 'sit'
    }
    case 'sleep': return Math.floor(t * 0.8) % 2 ? 'sleep2' : 'sleep'
    case 'drag': return 'dangle'
    case 'fall': return 'fall'
    case 'jump': return t < st.crouch ? 'land' : 'fall'
    case 'land': return 'land'
    case 'flip': return 'fall'
    case 'spin': return t > 1 ? 'quack' : 'idle0'
    case 'dance': {
      const beat = Math.floor(t / 0.3)
      return ['walk0', 'land', 'walk2', 'quack'][beat % 4]
    }
    case 'scene': {
      if (st.end || t < BUILD) return 'walk' + (Math.floor(t * 8) % 4)
      const E = EXTRA[st.kind]
      if (st.q != null && t - st.q < 0.8) return E && E.pose === 'stand' ? 'quack' : 'sitopen'
      if (E) return E.frame(t - BUILD, b)
      return b ? 'sitblink' : 'sit'
    }
    case 'hero': return HEROES[st.kind].frame(t, b)
    case 'portal': return st.t > 0.5 ? 'walk' + (Math.floor(t * 8) % 4) : (b ? 'blink' : 'idle0')
    case 'portalout': return st.t < 0.9 ? 'fall' : 'land'
    case 'ride':
      if (st.q != null && t - st.q < 0.8) return st.mount === 'skate' ? 'quack' : 'sitopen'
      if (t < 0.6 || st.end) return 'fall'
      if (st.mount === 'skate') return st.ol != null && t - st.ol < 0.15 ? 'land' : b ? 'blink' : 'idle0'
      return b ? 'sitblink' : 'sit'
    default: return b ? 'blink' : (Math.floor(t * 2) % 2 ? 'idle1' : 'idle0')
  }
}

// ---- desenho ----

const FONT = {
  Q: ['###', '#.#', '#.#', '###', '..#'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], C: ['###', '#..', '#..', '#..', '###'],
  K: ['#.#', '##.', '#..', '##.', '#.#'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'], N: ['..##', '..#.', '..#.', '###.', '##..']
}

function text(str, x, y, color) {
  ctx.fillStyle = color
  for (let i = 0; i < str.length; i++) {
    const g = FONT[str[i]]
    if (!g) continue
    g.forEach((row, r) => [...row].forEach((p, c) => { if (p === '#') ctx.fillRect(x + i * 4 + c, y + r, 1, 1) }))
  }
}

const headX = () => CX - 16 + (face > 0 ? 18 : 13)

function bubble(str, up = 0) {
  const bw = str.length * 4 + 3, bh = 9, by = Math.max(0, CY - 34 - up)
  const hx = headX()
  const bx = clamp(Math.round(hx - bw / 2), 0, LW - bw)
  ctx.fillStyle = OUT
  ctx.fillRect(bx + 1, by, bw - 2, bh)
  ctx.fillRect(bx, by + 1, bw, bh - 2)
  ctx.fillStyle = '#fff'
  ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2)
  ctx.fillRect(hx, by + bh - 1, 1, 2)
  ctx.fillStyle = OUT
  ctx.fillRect(hx - 1, by + bh, 1, 1)
  ctx.fillRect(hx + 1, by + bh, 1, 1)
  ctx.fillRect(hx, by + bh + 1, 1, 1)
  text(str, bx + 2, by + 2, OUT)
}

function drawParts(bx = headX(), by = CY - 26) {
  for (const p of parts) {
    if (p.kind === 'pop') continue
    if (p.kind === 'puff') { puffDraw(p); continue }
    if (p.kind === 'bub') { bubDraw(p); continue }
    const x = Math.round(bx + p.x + (p.kind === 'z' ? z(p) : Math.sin(p.t * 4) * 2))
    const y = Math.round(by - p.t * 5)
    const ch = p.kind === 'z' ? 'Z' : 'N'
    const col = p.kind === 'z' ? '#8fc8ff' : pick(['#ff7eb6', '#ffd23f', '#7fd6ea'])
    if (p.kind === 'note') p.col = p.col || col
    text(ch, x + 1, y + 1, OUT)
    text(ch, x, y, p.col || col)
  }
}
const z = (p) => -2 * face + p.t * 3 * face + Math.sin(p.t * 3) * 1.5

// balde na frente dos pes e pipoca voando pro bico
function popcorn(left, top) {
  const bx = left + (face > 0 ? 23 : 1), by = top + 30
  ctx.drawImage(Sprites.bucket(), bx, by)
  const p = parts.find(p => p.kind === 'pop')
  if (!p) return
  const k = Math.min(1, p.t / 0.35)
  const tx = left + (face > 0 ? 26 : 5), ty = top + 19
  const x = Math.round(bx + 4 + (tx - bx - 4) * k), y = Math.round(by + (ty - by) * k - Math.sin(Math.PI * k) * 8)
  ctx.fillStyle = OUT
  ctx.fillRect(x - 1, y - 1, 4, 4)
  ctx.fillStyle = '#fff3c4'
  ctx.fillRect(x, y, 2, 2)
}

function draw() {
  ctx.clearRect(0, 0, LW, LH)
  const fr = frame()
  let img, cx = CX, cy = CY, sx = ax, sy = ay - 19 * S, angle = 0

  if (st.name === 'hero') {
    HEROES[st.kind].draw(fr, st.t)
    drawParts()
    sy -= (st.fly || 0) - (st.lift || 0) * S
    sx += st.shake || 0
  } else if (st.name === 'portal' || st.name === 'portalout') {
    portalDraw(fr)
  } else if (st.name === 'scene' || st.name === 'ride') {
    if (st.name === 'scene') sceneDraw(fr); else rideDraw(fr)
  } else if (st.name === 'climb') {
    img = Sprites.get(fr, st.side < 0, true)
    cy = 30
    sx = st.side > 0 ? st.wall - 19 * S : st.wall + 20 * S
    sy = st.cy + S
  } else if (st.name === 'flip') {
    img = Sprites.get(fr, face < 0)
    cy = CY - 6
    const k = st.t / st.dur
    sy -= Math.sin(Math.PI * k) * 46
    angle = -face * Math.PI * 2 * k
  } else {
    let f = face
    if (st.name === 'spin' && st.t < 1) f = Math.floor(st.t / 0.1) % 2 ? -face : face
    if (st.name === 'dance' && Math.floor(st.t / 0.6) % 2) f = -face
    img = Sprites.get(fr, f < 0)
    if (st.name === 'quack' && st.hop && st.t < 0.35) sy -= Math.sin(Math.PI * st.t / 0.35) * 10
    if (st.name === 'dance' && Math.floor(st.t / 0.3) % 4 === 3) sy -= 4
    if (st.name === 'spin' && st.t < 1) sy -= Math.abs(Math.sin(st.t * Math.PI * 3)) * 8
  }

  if (!img) {
    // cena ja desenhou tudo
  } else if (angle) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    ctx.restore()
  } else {
    ctx.drawImage(img, cx - img.width / 2, cy - img.height / 2)
  }

  if (st.name === 'watch') popcorn(cx - 16, cy - 20)
  if (st.name === 'quack' && st.t > 0.03 && st.t < 0.8) bubble('QUACK!')
  if (st.name === 'sleep' || st.name === 'dance') drawParts()
  if (st.name === 'idle' || st.name === 'land' || st.name === 'walk') drawParts()

  vctx.clearRect(0, 0, view.width, view.height)
  vctx.drawImage(buf, 0, 0, view.width, view.height)
  lastSprite = { sx, sy }
  return { x: Math.round(sx - cx * S), y: Math.round(sy - cy * S) }
}

// ---- cenas: ele monta umas coisas e fica um tempo ----

const BUILD = 1.1
const WOOD = '#9a6a3f', WOOD2 = '#6e4626'
// meia largura (em DIP) que cada cena ocupa
const ROOM = { work: 78, beach: 60, hammock: 74 }

function room(w) {
  const cur = supportAt(ax, ay, sup && sup.id)
  if (!cur || ax - w < cur.x1 || ax + w > cur.x2) return false
  return !world.solids.some(b => b.x < ax + w && b.x + b.w > ax - w && b.y < ay && b.y + b.h > ay - 90)
}

function puff(x, y) { parts.push({ kind: 'puff', t: 0, x: CX + x, y: GY + y }) }
function puffs() { puff(-14, -10); puff(0, -18); puff(14, -10) }

function scene(kind) {
  if (drag || AIR.has(st.name)) { lazy = false; return false }
  if (kind === 'ride' || kind === 'skate') return ride(kind === 'ride' ? 'horse' : 'skate')
  if (!room(ROOM[kind] || EXTRA[kind].room)) return false
  parts = []
  const dur = lazy ? rnd(60, 150) : EXTRA[kind] ? rnd(18, 35) : rnd(25, 50)
  lazy = false
  go('scene', { kind, dur, k: 0 })
  return true
}

function sceneUpdate(dt) {
  // monta as pecas uma por uma
  if (st.k < 3 && st.t > st.k * 0.35) { st.k++; puff(rnd(-24, 24), rnd(-20, -4)); knock() }
  if (!st.end && st.t > st.dur) { st.end = st.t; parts = []; puffs() }
  if (st.end && st.t - st.end > 0.35) return go('idle', { dur: 0.8 })
  const E = EXTRA[st.kind]
  if (E && E.update && st.t > BUILD && !st.end) E.update(dt, st.t - BUILD)
}

function cutRange(list, a, b) {
  const out = []
  for (const [x1, x2] of list) {
    if (b <= x1 || a >= x2) { out.push([x1, x2]); continue }
    if (a > x1) out.push([x1, a])
    if (b < x2) out.push([b, x2])
  }
  return out
}

// chama um cavalinho (ou pega o skate) e sai num trecho livre do chao
function ride(mount = 'horse') {
  const cur = supportAt(ax, ay, sup && sup.id)
  if (!cur || cur.kind !== 'floor' || cur.x2 - cur.x1 < 300) return false
  // nao comeca em cima de icone da barra
  if (world.solids.some(b => ax + 40 >= b.x && ax - 40 <= b.x + b.w && b.y < ay)) return false
  parts = []
  puff(0, -20); puff(-16, -12); puff(16, -12)
  go('ride', { a: cur.x1 + 50, b: cur.x2 - 50, id: cur.id, fy: cur.y, lv: 0, dur: rnd(12, 24), step: 0, mount })
  return true
}

// altura dos icones da barra embaixo do cavalo. icones em fileira viram uma plataforma so
function rideLevel(x) {
  let lv = 0
  for (const b of world.solids) if (x + 28 >= b.x - 10 && x - 28 <= b.x + b.w + 10 && b.y < st.fy) lv = Math.max(lv, st.fy - b.y)
  return lv
}

function rideUpdate(dt) {
  if (st.end) {
    if (st.t - st.end > 0.45) go('land')
    return
  }
  // so desce do cavalo no chao
  if (st.t > st.dur && st.lv === 0 && !st.hop) { st.end = st.t; puffs(); return }
  if (st.t < 0.6) return
  const skate = st.mount === 'skate'
  // ollie de vez em quando
  if (skate && st.ol != null && st.t - st.ol > 0.6) st.ol = null
  if (skate && st.ol == null && Math.random() < dt * 0.35) st.ol = st.t
  const nx = ax + face * (skate ? 150 : RIDE) * dt
  if (nx < st.a || nx > st.b) { face = -face; return }
  const cur = world.segs.find(s => s.id === st.id)
  if (!cur) return dropOff()
  ax = nx
  if (sup) sup.off = ax - cur.wl
  st.fy = cur.y
  // pula pra cima dos icones da barra e desce no fim deles
  const want = rideLevel(ax + face * 24)
  if (!st.hop && Math.abs(want - st.lv) > 2) st.hop = { t0: st.t, from: st.lv, to: want }
  let e = st.lv
  if (st.hop) {
    const k = clamp((st.t - st.hop.t0) / 0.45, 0, 1)
    e = st.hop.from + (st.hop.to - st.hop.from) * k + Math.sin(Math.PI * k) * 22
    if (k >= 1) { st.lv = e = st.hop.to; st.hop = null }
  }
  ay = st.fy - e
  const step = Math.floor(st.t * 10) % 4
  if (step !== st.step) { st.step = step; if (step % 2 === 0 && !skate) clop() }
}

const mirror = (x) => face < 0 ? 2 * CX - 1 - x : x

// pixels [x, y, cor] com contorno, espelhado quando ele ta virado pra esquerda
function pix(list, out = true) {
  if (out) {
    ctx.fillStyle = OUT
    for (const [x, y] of list) { const m = mirror(x); ctx.fillRect(m - 1, y, 3, 1); ctx.fillRect(m, y - 1, 1, 3) }
  }
  for (const [x, y, c] of list) { ctx.fillStyle = c; ctx.fillRect(mirror(x), y, 1, 1) }
}

function rect(x, y, w, h, c, out = []) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j, typeof c === 'function' ? c(i, j) : c])
  return out
}

const duckAt = (fr, up) => ctx.drawImage(Sprites.get(fr, face < 0), CX - 16, Math.round(CY - 20 - up))

function sceneDraw(fr) {
  const k = st.end ? 0 : st.k, built = st.t >= BUILD && !st.end
  const g = GY, x = CX
  let up = 0
  const E = EXTRA[st.kind]

  if (E) {
    const te = st.t - BUILD
    up = built && E.bob ? E.bob(te) : 0
    if (k > 0 && E.back) E.back(te, x, g, up)
    duckAt(fr, up)
    if (k > 0) E.front(te, x, g, up)
  } else if (st.kind === 'work') {
    const typing = built && Math.sin(st.t * 0.9) > -0.3
    if (built) up = 7 + (typing && Math.floor(st.t * 7) % 2 ? 1 : 0)
    // cadeira
    if (k > 0) pix([...rect(x - 12, g - 25, 2, 14, WOOD), ...rect(x - 12, g - 11, 15, 2, WOOD), ...rect(x - 11, g - 9, 2, 8, WOOD2), ...rect(x + 1, g - 9, 2, 8, WOOD2)])
    duckAt(fr, up)
    // mesa
    if (k > 1) pix([...rect(x + 12, g - 17, 24, 2, WOOD), ...rect(x + 13, g - 15, 2, 14, WOOD2), ...rect(x + 33, g - 15, 2, 14, WOOD2)])
    // notebook e cafe
    if (k > 2) {
      pix([...rect(x + 18, g - 28, 11, 9, '#3a3a42'), ...rect(x + 16, g - 19, 14, 2, '#9a9ba0'), ...rect(x + 31, g - 21, 3, 4, '#fafafa'), ...rect(x + 31, g - 21, 3, 1, '#6b3b1f')])
      pix(rect(x + 19, g - 27, 9, 7, '#1c2b4a'), false)
      const seed = typing ? Math.floor(st.t * 5) : 7
      const code = []
      for (let i = 0; i < 3; i++) {
        const ind = (seed + i) % 3, len = 2 + (seed * 7 + i * 13) % 5
        rect(x + 20 + ind, g - 26 + i * 2, Math.min(len, 7 - ind), 1, ['#7fd6ea', '#ffd23f', '#ff7eb6'][i], code)
      }
      pix(code, false)
    }
  } else if (st.kind === 'beach') {
    // guarda-sol
    if (k > 0) {
      const p = rect(x - 14, g - 45, 1, 44, '#eeeeee')
      ;[4, 8, 11, 13, 14, 15].forEach((h, j) => {
        for (let i = -h; i < h; i++) p.push([x - 14 + i, g - 51 + j, Math.floor((i + 16) / 5) % 2 ? '#e0383e' : '#fafafa'])
      })
      pix(p)
    }
    // toalha
    if (k > 1) pix(rect(x - 18, g - 2, 34, 2, (i) => Math.floor(i / 4) % 2 ? '#4fa9bf' : '#fafafa'))
    duckAt(fr, 0)
    // oculos escuros
    if (built) {
      const ty = CY - 20
      pix([...rect(x - 6, ty + 13, 8, 1, '#111115'), ...rect(x + 2, ty + 13, 7, 4, '#111115'), [x + 3, ty + 13, '#7fd6ea'], [x + 4, ty + 14, '#7fd6ea']], false)
    }
    // suquinho
    if (k > 2) pix([...rect(x + 17, g - 7, 4, 6, '#ffd23f'), ...rect(x + 17, g - 7, 4, 1, '#fff3c4'), ...rect(x + 19, g - 11, 1, 4, '#ff7eb6'), [x + 20, g - 11, '#ff7eb6']])
  } else {
    // rede entre dois postes, balancando
    const sw = built ? Math.round(Math.sin(st.t * 1.6) * 1.4) : 0
    if (k > 0) pix([...rect(x - 35, g - 30, 2, 30, WOOD), ...rect(x + 33, g - 30, 2, 30, WOOD)])
    const cloth = [], rope = []
    if (k > 1) {
      for (let i = -27; i <= 27; i++) {
        const y0 = g - 21 + Math.round(8 * (1 - (i / 27) ** 2))
        for (let j = 0; j < 3; j++) cloth.push([x + i + sw, y0 + j, Math.floor((i + 28) / 4) % 2 ? '#e8b04a' : '#d2563c'])
      }
      for (let i = 0; i <= 6; i++) { rope.push([x - 33 + i + Math.round(sw * i / 6), g - 28 + i, '#5e3b22']); rope.push([x + 33 - i + Math.round(sw * i / 6), g - 28 + i, '#5e3b22']) }
      pix(rope, false)
    }
    // sentado afundado no meio da rede
    if (built) ctx.drawImage(Sprites.get(fr, face < 0), CX - 16 + (face < 0 ? -sw : sw), CY - 20 - 6)
    else duckAt(fr, 0)
    if (k > 1) pix(cloth)
  }

  if (st.q != null && st.t - st.q < 0.8) bubble('QUACK!', up)
  drawParts(headX(), CY - 32)
}

function skateDraw(fr) {
  const t = st.t, x = CX, g = GY
  const o = st.ol != null ? clamp((t - st.ol - 0.1) / 0.5, 0, 1) : 0
  const lift = Math.round(Math.sin(Math.PI * o) * 12)
  let up = 6 + lift
  if (t < 0.6) { const k = clamp((t - 0.15) / 0.45, 0, 1); up = 6 * k + Math.sin(Math.PI * k) * 10 }
  if (st.end) { const k = clamp((t - st.end) / 0.4, 0, 1); up = 6 * (1 - k) + Math.sin(Math.PI * k) * 8 }
  if (t > 0.12 && !(st.end && t - st.end > 0.12)) {
    const y = g - 6 - lift
    pix([...rect(x - 13, y, 26, 2, '#e0383e'), [x - 14, y - 1, '#e0383e'], [x + 13, y - 1, '#e0383e'],
      ...rect(x - 10, y + 2, 2, 2, '#2c2c33'), ...rect(x + 8, y + 2, 2, 2, '#2c2c33')])
  }
  duckAt(fr, up)
  if (st.q != null && t - st.q < 0.8) bubble('QUACK!', up)
  drawParts()
}

function rideDraw(fr) {
  if (st.mount === 'skate') return skateDraw(fr)
  const t = st.t
  const step = t >= 0.6 && !st.end ? Math.floor(t * 10) % 4 : 1
  let up = 19 + (step === 2 ? 1 : 0)
  // pula no cavalo e depois desce
  if (t < 0.6) { const k = clamp((t - 0.15) / 0.45, 0, 1); up = 19 * k + Math.sin(Math.PI * k) * 12 }
  if (st.end) { const k = clamp((t - st.end) / 0.4, 0, 1); up = 19 * (1 - k) + Math.sin(Math.PI * k) * 10 }
  if (t > 0.12 && !(st.end && t - st.end > 0.12)) ctx.drawImage(Sprites.horse(step, face < 0), CX - 20, GY - 31)
  duckAt(fr, up)
  if (st.q != null && t - st.q < 0.8) bubble('QUACK!', up)
  drawParts()
}

// ---- mais cenas paradas: cada uma desenha as coisas dela antes/depois do pato ----

function disc(cx, cy, r, c, out = []) {
  const R = Math.ceil(r)
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r) out.push([cx + dx, cy + dy, typeof c === 'function' ? c(dx, dy) : c])
  return out
}

function seg(x0, y0, x1, y1, c, out = []) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) out.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c])
  return out
}

const standFr = (t, b) => b ? 'blink' : Math.floor(t * 2) % 2 ? 'idle1' : 'idle0'

// quadrinho que ele pinta, 12x11
const PAINTING = (() => {
  const out = []
  for (let y = 0; y < 11; y++) for (let x = 0; x < 12; x++) {
    let c = y < 7 ? '#8fd3ff' : '#5cb85c'
    if (y >= 6 + Math.round(Math.sin(x / 1.8) * 1.2)) c = y > 8 ? '#3e8e41' : '#5cb85c'
    if ((x - 8) ** 2 + (y - 2) ** 2 <= 3) c = '#ffd23f'
    out.push([x, y, c])
  }
  // ordem embaralhada fixa pra pintura ir aparecendo
  for (let i = out.length - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); [out[i], out[j]] = [out[j], out[i]] }
  return out
})()

const EXTRA = {
  guitar: {
    room: 50, pose: 'sit',
    frame: (t, b) => Math.sin(t * 1.3) > 0.75 ? 'sitopen' : b ? 'sitblink' : 'sit',
    bob: t => Math.floor(t * 4) % 2,
    update(dt) {
      st.nt = (st.nt || 0) - dt
      if (st.nt <= 0) { st.nt = rnd(0.45, 0.9); parts.push({ t: 0, x: rnd(-4, 10), kind: 'note' }); pluck() }
    },
    front(t, x, g, up) {
      const p = []
      seg(x + 9, g - 10 - up, x + 21, g - 19 - up, '#5e3b22', p)
      seg(x + 10, g - 10 - up, x + 22, g - 19 - up, '#5e3b22', p)
      rect(x + 21, g - 22 - up, 3, 3, '#3a2618', p)
      disc(x + 5, g - 7 - up, 4.6, (dx, dy) => dy > 2 ? '#9a5a25' : '#c47a35', p)
      disc(x + 6, g - 8 - up, 1.2, '#3a2618', p)
      pix(p)
    }
  },

  book: {
    room: 46, pose: 'sit',
    frame: (t, b) => b ? 'sitblink' : 'sit',
    front(t, x, g) {
      const p = rect(x + 12, g - 19, 13, 7, '#2f6fb0')
      rect(x + 13, g - 20, 5, 6, '#fafafa', p)
      rect(x + 19, g - 20, 5, 6, '#fafafa', p)
      for (let i = 0; i < 3; i++) { rect(x + 14, g - 19 + i * 2, 3, 1, '#b9b9c4', p); rect(x + 20, g - 19 + i * 2, 3, 1, '#b9b9c4', p) }
      pix(p)
      // vira a pagina de vez em quando
      const k = (t % 5) / 0.45
      if (t > 0 && k < 1) pix(rect(Math.round(x + 22 - k * 8), g - 21 + Math.round(Math.sin(Math.PI * k) * -2), 1, 6, '#ffffff'))
    }
  },

  paint: {
    room: 70, pose: 'stand',
    frame: standFr,
    back(t, x, g) {
      pix([...seg(x + 19, g - 1, x + 22, g - 31, WOOD2), ...seg(x + 31, g - 1, x + 27, g - 31, WOOD2), ...seg(x + 25, g - 1, x + 25, g - 14, WOOD2)])
    },
    front(t, x, g) {
      pix(rect(x + 18, g - 30, 12, 11, '#fafafa'))
      const n = t > 0 ? Math.min(PAINTING.length, Math.floor(t * 8)) : 0
      pix(PAINTING.slice(0, n).map(([px, py, c]) => [x + 18 + px, g - 30 + py, c]), false)
      // paleta no chao
      pix([...rect(x - 16, g - 2, 7, 2, '#d9b38c'), [x - 15, g - 3, '#e0383e'], [x - 13, g - 3, '#ffd23f'], [x - 11, g - 3, '#4fa9bf']])
    }
  },

  fishing: {
    room: 80, pose: 'sit',
    frame(t, b) {
      if (st.catchT != null && t - st.catchT < 1.3) return 'sitopen'
      return b ? 'sitblink' : 'sit'
    },
    update(dt, t) {
      if (st.bite == null) st.bite = t + rnd(4, 9)
      if (st.catchT == null && t > st.bite + 1.2) { st.catchT = t; quackSound(1.2) }
      if (st.catchT != null && t - st.catchT > 1.6) { st.catchT = null; st.bite = t + rnd(5, 11) }
    },
    front(t, x, g) {
      const p = rect(x + 15, g - 2, 22, 2, (i, j) => j ? '#4fa9bf' : '#7fd6ea')
      rect(x + 17, g - 3, 18, 1, '#7fd6ea', p)
      pix(p)
      pix(seg(x + 6, g - 12, x + 26, g - 31, '#3a2618'))
      const biting = st.bite != null && t > st.bite && st.catchT == null
      const by = g - 5 + (biting ? Math.floor(t * 10) % 2 * 2 : Math.round(Math.sin(t * 2) * 0.6))
      if (st.catchT == null) {
        pix(seg(x + 26, g - 30, x + 26, by - 1, '#d8d8d8'), false)
        pix(rect(x + 26, by, 2, 2, '#e0383e'))
      } else {
        // peixe pulando pra fora e voltando pra agua
        const k = clamp((t - st.catchT) / 1.3, 0, 1)
        const fx = Math.round(x + 26 - k * 4), fy = Math.round(g - 4 - Math.sin(Math.PI * k) * 24)
        pix(seg(x + 26, g - 30, fx + 2, fy - 1, '#d8d8d8'), false)
        const flap = Math.floor(t * 12) % 2
        pix([...rect(fx, fy, 5, 3, '#ff8c42'), [fx - 1, fy + flap, '#e2551a'], [fx - 1, fy + 2 - flap, '#e2551a'], [fx + 4, fy + 1, '#1e1a24']])
        if (k < 0.8) bubble('!', 0)
      }
    }
  },

  bubbles: {
    room: 40, pose: 'stand',
    frame: (t, b) => Math.sin(t * 1.7) > 0 ? 'quack' : standFr(t, b),
    update(dt, t) {
      st.nt = (st.nt || 0) - dt
      if (Math.sin(t * 1.7) > 0 && st.nt <= 0) {
        st.nt = rnd(0.25, 0.5)
        parts.push({ t: 0, kind: 'bub', x: mirror(CX + 15), y: CY - 7, vx: face * rnd(4, 14), r: rnd(1.5, 3) })
      }
    },
    front() {}
  },

  plant: {
    room: 52, pose: 'stand',
    frame: standFr,
    front(t, x, g) {
      const h = clamp(Math.floor(t * 0.9), 0, 14)
      const p = []
      if (h > 0) rect(x + 20, g - 7 - h, 1, h, '#4caf50', p)
      if (h > 4) p.push([x + 19, g - 11, '#6fcf6f'], [x + 18, g - 12, '#6fcf6f'])
      if (h > 8) p.push([x + 21, g - 15, '#6fcf6f'], [x + 22, g - 16, '#6fcf6f'])
      if (h >= 14) disc(x + 20, g - 22, 2.2, (dx, dy) => dx || dy ? '#ff7eb6' : '#ffd23f', p)
      rect(x + 17, g - 6, 7, 6, '#c8643c', p)
      rect(x + 16, g - 7, 9, 2, '#e07a4f', p)
      pix(p)
      // regador no bico enquanto a planta cresce
      if (h < 14) {
        pix([...rect(x + 12, g - 27, 5, 4, '#7fb3d5'), ...seg(x + 17, g - 26, x + 20, g - 29, '#5f93b5')])
        for (let i = 0; i < 3; i++) {
          const d = (t * 24 + i * 6) % (16 - h + 6)
          pix([[x + 20, Math.round(g - 28 + d), '#8fd3ff']], false)
        }
      }
    }
  },

  gym: {
    room: 44, pose: 'stand',
    // agachamento com a barra apoiada na cabeca
    frame: t => (t % 1.4) < 0.7 ? 'land' : 'quack',
    front(t, x, g) {
      const down = (t % 1.4) < 0.7
      const by = down ? g - 37 : g - 39
      pix([...rect(x - 12, by - 3, 3, 7, '#2c2c33'), ...rect(x + 22, by - 3, 3, 7, '#2c2c33'), ...rect(x - 9, by, 31, 1, '#9a9ba0')])
      if (!down && Math.floor(t / 1.4) % 3 === 2) pix([[x - 3, g - 33, '#8fd3ff'], [x - 4, g - 31, '#8fd3ff']], false)
    }
  },

  icecream: {
    room: 44, pose: 'sit',
    frame: (t, b) => (t % 1.8) < 0.3 ? 'sitopen' : b ? 'sitblink' : 'sit',
    front(t, x, g) {
      const left = clamp(1 - t / Math.max(1, st.dur - BUILD - 1), 0, 1)
      const p = []
      if (left > 0.15) disc(x + 17, g - 21, 1 + left * 2.2, (dx, dy) => dy < -1 ? '#ffc4de' : '#ff9ecb', p)
      if (left > 0.8) p.push([x + 17, g - 25, '#e0383e'])
      for (let i = 0; i < 6; i++) rect(x + 15 + Math.floor(i / 2), g - 19 + i, Math.max(1, 5 - i), 1, i % 2 ? '#c98b45' : '#d9a05b', p)
      pix(p)
    }
  }
}

function bubDraw(p) {
  const x = Math.round(p.x + p.vx * p.t + Math.sin(p.t * 3) * 1.5), y = Math.round(p.y - p.t * 9)
  const r = p.r
  ctx.fillStyle = '#bfe9ff'
  const R = Math.ceil(r)
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = dx * dx + dy * dy
    if (d <= r * r && d > (r - 1) * (r - 1)) ctx.fillRect(x + dx, y + dy, 1, 1)
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - 1, y - 1, 1, 1)
}

// tudo que ele sabe fazer (bandeja e sorteio)
const KINDS = ['work', 'beach', 'hammock', 'ride', 'skate', ...Object.keys(EXTRA)]

// pediu pela bandeja e nao cabe aqui: vai pro lugar livre mais perto (andando ou de portal)
function sceneSpot(kind) {
  const w = kind === 'ride' || kind === 'skate' ? 60 : (ROOM[kind] || EXTRA[kind].room)
  const fl = freeFloors().length ? freeFloors() : floors()
  let best = null
  for (const f of fl) {
    if ((kind === 'ride' || kind === 'skate') && f.x2 - f.x1 < 300) continue
    for (let x = f.x1 + w + 10; x <= f.x2 - w - 10; x += 20) {
      if (world.solids.some(b => b.x < x + w + 10 && b.x + b.w > x - w - 10 && b.y < f.y && b.y + b.h > f.y - 90)) continue
      const d = Math.abs(x - ax) + Math.abs(f.y - ay) * 3
      if (!best || d < best.d) best = { id: f.id, x, y: f.y, d }
    }
  }
  return best
}

function goDo(kind) {
  const s = sceneSpot(kind)
  if (!s) return quack(true)
  goTo(s, kind) || quack(true)
}

// anda ate o lugar (ou vai de portal se for longe) e faz a cena
function goTo(s, kind) {
  const cur = supportAt(ax, ay, sup && sup.id)
  if (cur && Math.abs(s.x - ax) < 30 && Math.abs(cur.y - s.y) < 2) return scene(kind)
  const clear = !world.solids.some(b => b.x < Math.max(ax, s.x) && b.x + b.w > Math.min(ax, s.x) && b.y < s.y)
  if (cur && cur.kind === 'floor' && Math.abs(cur.y - s.y) < 2 && Math.abs(s.x - ax) < 700 && clear) { walkTo(s.x, { kind: 'scene', what: kind }); return true }
  return portal(s, kind)
}

// coisas paradas pra ficar no canto
const CHILL = ['work', 'work', 'work', 'hammock', 'hammock', 'hammock', 'book', 'beach', 'guitar', 'paint', 'fishing', 'plant']
let lazy = false

// lugar livre perto de um dos cantos de cada chao
function cornerSpot(w) {
  const fl = freeFloors().length ? freeFloors() : floors()
  const out = []
  for (const f of fl) {
    for (const side of [1, -1]) {
      for (let i = 0; i < 12; i++) {
        const x = side > 0 ? f.x1 + w + 10 + i * 20 : f.x2 - w - 10 - i * 20
        if (x - w < f.x1 || x + w > f.x2) break
        if (world.solids.some(b => b.x < x + w + 10 && b.x + b.w > x - w - 10 && b.y < f.y && b.y + b.h > f.y - 90)) continue
        out.push({ id: f.id, x, y: f.y, d: Math.abs(x - ax) + Math.abs(f.y - ay) * 3 })
        break
      }
    }
  }
  out.sort((a, b) => a.d - b.d)
  return out.length ? out[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * out.length)] : null
}

function chill() {
  const kind = pick(CHILL)
  const s = cornerSpot(ROOM[kind] || EXTRA[kind].room)
  lazy = true
  if (s && goTo(s, kind)) return
  lazy = false
  wander()
}

// ---- portal: abre um portal verde na frente, entra e sai em outro lugar ----

function portalTarget() {
  const opts = []
  for (const s of world.segs) {
    if (s.kind === 'tb' || s.x2 - s.x1 < 60) continue
    for (let i = 0; i < 3; i++) {
      const x = rnd(s.x1 + 24, s.x2 - 24)
      if (Math.abs(x - ax) < 300 && Math.abs(s.y - ay) < 100) continue
      if (isBusy(x)) continue
      if (world.solids.some(b => x >= b.x - HALF - 30 && x <= b.x + b.w + HALF + 30 && b.y < s.y && b.y + b.h > s.y - 60)) continue
      opts.push({ id: s.id, x, y: s.y, w: s.kind === 'floor' ? 1 : 2 })
    }
  }
  if (!opts.length) return null
  return pick(opts.flatMap(o => Array(o.w).fill(o)))
}

function portal(to, then) {
  if (drag || AIR.has(st.name)) return false
  const tg = to || portalTarget()
  if (!tg) return false
  parts = []
  go('portal', { tg, then })
  return true
}

function portalUpdate() {
  if (st.name === 'portal' && st.t > 1.35) {
    const s = world.segs.find(s => s.id === st.tg.id && st.tg.x >= s.x1 && st.tg.x <= s.x2)
    if (!s) return go('idle', { dur: 0.5 })
    ax = st.tg.x
    ay = s.y
    stand(s)
    face = Math.random() < 0.5 ? 1 : -1
    go('portalout', { then: st.then })
  } else if (st.name === 'portalout' && st.t > 1.25) {
    // saiu do portal pra fazer alguma coisa
    const then = st.then
    if (then) { go('idle', { dur: 0.1 }); if (!scene(then)) go('land') } else go('land')
  }
}

// abertura do portal (0..1) e o quanto do pato aparece (0..1)
function portalPhase() {
  const t = st.t
  if (st.name === 'portal') return { open: clamp(Math.min(t / 0.5, (1.35 - t) / 0.35), 0, 1), duck: 1 - clamp((t - 0.5) / 0.5, 0, 1) }
  return { open: clamp(Math.min(t / 0.4, (1.25 - t) / 0.35), 0, 1), duck: clamp((t - 0.4) / 0.5, 0, 1) }
}

function portalDraw(fr) {
  const { open, duck } = portalPhase()
  const px = CX + 17, py = GY - 15
  if (open > 0) {
    const rx = 6.5 * open, ry = 14 * open, p = []
    const R = Math.ceil(ry) + 1
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const q = (dx / rx) ** 2 + (dy / ry) ** 2
      if (q > 1) continue
      // espiral girando
      const a = Math.atan2(dy / ry, dx / rx), r = Math.sqrt(q)
      const band = Math.floor(a * 3 / Math.PI + r * 5 - st.t * 9)
      const col = r > 0.82 ? '#c6ff6a' : ['#7ee04a', '#3fb83a', '#2a8f2e'][((band % 3) + 3) % 3]
      p.push([px + dx, py + dy, col])
    }
    pix(p)
  }
  if (duck > 0) {
    const img = Sprites.get(fr, face < 0)
    const k = duck
    // encolhe indo pro centro do portal
    const cx = CX + (mirror(px) - CX) * (1 - k), cy = CY + (py - CY) * (1 - k)
    ctx.drawImage(img, Math.round(cx - 16 * k), Math.round(cy - 20 * k), Math.max(1, Math.round(32 * k)), Math.max(1, Math.round(40 * k)))
  }
}

// ---- herois: veste a fantasia e faz o poder de cada um ----

const ease = (k) => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
// valor que vai de a pra b entre t0 e t1
const tween = (t, t0, t1, a, b) => a + (b - a) * ease(clamp((t - t0) / (t1 - t0), 0, 1))
const once = (k) => { st.fired = st.fired || {}; return st.fired[k] ? false : (st.fired[k] = true) }

// pato com a fantasia. dx eh como se ele tivesse virado pra direita, k = escala
function heroDuck(fr, up = 0, dx = 0, k = 1) {
  const img = Sprites.get(fr, face < 0, false, HEROES[st.kind].skin)
  const w = Math.round(32 * k), h = Math.round(40 * k)
  ctx.drawImage(img, Math.round(CX + (face < 0 ? -dx : dx) - w / 2), Math.round(GY - 39 * k - up), w, h)
}

// coisas desenhadas por cima do sprite, em coordenada do sprite (32x40)
const spr = (list, up = 0, dx = 0) => list.map(([x, y, c]) => [CX - 16 + x + dx, GY - 39 - up + y, c])

function band(fr, up = 0, dx = 0) {
  const hy = Sprites.headY(fr), p = []
  rect(6, hy + 2, 22, 2, '#2a3f8f', p)
  rect(19, hy + 1, 6, 4, '#c0c4cc', p)
  p.push([21, hy + 2, '#5a5f6a'], [22, hy + 3, '#5a5f6a'])
  const w = Math.floor(st.t * 8) % 2
  p.push([4, hy + 3, '#2a3f8f'], [3, hy + 3 + w, '#2a3f8f'], [2, hy + 4 + w, '#2a3f8f'], [4, hy + 4, '#2a3f8f'])
  pix(spr(p, up, dx))
}

function ears(fr, up = 0) {
  const hy = Sprites.headY(fr)
  pix(spr([[12, hy - 1, '#26262d'], [12, hy - 2, '#26262d'], [13, hy - 1, '#26262d'], [18, hy - 1, '#26262d'], [18, hy - 2, '#26262d'], [17, hy - 1, '#26262d']], up))
}

function web(fr, up = 0) {
  const hy = Sprites.headY(fr), p = []
  for (let x = 7; x <= 26; x += 2) { p.push([x, hy + 3, '#5a0f12']); p.push([x, hy + 7, '#3a0a0c']) }
  for (let y = hy; y <= hy + 10; y += 2) p.push([12, y, '#5a0f12'])
  pix(spr(p, up), false)
}

// capa atras do corpo, balancando
function cape(fr, up, col, dark, wave = 1) {
  const hy = Sprites.headY(fr), p = []
  for (let y = hy + 13; y <= 37; y++) {
    const i = y - hy - 13
    const l = 10 - Math.round(i * 0.45 + Math.sin(st.t * 6 + y * 0.4) * wave)
    for (let x = l; x <= 13; x++) p.push([x, y, x === l ? dark : col])
  }
  pix(spr(p, up))
}

// capa esticada pra tras quando ta voando
function capeFly(fr, up, col, dark) {
  const hy = Sprites.headY(fr), p = []
  for (let x = -6; x <= 10; x++) {
    const w = Math.round(Math.sin(st.t * 14 + x * 0.6) * 1.5 * (10 - x) / 16)
    for (let y = hy + 13; y <= hy + 17; y++) p.push([x, y + w, y === hy + 17 ? dark : col])
  }
  pix(spr(p, up))
}

function bolt(x0, y0, x1, y1, seed) {
  const p = [], n = Math.max(2, Math.round(Math.abs(y1 - y0) / 4))
  let px = x0, py = y0
  for (let i = 1; i <= n; i++) {
    const nx = i === n ? x1 : x0 + (x1 - x0) * i / n + Math.round(Math.sin(seed * 13.7 + i * 3.1) * 3)
    const ny = y0 + (y1 - y0) * i / n
    seg(Math.round(px), Math.round(py), Math.round(nx), Math.round(ny), '#fff7b0', p)
    seg(Math.round(px) + 1, Math.round(py), Math.round(nx) + 1, Math.round(ny), '#ffe14d', p)
    px = nx; py = ny
  }
  pix(p, false)
}

const HEROES = {
  // clones das sombras e rasengan
  naruto: {
    skin: 'naruto', dur: 5,
    frame: (t, b) => t < 0.5 || (t > 3 && t < 4.4) ? 'quack' : standFr(t, b),
    update(dt, t) {
      if (t > 0.5 && once('c1')) { puff(-22, -16); puff(22, -16) }
      if (t > 3 && once('c2')) { puff(-22, -16); puff(22, -16) }
    },
    draw(fr, t) {
      if (t > 0.6 && t < 3) for (const dx of [-22, 22]) { const f = standFr(t + dx / 40, false); heroDuck(f, 0, dx); band(f, 0, dx) }
      heroDuck(fr)
      band(fr)
      if (t > 3 && t < 4.4) {
        const r = Math.min(4.5, (t - 3) * 8)
        pix(disc(CX + 17, GY - 24, r, (dx, dy) => {
          const q = Math.hypot(dx, dy) / r
          if (q > 0.8) return '#3f8fd0'
          return Math.floor(Math.atan2(dy, dx) * 2 + q * 4 - t * 14) % 2 ? '#7fd6ea' : '#e8fbff'
        }))
      }
    }
  },

  // corre a jato pela tela toda e volta
  flash: {
    skin: 'flash', dur: 3,
    frame: (t, b) => st.run ? 'walk' + (Math.floor(t * 30) % 4) : t < 0.4 ? 'land' : standFr(t, b),
    start() {
      const cur = supportAt(ax, ay, sup && sup.id)
      if (!cur) return
      const a = cur.x1 + 30, b = cur.x2 - 30
      st.legs = [face > 0 ? b : a, face > 0 ? a : b, ax]
      st.id = cur.id
      st.dur = 0.4 + (Math.abs(st.legs[0] - ax) + (b - a) + Math.abs(st.legs[2] - st.legs[1])) / 1100 + 0.8
    },
    update(dt, t) {
      st.run = false
      if (t < 0.4 || !st.legs || !st.legs.length) return
      const tx = st.legs[0], step = 1100 * dt
      if (Math.abs(tx - ax) > 1) face = tx > ax ? 1 : -1
      if (Math.abs(tx - ax) <= step) { ax = tx; st.legs.shift() } else { ax += face * step; st.run = true }
      const cur = world.segs.find(s => s.id === st.id)
      if (cur && sup) sup.off = ax - cur.wl
    },
    draw(fr, t) {
      if (st.run) {
        for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.55 - i * 0.14; heroDuck(fr, 0, -i * 7) }
        ctx.globalAlpha = 1
        bolt(CX - 8, GY - 16, CX - 38, GY - 14, Math.floor(t * 20))
        bolt(CX - 6, GY - 26, CX - 30, GY - 24, Math.floor(t * 20) + 5)
      }
      heroDuck(fr)
      if (!st.run && Math.floor(t * 10) % 3 === 0) pix([[CX - 10 + Math.floor(Math.random() * 20), GY - 3 - Math.floor(Math.random() * 6), '#ffe14d']], false)
    }
  },

  // armadura, voa com propulsor e dispara o raio
  ironman: {
    skin: 'ironman', dur: 5.2,
    frame: (t, b) => t > 2.2 && t < 2.8 ? 'quack' : b ? 'blink' : 'idle0',
    update(dt, t) {
      st.fly = t < 1.6 ? tween(t, 0.6, 1.6, 0, 140) : t < 3.4 ? 140 + Math.sin(t * 3) * 4 : tween(t, 3.4, 4.4, 140, 0)
      st.lift = Math.min(14, st.fly / 2)
    },
    draw(fr, t) {
      const up = st.lift
      if (t > 0.6 && t < 4.5) {
        const p = []
        for (const fx of [-6, 1]) {
          const len = 3 + Math.floor(Math.random() * 4) + Math.round(up / 3)
          for (let i = 0; i < len; i++) p.push([CX + fx, GY - 1 - up + 1 + i, i < 2 ? '#ffffff' : i < 4 ? '#ffe14d' : '#ff8c42'], [CX + fx + 1, GY - 1 - up + 1 + i, i < 3 ? '#fff7b0' : '#ff8c42'])
        }
        pix(p, false)
      }
      heroDuck(fr, up)
      const hy = Sprites.headY(fr)
      pix(spr([[14, hy + 21, '#bff6ff'], [15, hy + 21, '#bff6ff'], [14, hy + 22, '#7fd6ea'], [15, hy + 22, '#7fd6ea']], up), false)
      if (t > 2.2 && t < 2.8) {
        const y = GY - 39 - up + hy + 10
        pix([...disc(CX + 14, y, 2.5, '#e8fbff'), ...rect(CX + 14, y - 1, 26, 3, (i, j) => j === 1 ? '#ffffff' : '#7fd6ea')])
      }
    }
  },

  // sobe na teia e fica pendurado de cabeca pra baixo
  spiderman: {
    skin: 'spiderman', dur: 4.8,
    frame: (t, b) => t > 0.4 && t < 4 ? 'dangle' : standFr(t, b),
    update(dt, t) {
      st.fly = t < 1.4 ? tween(t, 0.4, 1.4, 0, 120) : t < 3.8 ? 120 : tween(t, 3.8, 4.15, 120, 0)
      st.lift = Math.min(16, st.fly / 2)
    },
    draw(fr, t) {
      const up = st.lift
      const hang = t > 1.4 && t < 3.8
      const cy = GY - 20 - up
      if (t < 0.4 || hang) {
        // fio da teia
        const ty = hang ? cy - 19 : GY - 39 - up + Sprites.headY(fr)
        pix(seg(CX + (hang ? 0 : 6), 0, CX + (hang ? 0 : 6), Math.round(ty * Math.min(1, hang ? 1 : t / 0.4)), '#f4f4f4'), false)
      } else if (t < 1.4) {
        pix(seg(CX + 6, 0, CX + 6, GY - 39 - up + Sprites.headY(fr), '#f4f4f4'), false)
      }
      if (hang) {
        // de cabeca pra baixo, pendurado pelo pe
        ctx.save()
        ctx.translate(CX, cy - 19)
        ctx.rotate(Math.PI + Math.sin(t * 2.5) * 0.25)
        ctx.translate(-CX, -(cy + 19))
      }
      heroDuck(fr, up)
      web(fr, up)
      if (hang) ctx.restore()
    }
  },

  // capa, joga o batarangue e some na fumaca
  batman: {
    skin: 'batman', dur: 4.6,
    frame: (t, b) => t > 2 && t < 2.3 ? 'quack' : standFr(t, b),
    update(dt, t) {
      if (t > 3.4 && once('smoke')) { for (let i = 0; i < 6; i++) puff(rnd(-16, 16), rnd(-30, -4)) }
    },
    draw(fr, t) {
      if (t > 3.6) return
      cape(fr, 0, '#1e1e24', '#2c2c36', 1.5)
      heroDuck(fr)
      ears(fr)
      if (t > 2 && t < 3) {
        const k = t - 2
        const x = CX + 14 + Math.round(Math.sin(Math.PI * k) * 26), y = GY - 22 - Math.round(Math.sin(2 * Math.PI * k) * 4)
        const flipY = Math.floor(t * 12) % 2 ? 1 : -1
        pix([...rect(x - 2, y, 5, 1, '#26262d'), [x - 3, y - flipY, '#26262d'], [x + 3, y - flipY, '#26262d'], [x, y - flipY, '#6b707a']])
      }
    }
  },

  // voa com a capa esvoacando
  superman: {
    skin: 'superman', dur: 5.4,
    frame: (t, b) => t < 0.5 ? 'land' : b ? 'blink' : 'idle0',
    start() { const cur = supportAt(ax, ay, sup && sup.id); if (cur) { st.a = cur.x1 + 40; st.b = cur.x2 - 40; st.id = cur.id } },
    update(dt, t) {
      st.fly = t < 1.3 ? tween(t, 0.5, 1.3, 0, 150) : t < 4 ? 150 + Math.sin(t * 2) * 6 : tween(t, 4, 4.8, 150, 0)
      st.lift = Math.min(16, st.fly / 2)
      if (t > 1.3 && t < 4 && st.id) {
        const nx = ax + face * 280 * dt
        if (nx < st.a || nx > st.b) face = -face; else ax = nx
        const cur = world.segs.find(s => s.id === st.id)
        if (cur && sup) sup.off = ax - cur.wl
      }
    },
    draw(fr, t) {
      const up = st.lift
      if (t > 1.1 && t < 4.2) capeFly(fr, up, '#d42a2a', '#9e1f1f')
      else cape(fr, up, '#d42a2a', '#9e1f1f', 1)
      heroDuck(fr, up)
    }
  },

  // fica verde e grandao, pula e esmaga o chao
  hulk: {
    skin: 'hulk', dur: 5,
    frame(t, b) {
      if (t < 0.8) return 'quack'
      if (t < 2.2) return 'walk' + (Math.floor(t * 5) % 4)
      if (t < 2.7) return 'fall'
      if (t < 3) return 'land'
      if (t < 4) return 'quack'
      return standFr(t, b)
    },
    update(dt, t) {
      st.k = t < 0.8 ? tween(t, 0.2, 0.8, 1, 1.6) : t < 4 ? 1.6 : tween(t, 4, 4.6, 1.6, 1)
      st.fly = t > 2.2 && t < 2.7 ? Math.sin(Math.PI * (t - 2.2) / 0.5) * 70 : 0
      if ((t > 0.2 && t < 0.8) || (t > 2.7 && t < 3.1)) st.shake = Math.round(rnd(-3, 3))
      if (t > 2.7 && once('smash')) { puff(-20, -4); puff(20, -4); puff(-32, -2); puff(32, -2); puff(0, -6) }
    },
    draw(fr, t) {
      const k = st.k || 1
      // so vira hulk depois que comeca a crescer
      const skin = HEROES.hulk.skin
      if (t < 0.25 || t > 4.5) HEROES.hulk.skin = null
      heroDuck(fr, 0, 0, k)
      HEROES.hulk.skin = skin
      if (t > 2.7 && t < 4.2) {
        const p = []
        for (const s of [-1, 1]) {
          let y = GY - 1
          for (let i = 8; i < 36; i++) { if (i % 5 === 0) y += Math.random() < 0.5 ? -1 : 1; p.push([CX + s * i, clamp(y, GY - 3, GY), '#2c2c33']) }
        }
        pix(p, false)
      }
    }
  },

  // levanta o martelo e chama os raios
  thor: {
    skin: 'thor', dur: 4.6,
    frame: (t, b) => t > 1 && t < 3 ? 'quack' : standFr(t, b),
    update(dt, t) {
      if (t > 3.2 && once('slam')) { puff(-14, -4); puff(14, -4); puff(22, -2) }
      if (t > 3.2 && t < 3.5) st.shake = Math.round(rnd(-2, 2))
    },
    draw(fr, t) {
      cape(fr, 0, '#d42a2a', '#9e1f1f', 1.2)
      heroDuck(fr)
      // martelo: na frente, sobe, fica la em cima e desce no chao
      const top = GY - 39 + Sprites.headY(fr) - 9
      const hy = t < 0.8 ? GY - 16 : t < 1 ? tween(t, 0.8, 1, GY - 16, top) : t < 3 ? top : tween(t, 3, 3.2, top, GY - 6)
      const hx = t < 0.8 || t > 3 ? CX + 13 : Math.round(tween(t, 0.8, 1, CX + 13, CX + 2))
      if (t > 1 && t < 3 && (t * 4) % 1 < 0.5) {
        bolt(hx + 3 + Math.round(Math.sin(t * 7) * 6), 0, hx + 3, Math.round(hy), Math.floor(t * 4))
        pix(disc(hx + 3, Math.round(hy) + 2, 4, '#fff7b0'), false)
      }
      pix([...rect(hx + 3, Math.round(hy) + 5, 1, 5, '#6e4626'), ...rect(hx, Math.round(hy), 7, 5, (i, j) => j > 3 ? '#6b707a' : '#9aa0aa')])
    }
  },

  // joga o escudo e pega de volta
  cap: {
    skin: 'cap', dur: 4.4,
    frame: (t, b) => (t > 1 && t < 1.25) || (t > 2.4 && t < 2.7) ? 'quack' : standFr(t, b),
    draw(fr, t) {
      heroDuck(fr)
      const k = clamp((t - 1) / 1.4, 0, 1)
      const cx = CX + 15 + Math.round(Math.sin(Math.PI * k) * 22), cy = GY - 15 - Math.round(Math.sin(Math.PI * k) * 4)
      const rx = k > 0 && k < 1 ? Math.max(1, Math.abs(Math.cos(t * 18)) * 5.5) : 5.5, ry = 5.5
      const p = []
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const q = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
        if (q > 1) continue
        let c = q > 0.78 ? '#d42a2a' : q > 0.58 ? '#fafafa' : q > 0.38 ? '#d42a2a' : '#2457c5'
        if (rx > 3 && ((dx === 0 && Math.abs(dy) <= 1) || (dy === 0 && Math.abs(dx) <= 1))) c = '#fafafa'
        p.push([cx + dx, cy + dy, c])
      }
      pix(p)
    }
  }
}

const HERO_KINDS = Object.keys(HEROES)

function hero(kind) {
  if (drag || AIR.has(st.name) || !HEROES[kind]) return false
  parts = []
  puffs()
  go('hero', { kind, dur: HEROES[kind].dur, fly: 0, lift: 0, shake: 0 })
  if (HEROES[kind].start) HEROES[kind].start()
  return true
}

function heroUpdate(dt) {
  const H = HEROES[st.kind]
  st.shake = 0
  if (H.update) H.update(dt, st.t)
  if (st.t > st.dur) { puffs(); go('land') }
}

// fumacinha quando monta/desmonta as coisas
function puffDraw(p) {
  const r = 1.5 + p.t * 9, cx = Math.round(p.x), cy = Math.round(p.y - p.t * 6)
  for (const [col, rr] of [[OUT, r + 1], ['#f4f1ea', r]]) {
    ctx.fillStyle = col
    const R = Math.ceil(rr)
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= rr * rr) ctx.fillRect(cx + dx, cy + dy, 1, 1)
  }
}

// ---- som ----

let actx
// ele nao faz som nenhum, so deixa SOUND = true se quiser de volta
const SOUND = false
function blip(t0, f0, f1, len, vol, type = 'sawtooth') {
  if (!SOUND) return
  const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter()
  o.type = type
  f.type = 'bandpass'
  f.frequency.value = 1300
  f.Q.value = 2.5
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(f1, t0 + len * 0.8)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len)
  o.connect(f).connect(g).connect(actx.destination)
  o.start(t0)
  o.stop(t0 + len + 0.02)
}

function quackSound(pitch = 1) {
  try {
    if (!SOUND) return
    actx = actx || new AudioContext()
    const t0 = actx.currentTime
    blip(t0, 560 * pitch, 300 * pitch, 0.12, 0.3)
    blip(t0 + 0.12, 480 * pitch, 220 * pitch, 0.12, 0.3)
  } catch (_) {}
}

// musiquinha da danca
function tune() {
  try {
    if (!SOUND) return
    actx = actx || new AudioContext()
    const t0 = actx.currentTime
    const notes = [523, 659, 784, 659, 587, 698, 880, 698]
    notes.forEach((n, i) => blip(t0 + i * 0.3, n, n * 0.98, 0.18, 0.12, 'square'))
  } catch (_) {}
}

// martelada montando as coisas
function knock() {
  try {
    if (!SOUND) return
    actx = actx || new AudioContext()
    blip(actx.currentTime, 260, 180, 0.06, 0.12, 'square')
  } catch (_) {}
}

// dedilhado do violao
function pluck() {
  try {
    if (!SOUND) return
    actx = actx || new AudioContext()
    const f = pick([660, 784, 880, 988, 1175])
    blip(actx.currentTime, f, f * 0.99, 0.3, 0.05, 'triangle')
  } catch (_) {}
}

// pocoto
function clop() {
  try {
    if (!SOUND) return
    actx = actx || new AudioContext()
    blip(actx.currentTime, 700, 500, 0.04, 0.05, 'square')
  } catch (_) {}
}

// ---- mouse ----

let through = true
function setThrough(v) { if (v !== through) { through = v; pet.through(v) } }
function opaqueAt(cx, cy) {
  const x = Math.floor(cx / S), y = Math.floor(cy / S)
  if (x < 0 || y < 0 || x >= LW || y >= LH) return false
  return ctx.getImageData(x, y, 1, 1).data[3] > 10
}

window.addEventListener('mousemove', e => { if (!drag) setThrough(!opaqueAt(e.clientX, e.clientY)) })
window.addEventListener('mouseleave', () => { if (!drag) setThrough(true) })

view.addEventListener('mousedown', e => {
  if (e.button !== 0 || !opaqueAt(e.clientX, e.clientY)) return
  lastTouch = performance.now()
  // pega o pato onde ele ta desenhado, mesmo escalando
  ax = lastSprite.sx
  ay = lastSprite.sy + 19 * S
  const cx = lastWin.x + e.clientX, cy = lastWin.y + e.clientY
  drag = { ox: cx - ax, oy: cy - ay, sx: cx, sy: cy, moved: false, vx: 0, vy: 0, last: null, busy: false, prev: st }
})

window.addEventListener('mouseup', () => {
  if (!drag) return
  const d = drag
  drag = null
  if (!d.moved) return click()
  vel.x = clamp(d.vx, -1600, 1600)
  vel.y = clamp(d.vy, -1400, 800)
  sup = null
  go('fall')
})

view.addEventListener('dblclick', () => { if (st.name !== 'sleep' && !AIR.has(st.name)) flip() })

function click() {
  if (st.name === 'sleep') return wake()
  if (AIR.has(st.name)) return
  // nas cenas ele so faz quack sem largar o que ta fazendo
  if (st.name === 'scene' || st.name === 'ride') { st.q = st.t; return quackSound() }
  if (st.name === 'portal' || st.name === 'portalout' || st.name === 'hero') return
  quack(true)
}

function pollDrag() {
  const d = drag
  if (!d || d.busy) return
  d.busy = true
  pet.cursor().then(p => {
    d.busy = false
    if (drag !== d) return
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 4) {
      d.moved = true
      parts = []
      sup = null
      go('drag')
    }
    if (!d.moved) return
    const now = performance.now()
    if (d.last) {
      const ms = Math.max(1, now - d.last.t)
      d.vx = d.vx * 0.5 + (p.x - d.last.x) / ms * 500
      d.vy = d.vy * 0.5 + (p.y - d.last.y) / ms * 500
    }
    d.last = { x: p.x, y: p.y, t: now }
    ax = p.x - d.ox
    ay = p.y - d.oy
  })
}

// ---- comandos da bandeja ----

function setTheme(t) {
  Sprites.setTheme(t)
  try { localStorage.setItem('theme', t) } catch (_) {}
  pet.icon(Sprites.icon(), t)
}

pet.onCmd(c => {
  lastTouch = performance.now()
  if (c.startsWith('theme:')) return setTheme(c.slice(6))
  if (drag || AIR.has(st.name)) return
  if (c === 'quack') quack(true)
  if (c === 'dance') dance()
  if (c === 'flip') flip()
  if (c === 'sleep') sleep()
  if (c === 'wake' && st.name === 'sleep') wake()
  if (KINDS.includes(c) && !scene(c)) goDo(c)
  if (c === 'portal' && !portal()) quack(true)
  if (c.startsWith('hero:') && !hero(c.slice(5))) quack(true)
})

pet.onWorld(onWorld)

pet.onMusic(v => {
  music = v
  Sprites.setPhones(v)
})

pet.onBusy(v => {
  busy = v || []
  if (drag || AIR.has(st.name) || watching) return
  if (['idle', 'sit', 'walk', 'land', 'dance', 'quack', 'scene', 'ride'].includes(st.name) && isBusy(ax)) {
    if (st.name === 'scene' || st.name === 'ride') { puffs(); go('idle', { dur: 0.3 }) }
    flee()
  }
})
pet.onWatch(v => {
  watching = v
  const going = st.name === 'walk' && st.plan && st.plan.kind === 'watch'
  if (v) {
    if (st.name === 'sleep') wake()
    if (drag || AIR.has(st.name)) return
    if (st.name === 'watch') {
      // a janela do video foi pra longe: vai atras
      const x = watchSpot()
      const cur = supportAt(ax, ay, sup && sup.id)
      if (x != null && cur && cur.kind === 'floor' && Math.abs(x - ax) > 260) goWatch()
      return
    }
    if (st.name === 'scene' || st.name === 'ride') puffs()
    goWatch()
  } else if (st.name === 'watch' || going) {
    parts = []
    go('land')
  }
})

// ---- loop ----

let lastT = 0, sent = ''
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now
  tickBlink(dt)
  pollDrag()
  update(dt)
  const p = draw()
  const k = p.x + ',' + p.y
  if (k !== sent) { sent = k; lastWin = p; pet.move(p.x, p.y) }
  requestAnimationFrame(loop)
}

pet.info().then(info => {
  world = info.world
  primary = info.primary
  watching = info.watching || null
  music = !!info.music
  Sprites.setPhones(music)
  busy = info.busy || []
  let t = 'creme'
  try { t = localStorage.getItem('theme') || t } catch (_) {}
  Sprites.setTheme(t)
  pet.icon(Sprites.icon(), Sprites.theme)
  const f = floors().find(f => f.x1 <= primary.x + 10 && f.x2 >= primary.x + 10) || floors()[0]
  ax = primary.x + primary.width / 2
  ay = f ? f.y : primary.y + primary.height
  if (f) stand(f)
  lastWin = { x: info.x, y: info.y }
  lastT = performance.now()
  requestAnimationFrame(loop)
})
