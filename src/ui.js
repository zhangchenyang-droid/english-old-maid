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
  const dealMode = !!opts.deal;
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
    s.count.textContent = p.out ? "已出完" : `手牌 ${p.hand.length}`;
  }

  // Render AI hands as backs only; human hand face-up.
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    const s = seatByIdx[i];
    s.hand.innerHTML = "";
    if (i === 0) {
      // You: show face-up cards (selectable on table)
      const n = p.hand.length;
      const center = (n - 1) / 2;
      for (let idx = 0; idx < n; idx++) {
        const card = p.hand[idx];
        const div = document.createElement("div");
        div.className = `faceCard ${card.type === "joker" ? "joker" : ""} ${card.type === "img" ? "imgCard" : ""}`;
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

        if (card.type === "joker") {
          div.dataset.corner = "JOKER";
          div.innerHTML = `
            <div class="cardContent">
              <div class="primaryText">JOKER</div>
              <div></div>
              <div class="secondaryText"></div>
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
      const showN = Math.min(10, p.hand.length);
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
          sx = d * 3;
          sy = d * 0.1;
          srot = 0;
        } else {
          // left/right: pile spreads downward
          sx = d * 0.1;
          sy = d * 2.4;
          // rotate 90° around each card's center for side players
          srot = i === 1 || i === 3 ? 90 : 0;
        }
        b.style.setProperty("--sx", `${sx}px`);
        b.style.setProperty("--sy", `${sy}px`);
        b.style.setProperty("--srot", `${srot}deg`);
        b.style.transitionDelay = `0ms`;
        b.style.zIndex = String(10 + k);
        s.hand.appendChild(b);
      }
    }
  }
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
    div.style.transform = `translate(-50%, -50%) rotate(${rotJitter(c.id, z)}deg)`;
    div.style.zIndex = String(z);

    if (isJoker) {
      div.dataset.corner = "JOKER";
      div.innerHTML = `
        <div class="cornerText">JOKER</div>
        <div class="centerText">JOKER<div class="centerSuit"></div></div>
        <div class="cornerText bottom">JOKER</div>
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
  const ghost = fromEl.cloneNode(true);
  ghost.classList.add("flyingCard");
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  ghost.animate(
    [
      { transform: "translate(0px,0px) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.75)`, opacity: 0.9 },
    ],
    { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)" }
  ).onfinish = () => ghost.remove();
}

function seatHandElByPlayerIndex(idx) {
  // Fixed mapping: 0 bottom(you), 1 right, 2 top, 3 left.
  if (idx === 0) return $("#pBottomHand");
  if (idx === 1) return $("#pRightHand");
  if (idx === 2) return $("#pTopHand");
  return $("#pLeftHand");
}

function flyFromRectToRect(fromRect, toRect, node) {
  const ghost = node;
  ghost.classList.add("flyingCard");
  ghost.style.left = `${fromRect.left}px`;
  ghost.style.top = `${fromRect.top}px`;
  ghost.style.width = `${fromRect.width}px`;
  ghost.style.height = `${fromRect.height}px`;
  document.body.appendChild(ghost);

  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
  ghost.animate(
    [
      { transform: "translate(0px,0px) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 0.95 },
    ],
    { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)" }
  ).onfinish = () => ghost.remove();
}

// Animate card draw with flying card (source -> target player hand)
// If drawing from human player (index 0), show face card; otherwise show back
function animateDrawCardFly(fromPlayerIdx, toPlayerIdx, drawnCard, onComplete) {
  try {
    const fromHandEl = seatHandElByPlayerIndex(fromPlayerIdx);
    const toHandEl = seatHandElByPlayerIndex(toPlayerIdx);
    if (!fromHandEl || !toHandEl) {
      if (onComplete) onComplete();
      return;
    }

    const fromRect = fromHandEl.getBoundingClientRect();
    const toRect = toHandEl.getBoundingClientRect();

    // Create flying card (face-up if from human player, back otherwise)
    const flyingCard = document.createElement("div");
    const showFace = fromPlayerIdx === 0; // human player is index 0

    if (showFace && drawnCard) {
      // Show face card
      flyingCard.className = `faceCard ${drawnCard.type === "joker" ? "joker" : ""} ${drawnCard.type === "img" ? "imgCard" : ""}`;
      flyingCard.style.width = "86px";
      flyingCard.style.height = "124px";

      if (drawnCard.type === "joker") {
        flyingCard.dataset.corner = "JOKER";
        flyingCard.innerHTML = `
          <div class="cardContent">
            <div class="primaryText">JOKER</div>
            <div></div>
            <div class="secondaryText"></div>
          </div>
        `;
      } else {
        flyingCard.dataset.corner = "";
        flyingCard.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="${escapeHtml(drawnCard.imgSrc)}" alt="card" draggable="false" /></div>
          </div>
        `;
      }
    } else {
      // Show back card
      flyingCard.className = "miniBack";
      flyingCard.style.width = "92px";
      flyingCard.style.height = "132px";
    }

    flyingCard.style.position = "fixed";
    const cardWidth = showFace ? 86 : 92;
    const cardHeight = showFace ? 124 : 132;
    flyingCard.style.left = `${fromRect.left + fromRect.width / 2 - cardWidth / 2}px`;
    flyingCard.style.top = `${fromRect.top + fromRect.height / 2 - cardHeight / 2}px`;
    flyingCard.style.zIndex = "10005";
    flyingCard.style.pointerEvents = "none";
    flyingCard.style.transform = "none";
    document.body.appendChild(flyingCard);

    const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
    const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

    const anim = flyingCard.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.75)`, opacity: 0.95 }
      ],
      { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)" }
    );

    anim.onfinish = () => {
      flyingCard.remove();
      if (onComplete) onComplete();
    };
  } catch (e) {
    console.error("animateDrawCardFly error:", e);
    if (onComplete) onComplete();
  }
}

// Animate AI discard pair: show two face-up cards flying from AI hand to discard pile
function animateAiDiscardPair(playerIdx, card1, card2, onComplete) {
  try {
    const fromHandEl = seatHandElByPlayerIndex(playerIdx);
    const discardPile = document.getElementById("discardPile");
    if (!fromHandEl || !discardPile) {
      if (onComplete) onComplete();
      return;
    }

    const fromRect = fromHandEl.getBoundingClientRect();
    const toRect = discardPile.getBoundingClientRect();

    // Sort cards: _A to left pile, _B to right pile
    let leftCard, rightCard;
    if (card1.imgSrc && card1.imgSrc.includes("_A.")) {
      leftCard = card1;
      rightCard = card2;
    } else if (card2.imgSrc && card2.imgSrc.includes("_A.")) {
      leftCard = card2;
      rightCard = card1;
    } else {
      // Fallback if no clear A/B suffix
      leftCard = card1;
      rightCard = card2;
    }

    const cards = [leftCard, rightCard];
    let completed = 0;

    cards.forEach((card, index) => {
      const flyingCard = document.createElement("div");
      flyingCard.className = `faceCard ${card.type === "joker" ? "joker" : ""} ${card.type === "img" ? "imgCard" : ""}`;
      flyingCard.style.width = "86px";
      flyingCard.style.height = "124px";
      flyingCard.style.position = "fixed";

      // Start position: offset slightly from hand center
      const startOffsetX = (index - 0.5) * 30;
      flyingCard.style.left = `${fromRect.left + fromRect.width / 2 - 43 + startOffsetX}px`;
      flyingCard.style.top = `${fromRect.top + fromRect.height / 2 - 62}px`;
      flyingCard.style.zIndex = "10005";
      flyingCard.style.pointerEvents = "none";
      flyingCard.style.transform = "none";

      if (card.type === "joker") {
        flyingCard.dataset.corner = "JOKER";
        flyingCard.innerHTML = `
          <div class="cardContent">
            <div class="primaryText">JOKER</div>
            <div></div>
            <div class="secondaryText"></div>
          </div>
        `;
      } else {
        flyingCard.dataset.corner = "";
        flyingCard.innerHTML = `
          <div class="cardContent">
            <div class="imgWrap"><img class="cardImg" src="${escapeHtml(card.imgSrc)}" alt="card" draggable="false" /></div>
          </div>
        `;
      }

      document.body.appendChild(flyingCard);

      // Target position: left pile (28%) or right pile (72%)
      const targetXPercent = index === 0 ? 0.28 : 0.72;
      const targetX = toRect.left + toRect.width * targetXPercent;
      const targetY = toRect.top + toRect.height * 0.52;

      const dx = targetX - (fromRect.left + fromRect.width / 2);
      const dy = targetY - (fromRect.top + fromRect.height / 2);

      // No delay - both cards fly simultaneously
      const anim = flyingCard.animate(
        [
          { transform: "translate(0px, 0px) scale(1) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.65) rotate(${(index - 0.5) * 12}deg)`, opacity: 0.9 }
        ],
        { duration: 480, easing: "cubic-bezier(.2,.9,.2,1)" }
      );

      anim.onfinish = () => {
        flyingCard.remove();
        completed++;
        if (completed === cards.length && onComplete) {
          onComplete();
        }
      };
    });
  } catch (e) {
    console.error("animateAiDiscardPair error:", e);
    if (onComplete) onComplete();
  }
}

// Animate Joker draw: from source -> center reveal -> target hand
function animateJokerDrawReveal(fromPlayerIdx, toPlayerIdx, onComplete) {
  try {
    const fromHandEl = seatHandElByPlayerIndex(fromPlayerIdx);
    const toHandEl = seatHandElByPlayerIndex(toPlayerIdx);
    if (!fromHandEl || !toHandEl) {
      if (onComplete) onComplete();
      return;
    }

    const fromRect = fromHandEl.getBoundingClientRect();
    const toRect = toHandEl.getBoundingClientRect();

    // Create flying Joker card
    const flyingCard = document.createElement("div");
    flyingCard.className = "faceCard joker";
    flyingCard.style.width = "86px";
    flyingCard.style.height = "124px";
    flyingCard.style.position = "fixed";
    flyingCard.style.left = `${fromRect.left + fromRect.width / 2 - 43}px`;
    flyingCard.style.top = `${fromRect.top + fromRect.height / 2 - 62}px`;
    flyingCard.style.zIndex = "10010";
    flyingCard.style.pointerEvents = "none";
    flyingCard.style.transform = "none";
    flyingCard.dataset.corner = "JOKER";
    flyingCard.innerHTML = `
      <div class="cardContent">
        <div class="primaryText">JOKER</div>
        <div></div>
        <div class="secondaryText"></div>
      </div>
    `;
    document.body.appendChild(flyingCard);

    // Step 1: Fly to center and scale up
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx1 = centerX - (fromRect.left + fromRect.width / 2);
    const dy1 = centerY - (fromRect.top + fromRect.height / 2);

    const anim1 = flyingCard.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
        { transform: `translate(${dx1}px, ${dy1}px) scale(1.35)`, opacity: 1 }
      ],
      { duration: 420, easing: "cubic-bezier(.2,.9,.2,1)" }
    );

    anim1.onfinish = () => {
      // Show name text
      const nameText = document.createElement("div");
      nameText.style.position = "fixed";
      nameText.style.left = "50%";
      nameText.style.top = `${centerY + 100}px`;
      nameText.style.transform = "translateX(-50%)";
      nameText.style.zIndex = "10011";
      nameText.style.fontSize = "18px";
      nameText.style.fontWeight = "900";
      nameText.style.color = "rgba(255,255,255,0.92)";
      nameText.style.textShadow = "0 2px 12px rgba(0,0,0,0.55)";
      nameText.style.pointerEvents = "none";
      nameText.textContent = `王八牌 → ${game?.players?.[toPlayerIdx]?.name || ""}`;
      document.body.appendChild(nameText);

      // Step 2: Wait briefly, then fly to target hand
      setTimeout(() => {
        nameText.remove();

        const currentRect = flyingCard.getBoundingClientRect();
        const dx2 = toRect.left + toRect.width / 2 - (currentRect.left + currentRect.width / 2);
        const dy2 = toRect.top + toRect.height / 2 - (currentRect.top + currentRect.height / 2);

        const anim2 = flyingCard.animate(
          [
            { transform: `translate(${dx1}px, ${dy1}px) scale(1.35)`, opacity: 1 },
            { transform: `translate(${dx1 + dx2}px, ${dy1 + dy2}px) scale(0.75)`, opacity: 0.95 }
          ],
          { duration: 420, easing: "cubic-bezier(.65,0,.35,1)" }
        );

        anim2.onfinish = () => {
          flyingCard.remove();
          if (onComplete) onComplete();
        };
      }, 720);
    };
  } catch (e) {
    console.error("animateJokerDrawReveal error:", e);
    if (onComplete) onComplete();
  }
}

function showJokerRevealAndFly(game, playerIndex) {
  // Always-visible centered overlay (not the message area below the table).
  const prev = document.querySelector(".jokerRevealOverlay");
  if (prev) prev.remove();

  const name = game?.players?.[playerIndex]?.name || "";
  const wrap = document.createElement("div");
  wrap.className = "jokerRevealOverlay";
  wrap.innerHTML = `
    <div class="jokerRevealInner">
      <div class="revealStage">
        <div class="revealCard joker" data-corner="JOKER">
          <div class="primaryText">JOKER</div>
          <div></div>
          <div class="secondaryText"></div>
        </div>
      </div>
      <div class="revealTo">王八牌 → ${escapeHtml(name)}</div>
    </div>
  `;
  document.body.appendChild(wrap);

  const revealEl = wrap.querySelector(".revealCard");
  if (!revealEl) {
    wrap.remove();
    return;
  }

  window.clearTimeout(showJokerRevealAndFly._t);
  showJokerRevealAndFly._t = window.setTimeout(() => {
    try {
      const from = revealEl.getBoundingClientRect();
      const handEl = seatHandElByPlayerIndex(playerIndex);
      const to = handEl.getBoundingClientRect();
      const ghost = revealEl.cloneNode(true);
      flyFromRectToRect(from, to, ghost);
    } catch {
      // ignore
    } finally {
      wrap.remove();
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
        <div class="revealCard joker" data-corner="JOKER">
          <div class="primaryText">JOKER</div>
          <div></div>
          <div class="secondaryText"></div>
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
      const ghost = revealEl.cloneNode(true);
      flyFromRectToRect(from, to, ghost);
    } catch {
      // ignore
    } finally {
      // Clear reveal after animation start
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
  const current = game.players[game.currentPlayerIndex];
  if (!current) return;
  // If somehow we landed on an "out" player, immediately advance until we reach an active one.
  if (current.out) {
    window.Game.advanceTurn(game);
    renderAll(game, settings);
    return runAiLoop(game, settings);
  }
  if (current.kind !== "ai") return;

  // AI：从下家随机抽一张
  const targetIdx = window.Game.getUpstreamPlayerIndex(game);
  const target = game.players[targetIdx];
  if (!target || target.out || target.hand.length === 0) {
    window.Game.advanceTurn(game);
    renderAll(game, settings);
    return runAiLoop(game, settings);
  }

  window.clearTimeout(runAiLoop._t);
  runAiLoop._t = window.setTimeout(() => {
    try {
      const idx = Math.floor(Math.random() * target.hand.length);
      const drawnCard = target.hand[idx];
      const isJoker = drawnCard && drawnCard.type === "joker";
      const currentIdx = game.currentPlayerIndex;

      if (isJoker) {
        // Joker: fly to center, reveal, then to AI hand
        animateJokerDrawReveal(targetIdx, currentIdx, () => {
          // After animation, execute the draw
          window.Game.drawCard(game, targetIdx, idx);
          renderAll(game, settings);

          // Continue AI turn: discard pairs with animation
          continueAiTurnAfterDraw();
        });
      } else {
        // Normal card: fly directly to AI hand
        animateDrawCardFly(targetIdx, currentIdx, drawnCard, () => {
          // After animation, execute the draw
          window.Game.drawCard(game, targetIdx, idx);
          renderAll(game, settings);

          // Continue AI turn: discard pairs with animation
          continueAiTurnAfterDraw();
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
                if (!game.gameOver) window.Game.advanceTurn(game);
                renderAll(game, settings);
                runAiLoop(game, settings);
                return;
              }

              // Animate discard, then execute and continue
              const aiIdx = game.currentPlayerIndex;
              animateAiDiscardPair(aiIdx, pair[0], pair[1], () => {
                window.Game.tryDiscardPairByCardIds(
                  game,
                  aiIdx,
                  pair[0].id,
                  pair[1].id
                );
                renderAll(game, settings);

                // Wait a bit before next pair
                window.setTimeout(discardNextPair, settings.aiPaceMs * 0.6);
              });
            };

            discardNextPair();
          } catch {
            // ignore
          }
        }, isJoker ? Math.max(settings.aiPaceMs, 1200) : settings.aiPaceMs);
      }
    } catch {
      // ignore
    }
  }, settings.aiPaceMs);
}

function initUi(imagePairs = []) {
  const settings = {
    showBothOnDraw: true,
    autoAdvanceMs: 0,
    aiPaceMs: 650,
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
  let upstreamOpenAnimating = false;
  let suppressDrawOverlayGhost = false; // avoid double-transition when we already animated the upstream pile

  let game = null;
  let selected = [];
  let lastHumanActionAt = 0;
  let hintT = null;
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
  const LAYOUT_KEY = "oldmaid_layout_v1";

  const DEFAULT_LAYOUT = {
    top: { left: 34, top: -7, width: 34.5, height: 28 },
    left: { left: -1.5, top: 25.5, width: 15, height: 44 },
    right: { left: 73.5, top: 29, width: 41, height: 34.5 },
    bottom: { left: 20, top: 66.5, width: 62, height: 25 },
    center: { left: 31.5, top: 35.5, width: 40, height: 20 },
    buttons: {
      hint: { x: 0, y: 0 },
      match: { x: 0, y: 0 },
      endturn: { x: 0, y: 0 },
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
      // Deep-merge for buttons
      const merged = { ...clone(DEFAULT_LAYOUT), ...parsed };
      merged.buttons = { ...clone(DEFAULT_LAYOUT).buttons, ...(parsed.buttons || {}) };
      merged.buttons.hint = { x: 0, y: 0, ...(merged.buttons.hint || {}) };
      merged.buttons.match = { x: 0, y: 0, ...(merged.buttons.match || {}) };
      merged.buttons.endturn = { x: 0, y: 0, ...(merged.buttons.endturn || {}) };
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
  }

  function maybeShowHint(isAuto = false) {
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;

    const pair = window.Game.findAnyPairInHand(game.players[0].hand);
    if (!pair) return;

    const a = pair[0].id;
    const b = pair[1].id;

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
  }

  function scheduleHintFromNow() {
    if (hintT) return; // already scheduled for current inactivity window
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.kind !== "human") return;
    if (!window.Game.findAnyPairInHand(game.players[0].hand)) return;

    const stamp = lastHumanActionAt;
    hintT = window.setTimeout(() => {
      // If user acted since scheduling, do nothing.
      if (lastHumanActionAt !== stamp) return;
      maybeShowHint(true); // 自动提示标记为 true
    }, HINT_MS);
  }

  function markHumanAction() {
    lastHumanActionAt = Date.now();
    clearHintHighlight();
    window.clearTimeout(hintT);
    hintT = null;
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
    settings.aiPaceMs = autoNextToggle.checked ? 650 : 9999999;

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
    const stepHuman = 22;
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

    const totalMs = base + allFace.length * stepHuman + 560 + 120;
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
      renderAll(game, settings);
      lastTurnPlayerId = game.players[game.currentPlayerIndex]?.id || null;
      markHumanAction();
      // 王八牌：不参与初始发牌；发牌动画结束后亮相并飞往随机玩家手牌
      if (game?.jokerPending) {
        const toIdx = Math.floor(Math.random() * game.players.length);
        window.Game.dealPendingJokerToPlayer(game, toIdx);
        renderAll(game, settings);
        window.setTimeout(() => runAiLoop(game, settings), 1250);
      } else {
        runAiLoop(game, settings);
      }
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
  btnRestart.addEventListener("click", () => {
    $("#game").classList.add("hidden");
    $("#setup").classList.remove("hidden");
    $("#message").innerHTML = "";
    game = null;
    selected = [];
    window.clearTimeout(hintT);
    hintT = null;
    window.clearTimeout(runAiLoop._t);
    runAiLoop._t = null;
    endOverlay.classList.add("hidden");
    updateTuneButtonState();
  });

  btnPlayAgain.addEventListener("click", () => {
    startNewGame();
  });

  btnBackToSetup.addEventListener("click", () => {
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
      // silent
    } catch {
      // Fallback: prompt copy
      window.prompt("复制下面的参数：", text);
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

  function openDrawOverlay(fromIdx) {
    if (!game || game.gameOver) return;
    advancePastOutPlayers();
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.out || current.kind !== "human") return;
    if (game.turnHasDrawn) return;
    const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
    if (fromIdx !== upstreamIdx) return;
    const target = game.players[fromIdx];
    if (!target || target.out || target.hand.length === 0) return;

    drawOverlay.classList.remove("hidden");
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

    // Transition: animate a single "ghost" card from upstream pile position to the overlay.
    // If we already played an upstream "pile rotate+scale" animation, skip this to keep it seamless.
    if (!suppressDrawOverlayGhost) {
      try {
        const srcHand = document.querySelector(`.seatHand[data-from-player-index="${fromIdx}"]`);
        const srcCard = srcHand ? srcHand.querySelector(".miniBack") : null;
        const srcRect = (srcCard || srcHand)?.getBoundingClientRect?.();
        const dstRect = drawRow.getBoundingClientRect();
        if (srcRect && dstRect) {
          const ghost = document.createElement("div");
          ghost.className = "drawTransitionGhost";
          // Start at the upstream pile card.
          ghost.style.transform = `translate(${srcRect.left}px, ${srcRect.top}px)`;
          document.body.appendChild(ghost);
          // End near the drawRow (top-left), then removed as cards spread in.
          const endX = dstRect.left + 8;
          const endY = dstRect.top + 8;
          ghost.animate(
            [
              { transform: `translate(${srcRect.left}px, ${srcRect.top}px) scale(1)` },
              { transform: `translate(${endX}px, ${endY}px) scale(1.05)` },
            ],
            { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
          ).onfinish = () => ghost.remove();
        }
      } catch {
        // ignore
      }
    }

    // Thumb animation: start as full bar, then shrink to correct width in sync with the "spread" timeline.
    // If the user interacts (wheel/drag), we will instantly finish this animation for max smoothness.
    try { if (drawThumbAnimRaf != null) window.cancelAnimationFrame(drawThumbAnimRaf); } catch { /* ignore */ }
    drawThumbAnimRaf = null;
    drawThumbFinalWPercent = 100;
    drawThumb.style.setProperty("--thumbDur", `0ms`);
    drawThumb.style.setProperty("--thumbW", "100%");
    drawThumb.style.setProperty("--thumbX", "0px");

    for (let i = 0; i < target.hand.length; i++) {
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

        // Get the card that will be drawn (peek before actual draw)
        const drawnCard = target.hand[i];
        const isJoker = drawnCard && drawnCard.type === "joker";

        closeDrawOverlay();

        if (isJoker) {
          // Joker: fly to center, reveal, then to hand
          animateJokerDrawReveal(fromIdx, 0, () => {
            // Execute actual draw after animation completes
            window.Game.drawCard(game, fromIdx, i);
            clearSelection();
            renderAll(game, settings);
          });
        } else {
          // Normal card: fly directly to hand
          animateDrawCardFly(fromIdx, 0, drawnCard, () => {
            // Execute actual draw
            window.Game.drawCard(game, fromIdx, i);
            clearSelection();
            renderAll(game, settings);
          });
        }
      });
      drawRow.appendChild(b);
      // stagger in
      window.setTimeout(() => b.classList.add("in"), 30 + i * 18);
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
          const CARD_W = 160;
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
    }
    suppressDrawOverlayGhost = false;
  }

  function animateUpstreamHandThenOpen(fromIdx) {
    // Only animate the upstream pile (table). Draw overlay stays unchanged.
    if (upstreamOpenAnimating) return;
    if (!game || game.gameOver) return;
    advancePastOutPlayers();
    const current = game.players[game.currentPlayerIndex];
    if (!current || current.out || current.kind !== "human") return;
    if (game.turnHasDrawn) return;
    const upstreamIdx = window.Game.getUpstreamPlayerIndex(game);
    if (fromIdx !== upstreamIdx) return;
    const target = game.players[fromIdx];
    if (!target || target.out || target.hand.length === 0) return;

    const srcHand = document.querySelector(`.seatHand[data-from-player-index="${fromIdx}"]`);
    if (!srcHand) {
      openDrawOverlay(fromIdx);
      return;
    }
    const srcRect = srcHand.getBoundingClientRect();
    if (!srcRect) {
      openDrawOverlay(fromIdx);
      return;
    }

    upstreamOpenAnimating = true;
    suppressDrawOverlayGhost = true;

    // Clone the upstream pile and animate the clone (do not touch the real layout).
    const ghost = srcHand.cloneNode(true);
    ghost.classList.add("upstreamHandGhost");
    ghost.style.left = `${srcRect.left}px`;
    ghost.style.top = `${srcRect.top}px`;
    ghost.style.width = `${srcRect.width}px`;
    ghost.style.height = `${srcRect.height}px`;
    document.body.appendChild(ghost);
    // Avoid double vision.
    srcHand.style.visibility = "hidden";

    // Target pose: rotate + translate-right sequence (no move-to-center), then hand off to draw overlay.
    // Note: draw overlay itself is unchanged; we only animate the upstream pile ghost.
    const scale = 160 / 92; // drawBack width / miniBack width
    // Decide "toward center" direction automatically:
    // - If upstream pile is on the left side of the table, +X moves toward center
    // - If it's on the right side, -X moves toward center
    let dir = 1;
    try {
      const tableBg = document.querySelector(".tableBg");
      const tRect = tableBg ? tableBg.getBoundingClientRect() : null;
      if (tRect) {
        const tableCx = tRect.left + tRect.width / 2;
        const srcCx = srcRect.left + srcRect.width / 2;
        dir = srcCx < tableCx ? 1 : -1;
      } else {
        // fallback: right player (1) tends to be on the right side
        dir = fromIdx === 1 ? -1 : 1;
      }
    } catch {
      dir = fromIdx === 1 ? -1 : 1;
    }

    // Trajectory (updated): start directly from step2 (green) -> step3 (blue).
    // Values are absolute translateX positions relative to the starting point (ghost starts at 0).
    const x2 = -70 * dir;   // step2 (green)
    // Step3 end: align to the left-most card position in the draw overlay row.
    // Compute analytically (no need to toggle overlay visibility, avoiding any layout side-effects).
    let x3 = 310 * dir; // fallback
    try {
      const nCards = target.hand.length;
      const CARD_W = 160;
      const GAP = 12;
      const OVERLAY_PAD_X = 12; // .drawOverlayInner padding: 14px 12px 12px
      const ROW_PAD_X = 6; // .drawRow padding: 6px 6px ...

      const tableBg = document.querySelector(".tableBg");
      const rect = tableBg ? tableBg.getBoundingClientRect() : null;
      if (rect) {
        const w = Math.max(320, Math.floor(rect.width));
        const overlayLeft = (window.innerWidth - w) / 2;
        const rowLeft = overlayLeft + OVERLAY_PAD_X + ROW_PAD_X;
        const rowW = Math.max(0, w - OVERLAY_PAD_X * 2);
        const avail = Math.max(0, rowW - ROW_PAD_X * 2);
        const contentW = nCards * CARD_W + Math.max(0, nCards - 1) * GAP;
        const leftMostX =
          contentW <= avail
            ? rowLeft + (avail - contentW) / 2
            : rowLeft;
        x3 = leftMostX - srcRect.left;
      }
    } catch {
      // keep fallback
    }

    // Rebuild the ghost so translation/scale and rotation can be animated independently.
    // This removes the visible "pause" at the end of step1: rotation is time-based from step1 start to step2 end.
    const wrap = document.createElement("div");
    wrap.className = "upstreamHandGhost";
    wrap.style.left = `${srcRect.left}px`;
    wrap.style.top = `${srcRect.top}px`;
    wrap.style.width = `${srcRect.width}px`;
    wrap.style.height = `${srcRect.height}px`;
    document.body.appendChild(wrap);
    // IMPORTANT: reuse the already-cloned `ghost` (it was created before we hid `srcHand`),
    // otherwise cloning after `srcHand.style.visibility="hidden"` would copy that and become invisible.
    const inner = ghost;
    // Ensure visible and reset any positioning copied from the first-ghost usage.
    inner.style.visibility = "";
    inner.classList.remove("upstreamHandGhost");
    inner.style.position = "absolute";
    inner.style.left = "0";
    inner.style.top = "0";
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.transformOrigin = "center";
    wrap.appendChild(inner);

    // Move + scale (2 segments). No rotation here.
    const aMove = wrap.animate(
      [
        { offset: 0, transform: "translateX(0px) scale(1)", opacity: 1, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        // Step2 faster: reach x2 earlier
        { offset: 0.52, transform: `translateX(${x2}px) scale(${scale})`, opacity: 1, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        { offset: 1, transform: `translateX(${x3}px) scale(${scale})`, opacity: 1, easing: "cubic-bezier(0.18, 0.95, 0.22, 1)" },
      ],
      { duration: 260, fill: "forwards" }
    );

    // Rotation: compute purely by time.
    // From now to the end of step2 (offset 0.70), rotate 0 -> -120 linearly.
    // Then during step3 rotate -120 -> (-120 + 30) = -90 for handoff.
    inner.animate(
      [
        { offset: 0, transform: "rotate(0deg)", easing: "linear" },
        // Step2 faster: reach -120deg earlier
        { offset: 0.52, transform: "rotate(-120deg)", easing: "linear" },
        { offset: 1, transform: "rotate(-90deg)", easing: "cubic-bezier(0.18, 0.95, 0.22, 1)" },
      ],
      { duration: 260, fill: "forwards" }
    );

    aMove.onfinish = () => {
      // Open overlay first (same frame) so the visual flow is continuous.
      openDrawOverlay(fromIdx);
      // Cleanup on next frame to avoid a visible "gap" between transitions.
      window.requestAnimationFrame(() => {
        try { wrap.remove(); } catch { /* ignore */ }
        srcHand.style.visibility = "";
        upstreamOpenAnimating = false;
        // Keep suppressing the overlay ghost just for this opening.
        window.setTimeout(() => { suppressDrawOverlayGhost = false; }, 0);
      });
    };
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
    const CARD_W = 160;  // .drawBack width
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
  const CARD_DRAG_SCALE_EXTRA = 0.11; // additional scale near caps (ease-out)
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

  // Click upstream backs to draw
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".seatHand[data-from-player-index]");
    if (!b) return;
    if (!game || game.gameOver) return;
    const current = game.players[game.currentPlayerIndex];
    if (current.kind !== "human") return;
    const fromIdx = Number(b.dataset.fromPlayerIndex);
    markHumanAction();
    animateUpstreamHandThenOpen(fromIdx);
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
      if (aEl) flyToDiscard(aEl);
      if (bEl) flyToDiscard(bEl);
      clearSelection();
    }
    renderAll(game, settings);
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
      window.clearTimeout(runAiLoop._t);
      runAiLoop._t = null;
      clearHintHighlight();

      const loser = window.Game.findJokerHolder(g.players);
      const youLose = loser && loser.id === g.players[0].id;
      endTitle.textContent = youLose ? "你输了" : "你赢了";
      endSubtitle.textContent = loser ? `${loser.name} 最后拿着 JOKER。` : "游戏结束。";
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
        clearHintHighlight();
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
      // same turn: if user is idle and we newly have a pair (e.g., after draw), ensure a timer exists
      scheduleHintFromNow();
    }
  };
}

window.initUi = initUi;

