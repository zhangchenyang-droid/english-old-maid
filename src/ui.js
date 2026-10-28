/* UI layer (DOM). No ES modules so file:// works. */

// Basic polyfills / diagnostics for mobile browsers
if (!window.CSS) window.CSS = {};
if (typeof window.CSS.escape !== "function") {
  window.CSS.escape = function (value) {
    // Minimal escape for use in attribute selectors.
    return String(value).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
  };
}

function showFatalError(err) {
  try {
    const msg = (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err);
    const box = document.createElement("div");
    box.style.position = "fixed";
    box.style.inset = "12px";
    box.style.zIndex = "20000";
    box.style.background = "rgba(0,0,0,0.78)";
    box.style.color = "white";
    box.style.padding = "12px";
    box.style.borderRadius = "14px";
    box.style.overflow = "auto";
    box.style.fontSize = "12px";
    box.style.whiteSpace = "pre-wrap";
    box.innerText = "页面发生错误（请截图发我）：\n\n" + msg;
    box.addEventListener("click", () => box.remove());
    document.body.appendChild(box);
  } catch {
    // ignore
  }
}

window.addEventListener("error", (e) => showFatalError(e.error || e.message || e), { passive: true });
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason || e), { passive: true });

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function seatEls() {
  return {
    top: { name: $("#pTopName"), count: $("#pTopCount"), hand: $("#pTopHand") },
    left: { name: $("#pLeftName"), count: $("#pLeftCount"), hand: $("#pLeftHand") },
    right: { name: $("#pRightName"), count: $("#pRightCount"), hand: $("#pRightHand") },
    bottom: { name: $("#pBottomName"), count: $("#pBottomCount"), hand: $("#pBottomHand") },
  };
}

function renderSeats(game, opts = {}) {
  // 🎯 渲染前检查：如果剩余两人，触发最终检查
  const activePlayers = game.players.filter(p => !p.out);
  if (activePlayers.length === 2 && !game.finalCheckDone) {
    console.log("[renderSeats] 检测到剩余两人，触发最终配对检查...");
    if (window.Game && window.Game.finalTwoPlayersCheck) {
      window.Game.finalTwoPlayersCheck(game);
      game.finalCheckDone = true; // 标记已检查，避免重复
    }
  }

  const dealMode = !!opts.deal;
  const animateExpand = !!opts.animateExpand; // new option: animate card repositioning
  // Fixed mapping: 0 bottom(you), 1 right, 2 top, 3 left.
  const map = seatEls();
  const seatByIdx = {
    0: map.bottom,
    1: map.right,
    2: map.top,
    3: map.left,
  };

  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    const s = seatByIdx[i];
    if (!s) continue;
    s.name.innerHTML = `${escapeHtml(p.name)} ${p.kind === "ai" ? "<span class=\"pill\">AI</span>" : "<span class=\"pill\">玩家</span>"}`;

    // 🆕 显示剩余手牌数量
    if (p.out) {
      s.count.innerHTML = '<span class="countText">已出完</span>';
    } else {
      // 所有玩家：仅显示剩余手牌数量，用span包装以支持独立缩放
      s.count.innerHTML = `<span class="countText">${p.hand.length}</span>`;
    }
  }

  // Render AI hands as backs only; human hand face-up.
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    const s = seatByIdx[i];

    // 跳过正在做自适应调整动画的手牌区域
    if (s.hand.dataset.adjusting === "true") {
      console.log(`[renderSeats] 跳过玩家${i}的手牌渲染，正在做自适应动画`);
      continue;
    }

    s.hand.innerHTML = "";
    if (i === 0) {
      // You: show face-up cards (selectable on table)
      const n = p.hand.length;
      const center = (n - 1) / 2;
      for (let idx = 0; idx < n; idx++) {
        const card = p.hand[idx];
        const div = document.createElement("div");
        div.className = `faceCard ${card.type === "joker" ? "joker imgCard" : ""} ${card.type === "img" ? "imgCard" : ""}`;
        div.dataset.cardId = card.id;
        if (dealMode) div.dataset.dealIndex = String(idx);

        // Fan layout (more readable: larger spacing between cards)
        // Cap overall width to avoid spilling off the bottom plank.
        const maxFanWidth = 920; // px (wider so text/images aren't covered)
        const spread = Math.min(62, maxFanWidth / Math.max(1, n - 1));
        const d = idx - center;
        div.style.setProperty("--x", `${d * spread}px`);
        div.style.setProperty("--rot", `${d * 0.9}deg`);
        div.style.setProperty("--y", `${Math.abs(d) * 0.8}px`);
        div.style.zIndex = String(100 + idx);

        // Add expand animation class when joker is dealt
        if (animateExpand) {
          div.style.transition = "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)";
        }

        if (card.type === "joker") {
          div.dataset.corner = "";
          div.innerHTML = `
            <div class="cardContent">
              <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
            </div>
          `;
        } else {
          div.dataset.corner = "";
          div.innerHTML = `
            <div class="cardContent">
              <div class="imgWrap"><img class="cardImg" src="${escapeHtml(card.imgSrc)}" alt="card" draggable="false" /></div>
            </div>
          `;
        }
        s.hand.appendChild(div);
      }
    } else {
      // AI: show backs only. If it's your turn and this AI is upstream, render full clickable backs.
      const isHumanTurn = game.players[game.currentPlayerIndex].kind === "human";
      const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
      const isUpstreamForDraw = isHumanTurn && upstreamIdx === i && !game.turnHasDrawn;
      // Render as a pile like the reference: top zone piles sideways, left/right piles vertical.
      // 使用真实手牌数量
      const showN = p.hand.length;
      const cCenter = (showN - 1) / 2;
      // Make the upstream pile clickable (tap pile -> open overlay).
      if (isUpstreamForDraw) s.hand.dataset.fromPlayerIndex = String(i);
      else s.hand.removeAttribute("data-from-player-index");

      for (let k = 0; k < showN; k++) {
        const b = document.createElement("div");
        b.className = "miniBack";
        if (dealMode) b.dataset.dealIndex = String(k);
        b.textContent = "";
        const d = k - cCenter;
        let sx = 0;
        let sy = 0;
        let srot = 0;
        if (i === 2) {
          // top player: pile spreads to the left (as in reference)
          sx = d * 12;
          sy = d * 0.3;
          srot = 0;
        } else {
          // left/right: pile spreads downward
          sx = d * 0.3;
          sy = d * 9;
          // rotate 90° around each card's center for side players
          srot = i === 1 || i === 3 ? 90 : 0;
        }
        b.style.setProperty("--sx", `${sx}px`);
        b.style.setProperty("--sy", `${sy}px`);
        b.style.setProperty("--srot", `${srot}deg`);
        b.style.transitionDelay = `0ms`;
        b.style.zIndex = String(10 + k);

        // Add expand animation when joker is dealt
        if (animateExpand) {
          b.style.transition = "left 300ms cubic-bezier(0.22, 1, 0.36, 1), top 300ms cubic-bezier(0.22, 1, 0.36, 1)";
        }

        s.hand.appendChild(b);
      }
    }
  }
}

// 计算下一张卡牌在弃牌堆中的 z-index（和 renderDiscardPile 完全一致的逻辑）
function getDiscardPileZIndex(game) {
  if (!game || !game.discardPile) {
    return { leftZ: 10, rightZ: 100 };
  }

  const pairs = [];
  for (let i = 0; i < game.discardPile.length; i += 2) {
    pairs.push([game.discardPile[i], game.discardPile[i + 1]]);
  }
  const leftPile = pairs.map((p) => p[0]).filter(Boolean);
  const rightPile = pairs.map((p) => p[1]).filter(Boolean);

  return {
    leftZ: 10 + leftPile.length,   // 下一张左卡的 z-index
    rightZ: 100 + rightPile.length  // 下一张右卡的 z-index
  };
}

function renderDiscardPile(game) {
  const pile = $("#discardPile");
  const count = $("#discardCount");
  count.textContent = `共 ${game.discardPile.length} 张`;
  pile.innerHTML = "";

  // Two-pile discard: each discarded *pair* becomes (leftPileCard, rightPileCard).http://127.0.0.1:8000/english-old-maid/assets/animal_cards/4_2_A.png
  // Next discard covers the previous (stacking), instead of spreading around.
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }
  function rotJitter(cardId, idx) {
    return (hash01(`${cardId}|${idx}`) - 0.5) * 8; // -4..4 deg
  }

  const pairs = [];
  for (let i = 0; i < game.discardPile.length; i += 2) {
    pairs.push([game.discardPile[i], game.discardPile[i + 1]]);
  }
  const leftPile = pairs.map((p) => p[0]).filter(Boolean);
  const rightPile = pairs.map((p) => p[1]).filter(Boolean);

  const MAX_DEPTH = 18; // render last N layers for perf; older still exist logically
  const leftShown = leftPile.slice(-MAX_DEPTH);
  const rightShown = rightPile.slice(-MAX_DEPTH);

  function renderCardFaceUp(c, xPercent, yPercent, z) {
    const div = document.createElement("div");
    const isJoker = c.type === "joker";
    div.className = `discardCard ${isJoker ? "joker" : "imgDiscard"}`;
    div.style.left = `${xPercent}%`;
    div.style.top = `${yPercent}%`;
    const rotation = rotJitter(c.id, z);
    div.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    div.style.zIndex = String(z);
    console.log(`[渲染弃牌] cardId=${c.id}, z=${z}, rotation=${rotation.toFixed(2)}°`);

    if (isJoker) {
      div.dataset.corner = "";
      div.innerHTML = `
        <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
      `;
    } else {
      div.dataset.corner = "";
      div.innerHTML = `
        <div class="imgWrap"><img class="cardImg" src="${escapeHtml(c.imgSrc)}" alt="card" draggable="false" /></div>
      `;
    }

    pile.appendChild(div);
  }

  // Left pile center and right pile center inside the discard zone
  const leftX = 28;
  const rightX = 72;
  const baseY = 52;

  // Render bottom-to-top so newer cards cover older ones.
  for (let i = 0; i < leftShown.length; i++) {
    const c = leftShown[i];
    renderCardFaceUp(c, leftX, baseY, 10 + i);
  }
  for (let i = 0; i < rightShown.length; i++) {
    const c = rightShown[i];
    renderCardFaceUp(c, rightX, baseY, 100 + i);
  }
}

// no TTS in standard card mode

function flyToDiscard(fromEl) {
  const pile = $("#discardPile");
  const from = fromEl.getBoundingClientRect();
  const to = pile.getBoundingClientRect();

  // 不克隆，直接操作原始卡牌元素
  fromEl.classList.add("flyingCard");
  fromEl.style.position = "fixed";
  fromEl.style.left = `${from.left}px`;
  fromEl.style.top = `${from.top}px`;
  fromEl.style.width = `${from.width}px`;
  fromEl.style.height = `${from.height}px`;
  fromEl.style.margin = "0";
  fromEl.style.zIndex = "10000";
  fromEl.style.pointerEvents = "none";

  // 获取 .tableBg 中心点
  const tableBg = document.querySelector('.tableBg');
  const tableBgRect = tableBg ? tableBg.getBoundingClientRect() : null;
  const centerX = tableBgRect ? tableBgRect.left + tableBgRect.width / 2 : window.innerWidth / 2;
  const centerY = tableBgRect ? tableBgRect.top + tableBgRect.height / 2 : window.innerHeight / 2;

  // Determine target position based on card suffix (_A -> left, _B -> right)
  const cardId = fromEl.dataset.cardId || "";
  const isACard = cardId.includes("_A");
  const isBCard = cardId.includes("_B");

  // Calculate target position (matching renderDiscardPile positions)
  const leftX = 0.28;
  const rightX = 0.72;
  const targetXPercent = isACard ? leftX : (isBCard ? rightX : 0.5);

  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const targetX = to.left + to.width * targetXPercent;
  const targetY = to.top + to.height * 0.52;

  // Calculate scale to match discardCard size (92px base width)
  const discardScale = getComputedStyle(document.documentElement).getPropertyValue('--scale-discard-pile') || "1";
  const targetWidth = 92 * parseFloat(discardScale);
  const scaleTarget = targetWidth / from.width;

  // 计算目标旋转角度（使用和 renderDiscardPile 完全相同的逻辑）
  const { leftZ, rightZ } = window.game ? getDiscardPileZIndex(window.game) : { leftZ: 1, rightZ: 1 };
  const targetZ = isACard ? leftZ : (isBCard ? rightZ : leftZ);

  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }
  const targetRotation = (hash01(`${cardId}|${targetZ}`) - 0.5) * 8;
  console.log(`[玩家出牌] cardId=${cardId}, targetZ=${targetZ}, rotation=${targetRotation.toFixed(2)}°`);

  // 弧线控制点：围绕 .tableBg 中心
  const midX = (startX + targetX) / 2;
  const midY = (startY + targetY) / 2;
  const toCenterX = centerX - midX;
  const toCenterY = centerY - midY;

  const dist = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
  const arcHeight = Math.min(80, dist * 0.3);
  const controlX = midX + toCenterX * 0.2;
  const controlY = midY + toCenterY * 0.2 - arcHeight;

  const steps = 30;
  const keyframes = [];
  const overshootDist = dist * 0.04;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let easeT, overshoot;

    if (t <= 0.68) {
      const t1 = t / 0.68;
      easeT = 1 - Math.pow(1 - t1, 2.5);
      overshoot = 1.04;
    } else {
      const t2 = (t - 0.68) / 0.32;
      const easeT2 = t2 < 0.5 ? 4 * t2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 3) / 2;
      easeT = 1.04 - 0.04 * easeT2;
      overshoot = easeT;
    }

    // 贝塞尔曲线轨迹
    const arcT = Math.min(easeT, 1.0);
    const baseX = (1-arcT)*(1-arcT)*startX + 2*(1-arcT)*arcT*controlX + arcT*arcT*targetX;
    const baseY = (1-arcT)*(1-arcT)*startY + 2*(1-arcT)*arcT*controlY + arcT*arcT*targetY;

    const dirX = targetX - startX;
    const dirY = targetY - startY;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
    const normX = dirLen > 0 ? dirX / dirLen : 0;
    const normY = dirLen > 0 ? dirY / dirLen : 0;
    const overshootAmount = (overshoot - 1.0) * overshootDist;

    const x = baseX + normX * overshootAmount;
    const y = baseY + normY * overshootAmount;

    const currentScale = 1 + (scaleTarget - 1) * Math.min(easeT, 1.0);
    const currentRotation = targetRotation * Math.min(easeT, 1.0);
    const opacity = 1 - 0.05 * Math.min(easeT, 1.0);

    keyframes.push({
      left: `${x}px`,
      top: `${y}px`,
      transform: `translate(-50%, -50%) scale(${currentScale}) rotate(${currentRotation}deg)`,
      opacity: opacity,
      offset: t
    });
  }

  const anim = fromEl.animate(keyframes, {
    duration: 520,
    easing: "linear"
  });

  anim.onfinish = () => {
    fromEl.remove();
  };

  return anim; // 返回动画对象，方便外部监听
}

function seatHandElByPlayerIndex(idx) {
  // Fixed mapping: 0 bottom(you), 1 right, 2 top, 3 left.
  if (idx === 0) return $("#pBottomHand");
  if (idx === 1) return $("#pRightHand");
  if (idx === 2) return $("#pTopHand");
  return $("#pLeftHand");
}

function flyFromRectToRect(fromRect, toRect, cardEl, playerIndex, onComplete) {
  // Handle both old (4 params) and new (5 params) signatures
  if (typeof playerIndex === 'function') {
    onComplete = playerIndex;
    playerIndex = 0; // default to player
  }

  // 不克隆，直接操作原始卡牌元素
  // 变成 fixed 定位，脱离文档流
  cardEl.style.position = "fixed";
  cardEl.style.left = `${fromRect.left}px`;
  cardEl.style.top = `${fromRect.top}px`;
  cardEl.style.width = `${fromRect.width}px`;
  cardEl.style.height = `${fromRect.height}px`;
  cardEl.style.margin = "0";
  cardEl.style.zIndex = "10000";
  cardEl.style.pointerEvents = "none";

  // 获取 .tableBg 中心点（作为弧线的参考点）
  const tableBg = document.querySelector('.tableBg');
  const tableBgRect = tableBg ? tableBg.getBoundingClientRect() : null;
  const centerX = tableBgRect ? tableBgRect.left + tableBgRect.width / 2 : window.innerWidth / 2;
  const centerY = tableBgRect ? tableBgRect.top + tableBgRect.height / 2 : window.innerHeight / 2;

  const startX = fromRect.left + fromRect.width / 2;
  const startY = fromRect.top + fromRect.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;

  // Calculate scale to match target card size
  const targetScale = toRect.width / fromRect.width;

  // 弧线控制点：围绕 .tableBg 中心点
  // 控制点位于起点和终点之间，但偏向中心
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const toCenterX = centerX - midX;
  const toCenterY = centerY - midY;

  // 弧线高度：根据距离和位置动态调整
  const dist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
  const arcHeight = Math.min(200, dist * 0.4);
  const controlX = midX + toCenterX * 0.3; // 30% 偏向中心
  const controlY = midY + toCenterY * 0.3 - arcHeight; // 加上弧线高度

  // Determine rotation based on target player
  let targetRotation = 0;
  if (playerIndex === 3) targetRotation = 90;        // Left AI
  else if (playerIndex === 1) targetRotation = -90;  // Right AI
  else if (playerIndex === 2) targetRotation = -180; // Top AI
  else targetRotation = 0;                            // Player (bottom)

  const keyframes = [];
  const steps = 30;
  const overshootRatio = 0.05;
  const overshootDist = dist * overshootRatio;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let easeT, overshoot;

    // Two-phase animation: approach with overshoot, then settle
    if (t <= 0.72) {
      const t1 = t / 0.72;
      easeT = 1 - Math.pow(1 - t1, 3);
      overshoot = 1.05;
    } else {
      const t2 = (t - 0.72) / 0.28;
      const easeT2 = t2 < 0.5 ? 4 * t2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 3) / 2;
      easeT = 1.05 - 0.05 * easeT2;
      overshoot = easeT;
    }

    // 贝塞尔曲线轨迹（围绕中心点的弧线）
    const baseX = (1-easeT)*(1-easeT)*startX + 2*(1-easeT)*easeT*controlX + easeT*easeT*endX;
    const baseY = (1-easeT)*(1-easeT)*startY + 2*(1-easeT)*easeT*controlY + easeT*easeT*endY;

    // 添加过冲
    const dirX = endX - startX;
    const dirY = endY - startY;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
    const normX = dirLen > 0 ? dirX / dirLen : 0;
    const normY = dirLen > 0 ? dirY / dirLen : 0;
    const overshootAmount = (overshoot - 1.0) * overshootDist;
    const x = baseX + normX * overshootAmount;
    const y = baseY + normY * overshootAmount;

    const currentScale = 1 + (targetScale - 1) * Math.min(easeT, 1.0);
    const currentRotation = targetRotation * Math.min(easeT, 1.0);
    const flipRotation = playerIndex === 0 ? 0 : Math.min(easeT, 1.0) * 180;

    keyframes.push({
      left: `${x}px`,
      top: `${y}px`,
      transform: `translate(-50%, -50%) scale(${currentScale}) rotate(${currentRotation}deg) rotateY(${flipRotation}deg)`,
      opacity: 1 - 0.05 * Math.min(easeT, 1.0)
    });
  }

  cardEl.animate(keyframes, {
    duration: 560,
    easing: "linear"
  }).onfinish = () => {
    cardEl.remove();
    if (onComplete) onComplete();
  };
}

// Animate card draw with flying card (source -> target player hand)
// Physics-based arc trajectory with proper rotation and overshoot
function animateDrawCardFly(fromPlayerIdx, toPlayerIdx, drawnCard, onComplete) {
  console.log(`[animateDrawCardFly] 被调用: from=${fromPlayerIdx} to=${toPlayerIdx}`, drawnCard);
  try {
    const fromHandEl = seatHandElByPlayerIndex(fromPlayerIdx);
    const toHandEl = seatHandElByPlayerIndex(toPlayerIdx);
    console.log(`[animateDrawCardFly] fromHandEl:`, fromHandEl, "toHandEl:", toHandEl);
    if (!fromHandEl || !toHandEl) {
      console.log(`[animateDrawCardFly] 元素未找到，跳过动画`);
      if (onComplete) onComplete();
      return;
    }

    const fromRect = fromHandEl.getBoundingClientRect();
    console.log(`[animateDrawCardFly] fromRect:`, fromRect);
    const toRect = toHandEl.getBoundingClientRect();

    // 获取 .tableBg 中心点作为弧线参考
    const tableBg = document.querySelector('.tableBg');
    const tableBgRect = tableBg ? tableBg.getBoundingClientRect() : null;
    const centerX = tableBgRect ? tableBgRect.left + tableBgRect.width / 2 : window.innerWidth / 2;
    const centerY = tableBgRect ? tableBgRect.top + tableBgRect.height / 2 : window.innerHeight / 2;

    // 🔧 从实际卡牌位置计算起点，而不是容器中心
    // 获取源手牌的最后一张卡牌（DOM 顺序最后，z-index 最高，视觉上最前面不被遮挡）
    const allFromCards = fromHandEl.querySelectorAll('.miniBack, .faceCard');
    const topFromCard = allFromCards.length > 0 ? allFromCards[allFromCards.length - 1] : null;
    let startX, startY;

    if (topFromCard) {
      // 如果有卡牌，从最后一张卡牌（最上层）的中心开始
      const cardRect = topFromCard.getBoundingClientRect();
      startX = cardRect.left + cardRect.width / 2;
      startY = cardRect.top + cardRect.height / 2;
      console.log(`[animateDrawCardFly] 使用最后一张卡（最上层）作为起点:`, cardRect);
    } else {
      // 如果没有卡牌（手牌为空），使用容器中心 + zone高度估算
      const zoneRect = fromHandEl.parentElement.getBoundingClientRect();
      startX = fromRect.left + fromRect.width / 2;
      startY = zoneRect.top + zoneRect.height / 2;
      console.log(`[animateDrawCardFly] 源手牌无卡牌，使用zone中心估算:`, zoneRect);
    }

    // 计算终点：根据目标玩家类型选择不同的计算方式
    console.log(`[animateDrawCardFly] 检查 window.game:`, window.game);
    const toPlayer = (window.game && window.game.players) ? window.game.players[toPlayerIdx] : null;
    console.log(`[animateDrawCardFly] toPlayer:`, toPlayer);

    let endX, endY;

    if (toPlayerIdx === 0) {
      // 玩家手牌：飞到扇形排列的最后一张
      const futureHandCount = toPlayer ? toPlayer.hand.length + 1 : 1;
      const center = (futureHandCount - 1) / 2;
      const lastCardIndex = futureHandCount - 1;
      const d = lastCardIndex - center;
      const spread = Math.min(62, 920 / Math.max(1, futureHandCount - 1));

      endX = toRect.left + toRect.width / 2 + d * spread;
      endY = toRect.top + 18 + 62 + Math.abs(d) * 0.8;
    } else {
      // AI 手牌：飞到最后一张卡的中心（DOM 顺序最后一个，z-index 最高，视觉上最前面不被遮挡）
      const allCards = toHandEl.querySelectorAll('.miniBack');
      const topCard = allCards.length > 0 ? allCards[allCards.length - 1] : null;
      if (topCard) {
        const cardRect = topCard.getBoundingClientRect();
        let targetX = cardRect.left + cardRect.width / 2;
        let targetY = cardRect.top + cardRect.height / 2;

        // 向屏幕中心偏移15%的距离，让卡牌不飞得太远
        const offsetRatio = 0.15;
        const towardCenterX = (centerX - targetX) * offsetRatio;
        const towardCenterY = (centerY - targetY) * offsetRatio;

        // 额外向上偏移，避免整体偏下
        const upwardOffset = 20; // 向上偏移20px

        endX = targetX + towardCenterX;
        endY = targetY + towardCenterY - upwardOffset;
        console.log(`[animateDrawCardFly] 使用最后一张卡（最上层）位置, 向中心偏移15%, 向上偏移${upwardOffset}px, z-index=${topCard.style.zIndex}, 中心:(${endX.toFixed(1)}, ${endY.toFixed(1)})`);
      } else {
        // 如果没有卡牌，使用手牌区域中心
        endX = toRect.left + toRect.width / 2;
        endY = toRect.top + toRect.height / 2;
        console.log(`[animateDrawCardFly] 无卡牌，使用区域中心`);
      }
    }

    console.log(`[animateDrawCardFly] 最终终点位置: (${endX}, ${endY})`);

    // 确定目标玩家手牌的实际卡牌尺寸（用于缩放）
    let targetCardWidth, targetCardHeight;
    if (toPlayerIdx === 0) {
      // 玩家手牌（底部）
      const scalePlayer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-player-card')) || 0.85;
      targetCardWidth = 86 * scalePlayer;
      targetCardHeight = 124 * scalePlayer;
    } else if (toPlayerIdx === 2) {
      // AI上家
      const scaleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-top-card')) || 1.29;
      targetCardWidth = 52 * scaleTop;
      targetCardHeight = 72 * scaleTop;
    } else {
      // AI左右家
      const scaleSide = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-side-card')) || 1.25;
      targetCardWidth = 64 * scaleSide;
      targetCardHeight = 89 * scaleSide;
    }

    // 创建飞行卡牌（双面结构：正面+背面）
    const showFace = fromPlayerIdx === 0; // 从人类玩家手中抽出时显示正面

    // 翻转容器
    const flipContainer = document.createElement("div");
    flipContainer.style.width = "86px";
    flipContainer.style.height = "124px";
    flipContainer.style.position = "fixed";
    flipContainer.style.transformStyle = "preserve-3d";
    flipContainer.style.perspective = "1000px";
    flipContainer.style.left = `${startX - 43}px`;
    flipContainer.style.top = `${startY - 62}px`;
    flipContainer.style.zIndex = "10005";
    flipContainer.style.pointerEvents = "none";

    // 背面牌
    const backCard = document.createElement("div");
    backCard.className = "miniBack";
    backCard.style.width = "86px";
    backCard.style.height = "124px";
    backCard.style.position = "absolute";
    backCard.style.backfaceVisibility = "hidden";
    backCard.style.transform = "rotateY(0deg)";

    // 正面牌
    const frontCard = document.createElement("div");
    frontCard.className = `faceCard ${drawnCard && drawnCard.type === "joker" ? "joker imgCard" : ""} ${drawnCard && drawnCard.type === "img" ? "imgCard" : ""}`;
    frontCard.style.width = "86px";
    frontCard.style.height = "124px";
    frontCard.style.position = "absolute";
    frontCard.style.backfaceVisibility = "hidden";
    frontCard.style.transform = "rotateY(180deg)";

    if (drawnCard) {
      if (drawnCard.type === "joker") {
        frontCard.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
          </div>
        `;
      } else {
        frontCard.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="${escapeHtml(drawnCard.imgSrc)}" alt="card" draggable="false" /></div>
          </div>
        `;
      }
    }

    flipContainer.appendChild(backCard);
    flipContainer.appendChild(frontCard);
    document.body.appendChild(flipContainer);
    console.log(`[animateDrawCardFly] 卡牌元素已添加到body, 起点:(${startX}, ${startY}) 终点:(${endX}, ${endY})`);

    // 计算弧线控制点（围绕 .tableBg 中心）
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const toCenterX = centerX - midX;
    const toCenterY = centerY - midY;

    const dist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const arcHeight = Math.min(200, dist * 0.4); // 弧线高度
    const controlX = midX + toCenterX * 0.3;
    const controlY = midY + toCenterY * 0.3 - arcHeight;

    // 计算目标旋转角度
    let targetRotZ = 0;
    if (toPlayerIdx === 3) targetRotZ = 90;        // 左侧AI
    else if (toPlayerIdx === 1) targetRotZ = -90;  // 右侧AI
    else if (toPlayerIdx === 2) targetRotZ = 180;  // 上方AI
    else targetRotZ = 0;                            // 玩家（底部）

    // 计算目标缩放
    const targetScale = targetCardWidth / 86;

    // 生成关键帧（贝塞尔曲线 + 过冲）
    const steps = 30;
    const keyframes = [];
    const overshootDist = dist * 0.05; // 5% 过冲

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let easeT, overshoot;

      // 两阶段缓动：加速接近（68%）+ 过冲回落（32%）
      if (t <= 0.72) {
        const t1 = t / 0.72;
        easeT = 1 - Math.pow(1 - t1, 3); // ease-out
        overshoot = 1.05; // 5% 过冲
      } else {
        const t2 = (t - 0.72) / 0.28;
        const easeT2 = t2 < 0.5 ? 4 * t2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 3) / 2;
        easeT = 1.05 - 0.05 * easeT2; // 从 1.05 回到 1.0
        overshoot = easeT;
      }

      // 贝塞尔曲线轨迹（二次）
      const arcT = Math.min(easeT, 1.0);
      const baseX = (1-arcT)*(1-arcT)*startX + 2*(1-arcT)*arcT*controlX + arcT*arcT*endX;
      const baseY = (1-arcT)*(1-arcT)*startY + 2*(1-arcT)*arcT*controlY + arcT*arcT*endY;

      // 添加过冲（沿运动方向）
      const dirX = endX - startX;
      const dirY = endY - startY;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      const normX = dirLen > 0 ? dirX / dirLen : 0;
      const normY = dirLen > 0 ? dirY / dirLen : 0;
      const overshootAmount = (overshoot - 1.0) * overshootDist;

      const x = baseX + normX * overshootAmount;
      const y = baseY + normY * overshootAmount;

      // 平滑缩放
      const currentScale = 1 + (targetScale - 1) * Math.min(arcT, 1.0);

      // Z轴旋转（对齐目标玩家手牌方向）
      const currentRotZ = targetRotZ * Math.min(arcT, 1.0);

      // Y轴翻转（从人类手中抽出时：正面→背面；从AI手中抽到人类手中：背面→正面）
      let flipRotY = 0;
      if (showFace) {
        // 从人类手中抽出：正面(0deg) → 背面(180deg)
        flipRotY = Math.min(arcT, 1.0) * 180;
      } else if (toPlayerIdx === 0) {
        // 抽到人类手中：背面(0deg) → 正面(180deg)
        flipRotY = Math.min(arcT, 1.0) * 180;
      }
      // AI之间抽牌：不翻转，保持背面

      // 淡出效果
      const opacity = 1 - 0.05 * Math.min(arcT, 1.0);

      keyframes.push({
        left: `${x - 43}px`,
        top: `${y - 62}px`,
        transform: `scale(${currentScale}) rotateZ(${currentRotZ}deg) rotateY(${flipRotY}deg)`,
        opacity: opacity,
        offset: t
      });
    }

    // 执行动画
    console.log(`[animateDrawCardFly] 开始执行动画, keyframes数量:`, keyframes.length);
    const anim = flipContainer.animate(keyframes, {
      duration: 560,
      easing: "linear", // 缓动已在关键帧中手动实现
      fill: "forwards"  // 保持最终状态，避免跳回初始位置
    });
    console.log(`[animateDrawCardFly] 动画对象创建完成, playState:`, anim.playState);

    anim.onfinish = () => {
      console.log(`[animateDrawCardFly] 动画完成`);
      flipContainer.remove();
      if (onComplete) onComplete();
    };
  } catch (e) {
    console.error("❌❌❌ animateDrawCardFly 发生错误:", e);
    console.error("错误堆栈:", e.stack);
    if (onComplete) onComplete();
  }
}

// Animate card draw from a specific point (used when drawing from overlay)
// startX/startY: the actual pixel position where the card currently is
function animateDrawCardFlyFromPoint(startX, startY, toPlayerIdx, drawnCard, currentHandCount, onComplete) {
  // 处理参数重载：如果第5个参数是函数，说明没有传currentHandCount
  if (typeof currentHandCount === 'function') {
    onComplete = currentHandCount;
    currentHandCount = null;
  }

  console.log("[animateDrawCardFlyFromPoint] 开始", { startX, startY, toPlayerIdx, drawnCard, currentHandCount });
  try {
    const toHandEl = seatHandElByPlayerIndex(toPlayerIdx);
    console.log("[animateDrawCardFlyFromPoint] toHandEl:", toHandEl);
    if (!toHandEl) {
      console.log("[animateDrawCardFlyFromPoint] 错误：找不到目标手牌元素");
      if (onComplete) onComplete();
      return;
    }

    const toRect = toHandEl.getBoundingClientRect();
    // 优先使用传入的手牌数量，否则从window.game获取
    const numCards = currentHandCount != null ? currentHandCount + 1 : (window.game?.players?.[toPlayerIdx]?.hand?.length || 0) + 1;
    console.log(`[玩家抽卡] 传入手牌数: ${currentHandCount}, 计算目标时使用: ${numCards}`);

    // 先确定目标玩家手牌的实际卡牌尺寸（用于后续位置计算）
    let targetCardWidth, targetCardHeight;
    if (toPlayerIdx === 0) {
      // 玩家手牌（底部）
      const scalePlayer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-player-card')) || 0.85;
      targetCardWidth = 86 * scalePlayer;
      targetCardHeight = 124 * scalePlayer;
    } else if (toPlayerIdx === 2) {
      // AI上家
      const scaleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-top-card')) || 1.29;
      targetCardWidth = 52 * scaleTop;
      targetCardHeight = 72 * scaleTop;
    } else {
      // AI左右家
      const scaleSide = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-side-card')) || 1.25;
      targetCardWidth = 64 * scaleSide;
      targetCardHeight = 89 * scaleSide;
    }

    // 获取 .tableBg 中心点作为弧线参考
    const tableBg = document.querySelector('.tableBg');
    const tableBgRect = tableBg ? tableBg.getBoundingClientRect() : null;
    const centerX = tableBgRect ? tableBgRect.left + tableBgRect.width / 2 : window.innerWidth / 2;
    const centerY = tableBgRect ? tableBgRect.top + tableBgRect.height / 2 : window.innerHeight / 2;

    // 计算目标位置（最右边卡牌的位置，学习flyJokerToPlayerSimple）
    let endX, endY;
    if (toPlayerIdx === 0) {
      // 玩家手牌：扇形展开，最右边位置
      const center = (numCards - 1) / 2;
      const spread = Math.min(62, 920 / Math.max(1, numCards - 1));
      const d = numCards - 1 - center; // 最右边
      endX = toRect.left + toRect.width / 2 + d * spread;
      endY = toRect.top + 18 + targetCardHeight / 2 + Math.abs(d) * 0.8;
      console.log(`[玩家抽卡] 目标位置计算: numCards=${numCards}, center=${center}, d=${d}, spread=${spread}, endX=${endX}, endY=${endY}`);
    } else {
      // 其他玩家（保持原逻辑）
      endX = toRect.left + toRect.width / 2;
      endY = toRect.top + toRect.height / 2;
    }

    // 创建飞行卡牌（已经是正面了，因为在抽牌界面已经翻转过了）
    const flyingCard = document.createElement("div");
    flyingCard.className = `faceCard ${drawnCard && drawnCard.type === "joker" ? "joker imgCard" : ""} ${drawnCard && drawnCard.type === "img" ? "imgCard" : ""}`;
    flyingCard.style.width = "140px"; // 抽牌界面卡牌尺寸
    flyingCard.style.height = "196px";
    flyingCard.style.position = "fixed";
    flyingCard.style.left = `${startX - 70}px`;
    flyingCard.style.top = `${startY - 98}px`;
    flyingCard.style.zIndex = "10005";
    flyingCard.style.pointerEvents = "none";

    if (drawnCard) {
      if (drawnCard.type === "joker") {
        flyingCard.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
          </div>
        `;
      } else {
        flyingCard.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="${escapeHtml(drawnCard.imgSrc)}" alt="card" draggable="false" /></div>
          </div>
        `;
      }
    }

    document.body.appendChild(flyingCard);

    // 计算弧线控制点（围绕 .tableBg 中心）
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const toCenterX = centerX - midX;
    const toCenterY = centerY - midY;

    const dist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const arcHeight = Math.min(80, dist * 0.15); // 弧线高度减小，避免往上飞
    const controlX = midX + toCenterX * 0.2;
    const controlY = midY + toCenterY * 0.2 - arcHeight;

    // 计算目标旋转角度（玩家手牌不旋转，保持0度）
    const targetRotZ = 0; // 玩家手牌始终是0度

    // 计算目标缩放（从抽牌界面140px缩放到玩家手牌尺寸）
    const targetScale = targetCardWidth / 140;

    // 生成关键帧（贝塞尔曲线 + ease-in-out，无过冲）
    const steps = 30;
    const keyframes = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // 改进的ease-in-out：起步更快，收尾平滑
      const easeT = t < 0.5
        ? 4 * t * t * t  // 前半段三次方加速（更快起步）
        : 1 - Math.pow(-2 * t + 2, 3) / 2; // 后半段三次方减速

      // 贝塞尔曲线轨迹（二次）
      const x = (1-easeT)*(1-easeT)*startX + 2*(1-easeT)*easeT*controlX + easeT*easeT*endX;
      const y = (1-easeT)*(1-easeT)*startY + 2*(1-easeT)*easeT*controlY + easeT*easeT*endY;

      // 平滑缩放
      const currentScale = 1 + (targetScale - 1) * easeT;

      // 飞行中的旋转角度：0度 → 10度 → 5度（终点保持轻微倾斜）
      const rotationAngle = easeT < 0.5
        ? easeT * 2 * 10  // 前半段从0到10度
        : 10 - (easeT - 0.5) * 2 * 5; // 后半段从10度降到5度

      // 淡出效果
      const opacity = 1 - 0.05 * easeT;

      keyframes.push({
        left: `${x - 70}px`,
        top: `${y - 98}px`,
        transform: `scale(${currentScale}) rotate(${rotationAngle}deg)`,
        opacity: opacity,
        offset: t
      });
    }

    // 根据距离动态计算时长：基础400ms + 距离因子
    // 短距离（200px）约450ms，长距离（600px）约650ms
    const baseDuration = 400;
    const distanceFactor = Math.min(dist / 1000, 0.5); // 最多增加250ms
    const duration = baseDuration + distanceFactor * 500;

    // 执行动画
    console.log(`[animateDrawCardFlyFromPoint] 开始动画, 距离=${Math.round(dist)}px, 时长=${Math.round(duration)}ms`);
    const anim = flyingCard.animate(keyframes, {
      duration: duration,
      easing: "linear" // 缓动已在关键帧中手动实现
    });

    anim.onfinish = () => {
      console.log("[animateDrawCardFlyFromPoint] 动画完成，移除卡牌并调用回调");
      flyingCard.remove();
      if (onComplete) {
        console.log("[animateDrawCardFlyFromPoint] 调用 onComplete");
        onComplete();
      } else {
        console.log("[animateDrawCardFlyFromPoint] 警告：onComplete 为空");
      }
    };
  } catch (e) {
    console.error("animateDrawCardFlyFromPoint error:", e);
    if (onComplete) onComplete();
  }
}

// Animate AI discard pair: show two face-up cards flying from AI hand to discard pile
// Uses physics-based arc trajectory with overshoot and settle-back
// AI discard pair: simplified animation like player's flyToDiscard
function animateAiDiscardPair(playerIdx, card1, card2, fromRectOverride, onComplete) {
  // Handle parameter: if 4th param is function, no fromRectOverride provided
  if (typeof fromRectOverride === 'function') {
    onComplete = fromRectOverride;
    fromRectOverride = null;
  }

  console.log(`[AI出牌动画] AI${playerIdx} 开始简化出牌动画`);
  try {
    const fromHandEl = seatHandElByPlayerIndex(playerIdx);
    const discardPile = document.getElementById("discardPile");
    if (!fromHandEl || !discardPile) {
      console.log(`[AI出牌动画] 元素未找到，跳过动画`);
      if (onComplete) onComplete();
      return;
    }

    const fromRect = fromRectOverride || fromHandEl.getBoundingClientRect();
    const toRect = discardPile.getBoundingClientRect();

    // 学习玩家：在动画开始前，平滑调整剩余AI手牌位置（填补空缺）
    const aiPlayer = window.game?.players?.[playerIdx];
    if (aiPlayer) {
      const currentN = aiPlayer.hand.length; // 当前手牌数量
      const newN = currentN - 2; // 出牌后的数量（即将减2）
      const allBackCards = Array.from(fromHandEl.querySelectorAll('.miniBack'));

      // 标记手牌区域正在做自适应动画，防止 renderSeats 重新渲染
      fromHandEl.dataset.adjusting = "true";

      // 计算新的布局参数
      const newCenter = (newN - 1) / 2;

      allBackCards.forEach((backCard, k) => {
        const d = k - newCenter;
        let sx = 0;
        let sy = 0;
        let srot = 0;

        if (playerIdx === 2) {
          // Top player: 横向展开
          sx = d * 12;
          sy = d * 0.3;
          srot = 0;
        } else {
          // Left/Right: 纵向展开
          sx = d * 0.3;
          sy = d * 9;
          srot = playerIdx === 1 || playerIdx === 3 ? 90 : 0;
        }

        // 添加transition并更新位置（学习玩家的 420ms cubic-bezier）
        backCard.style.transition = "left 420ms cubic-bezier(0.22, 1, 0.36, 1), top 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1)";

        requestAnimationFrame(() => {
          backCard.style.setProperty("--sx", `${sx}px`);
          backCard.style.setProperty("--sy", `${sy}px`);
          backCard.style.setProperty("--srot", `${srot}deg`);
        });
      });

      // 等待出牌动画完成后再清除标记（520ms + 50ms buffer）
      setTimeout(() => {
        fromHandEl.dataset.adjusting = "";
      }, 570);
    }

    // Sort cards: _A to left pile, _B to right pile
    let leftCard, rightCard;
    if (card1.imgSrc && card1.imgSrc.includes("_A.")) {
      leftCard = card1;
      rightCard = card2;
    } else if (card2.imgSrc && card2.imgSrc.includes("_A.")) {
      leftCard = card2;
      rightCard = card1;
    } else {
      leftCard = card1;
      rightCard = card2;
    }

    const cards = [leftCard, rightCard];
    let completed = 0;

    // Hash function for consistent rotation angles
    function hash01(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return ((h >>> 0) % 10000) / 10000;
    }

    // Calculate z-index for each card (使用和 renderDiscardPile 完全相同的逻辑)
    const { leftZ, rightZ } = window.game ? getDiscardPileZIndex(window.game) : { leftZ: 1, rightZ: 1 };

    cards.forEach((card, index) => {
      // 飞行卡牌使用弃牌堆的基础大小（92x132），确保完美匹配
      const flyingCardWidth = 92;
      const flyingCardHeight = 132;

      // 外层容器：负责位置和移动
      const outerContainer = document.createElement("div");
      outerContainer.style.width = flyingCardWidth + "px";
      outerContainer.style.height = flyingCardHeight + "px";
      outerContainer.style.position = "fixed";
      outerContainer.style.zIndex = "10000";
      outerContainer.style.pointerEvents = "none";
      outerContainer.style.perspective = "1000px"; // 添加透视效果，让3D翻转更明显

      // 内层翻转容器：专门负责 Y 轴翻转
      const flipContainer = document.createElement("div");
      flipContainer.style.width = "100%";
      flipContainer.style.height = "100%";
      flipContainer.style.transformStyle = "preserve-3d";
      flipContainer.style.position = "relative";

      // 创建背面元素
      const backFace = document.createElement("div");
      backFace.className = "miniBack";
      backFace.style.width = flyingCardWidth + "px";
      backFace.style.height = flyingCardHeight + "px";
      backFace.style.position = "absolute";
      backFace.style.left = "0";
      backFace.style.top = "0";
      backFace.style.backfaceVisibility = "hidden";
      backFace.style.transform = "rotateY(0deg)";

      // 创建正面元素（直接填充内容，避免90度时隐身）
      const frontFace = document.createElement("div");
      frontFace.className = `faceCard ${card.type === "img" ? "imgCard" : ""}`;
      frontFace.dataset.corner = "";
      frontFace.style.width = flyingCardWidth + "px";
      frontFace.style.height = flyingCardHeight + "px";
      frontFace.style.position = "absolute";
      frontFace.style.left = "0";
      frontFace.style.top = "0";
      frontFace.style.backfaceVisibility = "hidden";
      frontFace.style.transform = "rotateY(180deg)";
      // 直接填充正面内容
      frontFace.innerHTML = `
        <div class="cardContent">
          <div class="imgWrap"><img class="cardImg" src="${escapeHtml(card.imgSrc)}" alt="card" draggable="false" /></div>
        </div>
      `;

      flipContainer.appendChild(backFace);
      flipContainer.appendChild(frontFace);
      outerContainer.appendChild(flipContainer);

      // Staggered start position
      const startOffsetX = (index - 0.5) * 40;
      const startOffsetY = index * -8;

      // 起点：手牌区域中心
      const startX = fromRect.left + fromRect.width / 2 + startOffsetX;
      const startY = fromRect.top + fromRect.height / 2 + startOffsetY;

      outerContainer.style.left = `${startX}px`;
      outerContainer.style.top = `${startY}px`;
      document.body.appendChild(outerContainer);

      // 目标位置：28% (left) / 72% (right)
      const targetXPercent = index === 0 ? 0.28 : 0.72;
      const targetX = toRect.left + toRect.width * targetXPercent;
      const targetY = toRect.top + toRect.height * 0.52;

      // 目标缩放（飞行卡牌初始大小是 92x132，缩放到弃牌堆大小）
      const discardScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-discard-pile') || "0.82");
      const scaleTarget = discardScale; // 从 92 缩放到 92*scale，直接用 scale 即可

      // 目标旋转角度（和弃牌堆一致）
      const zIndex = index === 0 ? leftZ : rightZ;
      const targetRotation = (hash01(`${card.id}|${zIndex}`) - 0.5) * 8;
      console.log(`[AI出牌] Card${index} cardId=${card.id}, targetZ=${zIndex}, rotation=${targetRotation.toFixed(2)}°`);

      // 获取 .tableBg 中心点
      const tableBg = document.querySelector('.tableBg');
      const tableBgRect = tableBg ? tableBg.getBoundingClientRect() : null;
      const centerX = tableBgRect ? tableBgRect.left + tableBgRect.width / 2 : window.innerWidth / 2;
      const centerY = tableBgRect ? tableBgRect.top + tableBgRect.height / 2 : window.innerHeight / 2;

      // 弧线控制点：围绕 .tableBg 中心
      const midX = (startX + targetX) / 2;
      const midY = (startY + targetY) / 2;
      const toCenterX = centerX - midX;
      const toCenterY = centerY - midY;

      const dist = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
      const arcHeight = Math.min(80, dist * 0.3);
      const controlX = midX + toCenterX * 0.2;
      const controlY = midY + toCenterY * 0.2 - arcHeight;

      const steps = 30;
      const outerKeyframes = []; // 外层：位置、缩放、旋转
      const flipKeyframes = [];  // 内层：Y轴翻转
      const overshootDist = dist * 0.04;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let easeT, overshoot;

        if (t <= 0.68) {
          const t1 = t / 0.68;
          easeT = 1 - Math.pow(1 - t1, 2.5);
          overshoot = 1.04;
        } else {
          const t2 = (t - 0.68) / 0.32;
          const easeT2 = t2 < 0.5 ? 4 * t2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 3) / 2;
          easeT = 1.04 - 0.04 * easeT2;
          overshoot = easeT;
        }

        // 贝塞尔曲线轨迹
        const arcT = Math.min(easeT, 1.0);
        const baseX = (1-arcT)*(1-arcT)*startX + 2*(1-arcT)*arcT*controlX + arcT*arcT*targetX;
        const baseY = (1-arcT)*(1-arcT)*startY + 2*(1-arcT)*arcT*controlY + arcT*arcT*targetY;

        const dirX = targetX - startX;
        const dirY = targetY - startY;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
        const normX = dirLen > 0 ? dirX / dirLen : 0;
        const normY = dirLen > 0 ? dirY / dirLen : 0;
        const overshootAmount = (overshoot - 1.0) * overshootDist;

        const x = baseX + normX * overshootAmount;
        const y = baseY + normY * overshootAmount;

        const currentScale = 1 + (scaleTarget - 1) * Math.min(easeT, 1.0);
        const currentRotation = targetRotation * Math.min(easeT, 1.0);

        // Y轴翻转：0° → 180°（背面翻到正面）
        const flipRotation = Math.min(easeT, 1.0) * 180;

        // 外层容器关键帧：位置、缩放、Z轴旋转
        outerKeyframes.push({
          left: `${x}px`,
          top: `${y}px`,
          transform: `translate(-50%, -50%) scale(${currentScale}) rotate(${currentRotation}deg)`,
          opacity: 1, // 保持完全不透明，避免落地时闪烁
          offset: t
        });

        // 内层容器关键帧：Y轴翻转
        flipKeyframes.push({
          transform: `rotateY(${flipRotation}deg)`,
          offset: t
        });
      }

      // 外层容器动画：位置移动
      const outerAnim = outerContainer.animate(outerKeyframes, {
        duration: 520,
        easing: "linear"
      });

      // 内层容器动画：翻转
      flipContainer.animate(flipKeyframes, {
        duration: 520,
        easing: "linear"
      });

      // 正面内容已在初始化时填充，不需要90度检测了

      outerAnim.onfinish = () => {
        // 立即移除飞行元素（renderDiscardPile 会无缝接管显示）
        outerContainer.remove();
        completed++;
        if (completed === cards.length && onComplete) {
          onComplete();
        }
      };
    });
  } catch (e) {
    console.error("❌ animateAiDiscardPair 错误:", e);
    if (onComplete) onComplete();
  }
}

// AI版本的Joker抽牌动画：从源玩家手牌飞到屏幕中间亮相，然后飞向目标AI手牌
function animateAiJokerDraw(fromPlayerIdx, toPlayerIdx, drawnCard, onComplete) {
  console.log("[AI Joker动画] 开始", { fromPlayerIdx, toPlayerIdx });
  try {
    const fromHandEl = seatHandElByPlayerIndex(fromPlayerIdx);
    const toHandEl = seatHandElByPlayerIndex(toPlayerIdx);

    if (!fromHandEl || !toHandEl) {
      console.log("[AI Joker动画] 错误：找不到手牌元素");
      if (onComplete) onComplete();
      return;
    }

    // 计算起点：使用源手牌的最后一张卡位置（z-index 最高，视觉上最前面不被遮挡）
    const allFromCards = fromHandEl.querySelectorAll('.miniBack, .faceCard');
    const topFromCard = allFromCards.length > 0 ? allFromCards[allFromCards.length - 1] : null;
    let startX, startY;

    if (topFromCard) {
      const cardRect = topFromCard.getBoundingClientRect();
      startX = cardRect.left + cardRect.width / 2;
      startY = cardRect.top + cardRect.height / 2;
    } else {
      const fromRect = fromHandEl.getBoundingClientRect();
      startX = fromRect.left + fromRect.width / 2;
      startY = fromRect.top + fromRect.height / 2;
    }

    // 屏幕中心点（亮相位置）
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // 计算终点：目标AI手牌的最后一张卡位置（z-index 最高，视觉上最前面不被遮挡）
    const toPlayer = window.game?.players?.[toPlayerIdx];
    const futureHandCount = toPlayer ? toPlayer.hand.length + 1 : 1;

    let endX, endY;
    const allToCards = toHandEl.querySelectorAll('.miniBack');
    const topCard = allToCards.length > 0 ? allToCards[allToCards.length - 1] : null;
    if (topCard) {
      const cardRect = topCard.getBoundingClientRect();
      let targetX = cardRect.left + cardRect.width / 2;
      let targetY = cardRect.top + cardRect.height / 2;

      // 向屏幕中心偏移15%的距离，让卡牌不飞得太远
      const offsetRatio = 0.15;
      const towardCenterX = (centerX - targetX) * offsetRatio;
      const towardCenterY = (centerY - targetY) * offsetRatio;

      // 额外向上偏移，避免整体偏下
      const upwardOffset = 20; // 向上偏移20px

      endX = targetX + towardCenterX;
      endY = targetY + towardCenterY - upwardOffset;
    } else {
      const toRect = toHandEl.getBoundingClientRect();
      endX = toRect.left + toRect.width / 2;
      endY = toRect.top + toRect.height / 2;
    }

    // 确定目标手牌尺寸
    let targetCardWidth, targetCardHeight;
    if (toPlayerIdx === 2) {
      const scaleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-top-card')) || 1.29;
      targetCardWidth = 52 * scaleTop;
      targetCardHeight = 72 * scaleTop;
    } else {
      const scaleSide = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-side-card')) || 1.25;
      targetCardWidth = 64 * scaleSide;
      targetCardHeight = 89 * scaleSide;
    }

    // 创建飞行的Joker卡牌（双面结构：背面+正面，支持翻转）
    // 外层容器：负责位置和缩放
    const outerContainer = document.createElement("div");
    outerContainer.style.width = "86px";
    outerContainer.style.height = "124px";
    outerContainer.style.position = "fixed";
    outerContainer.style.left = `${startX - 43}px`;
    outerContainer.style.top = `${startY - 62}px`;
    outerContainer.style.zIndex = "10010";
    outerContainer.style.pointerEvents = "none";

    // 内层翻转容器：负责Y轴翻转
    const flipContainer = document.createElement("div");
    flipContainer.style.width = "100%";
    flipContainer.style.height = "100%";
    flipContainer.style.transformStyle = "preserve-3d";
    flipContainer.style.position = "relative";

    // 背面（初始可见）
    const backFace = document.createElement("div");
    backFace.className = "miniBack";
    backFace.style.width = "100%";
    backFace.style.height = "100%";
    backFace.style.position = "absolute";
    backFace.style.left = "0";
    backFace.style.top = "0";
    backFace.style.backfaceVisibility = "hidden";
    backFace.style.transform = "rotateY(0deg)";

    // 正面（初始隐藏，90°后填充大王图案）
    const frontFace = document.createElement("div");
    frontFace.style.width = "100%";
    frontFace.style.height = "100%";
    frontFace.style.position = "absolute";
    frontFace.style.left = "0";
    frontFace.style.top = "0";
    frontFace.style.backfaceVisibility = "hidden";
    frontFace.style.transform = "rotateY(180deg)";
    // 初始显示空背景，避免完全透明
    frontFace.style.background = "rgba(255,255,255,0.1)";
    frontFace.style.border = "1px solid rgba(0,0,0,0.16)";
    frontFace.style.borderRadius = "10px";

    flipContainer.appendChild(backFace);
    flipContainer.appendChild(frontFace);
    outerContainer.appendChild(flipContainer);
    document.body.appendChild(outerContainer);

    // 创建背景遮罩（参考发牌阶段的大王卡背景变暗效果）
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.left = "0";
    backdrop.style.top = "0";
    backdrop.style.width = "100%";
    backdrop.style.height = "100%";
    backdrop.style.backgroundColor = "rgba(0,0,0,0.7)";
    backdrop.style.zIndex = "10009"; // 低于卡牌和文字
    backdrop.style.pointerEvents = "none";
    backdrop.style.opacity = "0";
    document.body.appendChild(backdrop);

    // 创建文字元素（会在亮相时显示）
    const toPlayerName = window.game?.players?.[toPlayerIdx]?.name || "";
    const nameText = document.createElement("div");
    nameText.style.position = "fixed";
    nameText.style.left = "50%";
    nameText.style.top = `${centerY + 80}px`;
    nameText.style.transform = "translateX(-50%)";
    nameText.style.zIndex = "10011";
    nameText.style.fontSize = "18px";
    nameText.style.fontWeight = "900";
    nameText.style.color = "rgba(255,255,255,0.92)";
    nameText.style.textShadow = "0 2px 12px rgba(0,0,0,0.55)";
    nameText.style.pointerEvents = "none";
    nameText.style.opacity = "0";
    nameText.textContent = `王八牌 → ${toPlayerName}`;
    document.body.appendChild(nameText);

    // 阶段1：飞到屏幕中间 + 亮相0.8s
    const dist1 = Math.sqrt(Math.pow(centerX - startX, 2) + Math.pow(centerY - startY, 2));
    const arcHeight1 = Math.min(150, dist1 * 0.3);

    const flyDuration = 300;    // 飞行时长300ms（缩短100ms）
    const showDuration = 800;   // 亮相时长800ms
    const totalDuration1 = flyDuration + showDuration; // 总共1100ms

    // 阶段1使用直接的关键帧，实现ease-out曲线
    const outerKeyframes1 = [
      // 起点
      {
        left: `${startX - 43}px`,
        top: `${startY - 62}px`,
        transform: `scale(1)`,
        opacity: 1,
        offset: 0
      },
      // 飞行终点（ease-out cubic-bezier）
      {
        left: `${centerX - 43}px`,
        top: `${centerY - 62}px`,
        transform: `scale(1.5)`,
        opacity: 1,
        offset: flyDuration / totalDuration1,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)" // ease-out
      },
      // 亮相结束（停留）
      {
        left: `${centerX - 43}px`,
        top: `${centerY - 62}px`,
        transform: `scale(1.5)`,
        opacity: 1,
        offset: 1
      }
    ];

    const flipKeyframes1 = [
      // 起点：背面
      {
        transform: `rotateY(0deg)`,
        offset: 0
      },
      // 飞行终点：正面（ease-out）
      {
        transform: `rotateY(180deg)`,
        offset: flyDuration / totalDuration1,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)" // ease-out
      },
      // 亮相结束：保持正面
      {
        transform: `rotateY(180deg)`,
        offset: 1
      }
    ];

    // 外层容器动画：位置和缩放
    const outerAnim = outerContainer.animate(outerKeyframes1, {
      duration: totalDuration1,
      easing: "linear", // 使用关键帧内的easing
      fill: "forwards"
    });

    // 内层容器动画：Y轴翻转
    const flipAnim = flipContainer.animate(flipKeyframes1, {
      duration: totalDuration1,
      easing: "linear", // 使用关键帧内的easing
      fill: "forwards"
    });

    // 监控翻转进度，在90°时填充大王正面图案
    let flipped = false;
    const checkFlip = () => {
      if (flipped || flipAnim.playState === 'finished') return;
      const currentTime = flipAnim.currentTime || 0;
      const progress = currentTime / totalDuration1; // 0.0 - 1.0

      // 简化计算：直接用进度判断
      const flipProgress = progress * (totalDuration1 / flyDuration);
      const flipRotation = Math.min(flipProgress, 1.0) * 180;

      // 当旋转到 90° 时，填充正面大王图案
      if (flipRotation >= 90 && !flipped) {
        flipped = true;
        console.log("[AI Joker翻转] 到达90°，填充大王正面图案");

        // 填充正面卡牌的样式和内容
        frontFace.className = "faceCard joker imgCard";
        frontFace.dataset.corner = "";

        // 重新设置关键的 inline style
        frontFace.style.width = "100%";
        frontFace.style.height = "100%";
        frontFace.style.position = "absolute";
        frontFace.style.left = "0";
        frontFace.style.top = "0";
        frontFace.style.backfaceVisibility = "hidden";
        frontFace.style.transform = "rotateY(180deg)";
        frontFace.style.background = ""; // 清除占位背景
        frontFace.style.border = "";
        frontFace.style.borderRadius = "";

        frontFace.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
          </div>
        `;
      } else {
        requestAnimationFrame(checkFlip);
      }
    };
    requestAnimationFrame(checkFlip);

    // 同步背景遮罩动画
    backdrop.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: flyDuration / totalDuration1 },
      { opacity: 1, offset: (flyDuration + 100) / totalDuration1 }, // 飞行结束后100ms淡入
      { opacity: 1, offset: (totalDuration1 - 100) / totalDuration1 }, // 结束前100ms开始淡出
      { opacity: 0, offset: 1 }
    ], {
      duration: totalDuration1,
      easing: "linear",
      fill: "forwards"
    });

    // 同步文字动画
    nameText.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: flyDuration / totalDuration1 },
      { opacity: 1, offset: (flyDuration + showDuration * 0.2) / totalDuration1 },
      { opacity: 1, offset: (flyDuration + showDuration * 0.8) / totalDuration1 },
      { opacity: 0, offset: 1 }
    ], {
      duration: totalDuration1,
      easing: "linear",
      fill: "forwards"
    });

    outerAnim.onfinish = () => {
      console.log("[AI Joker动画] 亮相完成，开始飞向AI手牌");
      nameText.remove();
      backdrop.remove();

      // 阶段2：从屏幕中间飞向目标AI手牌（同时翻转回背面）
      const targetScale = targetCardWidth / 86;

      // 计算目标旋转角度
      let targetRotZ = 0;
      if (toPlayerIdx === 3) targetRotZ = 90;        // 左侧AI
      else if (toPlayerIdx === 1) targetRotZ = -90;  // 右侧AI
      else if (toPlayerIdx === 2) targetRotZ = 180;  // 上方AI

      const stage2Duration = 600;

      // 外层容器：位置、缩放、Z轴旋转（使用 ease-out + 过冲效果）
      const overshootScale = targetScale * 1.08; // 8% 过冲
      const outerKeyframes2 = [
        // 起点：中心位置，放大1.5倍
        {
          left: `${centerX - 43}px`,
          top: `${centerY - 62}px`,
          transform: `scale(1.5) rotateZ(0deg)`,
          opacity: 1,
          offset: 0
        },
        // 70%：接近目标，过冲到108%
        {
          left: `${endX - 43}px`,
          top: `${endY - 62}px`,
          transform: `scale(${overshootScale}) rotateZ(${targetRotZ}deg)`,
          opacity: 0.95,
          offset: 0.70,
          easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" // ease-out
        },
        // 100%：回弹到目标尺寸
        {
          left: `${endX - 43}px`,
          top: `${endY - 62}px`,
          transform: `scale(${targetScale}) rotateZ(${targetRotZ}deg)`,
          opacity: 0.95,
          offset: 1,
          easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" // ease-out
        }
      ];

      // 内层容器：Y轴翻转（从正面180°翻回背面360°）
      const flipKeyframes2 = [
        {
          transform: `rotateY(180deg)`,
          offset: 0
        },
        {
          transform: `rotateY(360deg)`,
          offset: 1,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)" // ease-in-out
        }
      ];

      const anim2 = outerContainer.animate(outerKeyframes2, {
        duration: stage2Duration,
        easing: "linear" // 使用关键帧内的easing
      });

      // 第二阶段的翻转动画
      const flipAnim2 = flipContainer.animate(flipKeyframes2, {
        duration: stage2Duration,
        easing: "linear" // 使用关键帧内的easing
      });

      anim2.onfinish = () => {
        console.log("[AI Joker动画] 完成");
        outerContainer.remove();
        if (onComplete) onComplete();
      };
    };
  } catch (e) {
    console.error("[AI Joker动画] 错误:", e);
    if (onComplete) onComplete();
  }
}

// Joker抽牌动画：从指定坐标飞到屏幕中间亮相0.8s，然后飞向手牌
function animateJokerDrawFromPoint(startX, startY, toPlayerIdx, onComplete) {
  console.log("[Joker动画] 开始", { startX, startY, toPlayerIdx });
  try {
    const toHandEl = seatHandElByPlayerIndex(toPlayerIdx);
    if (!toHandEl) {
      console.log("[Joker动画] 错误：找不到目标手牌元素");
      if (onComplete) onComplete();
      return;
    }

    const toRect = toHandEl.getBoundingClientRect();

    // 屏幕中心点（亮相位置）
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // 终点（玩家手牌中心）
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    // 确定目标手牌尺寸
    let targetCardWidth, targetCardHeight;
    if (toPlayerIdx === 0) {
      const scalePlayer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-player-card')) || 0.85;
      targetCardWidth = 86 * scalePlayer;
      targetCardHeight = 124 * scalePlayer;
    } else if (toPlayerIdx === 2) {
      const scaleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-top-card')) || 1.29;
      targetCardWidth = 52 * scaleTop;
      targetCardHeight = 72 * scaleTop;
    } else {
      const scaleSide = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-side-card')) || 1.25;
      targetCardWidth = 64 * scaleSide;
      targetCardHeight = 89 * scaleSide;
    }

    // 创建飞行的Joker卡牌
    const flyingCard = document.createElement("div");
    flyingCard.className = "faceCard joker imgCard";
    flyingCard.style.width = "140px";
    flyingCard.style.height = "196px";
    flyingCard.style.position = "fixed";
    flyingCard.style.left = `${startX - 70}px`;
    flyingCard.style.top = `${startY - 98}px`;
    flyingCard.style.zIndex = "10010";
    flyingCard.style.pointerEvents = "none";
    flyingCard.innerHTML = `
      <div class="cardContent">
        <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
      </div>
    `;
    document.body.appendChild(flyingCard);

    // 创建文字元素（会在亮相时显示）
    const nameText = document.createElement("div");
    nameText.style.position = "fixed";
    nameText.style.left = "50%";
    nameText.style.top = `${centerY + 120}px`;
    nameText.style.transform = "translateX(-50%)";
    nameText.style.zIndex = "10011";
    nameText.style.fontSize = "18px";
    nameText.style.fontWeight = "900";
    nameText.style.color = "rgba(255,255,255,0.92)";
    nameText.style.textShadow = "0 2px 12px rgba(0,0,0,0.55)";
    nameText.style.pointerEvents = "none";
    nameText.style.opacity = "0";
    nameText.textContent = `王八牌 → ${game?.players?.[toPlayerIdx]?.name || ""}`;
    document.body.appendChild(nameText);

    // 阶段1：飞到屏幕中间 + 亮相0.8s (一个完整动画)
    // 计算到屏幕中间的距离
    const dist1 = Math.sqrt(Math.pow(centerX - startX, 2) + Math.pow(centerY - startY, 2));
    const arcHeight1 = Math.min(150, dist1 * 0.3);

    const steps1 = 40; // 更多步骤以包含亮相
    const flyDuration = 400; // 飞行时长400ms
    const showDuration = 800; // 亮相时长800ms
    const totalDuration1 = flyDuration + showDuration; // 总共1200ms

    const keyframes1 = [];
    for (let i = 0; i <= steps1; i++) {
      const t = i / steps1;
      const time = t * totalDuration1;

      let x, y, scale, textOpacity;

      if (time <= flyDuration) {
        // 飞行阶段 (0-400ms)
        const flyT = time / flyDuration;
        const easeT = 1 - Math.pow(1 - flyT, 3); // ease-out

        // 贝塞尔曲线
        const controlX = (startX + centerX) / 2;
        const controlY = (startY + centerY) / 2 - arcHeight1;
        x = (1-easeT)*(1-easeT)*startX + 2*(1-easeT)*easeT*controlX + easeT*easeT*centerX;
        y = (1-easeT)*(1-easeT)*startY + 2*(1-easeT)*easeT*controlY + easeT*easeT*centerY;

        scale = 1 + 0.3 * easeT; // 从1.0放大到1.3
        textOpacity = 0;
      } else {
        // 亮相阶段 (400-1200ms) - 停留在屏幕中间
        x = centerX;
        y = centerY;
        scale = 1.3;

        const showT = (time - flyDuration) / showDuration;
        // 文字淡入淡出
        if (showT < 0.2) {
          textOpacity = showT / 0.2; // 0-0.2: 淡入
        } else if (showT > 0.8) {
          textOpacity = (1 - showT) / 0.2; // 0.8-1.0: 淡出
        } else {
          textOpacity = 1; // 0.2-0.8: 完全显示
        }
      }

      keyframes1.push({
        left: `${x - 70}px`,
        top: `${y - 98}px`,
        transform: `scale(${scale})`,
        opacity: 1
      });
    }

    const anim1 = flyingCard.animate(keyframes1, {
      duration: totalDuration1,
      easing: "linear",
      fill: "forwards"
    });

    // 同步文字动画
    nameText.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: flyDuration / totalDuration1 },
      { opacity: 1, offset: (flyDuration + showDuration * 0.2) / totalDuration1 },
      { opacity: 1, offset: (flyDuration + showDuration * 0.8) / totalDuration1 },
      { opacity: 0, offset: 1 }
    ], {
      duration: totalDuration1,
      easing: "linear",
      fill: "forwards"
    });

    anim1.onfinish = () => {
      console.log("[Joker动画] 亮相完成，开始飞向手牌");
      nameText.remove();

      // 阶段2：从屏幕中间飞向玩家手牌
      const dist2 = Math.sqrt(Math.pow(endX - centerX, 2) + Math.pow(endY - centerY, 2));
      const arcHeight2 = Math.min(150, dist2 * 0.3);
      const controlX2 = (centerX + endX) / 2;
      const controlY2 = (centerY + endY) / 2 - arcHeight2;

      const targetScale = targetCardWidth / 140;
      const overshootDist = dist2 * 0.05;

      const steps2 = 30;
      const keyframes2 = [];

      for (let i = 0; i <= steps2; i++) {
        const t = i / steps2;
        let easeT, overshoot;

        if (t <= 0.72) {
          const t1 = t / 0.72;
          easeT = 1 - Math.pow(1 - t1, 3);
          overshoot = 1.05;
        } else {
          const t2 = (t - 0.72) / 0.28;
          const easeT2 = t2 < 0.5 ? 4 * t2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 3) / 2;
          easeT = 1.05 - 0.05 * easeT2;
          overshoot = easeT;
        }

        const baseX = (1-easeT)*(1-easeT)*centerX + 2*(1-easeT)*easeT*controlX2 + easeT*easeT*endX;
        const baseY = (1-easeT)*(1-easeT)*centerY + 2*(1-easeT)*easeT*controlY2 + easeT*easeT*endY;

        const dirX = endX - centerX;
        const dirY = endY - centerY;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
        const normX = dirLen > 0 ? dirX / dirLen : 0;
        const normY = dirLen > 0 ? dirY / dirLen : 0;

        const overshootAmount = (overshoot - 1.0) * overshootDist;
        const x = baseX + normX * overshootAmount;
        const y = baseY + normY * overshootAmount;

        const scale = 1.3 + (targetScale - 1.3) * Math.min(easeT, 1.0);

        keyframes2.push({
          left: `${x - 70}px`,
          top: `${y - 98}px`,
          transform: `scale(${scale})`,
          opacity: 1 - 0.1 * Math.min(easeT, 1.0)
        });
      }

      const anim2 = flyingCard.animate(keyframes2, {
        duration: 600,
        easing: "linear"
      });

      anim2.onfinish = () => {
        console.log("[Joker动画] 完成");
        flyingCard.remove();
        if (onComplete) onComplete();
      };
    };
  } catch (e) {
    console.error("[Joker动画] 错误:", e);
    if (onComplete) onComplete();
  }
}

// 简洁的飞行函数：从.tableBg中心飞向玩家手牌，90度时替换图片
function flyJokerToPlayerSimple(game, playerIndex, onComplete) {
  try {
    const handEl = seatHandElByPlayerIndex(playerIndex);
    const player = game.players[playerIndex];
    const numCards = player ? player.hand.length + 1 : 1;

    // 获取目标卡牌尺寸
    let cardWidth, cardHeight;
    if (playerIndex === 0) {
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-player-card')) || 1;
      cardWidth = 86 * s;
      cardHeight = 124 * s;
    } else if (playerIndex === 2) {
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-top-card')) || 1;
      cardWidth = 52 * s;
      cardHeight = 72 * s;
    } else {
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-side-card')) || 1;
      cardWidth = 64 * s;
      cardHeight = 89 * s;
    }

    // 计算目标位置
    const handRect = handEl.getBoundingClientRect();
    let targetX, targetY;
    if (playerIndex === 0) {
      const center = (numCards - 1) / 2;
      const spread = Math.min(62, 920 / Math.max(1, numCards - 1));
      const d = numCards - 1 - center;
      targetX = handRect.left + handRect.width / 2 + d * spread;
      targetY = handRect.top + 18 + cardHeight / 2 + Math.abs(d) * 0.8;
    } else {
      const center = (numCards - 1) / 2;
      const d = numCards - 1 - center;
      if (playerIndex === 2) {
        targetX = handRect.left + handRect.width / 2 + d * 12;
        targetY = handRect.top + handRect.height / 2 + d * 0.3;
      } else {
        targetX = handRect.left + handRect.width / 2 + d * 0.3;
        targetY = handRect.top + handRect.height / 2 + d * 9;
      }
    }

    // 获取.tableBg中心作为起点
    const tableBg = document.querySelector('.tableBg');
    const tbr = tableBg ? tableBg.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const startX = tbr.left + tbr.width / 2;
    const startY = tbr.top + tbr.height / 2;

    // 创建飞行卡牌
    const card = document.createElement('div');
    card.style.cssText = `position:fixed;left:${startX-43}px;top:${startY-62}px;width:86px;height:124px;z-index:10060;border:1px solid rgba(0,0,0,0.22);border-radius:16px;overflow:hidden;background:white;`;
    card.innerHTML = `<img id="jImg" style="width:100%;height:100%;object-fit:contain" src="./assets/joker.png">`;
    document.body.appendChild(card);

    const img = card.querySelector('#jImg');
    const targetScale = cardWidth / 86;
    let rotZ = 0;
    if (playerIndex === 1) rotZ = -90;
    else if (playerIndex === 2) rotZ = 180;
    else if (playerIndex === 3) rotZ = 90;

    const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
    const arc = Math.min(200, dist * 0.4);
    const cx = (startX + targetX) / 2;
    let cy = (startY + targetY) / 2;
    if (playerIndex === 0) cy -= arc;
    else if (playerIndex === 2) cy -= arc * 0.5;
    else cy += arc * 0.3;

    const kf = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const et = 1 - (1 - t) ** 3;
      const x = (1 - et) ** 2 * startX + 2 * (1 - et) * et * cx + et ** 2 * targetX;
      const y = (1 - et) ** 2 * startY + 2 * (1 - et) * et * cy + et ** 2 * targetY;
      const sc = 1 + (targetScale - 1) * et;
      const rz = rotZ * et;
      let ry = 0;
      if (playerIndex !== 0 && et > 0.30) {
        ry = ((et - 0.30) / 0.70) * 180;
      }
      kf.push({ left: `${x - 43}px`, top: `${y - 62}px`, transform: `scale(${sc}) rotateZ(${rz}deg) rotateY(${ry}deg)`, opacity: 1 });
    }

    const an = card.animate(kf, { duration: 560, easing: 'linear', fill: 'forwards' });

    // AI: 90度时替换图片
    if (playerIndex !== 0 && img) {
      let flipped = false;
      const check = () => {
        if (flipped || an.playState === 'finished') return;
        const ct = an.currentTime || 0;
        const p = ct / 560;
        const et = 1 - (1 - p) ** 3;
        let ry = 0;
        if (et > 0.30) ry = ((et - 0.30) / 0.70) * 180;
        if (ry >= 90) {
          flipped = true;
          img.src = './assets/card-back.png';
          card.style.background = '#2b4a2d';
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    }

    an.onfinish = () => {
      card.remove();
      if (onComplete) onComplete();
    };
  } catch (e) {
    console.error('flyJokerToPlayerSimple error:', e);
    if (onComplete) onComplete();
  }
}

// 显示回合开始面板弹窗
function showRoundStartPanel(onClickCallback) {
  // 清除已有的弹窗
  const prev = document.querySelector(".roundStartOverlay");
  if (prev) prev.remove();

  // 延迟0.3秒后显示弹窗
  setTimeout(() => {
    // 创建弹窗
    const overlay = document.createElement("div");
    overlay.className = "roundStartOverlay";
    overlay.innerHTML = `
      <div class="roundStartPanel">
        <img src="./assets/ui_buttons/round-start-panel.png" alt="回合开始" />
      </div>
    `;
    document.body.appendChild(overlay);

    // 点击弹窗任意位置触发淡出动画
    overlay.addEventListener("click", () => {
      // 移除点击事件，防止重复触发
      overlay.style.pointerEvents = 'none';

      // 淡出面板图片（只移除图片，保持黑屏）
      const panel = overlay.querySelector(".roundStartPanel");
      if (panel) {
        panel.style.transition = 'opacity 0.5s ease-out';
        panel.style.opacity = '0';
      }

      // 0.5秒后移除面板并触发乌龟牌动画（保持overlay黑屏）
      setTimeout(() => {
        // 只移除面板，保留overlay作为乌龟牌的黑屏背景
        if (panel && panel.parentNode) {
          panel.remove();
        }
        // 传递overlay给回调，让乌龟牌动画复用这个黑屏
        if (onClickCallback) onClickCallback(overlay);
      }, 500);
    });
  }, 300);
}

function showJokerRevealAndFly(game, playerIndex, onComplete) {
  // 先显示回合开始面板，点击后再执行乌龟牌动画
  showRoundStartPanel((sharedOverlay) => {
    // 🎨 使用粒子凝聚特效（如果可用）
    if (window.JokerSummon && typeof window.JokerSummon.createSummonEffect === 'function') {
      const summonEffect = window.JokerSummon.createSummonEffect({
        jokerImageUrl: './assets/joker.png',
        duration: 1.2, // 缩短到1.2秒（扭曲在60%后就停止了）
        sharedContainer: sharedOverlay, // 传递共享黑屏容器
        onComplete: () => {
          summonEffect.destroy();
          // 移除共享的黑屏背景
          if (sharedOverlay && sharedOverlay.parentNode) {
            sharedOverlay.remove();
          }
          flyJokerToPlayerSimple(game, playerIndex, onComplete); // 立即开始飞行
        }
      });
      setTimeout(() => summonEffect.play(), 100);
      return;
    }

    // 如果没有粒子效果，继续执行fallback动画（传递共享overlay）
    executeFallbackJokerReveal(game, playerIndex, onComplete, sharedOverlay);
  });
}

// 将原来的fallback逻辑提取为独立函数
function executeFallbackJokerReveal(game, playerIndex, onComplete, sharedOverlay) {

  // 如果有共享的黑屏背景，复用它；否则创建新的
  let wrap = sharedOverlay;
  if (!wrap) {
    const prev = document.querySelector(".jokerRevealOverlay");
    if (prev) prev.remove();

    wrap = document.createElement("div");
    wrap.className = "jokerRevealOverlay";
    document.body.appendChild(wrap);
  }

  // 添加乌龟牌内容到黑屏上
  const name = game?.players?.[playerIndex]?.name || "";
  wrap.innerHTML = `
    <div class="jokerRevealInner">
      <div class="revealStage">
        <div class="revealCard joker imgCard" data-corner="">
          <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" /></div>
        </div>
      </div>
      <div class="revealTo">王八牌 → ${escapeHtml(name)}</div>
    </div>
  `;

  const revealEl = wrap.querySelector(".revealCard");
  if (!revealEl) {
    wrap.remove();
    if (onComplete) onComplete();
    return;
  }

  window.clearTimeout(showJokerRevealAndFly._t);
  showJokerRevealAndFly._t = window.setTimeout(() => {
    try {
      const from = revealEl.getBoundingClientRect();
      const handEl = seatHandElByPlayerIndex(playerIndex);
      const handRect = handEl.getBoundingClientRect();

      // Calculate target position: rightmost card position AFTER joker is added
      const player = game.players[playerIndex];
      const numCards = player ? player.hand.length + 1 : 1; // +1 for joker being added
      let targetX, targetY;

      // Get actual card size first (needed for position calculation)
      let cardWidth, cardHeight;
      if (playerIndex === 0) {
        const scalePlayer = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-player-card')) || 1;
        cardWidth = 86 * scalePlayer;
        cardHeight = 124 * scalePlayer;
      } else if (playerIndex === 2) {
        const scaleTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-top-card')) || 1;
        cardWidth = 52 * scaleTop;
        cardHeight = 72 * scaleTop;
      } else {
        const scaleSide = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale-ai-side-card')) || 1;
        cardWidth = 64 * scaleSide;
        cardHeight = 89 * scaleSide;
      }

      if (playerIndex === 0) {
        // Bottom player: calculate rightmost card position in fan layout (AFTER joker added)
        const center = (numCards - 1) / 2;
        const maxFanWidth = 920;
        const spread = Math.min(62, maxFanWidth / Math.max(1, numCards - 1));
        const rightmostIdx = numCards - 1;
        const rightmostD = rightmostIdx - center;
        // faceCard positioning: left: 50%, top: 18px, transform: translateX(-50%) translateX(var(--x)) translateY(var(--y))
        // So actual center X = handRect.left + handRect.width/2 + --x
        // Actual center Y = handRect.top + 18 + cardHeight/2 + --y
        const xOffset = rightmostD * spread;
        const yOffset = Math.abs(rightmostD) * 0.8;
        targetX = handRect.left + handRect.width / 2 + xOffset;
        targetY = handRect.top + 18 + cardHeight / 2 + yOffset;
      } else {
        // AI players: calculate tail position in their pile (AFTER joker added)
        const center = (numCards - 1) / 2;
        const tailIdx = numCards - 1;
        const tailD = tailIdx - center;

        if (playerIndex === 2) {
          // Top player: pile spreads left, tail is at left side (positive sx)
          const tailSx = tailD * 12;
          const tailSy = tailD * 0.3;
          targetX = handRect.left + handRect.width / 2 + tailSx;
          targetY = handRect.top + handRect.height / 2 + tailSy;
        } else {
          // Left/right players: pile spreads downward, tail is at bottom
          const tailSx = tailD * 0.3;
          const tailSy = tailD * 9;
          targetX = handRect.left + handRect.width / 2 + tailSx;
          targetY = handRect.top + handRect.height / 2 + tailSy;
        }
      }

      // Build target rect: targetX/targetY are CENTER positions
      // Convert to left/top (top-left corner) for the to object
      const to = {
        left: targetX - cardWidth / 2,
        top: targetY - cardHeight / 2,
        width: cardWidth,
        height: cardHeight
      };

      console.log(`[Joker] Player ${playerIndex}, numCards: ${numCards}, targetX: ${targetX}, targetY: ${targetY}, cardWidth: ${cardWidth}`);

      // 不克隆，直接使用原始卡牌元素
      // 从 wrap 中分离 revealEl（避免 wrap.remove() 时一起删除）
      revealEl.remove();
      flyFromRectToRect(from, to, revealEl, playerIndex, onComplete);
      wrap.remove();
    } catch {
      // ignore
      if (onComplete) onComplete();
    }
  }, 720);
}

function showDrawRevealAndFly(game, drawnCard, playerIndex) {
  const msg = $("#message");
  msg.classList.add("revealOnly");

  if (drawnCard.type === "joker") {
    const name = game?.players?.[playerIndex]?.name || "";
    msg.innerHTML = `
      <div class="revealStage">
        <div class="revealCard joker imgCard" data-corner="">
          <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" /></div>
        </div>
      </div>
      <div class="revealTo">王八牌 → ${escapeHtml(name)}</div>
    `;
  } else {
    msg.innerHTML = `
      <div class="revealStage">
        <div class="revealCard" data-corner="">
          <div class="imgWrap"><img class="cardImg" src="${escapeHtml(drawnCard.imgSrc)}" alt="card" /></div>
        </div>
      </div>
    `;
  }

  const revealEl = msg.querySelector(".revealCard");
  if (!revealEl) return;
  // no suit coloring in image mode

  // Fly to the drawer's hand area after a short reveal.
  window.clearTimeout(showDrawRevealAndFly._t);
  showDrawRevealAndFly._t = window.setTimeout(() => {
    try {
      const from = revealEl.getBoundingClientRect();
      const handEl = seatHandElByPlayerIndex(playerIndex);
      const to = handEl.getBoundingClientRect();

      // 不克隆，直接使用原始卡牌元素
      // 从 msg 中分离出来（避免 msg.innerHTML = "" 时一起清除）
      revealEl.remove();

      // 清除消息区域的其他内容
      msg.innerHTML = "";
      msg.classList.remove("revealOnly");

      // 飞行动画
      flyFromRectToRect(from, to, revealEl);
    } catch {
      // ignore
      msg.innerHTML = "";
      msg.classList.remove("revealOnly");
    }
  }, 650);
}

function renderAction(game, settings) {
  const choiceRow = $("#choiceRow");
  const btnTryMatch = $("#btnTryMatch");
  const btnClearSelect = $("#btnClearSelect");
  const btnEndTurn = $("#btnEndTurn");

  if (game.gameOver) {
    choiceRow.classList.add("hidden");
    btnEndTurn.disabled = true;
    return;
  }

  const current = game.players[game.currentPlayerIndex];
  const targetIdx = window.Game.getUpstreamPlayerIndex(game);

  // Choice UI
  const isHumanTurn = current.kind === "human";
  choiceRow.classList.toggle("hidden", !isHumanTurn);
  btnTryMatch.disabled = true;
  btnClearSelect.disabled = true;

  // End turn gating: must draw once before ending
  const canDrawUpstream = window.Game.canDrawFrom(game, targetIdx);
  // 规则：通常需要先抽牌再结束；但如果上家没牌可抽，则允许直接结束避免卡死
  btnEndTurn.disabled = !isHumanTurn || (!game.turnHasDrawn && canDrawUpstream);
}

function showLastEvent(game, settings) {
  const msg = $("#message");
  const ev = game.lastEvent;
  if (!ev) {
    msg.innerHTML = "";
    msg.classList.remove("revealOnly");
    return;
  }

  if (ev.type === "joker_deal") {
    // 发牌结束后：王八牌亮相（屏幕居中），然后飞到指定玩家手牌
    msg.innerHTML = "";
    msg.classList.remove("revealOnly");
    showJokerRevealAndFly(game, Math.max(0, ev.playerIndex || 0));
  } else if (ev.type === "draw") {
    // Draw animations are now handled inline during the draw action (with flying card)
    // Only clear the message area here
    msg.innerHTML = "";
    msg.classList.remove("revealOnly");
  } else if (ev.type === "discard_pair") {
    // no text / no TTS
  } else if (ev.type === "mismatch") {
    // No text提示
    msg.innerHTML = "";
  } else {
    msg.innerHTML = "";
  }
}

function renderAll(game, settings) {
  renderSeats(game);
  renderDiscardPile(game);
  renderAction(game, settings);
  showLastEvent(game, settings);
}

function runAiLoop(game, settings) {
  if (!game || game.gameOver) return;

  // 🆕 死循环检测：如果所有玩家都出局但游戏未结束，强制结束
  const allOut = game.players.every(p => p.out);
  if (allOut) {
    console.log('[死循环检测] 所有玩家都已出局，强制结束游戏');
    game.gameOver = true;
    const loser = window.Game.findJokerHolder(game.players);
    game.winnerText = loser
      ? `游戏结束：${loser.name} 手里留着"王八牌"，失败！`
      : "游戏结束";
    renderAll(game, settings);
    return;
  }

  const current = game.players[game.currentPlayerIndex];
  if (!current) return;
  // If somehow we landed on an "out" player, immediately advance until we reach an active one.
  if (current.out) {
    window.Game.advanceTurn(game);
    renderAll(game, settings);
    return runAiLoop(game, settings);
  }
  if (current.kind !== "ai") return;

  // 玩家出局后加速AI对局
  const humanPlayer = game.players.find(p => p.kind === "human");
  const speedUpAi = humanPlayer && humanPlayer.out;
  const basePace = speedUpAi ? 200 : settings.aiPaceMs;

  // 🆕 回合开始时先检查是否有配对，如果有则先出牌再抽牌
  const initialPair = window.Game.findAnyPairInHand(current.hand);
  if (initialPair && !game.turnHasDrawn) {
    console.log(`[AI回合开始] AI${game.currentPlayerIndex} 发现初始配对，先出牌`);

    // 延迟后开始出牌（给AI一个"思考"的时间）- 减半版
    const initialThinkingDelay = speedUpAi ? 200 : (300 + Math.random() * 200);  // 0.3-0.5s

    window.clearTimeout(runAiLoop._t);
    runAiLoop._t = window.setTimeout(() => {
      // 递归出牌直到没有配对
      const discardAllInitialPairs = () => {
        const pair = window.Game.findAnyPairInHand(current.hand);
        if (!pair) {
          // 没有配对了，继续正常抽牌流程
          console.log(`[AI回合开始] AI${game.currentPlayerIndex} 配对完成，开始抽牌`);
          proceedToDrawPhase();
          return;
        }

        // 出牌动画：先启动动画，完成后才移除手牌
        const aiIdx = game.currentPlayerIndex;
        animateAiDiscardPair(aiIdx, pair[0], pair[1], () => {
          // 动画完成后才移除手牌
          window.Game.tryDiscardPairByCardIds(game, aiIdx, pair[0].id, pair[1].id);

          // 立即渲染弃牌堆（无缝衔接飞行动画）
          renderDiscardPile(game);

          // 延迟渲染手牌，等待手牌调整动画完成（避免突然跳变）
          setTimeout(() => {
            renderSeats(game);
            renderAction(game, settings);
            showLastEvent(game, settings);

            // 检查是否出局
            if (current.out || game.gameOver) {
              window.Game.advanceTurn(game);
              renderAll(game, settings);
              runAiLoop(game, settings);
              return;
            }

            // 等待后继续出下一对 - 减半版
            const thinkingDelay = speedUpAi ? 150 : (400 + Math.random() * 200);  // 0.4-0.6s
            window.setTimeout(discardAllInitialPairs, thinkingDelay);
          }, 100); // 延迟 100ms，确保 adjusting 标记还在
        });
      };

      discardAllInitialPairs();
    }, initialThinkingDelay);
    return;
  }

  // 正常抽牌流程
  function proceedToDrawPhase() {
    console.log(`[AI抽牌流程] proceedToDrawPhase 被调用, 当前玩家: AI${game.currentPlayerIndex}`);
    // AI：从上家抽一张（使用智能抽牌逻辑）
    const targetIdx = window.Game.getUpstreamPlayerIndex(game);
    const target = game.players[targetIdx];
    console.log(`[AI抽牌流程] 上家索引: ${targetIdx}, 上家手牌数: ${target ? target.hand.length : 0}`);
    if (!target || target.out || target.hand.length === 0) {
      console.log(`[AI抽牌流程] 上家无牌，跳过抽牌`);
      window.Game.advanceTurn(game);
      renderAll(game, settings);
      return runAiLoop(game, settings);
    }

    // 计算AI抽牌延迟（根据手牌数量增加紧张感）
    const aiDrawDelay = speedUpAi ? 200 : window.Game.getAiDrawDelay(game, game.currentPlayerIndex);
    console.log(`[AI抽牌流程] 延迟 ${aiDrawDelay}ms 后开始抽牌`);

    window.clearTimeout(runAiLoop._t);
    runAiLoop._t = window.setTimeout(() => {
      try {
        // 使用智能抽牌索引（第三把会优先抽JOKER）
        const idx = window.Game.getAiDrawIndex(game, game.currentPlayerIndex, targetIdx);

        // 检查是否有有效的牌可抽
        if (idx < 0 || !target.hand[idx]) {
          console.log(`[AI抽牌流程] 无效索引或无牌，跳过抽牌`);
          window.Game.advanceTurn(game);
          renderAll(game, settings);
          return runAiLoop(game, settings);
        }

        const drawnCard = target.hand[idx];
        const isJoker = drawnCard.type === "joker";
        const currentIdx = game.currentPlayerIndex;
        console.log(`[AI抽牌流程] 准备抽第${idx}张牌, isJoker: ${isJoker}`, drawnCard);

        if (isJoker) {
          console.log(`[AI抽牌流程] 抽到JOKER，使用AI专属亮相动画`);
          // AI抽到Joker：使用AI专属的亮相动画（飞到屏幕中心亮相 + 飞向AI手牌）
          animateAiJokerDraw(targetIdx, currentIdx, drawnCard, () => {
            // After animation, execute the draw
            // 🚨 修复：动画后重新查找卡牌索引，因为手牌可能已变化
            const actualIdx = target.hand.findIndex(c => c.id === drawnCard.id);
            if (actualIdx >= 0) {
              window.Game.drawCard(game, targetIdx, actualIdx);
              renderAll(game, settings);
              continueAiTurnAfterDraw();
            } else {
              console.error(`[AI抽牌] 动画后找不到卡牌 ${drawnCard.id}`);
            }
          });
        } else {
          console.log(`[AI抽牌流程] 普通卡牌，调用 animateDrawCardFly`);
          // Normal card: fly directly to AI hand
          animateDrawCardFly(targetIdx, currentIdx, drawnCard, () => {
            // After animation, execute the draw
            // 🚨 修复：动画后重新查找卡牌索引，因为手牌可能已变化
            const actualIdx = target.hand.findIndex(c => c.id === drawnCard.id);
            if (actualIdx >= 0) {
              window.Game.drawCard(game, targetIdx, actualIdx);
              renderAll(game, settings);
              continueAiTurnAfterDraw();
            } else {
              console.error(`[AI抽牌] 动画后找不到卡牌 ${drawnCard.id}`);
            }
          });
        }

        function continueAiTurnAfterDraw() {
          window.setTimeout(() => {
            try {
              // AI auto-discard all pairs it can find (with animations)
              const discardNextPair = () => {
                if (game.gameOver) {
                  // Game ended, just run next loop
                  renderAll(game, settings);
                  runAiLoop(game, settings);
                  return;
                }

                const currentPlayer = game.players[game.currentPlayerIndex];
                const pair = window.Game.findAnyPairInHand(currentPlayer.hand);
                if (!pair) {
                  // No more pairs, advance turn
                  console.log(`[AI回合] ${currentPlayer.name} 抽牌后无配对，无进展回合数: ${game.noProgressTurns || 0}`);

                  // 🔄 主动检测：如果即将触发死循环检测，先渲染一次让 renderSeats 检查
                  if ((game.noProgressTurns || 0) >= 6) {
                    console.log(`   接近死循环阈值，先渲染检查...`);
                    renderAll(game, settings);
                  }

                  if (!game.gameOver) window.Game.advanceTurn(game);
                  renderAll(game, settings);
                  runAiLoop(game, settings);
                  return;
                }

                // Animate discard, then execute and continue
                const aiIdx = game.currentPlayerIndex;
                animateAiDiscardPair(aiIdx, pair[0], pair[1], () => {
                  // 动画完成后才移除手牌
                  window.Game.tryDiscardPairByCardIds(
                    game,
                    aiIdx,
                    pair[0].id,
                    pair[1].id
                  );

                  // 立即渲染弃牌堆（无缝衔接飞行动画）
                  renderDiscardPile(game);

                  // 延迟渲染手牌，等待手牌调整动画完成
                  setTimeout(() => {
                    renderSeats(game);
                    renderAction(game, settings);
                    showLastEvent(game, settings);

                    // Wait a bit before next pair - 减半版
                    const thinkingDelay = 400 + Math.random() * 200;  // 0.4-0.6s
                    window.setTimeout(discardNextPair, thinkingDelay);
                  }, 100);
                });
              };

              discardNextPair();
            } catch {
              // ignore
            }
          }, isJoker ? Math.max(basePace, 1200) : basePace);
        }
      } catch {
        // ignore
      }
    }, aiDrawDelay); // 使用动态计算的延迟时间
  }

  // 如果没有初始配对，直接进入抽牌阶段
  proceedToDrawPhase();
}

function initUi(imagePairs = []) {
  // 初始化全局游戏追踪器（从 localStorage 恢复）
  if (!window.__GAME_ROUND_TRACKER__) {
    try {
      const saved = localStorage.getItem("gameRoundTracker");
      if (saved) {
        window.__GAME_ROUND_TRACKER__ = JSON.parse(saved);
        console.log(`[关卡系统] 从localStorage恢复:`, window.__GAME_ROUND_TRACKER__);
      } else {
        window.__GAME_ROUND_TRACKER__ = {
          currentLevel: 1,
          roundNumber: 0,
        };
        console.log(`[关卡系统] 初始化为第1关`);
      }
    } catch {
      window.__GAME_ROUND_TRACKER__ = {
        currentLevel: 1,
        roundNumber: 0,
      };
    }
  }

  const settings = {
    showBothOnDraw: true,
    autoAdvanceMs: 0,
    aiPaceMs: 325,  // 减半: 650 → 325
  };

  const autoNextToggle = $("#autoNextToggle");
  const pairCountInput = $("#pairCount");
  const pairCountNum = $("#pairCountNum");
  const pairCountLabel = $("#pairCountLabel");
  const totalCardLabel = $("#totalCardLabel");
  const btnStart = $("#btnStart");
  const btnRestart = $("#btnRestart");
  const btnTryMatch = $("#btnTryMatch");
  const btnClearSelect = $("#btnClearSelect");
  const btnEndTurn = $("#btnEndTurn");
  const btnHintImg = $("#btnHintImg");
  const btnMatchImg = $("#btnMatchImg");
  const btnEndTurnImg = $("#btnEndTurnImg");
  const endOverlay = $("#endOverlay");
  const endTitle = $("#endTitle");
  const endSubtitle = $("#endSubtitle");
  const btnPlayAgain = $("#btnPlayAgain");
  const btnBackToSetup = $("#btnBackToSetup");
  const btnTune = $("#btnTune");
  const tunerPanel = $("#tunerPanel");
  const btnTuneClose = $("#btnTuneClose");
  const btnTuneReset = $("#btnTuneReset");
  const btnTuneImport = $("#btnTuneImport");
  const btnTuneCopy = $("#btnTuneCopy");
  const tunerControls = $("#tunerControls");
  const drawOverlay = $("#drawOverlay");
  const drawRow = $("#drawRow");
  const btnDrawClose = $("#btnDrawClose");
  const drawOverlayInner = drawOverlay.querySelector(".drawOverlayInner");
  const drawScroll = $("#drawScroll");
  const drawThumb = $("#drawThumb");
  // Hook for scrollbar recalculation (assigned in the scroll-sync IIFE below).
  let recalcDrawScrollSoon = null;
  // Draw overlay scrollbar: thumb appears as full bar then shrinks along the card "spread" timeline.
  let drawThumbAnimRaf = null;
  let drawThumbFinalWPercent = 100;

  let game = null;
  let selected = [];
  let lastHumanActionAt = 0;
  let hintT = null;
  let hintHandT = null; // 提示手定时器
  let lastTurnPlayerId = null;
  let isDealing = false;
  let suppressHandClickUntil = 0;

  function advancePastOutPlayers() {
    if (!game || game.gameOver) return;
    // If the current player is out, immediately advance until reaching an active one.
    let guard = 0;
    while (!game.gameOver && game.players[game.currentPlayerIndex]?.out && guard++ < 10) {
      window.Game.advanceTurn(game);
    }
  }

  const HINT_MS = 3000;
  const HINT_HAND_MS = 3000; // 呼吸动画出现后再等3秒显示提示手
  const LAYOUT_KEY = "oldmaid_layout_v1";

  const DEFAULT_LAYOUT = {
    top: { left: 32.6, top: -2.8, width: 34.5, height: 8 },
    left: { left: -2.2, top: 37.2, width: 15, height: 8 },
    right: { left: 74.1, top: 37.2, width: 41, height: 8 },
    bottom: { left: 19.7, top: 61.6, width: 62, height: 25 },
    center: { left: 30.5, top: 22.2, width: 40, height: 20 },
    buttons: {
      hint: { x: 0, y: 14 },
      match: { x: 3, y: 14 },
      endturn: { x: 6, y: 14 },
    },
    scales: {
      playerCard: 0.85,
      aiTopCard: 1.29,
      aiSideCard: 1.25,
      uiButtons: 0.84,
      discardPile: 0.82,
    },
    handCount: {
      top: { x: 86, y: 65, textX: 62, textY: 0 },
      left: { x: 40, y: -99, textX: 63, textY: -7 },
      right: { x: -170, y: -104, textX: 62, textY: -8 },
      bottom: { x: 18, y: -11, textX: 62, textY: 0 },
      scaleX: 0.73,
      scaleY: 1.29,
      textScaleX: 1.12,
      textScaleY: 0.84,
      textOffsetY: -3,
      x: 27,
      y: 27,
    },
    zoneName: {
      top: { x: -64, y: 59 },
      left: { x: 17, y: -100 },
      right: { x: 67, y: -88 },
      bottom: { x: -12, y: 19 },
    },
  };

  function getZones() {
    return {
      top: document.querySelector(".zone-top"),
      left: document.querySelector(".zone-left"),
      right: document.querySelector(".zone-right"),
      bottom: document.querySelector(".zone-bottom"),
      center: document.querySelector(".zone-center"),
    };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function clampToStep(n, min, max, step) {
    const clamped = clamp(n, min, max);
    const stepped = Math.round(clamped / step) * step;
    // Avoid floating point noise for 0.5 steps etc.
    return Number(stepped.toFixed(3));
  }

  function parseMaybeDecimal(raw) {
    if (raw == null) return NaN;
    const s = String(raw).trim().replace(",", ".");
    // Keep only first valid numeric token
    const m = s.match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function loadLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      const clone = (o) => JSON.parse(JSON.stringify(o));
      if (!raw) return clone(DEFAULT_LAYOUT);
      const parsed = JSON.parse(raw);
      // Deep-merge for buttons and cardSizes
      const merged = { ...clone(DEFAULT_LAYOUT), ...parsed };
      merged.buttons = { ...clone(DEFAULT_LAYOUT).buttons, ...(parsed.buttons || {}) };
      merged.buttons.hint = { x: 0, y: 0, ...(merged.buttons.hint || {}) };
      merged.buttons.match = { x: 0, y: 0, ...(merged.buttons.match || {}) };
      merged.buttons.endturn = { x: 0, y: 0, ...(merged.buttons.endturn || {}) };
      merged.scales = { ...clone(DEFAULT_LAYOUT).scales, ...(parsed.scales || {}) };
      merged.handCount = { ...clone(DEFAULT_LAYOUT).handCount, ...(parsed.handCount || {}) };
      merged.handCount.top = { x: 0, y: 0, ...(merged.handCount.top || {}) };
      merged.handCount.left = { x: 0, y: 0, ...(merged.handCount.left || {}) };
      merged.handCount.right = { x: 0, y: 0, ...(merged.handCount.right || {}) };
      merged.handCount.bottom = { x: 0, y: 0, ...(merged.handCount.bottom || {}) };
      return merged;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    }
  }

  function saveLayout(layout) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // ignore
    }
  }

  function applyLayout(layout) {
    const zones = getZones();
    for (const key of Object.keys(zones)) {
      const el = zones[key];
      const v = layout[key];
      if (!el || !v) continue;
      const left = clamp(Number(v.left), -10, 95);
      const top = clamp(Number(v.top), -10, 95);
      const width = clamp(Number(v.width), 8, 95);
      const height = clamp(Number(v.height), 8, 80);
      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      el.style.width = `${width}%`;
      el.style.height = `${height}%`;
    }

    // Button offsets
    const btns = layout.buttons || {};
    const applyBtn = (el, cfg) => {
      if (!el || !cfg) return;
      const x = clamp(Number(cfg.x), -260, 260);
      const y = clamp(Number(cfg.y), -180, 180);
      el.style.setProperty("--btnX", `${x}px`);
      el.style.setProperty("--btnY", `${y}px`);
    };
    applyBtn(btnHintImg, btns.hint);
    applyBtn(btnMatchImg, btns.match);
    applyBtn(btnEndTurnImg, btns.endturn);

    // Apply scales
    const scales = layout.scales || {};
    document.documentElement.style.setProperty("--scale-player-card", String(clamp(scales.playerCard || 1.0, 0.5, 2.0)));
    document.documentElement.style.setProperty("--scale-ai-top-card", String(clamp(scales.aiTopCard || 1.0, 0.5, 2.0)));
    document.documentElement.style.setProperty("--scale-ai-side-card", String(clamp(scales.aiSideCard || 1.0, 0.5, 2.0)));
    document.documentElement.style.setProperty("--scale-ui-buttons", String(clamp(scales.uiButtons || 1.0, 0.5, 2.0)));
    document.documentElement.style.setProperty("--scale-discard-pile", String(clamp(scales.discardPile || 1.0, 0.5, 2.0)));

    // Apply hand count position and scale (per zone)
    const hc = layout.handCount || {};
    // Top zone
    document.documentElement.style.setProperty("--hand-count-top-x", `${clamp((hc.top?.x || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-top-y", `${clamp((hc.top?.y || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-top-text-x", `${clamp((hc.top?.textX || 62), 40, 80)}px`);
    document.documentElement.style.setProperty("--hand-count-top-text-y", `${clamp((hc.top?.textY || 0), -20, 20)}px`);
    // Left zone
    document.documentElement.style.setProperty("--hand-count-left-x", `${clamp((hc.left?.x || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-left-y", `${clamp((hc.left?.y || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-left-text-x", `${clamp((hc.left?.textX || 62), 40, 80)}px`);
    document.documentElement.style.setProperty("--hand-count-left-text-y", `${clamp((hc.left?.textY || 0), -20, 20)}px`);
    // Right zone
    document.documentElement.style.setProperty("--hand-count-right-x", `${clamp((hc.right?.x || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-right-y", `${clamp((hc.right?.y || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-right-text-x", `${clamp((hc.right?.textX || 62), 40, 80)}px`);
    document.documentElement.style.setProperty("--hand-count-right-text-y", `${clamp((hc.right?.textY || 0), -20, 20)}px`);
    // Bottom zone
    document.documentElement.style.setProperty("--hand-count-bottom-x", `${clamp((hc.bottom?.x || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-bottom-y", `${clamp((hc.bottom?.y || 0), -200, 200)}px`);
    document.documentElement.style.setProperty("--hand-count-bottom-text-x", `${clamp((hc.bottom?.textX || 62), 40, 80)}px`);
    document.documentElement.style.setProperty("--hand-count-bottom-text-y", `${clamp((hc.bottom?.textY || 0), -20, 20)}px`);
    // Global scale
    document.documentElement.style.setProperty("--hand-count-scale-x", String(clamp(hc.scaleX || 1.0, 0.3, 3.0)));
    document.documentElement.style.setProperty("--hand-count-scale-y", String(clamp(hc.scaleY || 1.0, 0.3, 3.0)));
    // Text scale and offset
    document.documentElement.style.setProperty("--hand-count-text-scale-x", String(clamp(hc.textScaleX || 1.0, 0.5, 2.0)));
    document.documentElement.style.setProperty("--hand-count-text-scale-y", String(clamp(hc.textScaleY || 1.0, 0.5, 2.0)));
    document.documentElement.style.setProperty("--hand-count-text-offset-y", `${clamp(hc.textOffsetY || 0, -20, 20)}px`);

    // Apply zone name position (per zone)
    const zn = layout.zoneName || {};
    // Top zone
    document.documentElement.style.setProperty("--zone-name-top-x", `${clamp((zn.top?.x || 0), -100, 100)}px`);
    document.documentElement.style.setProperty("--zone-name-top-y", `${clamp((zn.top?.y || 0), -100, 100)}px`);
    // Left zone
    document.documentElement.style.setProperty("--zone-name-left-x", `${clamp((zn.left?.x || 0), -100, 100)}px`);
    document.documentElement.style.setProperty("--zone-name-left-y", `${clamp((zn.left?.y || 0), -100, 100)}px`);
    // Right zone
    document.documentElement.style.setProperty("--zone-name-right-x", `${clamp((zn.right?.x || 0), -100, 100)}px`);
    document.documentElement.style.setProperty("--zone-name-right-y", `${clamp((zn.right?.y || 0), -100, 100)}px`);
    // Bottom zone
    document.documentElement.style.setProperty("--zone-name-bottom-x", `${clamp((zn.bottom?.x || 0), -100, 100)}px`);
    document.documentElement.style.setProperty("--zone-name-bottom-y", `${clamp((zn.bottom?.y || 0), -100, 100)}px`);
  }

  function buildTunerUI(layout) {
    tunerControls.innerHTML = "";
    const groups = [
      ["top", "上方AI"],
      ["left", "左侧AI"],
      ["right", "右侧AI"],
      ["bottom", "玩家手牌"],
      ["center", "弃牌堆"],
    ];

    function addSlider(groupKey, prop, min, max, step) {
      const row = document.createElement("div");
      row.className = "tunerRow";

      const lab = document.createElement("label");
      lab.textContent = `${prop}(%)`;

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(layout[groupKey][prop]);

      const num = document.createElement("input");
      // Use text input for better decimal keyboard support on mobile (number often hides '.')
      num.type = "text";
      num.className = "tunerNum";
      num.min = String(min);
      num.max = String(max);
      num.step = String(step);
      num.value = String(layout[groupKey][prop]);
      num.inputMode = "decimal";
      num.autocomplete = "off";
      num.spellcheck = false;

      const applyFromRange = () => {
        const n0 = parseMaybeDecimal(input.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, min, max, step);
        layout[groupKey][prop] = n;
        input.value = String(n);
        // Keep number box in sync when slider is used
        num.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      const applyFromTextLive = () => {
        // While typing, don't rewrite the text box (so "1." / "-"/ "." can be typed).
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clamp(n0, min, max);
        layout[groupKey][prop] = n;
        input.value = String(n); // range will snap to its step
        applyLayout(layout);
        saveLayout(layout);
      };

      const applyFromTextCommit = () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, min, max, step);
        layout[groupKey][prop] = n;
        input.value = String(n);
        num.value = String(n); // normalize on commit
        applyLayout(layout);
        saveLayout(layout);
      };

      input.addEventListener("input", applyFromRange);
      num.addEventListener("input", applyFromTextLive);
      num.addEventListener("change", applyFromTextCommit);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(num);
      return row;
    }

    function addPxSlider(buttonKey, prop, min, max, step) {
      const row = document.createElement("div");
      row.className = "tunerRow";

      const lab = document.createElement("label");
      lab.textContent = `${prop.toUpperCase()}(px)`;

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(layout.buttons[buttonKey][prop]);

      const num = document.createElement("input");
      // Use text input for consistent keyboard and allow '.' / ',' on mobile
      num.type = "text";
      num.className = "tunerNum";
      num.min = String(min);
      num.max = String(max);
      num.step = String(step);
      num.value = String(layout.buttons[buttonKey][prop]);
      num.inputMode = "decimal";
      num.autocomplete = "off";
      num.spellcheck = false;

      const applyFromRange = () => {
        const n0 = parseMaybeDecimal(input.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, min, max, step);
        layout.buttons[buttonKey][prop] = n;
        input.value = String(n);
        num.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      const applyFromTextLive = () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clamp(n0, min, max);
        layout.buttons[buttonKey][prop] = n;
        input.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      const applyFromTextCommit = () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, min, max, step);
        layout.buttons[buttonKey][prop] = n;
        input.value = String(n);
        num.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      input.addEventListener("input", applyFromRange);
      num.addEventListener("input", applyFromTextLive);
      num.addEventListener("change", applyFromTextCommit);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(num);
      return row;
    }

    for (const [key, title] of groups) {
      const g = document.createElement("div");
      g.className = "tunerGroup";
      const t = document.createElement("div");
      t.className = "tunerGroupTitle";
      t.textContent = title;
      g.appendChild(t);

      // Use finer steps so decimal tuning doesn't "snap back" on blur/close.
      g.appendChild(addSlider(key, "left", -10, 95, 0.1));
      g.appendChild(addSlider(key, "top", -10, 95, 0.1));
      g.appendChild(addSlider(key, "width", 8, 95, 0.1));
      g.appendChild(addSlider(key, "height", 8, 80, 0.1));
      tunerControls.appendChild(g);
    }

    // Button controls
    const btnGroup = document.createElement("div");
    btnGroup.className = "tunerGroup";
    const bt = document.createElement("div");
    bt.className = "tunerGroupTitle";
    bt.textContent = "按钮位移（像素）";
    btnGroup.appendChild(bt);

    const mkSub = (name) => {
      const t = document.createElement("div");
      t.style.marginTop = "8px";
      t.style.fontWeight = "900";
      t.style.fontSize = "12px";
      t.style.opacity = "0.9";
      t.textContent = name;
      return t;
    };

    btnGroup.appendChild(mkSub("提示"));
    btnGroup.appendChild(addPxSlider("hint", "x", -260, 260, 1));
    btnGroup.appendChild(addPxSlider("hint", "y", -180, 180, 1));

    btnGroup.appendChild(mkSub("匹配出牌"));
    btnGroup.appendChild(addPxSlider("match", "x", -260, 260, 1));
    btnGroup.appendChild(addPxSlider("match", "y", -180, 180, 1));

    btnGroup.appendChild(mkSub("结束回合"));
    btnGroup.appendChild(addPxSlider("endturn", "x", -260, 260, 1));
    btnGroup.appendChild(addPxSlider("endturn", "y", -180, 180, 1));

    tunerControls.appendChild(btnGroup);

    // Hand count badge controls
    const handCountGroup = document.createElement("div");
    handCountGroup.className = "tunerGroup";
    const hcTitle = document.createElement("div");
    hcTitle.className = "tunerGroupTitle";
    hcTitle.textContent = "手牌数标牌位置与缩放";
    handCountGroup.appendChild(hcTitle);

    function addHandCountPosSlider(zone, axis, label, min, max, step) {
      const row = document.createElement("div");
      row.className = "tunerRow";

      const lab = document.createElement("label");
      lab.textContent = `${label}(px)`;

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(layout.handCount[zone][axis]);

      const num = document.createElement("input");
      num.type = "text";
      num.className = "tunerNum";
      num.value = String(layout.handCount[zone][axis]);
      num.inputMode = "decimal";

      const apply = () => {
        const n0 = parseMaybeDecimal(input.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, min, max, step);
        layout.handCount[zone][axis] = n;
        input.value = String(n);
        num.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      input.addEventListener("input", apply);
      num.addEventListener("input", () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clamp(n0, min, max);
        layout.handCount[zone][axis] = n;
        input.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      });
      num.addEventListener("change", apply);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(num);
      return row;
    }

    function addHandCountScaleSlider(prop, label, min, max, step) {
      const row = document.createElement("div");
      row.className = "tunerRow";

      const lab = document.createElement("label");
      lab.textContent = label;

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(layout.handCount[prop]);

      const num = document.createElement("input");
      num.type = "text";
      num.className = "tunerNum";
      num.value = String(layout.handCount[prop]);
      num.inputMode = "decimal";

      const apply = () => {
        const n0 = parseMaybeDecimal(input.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, min, max, step);
        layout.handCount[prop] = n;
        input.value = String(n);
        num.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      input.addEventListener("input", apply);
      num.addEventListener("input", () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clamp(n0, min, max);
        layout.handCount[prop] = n;
        input.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      });
      num.addEventListener("change", apply);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(num);
      return row;
    }

    // Top zone
    handCountGroup.appendChild(mkSub("上方AI"));
    handCountGroup.appendChild(addHandCountPosSlider("top", "x", "标牌X偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("top", "y", "标牌Y偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("top", "textX", "数字横向", 40, 80, 1));
    handCountGroup.appendChild(addHandCountPosSlider("top", "textY", "数字纵向", -20, 20, 1));

    // Left zone
    handCountGroup.appendChild(mkSub("左侧AI"));
    handCountGroup.appendChild(addHandCountPosSlider("left", "x", "标牌X偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("left", "y", "标牌Y偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("left", "textX", "数字横向", 40, 80, 1));
    handCountGroup.appendChild(addHandCountPosSlider("left", "textY", "数字纵向", -20, 20, 1));

    // Right zone
    handCountGroup.appendChild(mkSub("右侧AI"));
    handCountGroup.appendChild(addHandCountPosSlider("right", "x", "标牌X偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("right", "y", "标牌Y偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("right", "textX", "数字横向", 40, 80, 1));
    handCountGroup.appendChild(addHandCountPosSlider("right", "textY", "数字纵向", -20, 20, 1));

    // Bottom zone
    handCountGroup.appendChild(mkSub("玩家"));
    handCountGroup.appendChild(addHandCountPosSlider("bottom", "x", "标牌X偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("bottom", "y", "标牌Y偏移", -200, 200, 1));
    handCountGroup.appendChild(addHandCountPosSlider("bottom", "textX", "数字横向", 40, 80, 1));
    handCountGroup.appendChild(addHandCountPosSlider("bottom", "textY", "数字纵向", -20, 20, 1));

    // Global scale
    handCountGroup.appendChild(mkSub("全局缩放"));
    handCountGroup.appendChild(addHandCountScaleSlider("scaleX", "标牌X缩放", 0.3, 3.0, 0.01));
    handCountGroup.appendChild(addHandCountScaleSlider("scaleY", "标牌Y缩放", 0.3, 3.0, 0.01));

    // Text scale and offset
    handCountGroup.appendChild(mkSub("数字独立调整"));
    handCountGroup.appendChild(addHandCountScaleSlider("textScaleX", "数字X缩放", 0.5, 2.0, 0.01));
    handCountGroup.appendChild(addHandCountScaleSlider("textScaleY", "数字Y缩放", 0.5, 2.0, 0.01));
    handCountGroup.appendChild(addHandCountScaleSlider("textOffsetY", "数字Y偏移", -20, 20, 1));

    tunerControls.appendChild(handCountGroup);

    // Zone name position group
    const zoneNameGroup = document.createElement("div");
    zoneNameGroup.className = "tunerGroup";
    const zoneNameTitle = document.createElement("div");
    zoneNameTitle.className = "tunerGroupTitle";
    zoneNameTitle.textContent = "玩家名称位置";
    zoneNameGroup.appendChild(zoneNameTitle);

    function addZoneNamePosSlider(zone, prop, label, min, max, step) {
      const row = document.createElement("div");
      row.className = "tunerRow";

      const lab = document.createElement("label");
      lab.textContent = label;

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(layout.zoneName?.[zone]?.[prop] || 0);

      const num = document.createElement("input");
      num.type = "number";
      num.min = String(min);
      num.max = String(max);
      num.step = String(step);
      num.value = String(layout.zoneName?.[zone]?.[prop] || 0);
      num.style.width = "60px";

      const apply = () => {
        const val = parseMaybeDecimal(input.value);
        if (!layout.zoneName) layout.zoneName = {};
        if (!layout.zoneName[zone]) layout.zoneName[zone] = {};
        layout.zoneName[zone][prop] = val;
        num.value = String(val);
        applyLayout(layout);
        saveLayout(layout);
      };

      input.addEventListener("input", apply);
      num.addEventListener("input", () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clamp(n0, min, max);
        if (!layout.zoneName) layout.zoneName = {};
        if (!layout.zoneName[zone]) layout.zoneName[zone] = {};
        layout.zoneName[zone][prop] = n;
        input.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      });
      num.addEventListener("change", apply);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(num);
      return row;
    }

    // Top zone
    zoneNameGroup.appendChild(mkSub("上方AI"));
    zoneNameGroup.appendChild(addZoneNamePosSlider("top", "x", "名称X偏移", -100, 100, 1));
    zoneNameGroup.appendChild(addZoneNamePosSlider("top", "y", "名称Y偏移", -100, 100, 1));

    // Left zone
    zoneNameGroup.appendChild(mkSub("左侧AI"));
    zoneNameGroup.appendChild(addZoneNamePosSlider("left", "x", "名称X偏移", -100, 100, 1));
    zoneNameGroup.appendChild(addZoneNamePosSlider("left", "y", "名称Y偏移", -100, 100, 1));

    // Right zone
    zoneNameGroup.appendChild(mkSub("右侧AI"));
    zoneNameGroup.appendChild(addZoneNamePosSlider("right", "x", "名称X偏移", -100, 100, 1));
    zoneNameGroup.appendChild(addZoneNamePosSlider("right", "y", "名称Y偏移", -100, 100, 1));

    // Bottom zone
    zoneNameGroup.appendChild(mkSub("玩家"));
    zoneNameGroup.appendChild(addZoneNamePosSlider("bottom", "x", "名称X偏移", -100, 100, 1));
    zoneNameGroup.appendChild(addZoneNamePosSlider("bottom", "y", "名称Y偏移", -100, 100, 1));

    tunerControls.appendChild(zoneNameGroup);

    // Scales group
    const scaleGroup = document.createElement("div");
    scaleGroup.className = "tunerGroup";
    const scaleTitle = document.createElement("div");
    scaleTitle.className = "tunerGroupTitle";
    scaleTitle.textContent = "卡牌与按钮缩放";
    scaleGroup.appendChild(scaleTitle);

    function addScaleSlider(scaleKey, label) {
      const row = document.createElement("div");
      row.className = "tunerRow";

      const lab = document.createElement("label");
      lab.textContent = label;

      const input = document.createElement("input");
      input.type = "range";
      input.min = "0.5";
      input.max = "2.0";
      input.step = "0.01";
      input.value = String(layout.scales[scaleKey]);

      const num = document.createElement("input");
      num.type = "text";
      num.className = "tunerNum";
      num.value = String(layout.scales[scaleKey]);
      num.inputMode = "decimal";

      const apply = () => {
        const n0 = parseMaybeDecimal(input.value);
        if (Number.isNaN(n0)) return;
        const n = clampToStep(n0, 0.5, 2.0, 0.01);
        layout.scales[scaleKey] = n;
        input.value = String(n);
        num.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      };

      input.addEventListener("input", apply);
      num.addEventListener("input", () => {
        const n0 = parseMaybeDecimal(num.value);
        if (Number.isNaN(n0)) return;
        const n = clamp(n0, 0.5, 2.0);
        layout.scales[scaleKey] = n;
        input.value = String(n);
        applyLayout(layout);
        saveLayout(layout);
      });
      num.addEventListener("change", apply);

      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(num);
      return row;
    }

    scaleGroup.appendChild(addScaleSlider("playerCard", "玩家手牌"));
    scaleGroup.appendChild(addScaleSlider("aiTopCard", "AI上家"));
    scaleGroup.appendChild(addScaleSlider("aiSideCard", "AI左右"));
    scaleGroup.appendChild(addScaleSlider("discardPile", "弃牌堆"));
    scaleGroup.appendChild(addScaleSlider("uiButtons", "UI按钮"));

    tunerControls.appendChild(scaleGroup);
  }

  // Init layout tuning
  let layout = loadLayout();
  applyLayout(layout);
  buildTunerUI(layout);

  function updateTuneButtonState() {
    const gameEl = $("#game");
    btnTune.disabled = gameEl.classList.contains("hidden");
    if (btnTune.disabled) tunerPanel.classList.add("hidden");
  }
  updateTuneButtonState();

  function clearHintHighlight() {
    const cards = Array.from($("#pBottomHand").querySelectorAll(".faceCard"));
    for (const el of cards) {
      el.classList.remove("hintPulse");
      el.classList.remove("hintPulseAuto");
    }

    // 清除上家手牌的呼吸动画
    const allMiniBack = document.querySelectorAll('.miniBack');
    allMiniBack.forEach(card => card.classList.remove('hintPulseAuto'));

    // 清除保护标记，允许 renderSeats 重建元素
    const bottomHandEl = document.getElementById("pBottomHand");
    if (bottomHandEl) {
      bottomHandEl.dataset.adjusting = "";
    }
  }

  function clearHintHand() {
    const hintHand = document.getElementById("hintHand");
    if (hintHand) {
      hintHand.remove();
    }
  }

  // 清除结束回合按钮的提示
  function clearEndTurnHint() {
    const btnEndTurnImg = document.getElementById("btnEndTurnImg");
    if (btnEndTurnImg) {
      btnEndTurnImg.classList.remove("hintPulseAuto");
    }
    const hintHand = document.getElementById("hintHandEndTurn");
    if (hintHand) {
      hintHand.remove();
    }
  }

  // 显示结束回合按钮的呼吸动画
  function showEndTurnHint() {
    const btnEndTurnImg = document.getElementById("btnEndTurnImg");
    console.log("[结束回合提示] 尝试添加呼吸动画, 按钮:", btnEndTurnImg);
    if (!btnEndTurnImg || btnEndTurnImg.classList.contains("hintPulseAuto")) return;
    console.log("[结束回合提示] 添加 hintPulseAuto 类");
    btnEndTurnImg.classList.add("hintPulseAuto");
  }

  // 显示结束回合按钮的小手提示
  function showEndTurnHandHint() {
    // 如果已经存在，不重复创建
    if (document.getElementById("hintHandEndTurn")) return;

    const btnEndTurnImg = document.getElementById("btnEndTurnImg");
    console.log("[结束回合提示] 尝试添加小手提示, 按钮:", btnEndTurnImg);
    if (!btnEndTurnImg) return;

    // 创建提示手元素
    const hintHand = document.createElement("div");
    hintHand.id = "hintHandEndTurn";
    hintHand.className = "hintHand clicking";
    document.body.appendChild(hintHand);

    // 获取按钮位置
    const btnRect = btnEndTurnImg.getBoundingClientRect();
    const handX = btnRect.left + btnRect.width / 2;
    const handY = btnRect.top + btnRect.height / 2;

    hintHand.style.left = `${handX}px`;
    hintHand.style.top = `${handY}px`;
  }

  function showHintHand() {
    // 先清除已有的提示手
    clearHintHand();

    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;

    // 检查是否有配对牌
    const pair = window.Game.findAnyPairInHand(game.players[0].hand);

    if (pair) {
      // 有配对牌：显示提示手指向其中一张牌
      showHintHandForPlayerPair(pair);
      return;
    }

    // 没有配对牌且还没抽牌：提示上家手牌
    if (game.turnHasDrawn) return; // 已经抽过牌了

    // 获取上家玩家索引
    const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
    const upstreamHandEl = seatHandElByPlayerIndex(upstreamIdx);

    // 找到上家的第一张背面牌
    const targetEl = upstreamHandEl.querySelector('.miniBack');
    if (!targetEl) return;

    // 创建提示手元素
    const hintHand = document.createElement("div");
    hintHand.id = "hintHand";
    hintHand.className = "hintHand clicking"; // 立即添加点击动画类
    document.body.appendChild(hintHand);

    // 获取目标卡牌位置
    const targetRect = targetEl.getBoundingClientRect();
    const handSize = 60; // 提示手图片大小

    // 找到提示手图片的点击点（根据提示手图片调整）
    // 指尖大约在图片的 50% 宽度、65% 高度位置（往右下调整）
    const fingerTipOffsetX = handSize * 0.5;
    const fingerTipOffsetY = handSize * 0.65;

    // 将指尖对准卡牌中心
    hintHand.style.left = `${targetRect.left + targetRect.width / 2 - fingerTipOffsetX}px`;
    hintHand.style.top = `${targetRect.top + targetRect.height / 2 - fingerTipOffsetY}px`;
  }

  // 显示提示手指向玩家手中的配对牌
  function showHintHandForPlayerPair(pair) {
    if (!pair || pair.length < 2) return;

    // 找到第一张牌的DOM元素（指向其中一张即可）
    const cardId = pair[0].id;
    const targetEl = document.querySelector(`#pBottomHand .faceCard[data-card-id="${CSS.escape(cardId)}"]`);
    if (!targetEl) return;

    // 创建提示手元素
    const hintHand = document.createElement("div");
    hintHand.id = "hintHand";
    hintHand.className = "hintHand clicking"; // 立即添加点击动画类
    document.body.appendChild(hintHand);

    // 获取目标卡牌位置
    const targetRect = targetEl.getBoundingClientRect();
    const handSize = 60; // 提示手图片大小

    // 找到提示手图片的点击点（指尖位置）
    const fingerTipOffsetX = handSize * 0.5;
    const fingerTipOffsetY = handSize * 0.65;

    // 将指尖对准卡牌中心
    hintHand.style.left = `${targetRect.left + targetRect.width / 2 - fingerTipOffsetX}px`;
    hintHand.style.top = `${targetRect.top + targetRect.height / 2 - fingerTipOffsetY}px`;
  }

  function maybeShowHint(isAuto = false) {
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;

    const pair = window.Game.findAnyPairInHand(game.players[0].hand);
    if (!pair) return;

    const a = pair[0].id;
    const b = pair[1].id;

    // 设置保护标记，防止 renderSeats 打断提示动画
    const bottomHandEl = document.getElementById("pBottomHand");
    if (bottomHandEl) {
      bottomHandEl.dataset.adjusting = "true";
    }

    if (isAuto) {
      // 自动提示：只显示呼吸缩放动画，不选中
      const aEl = $("#pBottomHand").querySelector(
        `.faceCard[data-card-id="${CSS.escape(a)}"]`
      );
      const bEl = $("#pBottomHand").querySelector(
        `.faceCard[data-card-id="${CSS.escape(b)}"]`
      );
      for (const el of [aEl, bEl]) {
        if (!el) continue;
        el.classList.add("hintPulseAuto");
      }
    } else {
      // 手动提示：自动选中两张牌（弹出效果）
      selected = [a, b];
      renderSelectionHighlights();
      syncSelectionUi();
    }

    // 1.2秒后清除保护标记（hintPulse 动画一个循环的时间）
    setTimeout(() => {
      if (bottomHandEl) {
        bottomHandEl.dataset.adjusting = "";
      }
    }, 1200);
  }

  // 提示上家手牌（呼吸动画）
  function hintUpstreamHand() {
    const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
    if (upstreamIdx < 0) return;
    const upstreamHandEl = seatHandElByPlayerIndex(upstreamIdx);
    if (!upstreamHandEl) return;
    const cards = upstreamHandEl.querySelectorAll('.miniBack');
    cards.forEach(card => card.classList.add('hintPulseAuto'));
    // 不再自动移除呼吸动画，让它持续进行直到玩家操作（在 clearHintHighlight 中清除）
  }

  function scheduleHintFromNow() {
    if (hintT) return; // already scheduled for current inactivity window
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;

    const stamp = lastHumanActionAt;
    hintT = window.setTimeout(() => {
      // If user acted since scheduling, do nothing.
      if (lastHumanActionAt !== stamp) return;

      // 检查手里是否有可配对的牌
      const hasPair = window.Game.findAnyPairInHand(game.players[0].hand);
      if (hasPair) {
        // 有配对牌：提示手牌
        maybeShowHint(true);
      } else if (!game.turnHasDrawn) {
        // 没有配对牌且还没抽牌：提示上家手牌
        hintUpstreamHand();
      } else if (game.turnHasDrawn && !hasPair) {
        // 已经抽牌且没有配对：立刻提示结束回合按钮（呼吸动画）
        console.log("[提示系统] 检测到已抽牌且无配对，调用 showEndTurnHint()");
        showEndTurnHint();
      }

      // 启动提示手定时器：呼吸动画出现后再等3秒
      hintHandT = window.setTimeout(() => {
        // 再次检查用户是否操作
        if (lastHumanActionAt !== stamp) return;

        // 根据情况显示不同的小手提示
        if (game.turnHasDrawn && !window.Game.findAnyPairInHand(game.players[0].hand)) {
          // 已抽牌且无配对：提示结束回合按钮
          showEndTurnHandHint();
        } else {
          // 其他情况：提示卡牌
          showHintHand();
        }
      }, HINT_HAND_MS);
    }, HINT_MS);
  }

  function markHumanAction() {
    lastHumanActionAt = Date.now();
    clearHintHighlight();
    clearHintHand();
    clearEndTurnHint(); // 清除结束回合按钮的提示
    window.clearTimeout(hintT);
    hintT = null;
    window.clearTimeout(hintHandT);
    hintHandT = null;
    scheduleHintFromNow();
  }

  // Ensure slider max matches available pairs, and clamp current value.
  if (Array.isArray(imagePairs) && imagePairs.length > 0) {
    pairCountInput.max = String(imagePairs.length);
    pairCountNum.max = String(imagePairs.length);
    if (Number(pairCountInput.value) > imagePairs.length) {
      pairCountInput.value = String(imagePairs.length);
      pairCountNum.value = String(imagePairs.length);
    }
  }

  function syncSettings() {
    settings.autoAdvanceMs = 0; // no longer used for turn flow
    settings.aiPaceMs = autoNextToggle.checked ? 325 : 9999999;  // 减半: 650 → 325

    const pc = Number(pairCountInput.value);
    pairCountNum.value = String(pc);
    pairCountLabel.textContent = String(pc);
    // image mode: 2 cards per pair + 1 joker
    totalCardLabel.textContent = String(pc * 2 + 1);
  }

  function pickPairs(n) {
    const arr = imagePairs.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.max(1, Math.min(n, arr.length)));
  }

  function startNewGame() {
    syncSettings();
    const pairCount = Number(pairCountInput.value);
    const pickedPairs = pickPairs(pairCount);

    // 更新关卡显示
    const currentLevel = window.__GAME_ROUND_TRACKER__.currentLevel;
    $("#levelIndicator").textContent = currentLevel > 3 ? `- 随机局` : `- 第${currentLevel}关`;

    game = window.Game.createGame({
      pairs: pickedPairs,
      playerCount: 4,
      seed: String(Date.now()),
    });
    $("#setup").classList.add("hidden");
    $("#game").classList.remove("hidden");
    endOverlay.classList.add("hidden");
    updateTuneButtonState();
    selected = [];
    // Deal animation: render seats, then slide cards in from bottom with delays (no opacity changes).
    isDealing = true;
    renderSeats(game, { deal: true });
    renderDiscardPile(game);
    renderAction(game, settings);
    showLastEvent(game, settings);

    const allFace = Array.from(document.querySelectorAll("#pBottomHand .faceCard"));
    const aiBacks = Array.from(document.querySelectorAll(".seatHand .miniBack"));
    // Init state (AI uses simple fade-in; human uses composited transform animation)
    for (const el of aiBacks) el.classList.add("dealInit");

    // Compute delays: player cards left->right (idx asc).
    const base = 18;
    const stepHuman = 35; // 增加到35ms，让出场间隔更明显
    for (const el of allFace) {
      const idx = Number(el.dataset.dealIndex || 0);
      el.style.animationDelay = `${base + idx * stepHuman}ms`;
    }
    // AI: simple stagger per seat
    const stepAi = 18;
    for (const el of aiBacks) {
      const idx = Number(el.dataset.dealIndex || 0);
      el.style.transitionDelay = `${base + 80 + idx * stepAi}ms`;
    }

    // Trigger in next frame
    window.requestAnimationFrame(() => {
      for (const el of allFace) el.classList.add("dealAnim");
      for (const el of aiBacks) el.classList.add("dealIn");
    });

    // 计算最后一张玩家手牌动画完成的时间（不包括清理缓冲）
    const lastCardCompleteMs = base + (allFace.length - 1) * stepHuman + 420;
    // 完整的清理时间（包括缓冲）
    const totalMs = base + allFace.length * stepHuman + 420 + 120;

    // 定义处理函数
    function handleJokerThenPairs() {
      if (game?.jokerPending) {
        // 先发JOKER
        const toIdx = Math.floor(Math.random() * game.players.length);
        game.lastEvent = null;

        renderSeats(game);
        renderDiscardPile(game);
        renderAction(game, settings);

        showJokerRevealAndFly(game, toIdx, () => {
          window.Game.dealPendingJokerToPlayer(game, toIdx);
          game.lastEvent = null;
          renderSeats(game, { animateExpand: true });
          renderDiscardPile(game);
          renderAction(game, settings);

          // JOKER发牌完成后，等待1.5秒，然后开始所有玩家的配对动画
          console.log("[JOKER发牌完成] 等待1.5秒后开始配对...");
          setTimeout(() => {
            startInitialPairingAnimation();
          }, 1500);
        });
      } else {
        // 没有JOKER，直接开始配对
        startInitialPairingAnimation();
      }
    }

    function startInitialPairingAnimation() {
      // 🆕 第一步：在移除配对之前，先保存所有AI手牌的位置
      console.log("[开始配对] 步骤1：保存所有AI手牌位置...");
      const handPositions = {};
      for (let pi = 1; pi < game.players.length; pi++) {
        const handEl = seatHandElByPlayerIndex(pi);
        if (handEl) {
          // 使用父级 .zone 的rect，因为 .seatHand 的高度可能为0
          const zoneEl = handEl.parentElement;
          const rect = zoneEl ? zoneEl.getBoundingClientRect() : handEl.getBoundingClientRect();
          handPositions[pi] = rect;
          console.log(`[配对动画] AI${pi} 原始位置(使用zone):`, rect);
        }
      }

      // 第二步：收集所有玩家的初始配对（但不移除手牌！）
      console.log("[开始配对] 步骤2：收集配对牌信息...");
      const pairsByPlayer = {}; // { playerIdx: [{card1, card2}, ...] }

      for (let pi = 1; pi < game.players.length; pi++) {
        const player = game.players[pi];
        if (player && !player.out) {
          // 创建手牌的副本，用于查找配对（不影响原始手牌）
          const handCopy = [...player.hand];
          const pairs = [];

          while (handCopy.length > 0) {
            const pair = window.Game.findAnyPairInHand(handCopy);
            if (!pair) break;

            // 保存配对信息（引用原始卡牌对象）
            const originalCard1 = player.hand.find(c => c.id === pair[0].id);
            const originalCard2 = player.hand.find(c => c.id === pair[1].id);

            if (originalCard1 && originalCard2) {
              pairs.push({ card1: originalCard1, card2: originalCard2 });
            }

            // 从副本中移除这一对（避免重复查找）
            const idx1 = handCopy.findIndex(c => c.id === pair[0].id);
            const idx2 = handCopy.findIndex(c => c.id === pair[1].id);
            if (idx1 >= 0) handCopy.splice(idx1, 1);
            if (idx2 >= 0) handCopy.splice(idx2, 1);
          }

          if (pairs.length > 0) {
            pairsByPlayer[pi] = pairs;
            console.log(`[发牌结束] AI${pi} 找到 ${pairs.length} 对牌（未移除）`);
          }
        }
      }

      // 按AI顺序播放配对动画
      const playerIndices = Object.keys(pairsByPlayer).map(Number).sort((a, b) => a - b);

      if (playerIndices.length > 0) {
        console.log(`[发牌结束] 将按AI顺序播放配对动画`);

        // ⚠️ 不要先更新UI！需要先获取原始手牌位置，动画完成后再更新
        // renderSeats(game);
        // renderDiscardPile(game);

        let totalAnimsCompleted = 0;
        let totalAnimsExpected = 0;
        playerIndices.forEach(pi => {
          totalAnimsExpected += pairsByPlayer[pi].length * 2;
        });

        // 递归播放每个AI的配对
        let currentPlayerIdx = 0;
        let accumulatedDelay = 0;

        function playNextPlayer() {
          if (currentPlayerIdx >= playerIndices.length) {
            // 所有AI配对完成
            console.log("[发牌结束] 所有配对动画完成，等待后刷新UI");
            setTimeout(() => {
              renderSeats(game);
              renderDiscardPile(game);
              proceedAfterInitialPairs();
            }, 300);
            return;
          }

          const pi = playerIndices[currentPlayerIdx];
          const pairs = pairsByPlayer[pi];
          const aiName = `AI${pi}`;

          // AI思考延迟 - 减半版
          const thinkDelay = 250 + Math.random() * 150;  // 0.25-0.4s
          console.log(`[配对动画] ${aiName} 思考中... (${Math.round(thinkDelay)}ms)`);

          setTimeout(() => {
            console.log(`[配对动画] ${aiName} 开始出牌 (${pairs.length}对)`);

            // 📍 使用之前保存的原始位置
            const originalFromRect = handPositions[pi];
            if (!originalFromRect) {
              console.log(`[配对动画] ${aiName} 错误：没有保存的原始位置`);
              currentPlayerIdx++;
              playNextPlayer();
              return;
            }

            // 递归播放该AI的每一对牌
            let pairIdx = 0;

            function playNextPair() {
              console.log(`[配对动画] ${aiName} playNextPair, pairIdx=${pairIdx}, total=${pairs.length}`);
              if (pairIdx >= pairs.length) {
                // 该AI的所有配对完成，进入下一个AI
                console.log(`[配对动画] ${aiName} 所有配对完成`);
                currentPlayerIdx++;
                playNextPlayer();
                return;
              }

              const pair = pairs[pairIdx];
              const player = game.players[pi];

              // 使用最开始保存的原始位置（在任何移除操作之前，2497行保存的）
              // 这个位置是手牌完整时的位置，高度正确
              console.log(`[配对动画] ${aiName} 使用原始保存位置:`, originalFromRect);

              // 调用动画，传入原始保存的位置
              console.log(`[配对动画] ${aiName} 开始播放动画 pair ${pairIdx + 1}`);
              animateAiDiscardPair(pi, pair.card1, pair.card2, originalFromRect, () => {
                console.log(`[配对动画] ${aiName} 动画完成 pair ${pairIdx + 1}`);

                // 动画完成后才从手牌中移除这一对并添加到弃牌堆
                const idx1 = player.hand.findIndex(c => c.id === pair.card1.id);
                const idx2 = player.hand.findIndex(c => c.id === pair.card2.id);
                if (idx1 >= 0) player.hand.splice(idx1, 1);
                if (idx2 >= 0) player.hand.splice(idx2, 1);
                game.discardPile.push(pair.card1, pair.card2);
                player.out = player.hand.length === 0;

                // 立即渲染弃牌堆（无缝衔接）
                renderDiscardPile(game);

                // 延迟渲染手牌，等待手牌调整动画完成
                setTimeout(() => {
                  // 更新UI
                  renderSeats(game);

                  // 延迟后出下一对
                  pairIdx++;
                  if (pairIdx < pairs.length) {
                    const pairDelay = 800 + Math.random() * 400;
                    setTimeout(() => {
                      playNextPair();
                    }, pairDelay);
                  } else {
                    // 该AI所有牌出完，进入下一个AI
                    currentPlayerIdx++;
                    playNextPlayer();
                  }
                }, 100); // 延迟 100ms，等待手牌调整
              });

            }

            // 开始播放该AI的第一对
            console.log(`[配对动画] ${aiName} 准备播放第一对`);
            playNextPair();
          }, thinkDelay);
        }

        // 开始播放第一个AI
        playNextPlayer();
      } else {
        // 没有初始配对，直接继续
        proceedAfterInitialPairs();
      }
    }

    function proceedAfterInitialPairs() {
      // 配对完成，开始游戏
      renderAll(game, settings);
      runAiLoop(game, settings);
      // 重置提示计时器，从这一刻开始计算3秒
      markHumanAction();
    }

    // 在最后一张卡动画完成时立即触发Joker特效
    window.setTimeout(() => {
      handleJokerThenPairs();
    }, lastCardCompleteMs);

    // 稍后再进行清理
    window.setTimeout(() => {
      // Cleanup
      for (const el of [...allFace, ...aiBacks]) {
        el.classList.remove("dealAnim");
        el.style.animationDelay = "";
        el.style.transitionDelay = "";
        // keep AI fade classes removed as well
        el.classList.remove("dealInit", "dealIn");
      }
      isDealing = false;
      lastTurnPlayerId = game.players[game.currentPlayerIndex]?.id || null;
      markHumanAction();
    }, totalMs);
    lastTurnPlayerId = game.players[game.currentPlayerIndex]?.id || null;
    markHumanAction(); // start the 8s timer baseline if it's your turn
  }

  autoNextToggle.addEventListener("change", syncSettings);
  pairCountInput.addEventListener("input", syncSettings);
  pairCountNum.addEventListener("input", () => {
    const min = Number(pairCountInput.min || 1);
    const max = Number(pairCountInput.max || 999);
    const step = Number(pairCountInput.step || 1);
    const pc = clampToStep(Number(pairCountNum.value), min, max, step);
    pairCountInput.value = String(pc);
    syncSettings();
  });
  pairCountNum.addEventListener("change", () => {
    // Normalize on blur/enter
    const min = Number(pairCountInput.min || 1);
    const max = Number(pairCountInput.max || 999);
    const step = Number(pairCountInput.step || 1);
    const pc = clampToStep(Number(pairCountNum.value), min, max, step);
    pairCountNum.value = String(pc);
    pairCountInput.value = String(pc);
    syncSettings();
  });

  btnStart.addEventListener("click", startNewGame);

  // 设置面板的重置进度按钮
  const btnResetLevel = document.getElementById("btnResetLevel");
  if (btnResetLevel) {
    btnResetLevel.addEventListener("click", () => {
      // 重置关卡进度
      window.__GAME_ROUND_TRACKER__.currentLevel = 1;
      window.__GAME_ROUND_TRACKER__.roundNumber = 0;

      // 清除 localStorage
      try {
        localStorage.removeItem("gameRoundTracker");
        console.log(`[重置进度] 已重置为第1关`);
        alert("游戏进度已重置！");
      } catch (e) {
        console.error(`[重置进度] 清除失败:`, e);
        alert("重置失败，请重试");
      }
    });
  }

  btnRestart.addEventListener("click", () => {
    // 返回设置时重置关卡
    window.__GAME_ROUND_TRACKER__.currentLevel = 1;
    window.__GAME_ROUND_TRACKER__.roundNumber = 0;

    // 清除 localStorage
    try {
      localStorage.removeItem("gameRoundTracker");
      console.log(`[关卡切换] 点击返回设置，已重置为第1关`);
    } catch (e) {
      console.error(`[关卡切换] 清除失败:`, e);
    }

    $("#game").classList.add("hidden");
    $("#setup").classList.remove("hidden");
    $("#message").innerHTML = "";
    game = null;
    selected = [];
    window.clearTimeout(hintT);
    hintT = null;
    window.clearTimeout(hintHandT);
    hintHandT = null;
    clearHintHand();
    window.clearTimeout(runAiLoop._t);
    runAiLoop._t = null;
    endOverlay.classList.add("hidden");
    updateTuneButtonState();
  });

  btnPlayAgain.addEventListener("click", () => {
    startNewGame();
  });

  $("#btnNextLevel").addEventListener("click", () => {
    // 进入下一关
    console.log(`[关卡切换] 当前关卡: ${window.__GAME_ROUND_TRACKER__.currentLevel}`);
    // 第3关通过后进入随机局（第4关 = 随机局，之后一直停留在随机局）
    if (window.__GAME_ROUND_TRACKER__.currentLevel <= 3) {
      window.__GAME_ROUND_TRACKER__.currentLevel++;
      window.__GAME_ROUND_TRACKER__.roundNumber = window.__GAME_ROUND_TRACKER__.currentLevel - 1;
      console.log(`[关卡切换] 进入下一关: ${window.__GAME_ROUND_TRACKER__.currentLevel}`);

      // 保存到 localStorage
      try {
        localStorage.setItem("gameRoundTracker", JSON.stringify(window.__GAME_ROUND_TRACKER__));
        console.log(`[关卡切换] 已保存到localStorage`);
      } catch (e) {
        console.error(`[关卡切换] 保存失败:`, e);
      }

      startNewGame();
    } else {
      console.log(`[关卡切换] 已经是最后一关，不能继续`);
    }
  });

  btnBackToSetup.addEventListener("click", () => {
    // 返回设置时重置关卡
    window.__GAME_ROUND_TRACKER__.currentLevel = 1;
    window.__GAME_ROUND_TRACKER__.roundNumber = 0;

    // 清除 localStorage
    try {
      localStorage.removeItem("gameRoundTracker");
      console.log(`[关卡切换] 已重置为第1关`);
    } catch (e) {
      console.error(`[关卡切换] 清除失败:`, e);
    }

    btnRestart.click();
  });

  btnTune.addEventListener("click", () => {
    if (btnTune.disabled) return;
    tunerPanel.classList.toggle("hidden");
  });
  btnTuneClose.addEventListener("click", () => {
    tunerPanel.classList.add("hidden");
  });
  btnTuneReset.addEventListener("click", () => {
    layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    saveLayout(layout);
    applyLayout(layout);
    buildTunerUI(layout);
  });

  btnTuneImport.addEventListener("click", () => {
    const example = JSON.stringify(layout, null, 2);
    const raw = window.prompt("粘贴布局 JSON（会覆盖当前布局）：", example);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const required = ["top", "left", "right", "bottom", "center"];
      for (const k of required) {
        if (!parsed[k]) throw new Error("missing " + k);
        for (const p of ["left", "top", "width", "height"]) {
          if (typeof parsed[k][p] !== "number") throw new Error(`invalid ${k}.${p}`);
        }
      }
      if (parsed.buttons) {
        // Optional
        for (const key of ["hint", "match", "endturn"]) {
          if (parsed.buttons[key]) {
            if (typeof parsed.buttons[key].x !== "number") throw new Error(`invalid buttons.${key}.x`);
            if (typeof parsed.buttons[key].y !== "number") throw new Error(`invalid buttons.${key}.y`);
          }
        }
      }
      layout = parsed;
      if (!layout.buttons) layout.buttons = JSON.parse(JSON.stringify(DEFAULT_LAYOUT.buttons));
      saveLayout(layout);
      applyLayout(layout);
      buildTunerUI(layout);
    } catch (e) {
      alert("导入失败：JSON 格式或字段不对。");
    }
  });
  btnTuneCopy.addEventListener("click", async () => {
    const text = JSON.stringify(layout, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert("参数已复制到剪贴板！");
    } catch {
      // Fallback: prompt copy
      const copied = window.prompt("复制下面的参数（Cmd+C）：", text);
      if (copied !== null) {
        alert("请手动复制上面的参数");
      }
    }
  });

  function syncSelectionUi() {
    const isHumanTurn = game && !game.gameOver && game.players[game.currentPlayerIndex].kind === "human";
    const canTry = isHumanTurn && selected.length === 2;
    btnTryMatch.disabled = !canTry;
    btnClearSelect.disabled = !isHumanTurn || selected.length === 0;
  }

  function renderSelectionHighlights() {
    const cards = Array.from($("#pBottomHand").querySelectorAll(".faceCard"));
    for (const el of cards) {
      const id = el.dataset.cardId;
      el.classList.toggle("selected", selected.includes(id));
    }
  }

  function clearSelection() {
    selected = [];
    renderSelectionHighlights();
    syncSelectionUi();
  }

  // 上家手牌动画：按住时保持可见，松手后隐藏
  function animateUpstreamRotateAndOpen(fromIdx) {
    const upstream = game.players[fromIdx];
    if (!upstream || upstream.hand.length === 0) {
      openDrawOverlay(fromIdx);
      return;
    }

    const handEl = seatHandElByPlayerIndex(fromIdx);
    const backs = Array.from(handEl.querySelectorAll(".miniBack"));
    if (backs.length === 0) {
      openDrawOverlay(fromIdx);
      return;
    }

    // 边界情况：只有1张牌，直接打开抽牌界面
    if (backs.length === 1) {
      openDrawOverlay(fromIdx);
      return;
    }

    // ⭐ 新逻辑：按住时只合拢到中心点，不旋转、不缩放
    // 快速过渡：80ms完成动画
    backs.forEach(card => {
      card.style.transition = 'left 80ms ease-out, top 80ms ease-out';
    });

    requestAnimationFrame(() => {
      backs.forEach(card => {
        // 聚合到中心点（0, 0），即手牌区域的中心
        card.style.setProperty('--sx', '0px');
        card.style.setProperty('--sy', '0px');
        // 不修改 transform，保持原有的旋转和缩放
      });
    });

    // 标记动画已完成，等待 pointerup
    setTimeout(() => {
      handEl.dataset.animationComplete = "true";
    }, 80);
  }

  function openDrawOverlay(fromIdx) {
    console.log(">>> openDrawOverlay 被调用, fromIdx:", fromIdx);

    if (!game || game.gameOver) {
      console.log(">>> 游戏不存在或已结束");
      return;
    }
    advancePastOutPlayers();
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.out || current.kind !== "human") {
      console.log(">>> 当前玩家不是人类或已出局");
      return;
    }
    if (game.turnHasDrawn) {
      console.log(">>> 本回合已经抽过牌了");
      return;
    }
    const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
    if (fromIdx !== upstreamIdx) {
      console.log(">>> fromIdx 不是上家:", fromIdx, "!=", upstreamIdx);
      return;
    }
    const target = game.players[fromIdx];
    if (!target || target.out || target.hand.length === 0) {
      console.log(">>> 目标玩家不存在或已出局或无牌");
      return;
    }

    console.log(">>> 准备调用 ensureHumanCanMatch");

    // 在显示抽牌界面前，根据连续未匹配次数决定是否作弊换牌
    try {
      window.Game.ensureHumanCanMatch(game);
      console.log(">>> ensureHumanCanMatch 调用完成");
    } catch (e) {
      console.error(">>> ensureHumanCanMatch error:", e);
    }

    console.log(">>> 显示抽牌界面");
    drawOverlay.classList.remove("hidden");
    // Restore content visibility (in case it was hidden during animation)
    if (drawOverlayInner) drawOverlayInner.style.opacity = "";
    drawRow.innerHTML = "";
    drawScroll.classList.add("hidden");
    drawThumb.style.setProperty("--thumbW", "100%");
    drawThumb.style.setProperty("--thumbX", "0px");

    // Clamp overlay width to the background table so cards never exceed table edges.
    try {
      const tableBg = document.querySelector(".tableBg");
      if (tableBg && drawOverlayInner) {
        const rect = tableBg.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width));
        drawOverlayInner.style.width = `${w}px`;
        // Also align overlay vertically to the tableBg center (prevents the row looking "too low").
        const tableCy = rect.top + rect.height / 2;
        const viewCy = window.innerHeight / 2;
        const dy = tableCy - viewCy;
        drawOverlayInner.style.transform = `translateY(${Math.round(dy)}px)`;
      }
    } catch {
      // ignore
    }

    // No auto-sizing: drawBack uses fixed CSS size; row can scroll horizontally if needed.
    // Ensure the first card is fully visible by default.
    try {
      drawRow.scrollLeft = 0;
    } catch {
      // ignore
    }

    // 禁用过渡ghost卡牌动画（直接打开抽牌界面，无过渡）
    // if (!suppressDrawOverlayGhost) { ... } 已删除

    // Thumb animation: start as full bar, then shrink to correct width in sync with the "spread" timeline.
    // If the user interacts (wheel/drag), we will instantly finish this animation for max smoothness.
    try { if (drawThumbAnimRaf != null) window.cancelAnimationFrame(drawThumbAnimRaf); } catch { /* ignore */ }
    drawThumbAnimRaf = null;
    drawThumbFinalWPercent = 100;
    drawThumb.style.setProperty("--thumbDur", `0ms`);
    drawThumb.style.setProperty("--thumbW", "100%");
    drawThumb.style.setProperty("--thumbX", "0px");

    // 使用真实手牌数量
    const handSize = target.hand.length;

    for (let i = 0; i < handSize; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "drawBack";
      b.dataset.fromPlayerIndex = String(fromIdx);
      b.dataset.drawIndex = String(i);
      // "码开" feel: start overlapped then spread to normal positions.
      b.style.setProperty("--preX", `${-i * 26}px`);
      b.addEventListener("click", () => {
        if (!game || game.gameOver) return;
        advancePastOutPlayers();
        const cur = game.players[game.currentPlayerIndex];
        if (!cur || cur.out || cur.kind !== "human") {
          closeDrawOverlay();
          renderAll(game, settings);
          runAiLoop(game, settings);
          return;
        }
        if (game.turnHasDrawn) return;
        markHumanAction();

        const tracker = window.__GAME_ROUND_TRACKER__;
        const currentLevel = tracker ? tracker.currentLevel : 1;

        // 🆕 概率匹配机器：不同关卡不同规则
        let probability = 0;
        let shouldMatch = false;

        // ============ 第1关：概率机器禁用 ============
        if (currentLevel === 1) {
          // 第1关：不使用概率机制（玩家全配对，必定获胜）
          console.log(`[第1关] 概率机器未启用（新手关）`);
        }
        // ============ 第2关：60% → 100% ============
        else if (currentLevel === 2) {
          probability = 0.6;  // 第1次: 60%
          if (game.humanDrawAttempts >= 1) probability = 1.0;  // 第2次: 100%
          shouldMatch = Math.random() < probability;
          console.log(`[第2关-概率机器] 尝试次数:${game.humanDrawAttempts} 概率:${(probability*100).toFixed(0)}% 触发:${shouldMatch}`);
        }
        // ============ 第3关：50% → 70% → 100% ============
        else if (currentLevel === 3) {
          probability = 0.5;  // 第1次: 50%
          if (game.humanDrawAttempts === 1) probability = 0.7;  // 第2次: 70%
          if (game.humanDrawAttempts >= 2) probability = 1.0;  // 第3次: 100%
          shouldMatch = Math.random() < probability;
          console.log(`[第3关-概率机器] 尝试次数:${game.humanDrawAttempts} 概率:${(probability*100).toFixed(0)}% 触发:${shouldMatch}`);
        }
        // ============ 随机局：概率机器禁用，抽到什么就是什么 ============
        else {
          console.log(`[随机局] 概率机器未启用（纯随机）`);
        }

        // 从上家手牌中抽取（真实卡牌）
        let drawnCard = target.hand[i];
        let foundMatch = false;

        // ============ 第1关：Joker保护 ============
        if (currentLevel === 1 && drawnCard.type === "joker") {
          console.log(`[第1关] Joker保护：玩家抽到Joker，自动替换为其他牌`);
          const nonJokerIndices = target.hand
            .map((c, idx) => ({ card: c, idx }))
            .filter(item => item.card.type !== "joker")
            .map(item => item.idx);

          if (nonJokerIndices.length > 0) {
            const randomIdx = nonJokerIndices[Math.floor(Math.random() * nonJokerIndices.length)];
            drawnCard = target.hand[randomIdx];
            console.log(`[第1关] 替换为: ${drawnCard.id}`);
          }
        }
        // ============ 第2关及以后：可以抽到Joker ============
        else if (currentLevel >= 2 && drawnCard.type === "joker") {
          console.log(`[第${currentLevel}关] 玩家抽到Joker: ${drawnCard.id}`);
        }

        // 如果需要匹配，尝试替换为能配对的牌
        if (shouldMatch) {
          console.log(`[概率匹配机器-调试] 玩家手牌:`, cur.hand.map(c => c.id));
          console.log(`[概率匹配机器-调试] 上家手牌:`, target.hand.map(c => c.id));

          // 查找玩家手中可配对的牌
          for (const playerCard of cur.hand) {
            if (!playerCard.pairId) continue;

            // 在上家手中找对应的配对牌
            const neededSide = playerCard.side === "A" ? "B" : "A";
            console.log(`[概率匹配机器-调试] 尝试匹配: ${playerCard.id} 需要 ${playerCard.pairId}_${neededSide}`);

            const matchingIndex = target.hand.findIndex(c =>
              c.pairId === playerCard.pairId && c.side === neededSide
            );

            if (matchingIndex !== -1) {
              // 找到匹配的牌，替换原本要抽的牌
              drawnCard = target.hand[matchingIndex];
              console.log(`[概率匹配机器] 替换为匹配卡: ${drawnCard.id} (与 ${playerCard.id} 配对)`);
              foundMatch = true;
              break;
            }
          }

          if (!foundMatch) {
            console.log(`[概率匹配机器-调试] 上家没有可匹配的牌`);
          }

          // 如果100%概率但上家没有可配对的牌，从其他玩家手中找并静默交换
          if (!foundMatch && probability === 1.0) {
            console.log(`[概率匹配机器] 上家无可匹配的牌，尝试从其他玩家交换...`);

            // 查找其他玩家（不包括当前玩家和上家）
            const otherPlayers = game.players.filter((p, idx) =>
              idx !== game.currentPlayerIndex &&
              idx !== fromIdx &&
              !p.out &&
              p.hand.length > 0
            );

            // 遍历玩家手牌，找可配对的牌
            for (const playerCard of cur.hand) {
              if (!playerCard.pairId || foundMatch) continue;

              const neededSide = playerCard.side === "A" ? "B" : "A";

              // 在其他玩家中找可配对的牌
              for (const otherPlayer of otherPlayers) {
                const matchingCardIndex = otherPlayer.hand.findIndex(c =>
                  c.pairId === playerCard.pairId && c.side === neededSide
                );

                if (matchingCardIndex !== -1) {
                  // 找到了！静默交换：其他玩家的配对牌 ↔ 上家的某张随机牌
                  const matchingCard = otherPlayer.hand[matchingCardIndex];
                  const randomUpstreamIndex = Math.floor(Math.random() * target.hand.length);
                  const swapCard = target.hand[randomUpstreamIndex];

                  // 执行交换
                  otherPlayer.hand[matchingCardIndex] = swapCard;
                  target.hand[randomUpstreamIndex] = matchingCard;

                  // 如果玩家点击的正好是被交换走的牌，更新drawnCard
                  if (i === randomUpstreamIndex) {
                    drawnCard = matchingCard;
                  } else {
                    // 否则直接使用这张配对牌
                    drawnCard = matchingCard;
                  }

                  console.log(`[概率匹配机器] 静默交换成功: ${otherPlayer.name}的${matchingCard.id} ↔ ${target.name}的${swapCard.id}`);
                  console.log(`[概率匹配机器] 玩家将抽到配对牌: ${drawnCard.id} (与 ${playerCard.id} 配对)`);
                  foundMatch = true;
                  break;
                }
              }

              if (foundMatch) break;
            }

            if (!foundMatch) {
              console.log(`[概率匹配机器] 其他玩家也无可匹配的牌，抽取原始牌: ${drawnCard.id}`);
            }
          } else if (!foundMatch) {
            console.log(`[概率匹配机器] 上家无可匹配的牌，抽取原始牌: ${drawnCard.id}`);
          }
        } else {
          console.log(`[概率匹配机器] 未触发，抽取原始牌: ${drawnCard.id}`);
        }

        const isJoker = drawnCard && drawnCard.type === "joker";

        // 🆕 原地翻转动画：卡背 → 正面（不克隆，直接修改当前按钮）
        // 将按钮改造成双面卡结构
        b.disabled = true; // 禁用按钮，防止重复点击
        b.style.transformStyle = "preserve-3d";
        b.style.transition = "none"; // 清除 CSS 过渡

        // 创建正面（卡牌内容）- 0deg时可见
        const frontFace = document.createElement("div");
        frontFace.className = `faceCard ${isJoker ? "joker imgCard" : "imgCard"}`;
        frontFace.style.width = "100%";
        frontFace.style.height = "100%";
        frontFace.style.position = "absolute";
        frontFace.style.left = "0";
        frontFace.style.top = "0";
        frontFace.style.backfaceVisibility = "hidden";
        frontFace.style.WebkitBackfaceVisibility = "hidden";
        frontFace.style.transform = "rotateY(0deg)";
        frontFace.style.margin = "0";
        frontFace.style.padding = "0";  // 无padding，让图片铺满
        frontFace.style.boxSizing = "border-box";
        frontFace.style.overflow = "hidden";

        // 创建背面（卡背）- 180deg时可见
        const backFace = document.createElement("div");
        backFace.className = "miniBack";
        backFace.style.width = "100%";
        backFace.style.height = "100%";
        backFace.style.position = "absolute";
        backFace.style.left = "0";
        backFace.style.top = "0";
        backFace.style.backfaceVisibility = "hidden";
        backFace.style.WebkitBackfaceVisibility = "hidden";
        backFace.style.transform = "rotateY(180deg)";

        if (isJoker) {
          frontFace.innerHTML = `
            <div class="cardContent">
              <div class="imgWrap"><img class="cardImg" src="./assets/joker.png" alt="joker" draggable="false" /></div>
            </div>
          `;
        } else if (drawnCard) {
          frontFace.innerHTML = `
            <div class="cardContent">
              <div class="imgWrap"><img class="cardImg" src="${escapeHtml(drawnCard.imgSrc)}" alt="card" draggable="false" /></div>
            </div>
          `;
        }

        // 清空按钮内容，添加双面结构
        b.innerHTML = "";
        b.appendChild(frontFace);
        b.appendChild(backFace);

        // 初始状态：显示背面（180deg）
        b.style.transform = "rotateY(180deg)";

        // 翻转动画：180deg → 360deg（显示正面）
        const flipAnim = b.animate(
          [
            { transform: "rotateY(180deg)" },
            { transform: "rotateY(360deg)" }
          ],
          { duration: 360, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
        );

        flipAnim.onfinish = () => {
          console.log("[翻转完成] 开始获取卡牌位置...");
          // 🆕 翻转完成后，获取当前卡牌的实际位置作为飞行起点
          const cardRect = b.getBoundingClientRect();
          const cardStartX = cardRect.left + cardRect.width / 2;
          const cardStartY = cardRect.top + cardRect.height / 2;
          console.log("[翻转完成] 卡牌位置:", { x: cardStartX, y: cardStartY });

          // 立即关闭抽牌界面（飞行卡牌在外部独立创建）
          console.log("[翻转完成] 关闭抽牌界面...");
          closeDrawOverlay();

          if (isJoker) {
            console.log("[翻转完成] 检测到Joker，启动新的Joker动画");
            // Joker: 飞到屏幕中间亮相0.8s，然后飞向手牌
            animateJokerDrawFromPoint(cardStartX, cardStartY, 0, () => {
              // 🚨 修复：从上家手牌中移除这张卡
              const cardIndex = target.hand.findIndex(c => c.id === drawnCard.id);
              if (cardIndex >= 0) {
                target.hand.splice(cardIndex, 1);
                console.log(`[抽牌] 从${target.name}移除卡牌: ${drawnCard.id}`);
              } else {
                console.error(`[抽牌错误] 在${target.name}手牌中找不到 ${drawnCard.id}`);
              }

              // 添加到玩家手牌
              cur.hand.push(drawnCard);
              game.turnHasDrawn = true;

              // 更新out状态
              target.out = target.hand.length === 0;
              cur.out = cur.hand.length === 0;

              // 更新概率
              const hasPotentialMatch = !!drawnCard.pairId && cur.hand.some((c) => c !== drawnCard && c.pairId === drawnCard.pairId);
              if (hasPotentialMatch) {
                game.humanDrawAttempts = 0;
                console.log("[概率匹配机器] 匹配成功！尝试次数重置为0，下次概率50%");
              } else {
                game.humanDrawAttempts++;
                console.log(`[概率匹配机器] 未匹配，尝试次数增加至${game.humanDrawAttempts}，下次概率${game.humanDrawAttempts===1?'70%':'100%'}`);
              }

              clearSelection();
              renderAll(game, settings);
            });
          } else {
            console.log("[翻转完成] 普通卡牌，启动飞行动画", { drawnCard, cardStartX, cardStartY });

            // 🔧 修复v2：删除adjusting机制，对齐AI逻辑
            // 让renderAll在飞行完成后直接处理手牌布局，100%可靠

            // Normal card: fly directly to hand (从翻转后的实际位置开始)
            // 玩家抽牌，目标是索引0（人类玩家），传递当前手牌数量
            const currentHandCount = cur.hand.length;
            animateDrawCardFlyFromPoint(cardStartX, cardStartY, 0, drawnCard, currentHandCount, () => {
              console.log("[飞行完成] 执行drawCard...");

              // 🚨 修复：从上家手牌中移除这张卡
              const cardIndex = target.hand.findIndex(c => c.id === drawnCard.id);
              if (cardIndex >= 0) {
                target.hand.splice(cardIndex, 1);
                console.log(`[抽牌] 从${target.name}移除卡牌: ${drawnCard.id}`);
              } else {
                console.error(`[抽牌错误] 在${target.name}手牌中找不到 ${drawnCard.id}`);
              }

              // 添加到玩家手牌
              cur.hand.push(drawnCard);
              game.turnHasDrawn = true;

              // 更新out状态
              target.out = target.hand.length === 0;
              cur.out = cur.hand.length === 0;

              // 更新概率
              const hasPotentialMatch = !!drawnCard.pairId && cur.hand.some((c) => c !== drawnCard && c.pairId === drawnCard.pairId);
              if (hasPotentialMatch) {
                game.humanDrawAttempts = 0;
                console.log("[概率匹配机器] 匹配成功！尝试次数重置为0，下次概率50%");
              } else {
                game.humanDrawAttempts++;
                console.log(`[概率匹配机器] 未匹配，尝试次数增加至${game.humanDrawAttempts}，下次概率${game.humanDrawAttempts===1?'70%':'100%'}`);
              }

              clearSelection();
              renderAll(game, settings);
              console.log("[飞行完成] renderAll完成");
            });
          }
        };
      });
      drawRow.appendChild(b);
      // stagger in: 从左到右依次快速渐显，每张卡间隔40ms
      window.setTimeout(() => {
        b.classList.add("in");

        // 调试：打印第一张卡的中心点位置
        if (i === 0) {
          window.setTimeout(() => {
            const rect = b.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            console.log('抽1卡牌中心点位置:', { x: centerX, y: centerY, rect });
          }, 500); // 等待展开动画完成
        }
      }, i * 40); // 每张卡间隔40ms，从左到右快速依次显示
    }

    // Align behavior:
    // - If cards fit in the row, center them (so 1 card sits in the middle).
    // - If overflow, left-align and keep first card fully visible.
    window.requestAnimationFrame(() => {
      try {
        // need a second frame for layout to settle after images/styles
        window.requestAnimationFrame(() => {
          // IMPORTANT: don't rely on scrollWidth here because entry transforms can distort the visual layout
          // and make it *look* like scrolling does nothing. Compute deterministically.
          const nCards = target.hand.length;
          const CARD_W = 140;
          const GAP = 12;
          const PAD = 6; // .drawRow padding left/right
          const contentW = nCards * CARD_W + Math.max(0, nCards - 1) * GAP;
          const avail = Math.max(0, drawRow.clientWidth - PAD * 2);
          const fits = contentW <= avail + 1;

          drawRow.style.justifyContent = fits ? "center" : "flex-start";
          drawRow.scrollLeft = 0;

          // Custom scrollbar: only show when overflow.
          try {
            if (!fits) {
              drawScroll.classList.remove("hidden");
              // Thumb width ratio based on deterministic widths.
              const scrollW = Math.max(avail, contentW);
              const ratio = avail / scrollW;
              const w = Math.max(10, Math.min(100, Math.floor(ratio * 1000) / 10)); // %
              drawThumbFinalWPercent = w;
              // Animate thumb shrinking in sync with the spread.
              // Spread timeline: last card starts at (30 + (n-1)*18) then transitions for ~420ms.
              const total = 30 + Math.max(0, nCards - 1) * 18 + 420;
              const start = performance.now();
              const easeOut = (t) => 1 - Math.pow(1 - t, 3); // close to the feel we use elsewhere
              try { if (drawThumbAnimRaf != null) window.cancelAnimationFrame(drawThumbAnimRaf); } catch { /* ignore */ }
              drawThumbAnimRaf = null;
              const step = (now) => {
                const p01 = Math.max(0, Math.min(1, (now - start) / Math.max(1, total)));
                const e = easeOut(p01);
                const cur = 100 + (drawThumbFinalWPercent - 100) * e;
                drawThumb.style.setProperty("--thumbW", `${cur}%`);
                if (p01 < 1) drawThumbAnimRaf = window.requestAnimationFrame(step);
                else {
                  drawThumbAnimRaf = null;
                  drawThumb.style.setProperty("--thumbW", `${drawThumbFinalWPercent}%`);
                }
              };
              drawThumbAnimRaf = window.requestAnimationFrame(step);
              if (typeof recalcDrawScrollSoon === "function") recalcDrawScrollSoon();
            } else {
              drawScroll.classList.add("hidden");
              if (typeof recalcDrawScrollSoon === "function") recalcDrawScrollSoon();
            }
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    });
  }

  function closeDrawOverlay() {
    drawOverlay.classList.add("hidden");
    drawRow.innerHTML = "";
    drawScroll.classList.add("hidden");
    if (typeof recalcDrawScrollSoon === "function") recalcDrawScrollSoon();
    if (drawOverlayInner) {
      drawOverlayInner.style.width = "";
      drawOverlayInner.style.transform = "";
      drawOverlayInner.style.opacity = "";
    }
    // Reset background styles
    drawOverlay.style.background = "";
    drawOverlay.style.backdropFilter = "";

    // 直接重新渲染玩上手牌，无展开动画
    if (game && !game.gameOver) {
      renderSeats(game);
    }
  }

  drawOverlay.addEventListener("click", (e) => {
    if (e.target === drawOverlay) closeDrawOverlay();
  });
  btnDrawClose.addEventListener("click", closeDrawOverlay);

  // Draw overlay: keep custom scrollbar perfectly in sync with drawRow.scrollLeft (and allow dragging).
  // Rebuilt model (for maximum smoothness):
  // - Thumb movement drives scrollLeft directly (1px thumb -> proportional scrollLeft).
  // - ScrollLeft (wheel/touchpad) updates thumb position.
  // - While the entry "spread" is animating, thumb starts full-width then shrinks; first user interaction
  //   instantly finishes both the spread and the thumb shrink animation to avoid any jitter.
  (() => {
    const ROW_PAD_X = 6; // .drawRow padding left/right
    const CARD_W = 140;  // .drawBack width
    const GAP = 12;      // .drawRow gap

    const st = {
      rafSync: null,
      rafRecalc: null,
      dragging: false,
      // cached geometry
      maxScroll: 0,
      trackW: 0,
      thumbWPercent: 100,
      thumbWPx: 0,
      thumbXMax: 0,
      // thumb position cache (px on track)
      thumbX: 0,
      // drag state
      spid: null,
      startClientX: 0,
      startThumbX: 0,
    };

    function clamp01(x) {
      return Math.max(0, Math.min(1, x));
    }
    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function readThumbWPercent() {
      // Prefer the CSS variable we set (e.g. "23.4%"), not offsetWidth (layout read).
      try {
        const raw = getComputedStyle(drawThumb).getPropertyValue("--thumbW").trim();
        if (!raw) return 100;
        const s = raw.endsWith("%") ? raw.slice(0, -1) : raw;
        const n = Number.parseFloat(s);
        if (!Number.isFinite(n)) return 100;
        return Math.max(1, Math.min(100, n));
      } catch {
        return 100;
      }
    }

    function recalc() {
      try {
        if (drawScroll.classList.contains("hidden")) {
          st.maxScroll = 0;
          st.trackW = 0;
          st.thumbXMax = 0;
          return;
        }

        st.trackW = drawScroll.clientWidth;
        st.thumbWPercent = readThumbWPercent();
        st.thumbWPx = st.trackW * (st.thumbWPercent / 100);
        st.thumbXMax = Math.max(0, st.trackW - st.thumbWPx);

        // Use deterministic geometry during entry transforms (more stable), but fall back to real scrollWidth
        // when it's larger (after spread has finished).
        const nCards = drawRow ? drawRow.children.length : 0;
        const avail = Math.max(0, drawRow.clientWidth - ROW_PAD_X * 2);
        const contentW = nCards * CARD_W + Math.max(0, nCards - 1) * GAP;
        const detMax = Math.max(0, contentW - avail);
        const realMax = Math.max(0, drawRow.scrollWidth - drawRow.clientWidth);
        st.maxScroll = Math.max(detMax, realMax);

        // Keep cached thumbX inside bounds after geometry changes.
        st.thumbX = clamp(st.thumbX, 0, st.thumbXMax);
      } catch {
        // ignore
      }
    }

    function setThumbX(x) {
      st.thumbX = clamp(x, 0, st.thumbXMax);
      drawThumb.style.setProperty("--thumbX", `${st.thumbX}px`);
    }

    function setThumbFromScrollLeft(scrollLeft) {
      try {
        if (drawScroll.classList.contains("hidden")) return;
        const max = Math.max(1, st.maxScroll);
        const p = clamp01(scrollLeft / max);
        setThumbX(p * st.thumbXMax);
      } catch {
        // ignore
      }
    }

    function ensureInstantSpread() {
      // Entry uses transforms (visual-only). If user starts scrolling/dragging,
      // finish the spread immediately so scroll feedback is visible.
      try { drawRow.classList.add("instant"); } catch { /* ignore */ }
      // Also instantly finish thumb width animation if it's running.
      try {
        if (drawThumbAnimRaf != null) {
          window.cancelAnimationFrame(drawThumbAnimRaf);
          drawThumbAnimRaf = null;
        }
        if (Number.isFinite(drawThumbFinalWPercent)) {
          drawThumb.style.setProperty("--thumbW", `${drawThumbFinalWPercent}%`);
        }
      } catch { /* ignore */ }
    }

    function scheduleRecalc() {
      if (st.rafRecalc != null) return;
      st.rafRecalc = window.requestAnimationFrame(() => {
        st.rafRecalc = null;
        recalc();
        setThumbFromScrollLeft(drawRow.scrollLeft);
      });
    }

    function scheduleSync() {
      if (st.rafSync != null) return;
      st.rafSync = window.requestAnimationFrame(() => {
        st.rafSync = null;
        if (st.dragging) return; // drag path drives thumb directly (more responsive)
        setThumbFromScrollLeft(drawRow.scrollLeft);
      });
    }

    // Init once.
    scheduleRecalc();
    // Expose to open/close overlay code (so showing/hiding the bar always refreshes metrics).
    recalcDrawScrollSoon = scheduleRecalc;

    drawRow.addEventListener("scroll", () => scheduleSync(), { passive: true });
    drawRow.addEventListener("wheel", () => ensureInstantSpread(), { passive: true });

    // Recalc on size changes (overlay width changes / viewport resize).
    try {
      const ro = new ResizeObserver(() => scheduleRecalc());
      ro.observe(drawRow);
      ro.observe(drawScroll);
    } catch {
      window.addEventListener("resize", () => scheduleRecalc(), { passive: true });
    }

    function beginDrag(e) {
      if (drawScroll.classList.contains("hidden")) return;
      if (!drawRow) return;
      // Only primary button for mouse
      if (e.button != null && e.button !== 0) return;

      ensureInstantSpread();
      recalc();
      if (st.maxScroll <= 0 || st.thumbXMax <= 0) return;

      st.spid = e.pointerId;
      st.startClientX = e.clientX;
      st.startThumbX = st.thumbX;
      st.dragging = true;

      try { drawScroll.setPointerCapture(st.spid); } catch { /* ignore */ }
      e.preventDefault();

      // If user clicked the track (not the thumb), jump so the thumb centers around the click.
      const isThumb = e.target === drawThumb || (e.target && e.target.closest && e.target.closest("#drawThumb"));
      if (!isThumb) {
        const trackRect = drawScroll.getBoundingClientRect();
        const clickX = e.clientX - trackRect.left;
        const thumbCenterX = st.thumbX + st.thumbWPx / 2;
        const dx = clickX - thumbCenterX;
        setThumbX(st.thumbX + dx);
        // Drive scroll immediately.
        const p = st.thumbXMax <= 0 ? 0 : st.thumbX / st.thumbXMax;
        drawRow.scrollLeft = p * st.maxScroll;
        // rebase after jump
        st.startClientX = e.clientX;
        st.startThumbX = st.thumbX;
      }
    }

    function moveDrag(e) {
      if (st.spid == null || e.pointerId !== st.spid) return;
      if (st.maxScroll <= 0) return;
      // Use coalesced events for smoother-than-1px mouse steps where available.
      const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
      let lastX = st.startThumbX;
      for (const ev of evs) {
        const dx = ev.clientX - st.startClientX;
        lastX = st.startThumbX + dx;
      }
      setThumbX(lastX);
      const p = st.thumbXMax <= 0 ? 0 : st.thumbX / st.thumbXMax;
      drawRow.scrollLeft = p * st.maxScroll;
      e.preventDefault();
    }

    function endDrag(e) {
      if (st.spid == null || e.pointerId !== st.spid) return;
      try { drawScroll.releasePointerCapture(st.spid); } catch { /* ignore */ }
      st.spid = null;
      st.dragging = false;
      scheduleSync();
    }

    drawScroll.addEventListener("pointerdown", beginDrag);
    drawScroll.addEventListener("pointermove", moveDrag);
    drawScroll.addEventListener("pointerup", endDrag);
    drawScroll.addEventListener("pointercancel", endDrag);
  })();

  // Single-card drag (2D) with asymmetric caps + damping:
  // - Horizontal: max 200px (left/right)
  // - Vertical: only upward, max 400px; cannot drag downward
  // - Damping increases near caps; once hitting a cap, lock until release.
  const bottomHandEl = $("#pBottomHand");
  let cardPointerId = null;
  let cardEl = null;
  let cardLastX = 0;
  let cardLastY = 0;
  let cardLastT = 0;
  let cardDx = 0;
  let cardDy = 0;
  let cardVx = 0;
  let cardVy = 0;
  let cardS = 1;
  let cardDragged = false;
  let cardDownAt = 0;
  const CARD_DRAG_CAP_X_PX = 200;
  const CARD_DRAG_CAP_UP_PX = 300;
  const CARD_DRAG_DAMP_P = 2.5; // exponent for ease-out damping increase (slightly softer near the end)
  const CARD_DRAG_SCALE_BASE = 1.0;
  const CARD_DRAG_SCALE_EXTRA = 0.3; // additional scale near caps (ease-out) - max 1.3x
  const EDGE_DAMP_RADIUS_PX = 220; // within this distance to table edge, damping ramps to max
  const DAMP_START_FRAC = 1 / 3; // start damping after 1/3 of the pull-to-cap distance
  let cardLocked = false; // once reached lock point, stop reacting until release
  let springRaf = null;
  // No hover-lift; click selection handles the lift.

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function projectToDragRegion(dx, dy) {
    // dy: only upward (negative), cannot go downward (positive)
    const ndy = clamp(dy, -CARD_DRAG_CAP_UP_PX, 0);
    const ndx = dx;
    if (CARD_DRAG_CAP_X_PX <= 0 || CARD_DRAG_CAP_UP_PX <= 0) {
      return { dx: 0, dy: 0, hit: true };
    }

    // Elliptical boundary (smooth arc):
    // (x/CAP_X)^2 + (y/CAP_UP)^2 <= 1, with y = -dy (upward distance)
    let tx = ndx / CARD_DRAG_CAP_X_PX;
    let ty = Math.max(0, -ndy) / CARD_DRAG_CAP_UP_PX;
    const r2 = tx * tx + ty * ty;
    if (r2 <= 1) return { dx: ndx, dy: ndy, hit: false };
    const r = Math.sqrt(r2) || 1;
    tx /= r;
    ty /= r;
    const x2 = tx * CARD_DRAG_CAP_X_PX;
    const y2 = -ty * CARD_DRAG_CAP_UP_PX;
    return { dx: x2, dy: y2, hit: true };
  }
  function dragFrac(dx, dy) {
    // 0..1 based on radial distance inside the ellipse.
    if (CARD_DRAG_CAP_X_PX <= 0 || CARD_DRAG_CAP_UP_PX <= 0) return 1;
    const tx = dx / CARD_DRAG_CAP_X_PX;
    const ty = Math.max(0, -dy) / CARD_DRAG_CAP_UP_PX;
    return clamp(Math.sqrt(tx * tx + ty * ty), 0, 1);
  }
  const tableBgEl = document.querySelector(".tableBg");
  function edgeFracFromPointer(clientX, clientY) {
    // 0..1: 0 means far from edge, 1 means at/over the edge of table background.
    // This is used to force max damping when the mouse reaches the background edge.
    if (!tableBgEl) return 0;
    const r = tableBgEl.getBoundingClientRect();
    const dx = Math.max(r.left - clientX, 0, clientX - r.right);
    const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
    // If pointer is outside, treat as edge (max damping).
    if (dx > 0 || dy > 0) return 1;
    const toLeft = clientX - r.left;
    const toRight = r.right - clientX;
    const toTop = clientY - r.top;
    const toBottom = r.bottom - clientY;
    const minDist = Math.max(0, Math.min(toLeft, toRight, toTop, toBottom));
    const t = 1 - clamp(minDist / EDGE_DAMP_RADIUS_PX, 0, 1);
    return t;
  }
  function setCardOffset(el, dx, dy) {
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
  }
  function setCardScale(el, s) {
    el.style.setProperty("--s", `${s}`);
  }
  function easeOutPow(t, p) {
    const x = clamp(t, 0, 1);
    return 1 - Math.pow(1 - x, p);
  }
  function easeInPow(t, p) {
    const x = clamp(t, 0, 1);
    return Math.pow(x, p);
  }
  function combinedFrac(frac, edgeFrac) {
    // Avoid "instant big -> small -> big" at drag start when the hand is physically near the table edge:
    // only let edge-based damping contribute once the card is actually pulled out.
    // Weight edge influence by pull fraction so it's ~0 near origin and increases smoothly.
    const f = clamp(frac, 0, 1);
    const e = clamp(edgeFrac, 0, 1);
    const w = easeOutPow(f, 1.4); // 0 -> 1 as pull increases (out curve)
    return Math.max(f, e * w);
  }
  function dampDriver(frac) {
    // Gate the damping so it doesn't start too early:
    // below DAMP_START_FRAC => 0, then ramps 0..1 afterwards.
    const x = clamp(frac, 0, 1);
    const t0 = clamp(DAMP_START_FRAC, 0, 0.95);
    if (x <= t0) return 0;
    return clamp((x - t0) / (1 - t0), 0, 1);
  }

  function stopSpring() {
    if (springRaf) {
      cancelAnimationFrame(springRaf);
      springRaf = null;
    }
  }

  function startSpringBack(el, x0, y0, vx0, vy0, s0) {
    stopSpring();
    if (!el) return;

    // Hard spring snapback with landing bounce on impact
    let x = x0;
    let y = y0;
    const VMAX = 1200; // px/s
    let vx = clamp(vx0, -VMAX, VMAX) * 0.5;
    let vy = clamp(vy0, -VMAX, VMAX) * 0.5;
    let sStart = typeof s0 === "number" && Number.isFinite(s0) ? s0 : 1;
    let tAcc = 0;
    let last = performance.now();
    const startDist = Math.max(1, Math.hypot(x0, y0));
    const v0 = Math.hypot(vx, vy);

    // Hard spring: high omega, critically damped
    const omega = clamp(35 + startDist / 160, 35, 52); // rad/s - fast, hard spring
    const zeta = clamp(1.0 + v0 / 18000, 0.98, 1.15); // critically damped
    const k = omega * omega;
    const c = 2 * zeta * omega;

    el.classList.add("springing");
    el.classList.remove("snapBack");
    el.classList.remove("overshoot");

    // Landing bounce parameters
    const BOUNCE_COEF = 0.28; // coefficient of restitution (energy preserved on bounce)
    const BOUNCE_GRAVITY = 4800; // px/s^2
    const BOUNCE_MIN_VY = 60; // px/s - minimum velocity to trigger bounce

    const step = (now) => {
      let dt = clamp((now - last) / 1000, 0.001, 0.034);
      last = now;
      tAcc += dt;

      // Semi-implicit Euler
      const px = x;
      const py = y;
      const ax = -k * x - c * vx;
      const ay = -k * y - c * vy;
      vx += ax * dt;
      vy += ay * dt;
      x += vx * dt;
      y += vy * dt;

      // X-axis: hard stop at zero
      if ((px > 0 && x <= 0) || (px < 0 && x >= 0)) {
        x = 0;
        vx = 0;
      }

      // Y-axis: detect landing and trigger bounce
      if (py < 0 && y >= 0 && vy > 0) {
        // Just crossed zero from above with downward velocity
        const impactVy = Math.abs(vy);
        x = 0;
        y = 0;
        vx = 0;
        vy = 0;

        // Start landing bounce if impact velocity is significant
        if (impactVy >= BOUNCE_MIN_VY) {
          const bounceVy = -impactVy * BOUNCE_COEF; // upward velocity after bounce
          let by = 0;
          let bvy = bounceVy;
          let lastB = performance.now();

          const bounceStep = (nowB) => {
            const dtB = clamp((nowB - lastB) / 1000, 0.001, 0.034);
            lastB = nowB;
            bvy += BOUNCE_GRAVITY * dtB;
            by += bvy * dtB;

            // Bounce finished when back at ground moving downward
            if (by >= 0 && bvy >= 0) {
              setCardOffset(el, 0, 0);
              setCardScale(el, 1);
              el.classList.remove("springing");
              springRaf = null;
              return;
            }

            setCardOffset(el, 0, by);
            setCardScale(el, 1);
            springRaf = requestAnimationFrame(bounceStep);
          };
          springRaf = requestAnimationFrame(bounceStep);
          return;
        } else {
          // Impact too soft, just stop
          setCardOffset(el, 0, 0);
          setCardScale(el, 1);
          el.classList.remove("springing");
          springRaf = null;
          return;
        }
      }

      setCardOffset(el, x, y);
      // Scale follows ease-in curve (accelerating shrink)
      const scaleT = clamp(1 - Math.exp(-8 * tAcc), 0, 1);
      const s = 1 + (sStart - 1) * (1 - easeInPow(scaleT, 2.0));
      setCardScale(el, s);

      // Check if settled near origin with low velocity
      const settled = Math.hypot(x, y) < 0.5 && Math.hypot(vx, vy) < 18;
      if (settled) {
        setCardOffset(el, 0, 0);
        setCardScale(el, 1);
        el.classList.remove("springing");
        springRaf = null;
        return;
      }

      springRaf = requestAnimationFrame(step);
    };
    springRaf = requestAnimationFrame(step);
  }

  bottomHandEl.addEventListener("pointerdown", (e) => {
    if (isDealing) return;
    if (e.button != null && e.button !== 0) return;
    const target = e.target.closest(".faceCard");
    if (!target) return;
    cardPointerId = e.pointerId;
    cardEl = target;
    // Ensure snapback easing only applies on release (not during drag).
    cardEl.classList.remove("snapBack");
    cardEl.classList.remove("overshoot");
    cardEl.classList.remove("springing");
    stopSpring();
    cardLastX = e.clientX;
    cardLastY = e.clientY;
    cardLastT = performance.now();
    cardDx = 0;
    cardDy = 0;
    cardVx = 0;
    cardVy = 0;
    cardS = CARD_DRAG_SCALE_BASE;
    cardDragged = false;
    cardDownAt = Date.now();
    cardLocked = false;
    cardEl.classList.add("dragging");
    setCardOffset(cardEl, 0, 0);
    setCardScale(cardEl, cardS);
    try { cardEl.setPointerCapture(cardPointerId); } catch { /* ignore */ }
  });

  bottomHandEl.addEventListener("pointermove", (e) => {
    if (isDealing) return;
    if (cardPointerId == null || e.pointerId !== cardPointerId) return;
    if (!cardEl) return;
    if (cardLocked) return;
    const tNow = performance.now();
    const dt = clamp((tNow - cardLastT) / 1000, 0.001, 0.05);
    cardLastT = tNow;
    const ddx0 = e.clientX - cardLastX;
    const ddy0 = e.clientY - cardLastY;
    cardLastX = e.clientX;
    cardLastY = e.clientY;

    const prevDx = cardDx;
    const prevDy = cardDy;

    const oldFrac = dragFrac(cardDx, cardDy);
    const edgeFrac = edgeFracFromPointer(e.clientX, e.clientY);
    const oldCombined = combinedFrac(oldFrac, edgeFrac);
    const oldD = dampDriver(oldCombined);
    // Target offset if perfectly following the pointer
    let ddx = ddx0;
    let ddy = ddy0;
    let nextDx = cardDx + ddx;
    let nextDy = cardDy + ddy;
    // Apply "no downward" immediately for intent detection (downward movement shouldn't help push outward)
    if (nextDy > 0) nextDy = 0;
    let nextFrac = dragFrac(nextDx, nextDy);
    const nextCombined = combinedFrac(nextFrac, edgeFrac);
    const nextD = dampDriver(nextCombined);

    // Damping: apply whenever we are NOT moving inward (i.e., not getting farther from caps).
    // Joystick feel: resist radial (outward) motion much more than tangential (around-the-edge) motion.
    // This prevents the "pause / straight line" feel when sliding left/right at a given height.
    if (nextD >= oldD) {
      // Combined damping driver: either card approaching its drag caps, OR pointer approaching table edge.
      // When mouse reaches the table edge, edgeFrac -> 1 => strength -> 1 (max damping).
      const strength = easeOutPow(oldD, CARD_DRAG_DAMP_P);
      const radialGain = 1 - strength; // strongest resistance
      // Tangential (left/right) should remain smooth, but when pulled upward "high enough",
      // increase tangential damping so the arc stays small (avoid the "can draw a circle" feel).
      let tanGain = 1 - strength * 0.35; // base tangential damping near edge

      // Work in normalized ellipse-space so the boundary is a circle:
      // vx = dx/CAP_X, vy = (-dy)/CAP_UP
      const capX = CARD_DRAG_CAP_X_PX;
      const capY = CARD_DRAG_CAP_UP_PX;
      if (capX > 0 && capY > 0) {
        const ux0 = cardDx / capX;
        const uy0 = Math.max(0, -cardDy) / capY;
        const un = Math.hypot(ux0, uy0);
        if (un > 1e-4) {
          const ux = ux0 / un;
          const uy = uy0 / un;

          // Height-dependent tangential damping:
          // - below ~35% upward pull: almost unchanged
          // - above that: tangential gets increasingly "sticky" so sliding left/right produces only a small arc
          const upFrac = clamp(uy0, 0, 1); // 0..1 upward fraction
          const tUp = clamp((upFrac - 0.35) / (1 - 0.35), 0, 1);
          // Up to ~55% additional tangential damping at max upward pull.
          tanGain *= 1 - 0.55 * tUp;

          let dvx = ddx0 / capX;
          let dvy = -ddy0 / capY;

          // Decompose dv into radial/tangential components.
          const dr = dvx * ux + dvy * uy;
          const tvx = dvx - dr * ux;
          const tvy = dvy - dr * uy;

          // Only resist radial-outward component (dr > 0). Inward dr stays responsive.
          const dr2 = dr > 0 ? dr * radialGain : dr;
          dvx = dr2 * ux + tvx * tanGain;
          dvy = dr2 * uy + tvy * tanGain;

          ddx = dvx * capX;
          ddy = -dvy * capY;
        } else {
          // Near origin: fall back to uniform damping.
          const gain = 1 - strength;
          ddx = ddx0 * gain;
          ddy = ddy0 * gain;
        }
      } else {
        const gain = 1 - strength;
        ddx = ddx0 * gain;
        ddy = ddy0 * gain;
      }

      nextDx = cardDx + ddx;
      nextDy = cardDy + ddy;
      if (nextDy > 0) nextDy = 0;
      nextFrac = dragFrac(nextDx, nextDy);
    }

    // Clamp to a smooth arc (ellipse). Do NOT lock; keep motion continuous along the boundary (no "pause").
    const proj = projectToDragRegion(nextDx, nextDy);
    nextDx = proj.dx;
    nextDy = proj.dy;

    cardDx = nextDx;
    cardDy = nextDy;

    // Scale follows the same ease-out "damping strength" rhythm.
    const curFrac = dragFrac(cardDx, cardDy);
    const curCombined = combinedFrac(curFrac, edgeFrac);
    const curD = dampDriver(curCombined);
    const curStrength = easeOutPow(curD, CARD_DRAG_DAMP_P);
    cardS = CARD_DRAG_SCALE_BASE + CARD_DRAG_SCALE_EXTRA * curStrength;

    // Velocity estimate (for physical release). Smooth a bit to reduce noise.
    const instVx = (cardDx - prevDx) / dt;
    const instVy = (cardDy - prevDy) / dt;
    cardVx = cardVx * 0.65 + instVx * 0.35;
    cardVy = cardVy * 0.65 + instVy * 0.35;

    if (!cardDragged) {
      const moved = Math.hypot(cardDx, cardDy) > 6 && Date.now() - cardDownAt > 40;
      if (moved) cardDragged = true;
    }
    setCardOffset(cardEl, cardDx, cardDy);
    setCardScale(cardEl, cardS);
  });

  function endCardPointer(e) {
    if (cardPointerId == null || e.pointerId !== cardPointerId) return;
    const el = cardEl;
    const lastDx = cardDx;
    const lastDy = cardDy;
    const lastVx = cardVx;
    const lastVy = cardVy;
    const lastS = cardS;
    const dragDist = Math.hypot(lastDx, lastDy);
    cardPointerId = null;
    cardEl = null;

    if (el) {
      el.classList.remove("dragging");
      // Only spring back if we actually dragged (or moved meaningfully).
      const moved = Math.hypot(lastDx, lastDy) > 1.5 || cardDragged;
      if (moved) {
        startSpringBack(el, lastDx, lastDy, lastVx, lastVy, lastS);
      } else {
        // No movement: don't run spring animation (prevents "return then pop" on click).
        setCardOffset(el, 0, 0);
        setCardScale(el, 1);
        el.classList.remove("springing");
        el.classList.remove("overshoot");
      }
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    // If it was a drag, suppress click selection.
    if (cardDragged) suppressHandClickUntil = Date.now() + 220;

    cardDragged = false;
    cardLocked = false;
    cardVx = 0;
    cardVy = 0;
    cardS = 1;
  }
  bottomHandEl.addEventListener("pointerup", endCardPointer);
  bottomHandEl.addEventListener("pointercancel", endCardPointer);

  // Click your cards to select (on table)
  bottomHandEl.addEventListener("click", (e) => {
    if (isDealing) return;
    if (Date.now() < suppressHandClickUntil) return;
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;
    const c = e.target.closest(".faceCard");
    if (!c) return;
    const id = c.dataset.cardId;
    if (!id) return;
    markHumanAction();
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else selected = selected.length >= 2 ? [selected[1], id] : [...selected, id];
    renderSelectionHighlights();
    syncSelectionUi();
  });

  // UI image buttons
  // Prevent image/element drag (fixes mobile/desktop "can drag" and hit-testing weirdness)
  for (const el of [btnHintImg, btnMatchImg, btnEndTurnImg]) {
    el.addEventListener("dragstart", (e) => e.preventDefault());
    const img = el.querySelector("img");
    if (img) img.addEventListener("dragstart", (e) => e.preventDefault());
  }

  // Prevent native HTML drag on card images (otherwise non-joker image cards may bypass our 50px lift cap).
  bottomHandEl.addEventListener(
    "dragstart",
    (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(".faceCard")) e.preventDefault();
    },
    { capture: true }
  );

  btnHintImg.addEventListener("click", () => {
    if (isDealing) return;
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;
    markHumanAction();

    // Toggle hint: if already showing hint (2 cards selected), clear them; otherwise show hint
    if (selected.length === 2) {
      // Check if the current selection is a valid pair (hint result)
      const pair = window.Game.findAnyPairInHand(game.players[0].hand);
      const isHintPair = pair &&
        ((selected[0] === pair[0].id && selected[1] === pair[1].id) ||
         (selected[0] === pair[1].id && selected[1] === pair[0].id));

      if (isHintPair) {
        // Clear hint: deselect cards and return them to original position
        clearSelection();
        return;
      }
    }

    // Show hint: select the matching pair
    maybeShowHint();
  });

  btnMatchImg.addEventListener("click", () => {
    if (isDealing) return;
    // same as "匹配出牌"
    btnTryMatch.click();
  });

  btnEndTurnImg.addEventListener("click", () => {
    if (isDealing) return;
    btnEndTurn.click();
  });

  // 记录当前正在进行动画的手牌区域
  let activeHandElement = null;

  // Click upstream backs to draw
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".seatHand[data-from-player-index]");
    if (!b) return;
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (current.kind !== "human") return;
    const fromIdx = Number(b.dataset.fromPlayerIndex);
    markHumanAction();

    // 记录当前点击的元素
    activeHandElement = b;

    // 立即保存 fromIdx，防止快速松手时获取不到
    b.dataset.pendingFromIdx = String(fromIdx);

    // 触发甩卡动画（鼠标按下瞬间触发）
    animateUpstreamRotateAndOpen(fromIdx);
  });

  // 监听 pointerup 事件，松手时显示背景和打开抽牌界面
  document.addEventListener("pointerup", () => {
    // 检查是否有活跃的手牌区域
    if (!activeHandElement) return;

    const b = activeHandElement;
    const fromIdx = Number(b.dataset.pendingFromIdx);

    // 定义执行动画的函数
    const executeAnimation = () => {
      // 清除标记和活跃元素
      b.dataset.animationComplete = "";
      b.dataset.pendingFromIdx = "";
      activeHandElement = null; // 重置活跃元素

      // ⭐ 松手时立即隐藏上家所有手牌并立即打开抽牌界面
      const backs = Array.from(b.querySelectorAll(".miniBack"));
      backs.forEach(card => {
        card.style.opacity = '0';
        card.style.transition = 'opacity 150ms ease-out';
      });

      // 🔧 立即打开抽牌界面，与手牌淡出同时进行
      console.log('[玩上→抽1] 松手，隐藏手牌并立即打开抽牌界面');
      openDrawOverlay(fromIdx);

    }; // executeAnimation 函数结束

    // 检查动画是否完成，如果完成则立即执行，否则等待
    if (b.dataset.animationComplete === "true") {
      executeAnimation();
    } else {
      // 等待动画完成（最多等待100ms）
      const checkInterval = setInterval(() => {
        if (b.dataset.animationComplete === "true") {
          clearInterval(checkInterval);
          executeAnimation();
        }
      }, 10);

      // 100ms 后强制执行
      setTimeout(() => {
        clearInterval(checkInterval);
        if (activeHandElement === b) {
          executeAnimation();
        }
      }, 100);
    }
  });

  btnTryMatch.addEventListener("click", () => {
    if (!game || game.gameOver) return;
    advancePastOutPlayers();
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.out || current.kind !== "human") return;
    if (selected.length !== 2) return;
    markHumanAction();
    const [a, b] = selected;

    // Animate the two selected cards to discard pile if it matches.
    const aEl = $("#pBottomHand").querySelector(`.faceCard[data-card-id="${CSS.escape(a)}"]`);
    const bEl = $("#pBottomHand").querySelector(`.faceCard[data-card-id="${CSS.escape(b)}"]`);
    const res = window.Game.tryDiscardPairByCardIds(game, 0, a, b);
    if (res.ok) {
      const bottomHandEl = $("#pBottomHand");

      // 获取所有剩余手牌（不包括即将飞走的两张）
      const allCards = Array.from(bottomHandEl.querySelectorAll(".faceCard"));
      const remainingCards = allCards.filter(el => el !== aEl && el !== bEl);

      // 标记手牌区域正在做自适应动画
      bottomHandEl.dataset.adjusting = "true";

      // 计算新的布局位置（手牌数量减2）
      const newN = remainingCards.length;
      const newCenter = (newN - 1) / 2;
      const maxFanWidth = 920;
      const newSpread = Math.min(62, maxFanWidth / Math.max(1, newN - 1));

      // 立即为剩余手牌添加transition，并更新它们的位置（填补空缺）
      remainingCards.forEach((card, newIdx) => {
        const newD = newIdx - newCenter;
        const newX = newD * newSpread;
        const newRot = newD * 0.9;
        const newY = Math.abs(newD) * 0.8;

        // 添加平滑过渡
        card.style.transition = "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)";

        // 使用 requestAnimationFrame 确保transition生效
        requestAnimationFrame(() => {
          card.style.setProperty("--x", `${newX}px`);
          card.style.setProperty("--rot", `${newRot}deg`);
          card.style.setProperty("--y", `${newY}px`);
        });
      });

      // 启动出牌飞行动画（同时进行）
      if (aEl) flyToDiscard(aEl);
      if (bEl) flyToDiscard(bEl);

      // 等待自适应动画完成后，清除标记并重新渲染（清理transition等）
      setTimeout(() => {
        bottomHandEl.dataset.adjusting = "";
        renderSeats(game);
        renderDiscardPile(game);
        renderAction(game, settings);
        showLastEvent(game, settings);
      }, 500); // 略长于自适应动画时长（420ms）

      clearSelection();
    } else {
      // 配对失败，正常更新
      renderAll(game, settings);
    }
    // If the human just went out, immediately pass the turn.
    if (!game.gameOver && game.players[game.currentPlayerIndex]?.out) {
      closeDrawOverlay();
      window.Game.advanceTurn(game);
      renderAll(game, settings);
      runAiLoop(game, settings);
    }
  });

  btnClearSelect.addEventListener("click", () => {
    markHumanAction();
    clearSelection();
  });

  btnEndTurn.addEventListener("click", () => {
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (current.kind !== "human") return;
    const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
    const canDrawUpstream = window.Game.canDrawFrom(game, upstreamIdx);
    if (!game.turnHasDrawn && canDrawUpstream) return;
    markHumanAction();
    clearSelection();
    closeDrawOverlay();
    window.Game.advanceTurn(game);
    renderAll(game, settings);
    runAiLoop(game, settings);
  });

  syncSettings();

  // When AI advances and it becomes the human's turn, start the 8s timer baseline.
  const _renderAll = renderAll;
  renderAll = function patchedRenderAll(g, s) {
    _renderAll(g, s);
    if (!g) return;
    if (g.gameOver) {
      window.clearTimeout(hintT);
      hintT = null;
      window.clearTimeout(hintHandT);
      hintHandT = null;
      window.clearTimeout(runAiLoop._t);
      runAiLoop._t = null;
      clearHintHighlight();
      clearHintHand();

      const loser = window.Game.findJokerHolder(g.players);
      const youLose = loser && loser.id === g.players[0].id;
      const currentLevel = window.__GAME_ROUND_TRACKER__.currentLevel;

      // 显示关卡结果
      if (currentLevel > 3) {
        // 随机局：不分过关/失败，直接再来一局
        endTitle.textContent = youLose ? `你输了` : `🎉 你赢了！`;
        endSubtitle.textContent = youLose ? `你手里留着"王八牌"！` : (loser ? `${loser.name} 拿着王八牌。` : "");
        $("#btnNextLevel").style.display = "none";
        $("#btnPlayAgain").textContent = "再来一局";
      } else if (youLose) {
        endTitle.textContent = `第${currentLevel}关失败`;
        endSubtitle.textContent = `你手里留着"王八牌"！`;
        $("#btnNextLevel").style.display = "none";
        $("#btnPlayAgain").textContent = "重新挑战";
      } else {
        endTitle.textContent = `🎉 第${currentLevel}关通过！`;
        endSubtitle.textContent = loser ? `${loser.name} 拿着王八牌。` : "恭喜过关！";

        // 如果不是第三关，显示"进入下一关"按钮
        $("#btnNextLevel").style.display = "block";
        $("#btnPlayAgain").textContent = "重新挑战本关";
        if (currentLevel < 3) {
          $("#btnNextLevel").textContent = "进入下一关";
        } else {
          $("#btnNextLevel").textContent = "继续玩（随机局）";
          endSubtitle.textContent = "🎊 恭喜通关全部三关！";
        }
      }

      endOverlay.classList.remove("hidden");
      return;
    }
    const pid = g.players[g.currentPlayerIndex]?.id || null;
    if (pid !== lastTurnPlayerId) {
      lastTurnPlayerId = pid;
      if (g.players[g.currentPlayerIndex]?.kind === "human") {
        markHumanAction();
      } else {
        // not human turn: stop hints
        window.clearTimeout(hintT);
        hintT = null;
        window.clearTimeout(hintHandT);
        hintHandT = null;
        clearHintHighlight();
        clearHintHand();
        // ensure AI loop always starts when it's AI's turn (prevents "stuck after end turn")
        if (s.aiPaceMs < 1e6) {
          try {
            runAiLoop(g, s);
          } catch {
            // ignore
          }
        }
      }
    } else {
      // same turn: only schedule hints if it's human's turn
      // (avoid interfering with AI actions or player's existing hints)
      if (g.players[g.currentPlayerIndex]?.kind === "human") {
        scheduleHintFromNow();
      }
    }
  };
}

window.initUi = initUi;

