// The DOM HUD: health, ammo, timer, score, money, buy menu, kill feed, teammates,
// bomb progress, crosshair, hit marker, damage direction and the minimap. It never
// touches the simulation; the sim pushes numbers in and reads callbacks out.
import { CFG } from './config.js';
import { PALETTE } from './palette.js';

const BUY_COPY = {
  start: {
    title: 'MERIDIAN DEPOT',
    copy: 'Nightwatch versus Ravens, one bomb site, first to 7 rounds. Buy, then hold the Relay — or take it.',
    action: 'Click to play',
  },
  paused: {
    title: 'MERIDIAN DEPOT',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team is still fighting. The round goes on without you.',
    action: 'Keep watching',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(minimapRects) {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    health: $('health-value'), healthBar: $('health-bar'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    timer: $('timer-value'), timerLabel: $('timer-label'),
    scoreN: $('score-nightwatch'), scoreR: $('score-ravens'), round: $('round-value'),
    money: $('money-value'), team: $('team-label'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    banner: $('banner'), bannerText: $('banner-text'), bannerSub: $('banner-sub'),
    buy: $('buy'), buyMoney: $('buy-money'), buyGrid: $('buy-grid'),
    feed: $('feed'), mates: $('mates'),
    bomb: $('bomb'), bombLabel: $('bomb-label'), bombBar: $('bomb-bar'),
    damage: $('damage'), minimap: $('minimap'),
    phase: $('phase-label'),
  };
  const mapCtx = els.minimap.getContext('2d');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyOpen = false;

  function fmtTime(s) {
    const v = Math.max(0, Math.ceil(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp) {
      setText(els.health, 'hp', String(Math.max(0, Math.ceil(hp))));
      els.healthBar.style.width = `${Math.max(0, hp)}%`;
      els.healthBar.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve) {
      setText(els.ammoMag, 'mag', String(mag));
      setText(els.ammoReserve, 'res', `/ ${reserve}`);
      els.ammo.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, label) {
      setText(els.timer, 'timer', fmtTime(seconds));
      setText(els.timerLabel, 'tlabel', label);
    },
    setScore(n, r, round) {
      setText(els.scoreN, 'sn', String(n));
      setText(els.scoreR, 'sr', String(r));
      setText(els.round, 'round', `ROUND ${round}`);
    },
    setMoney(m) {
      setText(els.money, 'money', `$${m}`);
    },
    setTeam(attacking) {
      setText(els.team, 'team', attacking ? 'ATTACK · PLANT THE RELAY' : 'DEFEND · HOLD THE RELAY');
      els.team.classList.toggle('attack', attacking);
    },
    setPhase(text) {
      setText(els.phase, 'phase', text);
    },
    setCrosshair(spreadPx) {
      const gap = 4 + spreadPx;
      els.crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFrom(angleDeg) {
      els.damage.style.setProperty('--rot', `${angleDeg}deg`);
      els.damage.classList.add('on');
      setTimeout(() => els.damage.classList.remove('on'), 450);
    },
    killfeed(killer, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = `<b>${killer}</b> ${headshot ? '⌖' : '×'} <b>${victim}</b>`;
      els.feed.prepend(line);
      while (els.feed.children.length > 5) els.feed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    setTeammates(list) {
      // list: [{ name, hp, alive }]
      const html = list.map((m) => `<div class="mate ${m.alive ? '' : 'dead'}"><span class="mate-dot"></span>${m.name}<span class="mate-hp">${m.alive ? Math.ceil(m.hp) : '✕'}</span></div>`).join('');
      if (last.mates !== html) {
        last.mates = html;
        els.mates.innerHTML = html;
      }
    },
    banner(text, sub = '', ms = 2600) {
      els.bannerText.textContent = text;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), ms);
    },
    showBomb(label, frac) {
      els.bomb.hidden = false;
      setText(els.bombLabel, 'blabel', label);
      els.bombBar.style.width = `${Math.round(frac * 100)}%`;
    },
    hideBomb() {
      els.bomb.hidden = true;
    },
    // Buy menu. items: [{ key, name, price, owned, kind }]. onBuy(key) called on click.
    showBuy(money, items, onBuy) {
      buyOpen = true;
      els.buy.hidden = false;
      setText(els.buyMoney, 'bmoney', `$${money}`);
      els.buyGrid.innerHTML = '';
      for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `buy-item ${item.owned ? 'owned' : ''} ${money < item.price && !item.owned ? 'poor' : ''}`;
        btn.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-key">${item.keyLabel}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        btn.addEventListener('click', () => onBuy(item.key));
        els.buyGrid.appendChild(btn);
      }
    },
    hideBuy() {
      buyOpen = false;
      els.buy.hidden = true;
    },
    isBuyOpen() {
      return buyOpen;
    },
    showOverlay(mode, data = {}) {
      const text = BUY_COPY[mode];
      els.title.textContent = text.title;
      let copy = text.copy;
      if (mode === 'roundEnd') copy = data.copy || '';
      if (mode === 'matchEnd') copy = data.copy || '';
      els.copy.textContent = copy;
      els.play.textContent = text.action;
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
    drawMinimap(player, mates, enemies, bombPlanted, site) {
      const ctx = mapCtx;
      const W = 168;
      const H = 132;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20, 24, 30, 0.82)';
      ctx.fillRect(0, 0, W, H);
      const sx = (x) => (x + 23) / 46 * W;
      const sz = (z) => (z + 17.5) / 35 * H;
      for (const r of minimapRects) {
        ctx.fillStyle = r.color;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(sx(r.x), sz(r.z), Math.max(1.5, r.w / 46 * W), Math.max(1.5, r.d / 35 * H));
      }
      ctx.globalAlpha = 1;
      // Bomb site.
      ctx.strokeStyle = bombPlanted ? PALETTE.danger : PALETTE.accent;
      ctx.lineWidth = 2;
      const cx = sx(site.x);
      const cy = sz(site.z);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 7, cy);
      ctx.lineTo(cx, cy + 7);
      ctx.lineTo(cx - 7, cy);
      ctx.closePath();
      ctx.stroke();
      // Enemies seen recently.
      for (const e of enemies) {
        ctx.fillStyle = PALETTE.ravens;
        ctx.beginPath();
        ctx.arc(sx(e.x), sz(e.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Teammates.
      for (const m of mates) {
        ctx.fillStyle = PALETTE.nightwatch;
        ctx.beginPath();
        ctx.arc(sx(m.x), sz(m.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // The player: an arrow pointing where they look.
      ctx.save();
      ctx.translate(sx(player.x), sz(player.z));
      ctx.rotate(-player.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    },
  };
}
