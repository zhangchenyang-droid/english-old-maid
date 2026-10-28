/* Core game logic (no DOM). No ES modules so file:// works. */

function createRng(seedString = "") {
  // Mulberry32 PRNG from string seed (deterministic shuffles if needed).
  let h = 1779033703 ^ seedString.length;
  for (let i = 0; i < seedString.length; i++) {
    h = Math.imul(h ^ seedString.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h >>> 0) || 1;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeckFromImagePairs(pairs) {
  const deck = [];
  for (const p of pairs) {
    const pairId = p.key;
    deck.push({
      id: `${pairId}_A`,
      type: "img",
      pairId,
      side: "A",
      imgSrc: p.A,
    });
    deck.push({
      id: `${pairId}_B`,
      type: "img",
      pairId,
      side: "B",
      imgSrc: p.B,
    });
  }
  // One unmatchable joker card (Old Maid)
  deck.push({
    id: "joker",
    type: "joker",
    pairId: null,
    side: null,
  });
  return deck;
}

function extractJoker(deck) {
  let joker = null;
  const rest = [];
  for (const c of deck) {
    if (c && c.type === "joker" && !joker) joker = c;
    else rest.push(c);
  }
  if (!joker) joker = { id: "joker", type: "joker", pairId: null, side: null };
  return { joker, rest };
}

function buildPlayers(playerCount) {
  return Array.from({ length: playerCount }).map((_, i) => ({
    id: `p${i + 1}`,
    name: i === 0 ? "你" : `AI${i}`,
    kind: i === 0 ? "human" : "ai",
    hand: [],
    out: false,
  }));
}

function initialDeal(deck, playerCount, rand = Math.random) {
  const players = buildPlayers(playerCount);
  shuffleInPlace(deck, rand);

  const CARDS_PER_PLAYER = 12;
  const A_CARDS_PER_PLAYER = 6;
  const B_CARDS_PER_PLAYER = 6;

  // 🆕 根据关卡决定发牌策略
  const tracker = window.__GAME_ROUND_TRACKER__;
  const currentLevel = tracker ? tracker.currentLevel : 1;

  // ============ 第3关之后：随机局（纯随机发牌，无任何配对控制） ============
  if (currentLevel > 3) {
    // deck 已洗过，整副轮流发给每个玩家
    deck.forEach((card, i) => players[i % playerCount].hand.push(card));
    for (const p of players) p.out = p.hand.length === 0;
    console.log(`[随机局] 纯随机发牌:`, players.map(p => `${p.name}:${p.hand.length}张`).join(' '));
    return players;
  }

  console.log(`[发牌调试] GAME_ROUND_TRACKER:`, tracker);
  console.log(`[发牌调试] currentLevel = ${currentLevel}, 类型: ${typeof currentLevel}`);

  let humanMatchablePairs, aiMatchablePairs;

  // ============ 第1关：新手教学关 ============
  if (currentLevel === 1) {
    humanMatchablePairs = 6;  // 玩家12张全配对（6对全能消除）
    aiMatchablePairs = 2 + Math.floor(rand() * 2);  // AI: 2-3对
    console.log(`[第1关] 新手教学模式 - 玩家6对全能消除`);
  }
  // ============ 第2关：正常难度 ============
  else if (currentLevel === 2) {
    humanMatchablePairs = 3 + Math.floor(rand() * 3);  // 玩家: 3-5对可消除
    aiMatchablePairs = 2 + Math.floor(rand() * 2);  // AI: 2-3对
    console.log(`[第2关] 正常难度 - 玩家${humanMatchablePairs}对可消除（共6对牌）`);
  }
  // ============ 第3关：困难模式 ============
  else if (currentLevel === 3) {
    humanMatchablePairs = 3 + Math.floor(rand() * 3);  // 玩家: 3-5对可消除
    aiMatchablePairs = 2 + Math.floor(rand() * 2);  // AI: 2-3对
    console.log(`[第3关] 困难模式 - 玩家${humanMatchablePairs}对可消除（共6对牌）`);
  }
  // ============ 默认：使用第2关规则 ============
  else {
    humanMatchablePairs = 3 + Math.floor(rand() * 3);  // 3-5对可消除
    aiMatchablePairs = 2 + Math.floor(rand() * 2);  // AI: 2-3对
    console.log(`[第${currentLevel}关] 使用默认规则 - 玩家${humanMatchablePairs}对可消除（共6对牌）`);
  }

  console.log(`[发牌] 第${currentLevel}关 - 玩家可配对:${humanMatchablePairs}对，AI可配对:${aiMatchablePairs}对`);

  // 按 pairId 分组
  const pairGroups = new Map();
  for (const card of deck) {
    if (!card.pairId) continue;
    if (!pairGroups.has(card.pairId)) pairGroups.set(card.pairId, []);
    pairGroups.get(card.pairId).push(card);
  }

  const allPairIds = Array.from(pairGroups.keys());
  shuffleInPlace(allPairIds, rand);

  // 🚨 关键修复：追踪每张卡是否已被使用（不是追踪pairId）
  const usedCards = new Set();  // 存储已发出的卡牌ID
  const playerHasPairId = players.map(() => new Set());  // 每个玩家已有的pairId

  for (let p = 0; p < playerCount; p++) {
    const targetMatchablePairs = p === 0 ? humanMatchablePairs : aiMatchablePairs;

    // 1. 先发可配对的完整对
    let dealtPairs = 0;
    for (const pairId of allPairIds) {
      if (dealtPairs >= targetMatchablePairs) break;

      const cards = pairGroups.get(pairId);
      const availableA = cards.find(c => c.side === 'A' && !usedCards.has(c.id));
      const availableB = cards.find(c => c.side === 'B' && !usedCards.has(c.id));

      if (availableA && availableB) {
        players[p].hand.push(availableA, availableB);
        usedCards.add(availableA.id);
        usedCards.add(availableB.id);
        playerHasPairId[p].add(pairId);  // 记录玩家已有的pairId
        dealtPairs++;
      }
    }

    // 2. 补充A卡到6张（🚨 避免玩家已有该pairId）
    const currentA = players[p].hand.filter(c => c.side === 'A').length;
    const needA = A_CARDS_PER_PLAYER - currentA;
    let addedA = 0;

    for (const pairId of allPairIds) {
      if (addedA >= needA) break;
      if (playerHasPairId[p].has(pairId)) continue;  // 🚨 跳过玩家已有的pairId
      const cards = pairGroups.get(pairId);
      const availableA = cards.find(c => c.side === 'A' && !usedCards.has(c.id));
      if (availableA) {
        players[p].hand.push(availableA);
        usedCards.add(availableA.id);
        playerHasPairId[p].add(pairId);  // 记录pairId
        addedA++;
      }
    }

    // 3. 补充B卡到6张（🚨 避免玩家已有该pairId）
    const currentB = players[p].hand.filter(c => c.side === 'B').length;
    const needB = B_CARDS_PER_PLAYER - currentB;
    let addedB = 0;

    for (const pairId of allPairIds) {
      if (addedB >= needB) break;
      if (playerHasPairId[p].has(pairId)) continue;  // 🚨 跳过玩家已有的pairId
      const cards = pairGroups.get(pairId);
      const availableB = cards.find(c => c.side === 'B' && !usedCards.has(c.id));
      if (availableB) {
        players[p].hand.push(availableB);
        usedCards.add(availableB.id);
        playerHasPairId[p].add(pairId);  // 记录pairId
        addedB++;
      }
    }

    console.log(`[发牌] ${players[p].name}: ${players[p].hand.length}张 (A:${players[p].hand.filter(c=>c.side==='A').length} B:${players[p].hand.filter(c=>c.side==='B').length})，目标可消除:${targetMatchablePairs}对`);
  }

  // 验证：检查是否有重复卡牌
  console.log("=== 发牌结果检查 ===");
  for (let p = 0; p < playerCount; p++) {
    const aCount = players[p].hand.filter(c => c.side === 'A').length;
    const bCount = players[p].hand.filter(c => c.side === 'B').length;
    const total = players[p].hand.length;

    // 检查重复卡牌
    const cardIds = new Set();
    const duplicates = [];
    players[p].hand.forEach(c => {
      if (cardIds.has(c.id)) {
        duplicates.push(c.id);
      }
      cardIds.add(c.id);
    });

    // 统计可配对数
    const pairIdCount = new Map();
    players[p].hand.forEach(c => {
      if (!pairIdCount.has(c.pairId)) pairIdCount.set(c.pairId, { A: 0, B: 0 });
      pairIdCount.get(c.pairId)[c.side]++;
    });
    let actualPairs = 0;
    for (const [pairId, count] of pairIdCount.entries()) {
      if (count.A > 0 && count.B > 0) actualPairs++;
    }

    const dupStatus = duplicates.length > 0 ? `❌ 重复:${duplicates.join(',')}` : '✓';
    console.log(`${players[p].name}: ${total}张 (A:${aCount} B:${bCount}) 实际可配对:${actualPairs}对 ${dupStatus}`);
  }
  console.log("==================");

  // 打乱手牌
  for (const p of players) {
    shuffleInPlace(p.hand, rand);
  }

  for (const p of players) {
    p.out = p.hand.length === 0;
  }

  return players;
}



function countSidesInHand(hand) {
  let a = 0;
  let b = 0;
  for (const c of hand) {
    if (!c || c.type === "joker") continue;
    if (c.side === "A") a++;
    else if (c.side === "B") b++;
  }
  return { a, b };
}

function dealConstrained22Pairs(pairs, playerCount, rand = Math.random) {
  // Constraints for the 22-pair mode (4 players):
  // - Each player's non-joker hand maintains A:B == 1:1
  // - Human's "initial discardable pairs count" follows the requested distribution:
  //   - 5%  : full clear (all 12 cards are pairs => 6 pairs)
  //   - 15% : 2 pairs
  //   - 50% : 3 pairs
  //   - 30% : 4 pairs
  // - Joker is not dealt to the human in this mode (keeps the distribution stable and avoids instant-loss confusion)
  if (playerCount !== 4) throw new Error("Constrained deal only supports 4 players.");
  if (!Array.isArray(pairs) || pairs.length !== 22) {
    throw new Error("Constrained deal expects exactly 22 pairs.");
  }

  const players = buildPlayers(playerCount);

  // Fixed non-joker hand sizes (sum to 44):
  // - Human: 12
  // - AI:    12, 10, 10 (one of the 10s will also get the joker => 11 total)
  const humanIdx = 0;
  const aiIdxs = [1, 2, 3];
  shuffleInPlace(aiIdxs, rand);
  const ai12 = aiIdxs[0];
  const ai10a = aiIdxs[1];
  const ai10b = aiIdxs[2];

  const targetNonJoker = Array(playerCount).fill(0);
  targetNonJoker[humanIdx] = 12;
  targetNonJoker[ai12] = 12;
  targetNonJoker[ai10a] = 10;
  targetNonJoker[ai10b] = 10;

  // Build pair objects so we can split A/B if needed.
  const pairObjs = pairs.map((p) => {
    const pairId = p.key;
    return {
      pairId,
      A: { id: `${pairId}_A`, type: "img", pairId, side: "A", imgSrc: p.A },
      B: { id: `${pairId}_B`, type: "img", pairId, side: "B", imgSrc: p.B },
    };
  });
  shuffleInPlace(pairObjs, rand);

  function pickHumanPairsCount() {
    const r = rand();
    if (r < 0.05) return 6; // full clear with 12 cards
    if (r < 0.20) return 2;
    if (r < 0.70) return 3;
    return 4;
  }

  const humanPairsTarget = pickHumanPairsCount();
  const humanSingles = targetNonJoker[humanIdx] - humanPairsTarget * 2; // 0,4,6,8
  if (humanSingles < 0 || humanSingles % 2 !== 0) {
    throw new Error("Invalid human pair distribution.");
  }

  // Human gets exactly N full pairs.
  for (let k = 0; k < humanPairsTarget; k++) {
    const next = pairObjs.pop();
    if (!next) throw new Error("Not enough pairs for human full pairs.");
    players[humanIdx].hand.push(next.A, next.B);
  }

  // Human fills the rest with singles: keep A:B == 1:1 and ensure these singles never form a complete pair.
  const singlesHalf = humanSingles / 2;
  const looseA = [];
  const looseB = [];
  for (let k = 0; k < singlesHalf; k++) {
    const next = pairObjs.pop();
    if (!next) throw new Error("Not enough pairs for human singles.");
    players[humanIdx].hand.push(next.A);
    looseB.push(next.B);
  }
  for (let k = 0; k < singlesHalf; k++) {
    const next = pairObjs.pop();
    if (!next) throw new Error("Not enough pairs for human singles.");
    players[humanIdx].hand.push(next.B);
    looseA.push(next.A);
  }

  // Build side pools for the remaining cards (including leftovers from split pairs).
  const poolA = looseA.slice();
  const poolB = looseB.slice();
  for (const p of pairObjs) {
    poolA.push(p.A);
    poolB.push(p.B);
  }
  shuffleInPlace(poolA, rand);
  shuffleInPlace(poolB, rand);

  // Deal to AIs by side counts (keeps A:B=1:1 automatically).
  for (const pi of [ai12, ai10a, ai10b]) {
    const half = targetNonJoker[pi] / 2;
    for (let k = 0; k < half; k++) {
      const c = poolA.pop();
      if (!c) throw new Error("PoolA exhausted.");
      players[pi].hand.push(c);
    }
    for (let k = 0; k < half; k++) {
      const c = poolB.pop();
      if (!c) throw new Error("PoolB exhausted.");
      players[pi].hand.push(c);
    }
  }

  // Shuffle each hand for randomness and sanity-check.
  for (let pi = 0; pi < playerCount; pi++) {
    shuffleInPlace(players[pi].hand, rand);
    players[pi].out = players[pi].hand.length === 0;
    const nonJoker = players[pi].hand.filter((c) => c.type !== "joker");
    const { a, b } = countSidesInHand(nonJoker);
    if (a !== b) throw new Error("Constrained deal failed: A/B not 1:1.");
  }

  // Sanity: human complete pairs equals the configured target.
  if (countCompletePairsInHand(players[humanIdx].hand) !== humanPairsTarget) {
    throw new Error("Constrained deal failed: human pairs count mismatch.");
  }

  return players;
}

function balanceHandSides(players, rand = Math.random) {
  const human = players[0];
  if (!human) return;

  function countSides(hand) {
    return countSidesInHand(hand);
  }

  function pickIndexBySide(hand, side) {
    const idxs = [];
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      if (!c || c.type === "joker") continue;
      if (c.side === side) idxs.push(i);
    }
    if (idxs.length === 0) return -1;
    return idxs[Math.floor(rand() * idxs.length)];
  }

  // Try a few swaps to make |A-B| <= 1 for the human player.
  for (let guard = 0; guard < 80; guard++) {
    const { a, b } = countSides(human.hand);
    const diff = a - b;
    if (Math.abs(diff) <= 1) break;

    const humanHasMoreSide = diff > 0 ? "A" : "B";
    const humanNeedsSide = diff > 0 ? "B" : "A";

    // Find a target player who has an excess of the needed side, to improve both hands.
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let pi = 1; pi < players.length; pi++) {
      const p = players[pi];
      const cs = countSides(p.hand);
      const pDiff = cs.a - cs.b;
      // score: does player have the side we need, and will swap reduce their imbalance too?
      const hasNeeded = humanNeedsSide === "A" ? cs.a : cs.b;
      const hasMore = humanHasMoreSide === "A" ? cs.a : cs.b;
      if (hasNeeded === 0 || hasMore === 0) continue;

      const score =
        (humanNeedsSide === "A" ? cs.a : cs.b) -
        Math.abs(pDiff); // prefer plenty of needed side and already imbalanced
      if (score > bestScore) {
        bestScore = score;
        bestIdx = pi;
      }
    }

    if (bestIdx < 0) {
      // fallback: any player who has the needed side
      for (let pi = 1; pi < players.length; pi++) {
        const p = players[pi];
        const idx = pickIndexBySide(p.hand, humanNeedsSide);
        if (idx >= 0) {
          bestIdx = pi;
          break;
        }
      }
    }
    if (bestIdx < 0) break;

    const target = players[bestIdx];
    const hi = pickIndexBySide(human.hand, humanHasMoreSide);
    const ti = pickIndexBySide(target.hand, humanNeedsSide);
    if (hi < 0 || ti < 0) break;

    const temp = human.hand[hi];
    human.hand[hi] = target.hand[ti];
    target.hand[ti] = temp;
  }
}

function countCompletePairsInHand(hand) {
  const byKey = new Map(); // pairId -> {A:boolean,B:boolean}
  for (const c of hand) {
    if (!c || !c.pairId || c.type === "joker") continue;
    if (!byKey.has(c.pairId)) byKey.set(c.pairId, { A: false, B: false });
    const s = byKey.get(c.pairId);
    if (c.side === "A") s.A = true;
    if (c.side === "B") s.B = true;
  }
  let count = 0;
  for (const s of byKey.values()) if (s.A && s.B) count++;
  return count;
}

function ensureHumanHasAtLeastNPairs(players, minPairs, rand = Math.random) {
  const human = players[0];
  if (!human || minPairs <= 0) return;
  if (human.hand.length < 4) return; // cannot have 2 pairs

  const maxPairsPossible = Math.floor(
    human.hand.filter((c) => c && c.type !== "joker").length / 2
  );
  if (maxPairsPossible < minPairs) return;

  function findInHand(p, pairId, side) {
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      if (c && c.pairId === pairId && c.side === side) return i;
    }
    return -1;
  }

  function findElsewhere(pairId, side) {
    for (let pi = 1; pi < players.length; pi++) {
      const idx = findInHand(players[pi], pairId, side);
      if (idx >= 0) return { pi, idx };
    }
    return null;
  }

  function chooseHumanGiveIndex(avoidPairId) {
    // Prefer giving away cards that are NOT part of an already complete pair.
    const complete = new Set();
    const state = new Map();
    for (const c of human.hand) {
      if (!c || !c.pairId || c.type === "joker") continue;
      if (!state.has(c.pairId)) state.set(c.pairId, { A: false, B: false });
      const s = state.get(c.pairId);
      if (c.side === "A") s.A = true;
      if (c.side === "B") s.B = true;
    }
    for (const [pid, s] of state.entries()) if (s.A && s.B) complete.add(pid);

    const candidates = [];
    for (let i = 0; i < human.hand.length; i++) {
      const c = human.hand[i];
      if (!c || c.type === "joker") continue;
      if (avoidPairId && c.pairId === avoidPairId) continue;
      const score = complete.has(c.pairId) ? -10 : 0;
      candidates.push({ i, score });
    }
    if (candidates.length === 0) return -1;
    candidates.sort((a, b) => b.score - a.score);
    const bestScore = candidates[0].score;
    const best = candidates.filter((c) => c.score === bestScore);
    return best[Math.floor(rand() * best.length)].i;
  }

  function swapWithHuman(pi, aiIdx, humanIdx) {
    const tmp = human.hand[humanIdx];
    human.hand[humanIdx] = players[pi].hand[aiIdx];
    players[pi].hand[aiIdx] = tmp;
  }

  // Phase 1: complete existing partial pairs in the human hand.
  for (let guard = 0; guard < 120; guard++) {
    if (countCompletePairsInHand(human.hand) >= minPairs) return;

    const state = new Map();
    for (const c of human.hand) {
      if (!c || !c.pairId || c.type === "joker") continue;
      if (!state.has(c.pairId)) state.set(c.pairId, { A: false, B: false });
      const s = state.get(c.pairId);
      if (c.side === "A") s.A = true;
      if (c.side === "B") s.B = true;
    }
    const needs = [];
    for (const [pid, s] of state.entries()) {
      if (s.A && !s.B) needs.push({ pid, want: "B" });
      if (s.B && !s.A) needs.push({ pid, want: "A" });
    }
    if (needs.length === 0) break;

    const pick = needs[Math.floor(rand() * needs.length)];
    const loc = findElsewhere(pick.pid, pick.want);
    if (!loc) continue;
    const giveIdx = chooseHumanGiveIndex(pick.pid);
    if (giveIdx < 0) break;
    swapWithHuman(loc.pi, loc.idx, giveIdx);
  }

  // Phase 2: import full pairs from AI (two swaps), until reaching minPairs or no options.
  for (let guard = 0; guard < 120; guard++) {
    if (countCompletePairsInHand(human.hand) >= minPairs) return;

    let chosen = null;
    for (let pi = 1; pi < players.length && !chosen; pi++) {
      const p = players[pi];
      for (const c of p.hand) {
        if (!c || !c.pairId || c.type === "joker") continue;
        const pid = c.pairId;
        // locate both A and B among AI hands
        const locA = findElsewhere(pid, "A");
        const locB = findElsewhere(pid, "B");
        if (locA && locB) {
          chosen = { pid, locA, locB };
          break;
        }
      }
    }
    if (!chosen) break;

    const give1 = chooseHumanGiveIndex(chosen.pid);
    if (give1 < 0) break;
    swapWithHuman(chosen.locA.pi, chosen.locA.idx, give1);

    const give2 = chooseHumanGiveIndex(chosen.pid);
    if (give2 < 0) break;
    // re-locate B (indices may have shifted)
    const bIdx2 = findInHand(players[chosen.locB.pi], chosen.pid, "B");
    if (bIdx2 < 0) continue;
    swapWithHuman(chosen.locB.pi, bIdx2, give2);
  }
}

function discardAllPairsInPlace(hand) {
  const byPair = new Map();
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (!c.pairId) continue;
    if (!byPair.has(c.pairId)) byPair.set(c.pairId, []);
    byPair.get(c.pairId).push(i);
  }

  // Remove pairs; each pairId has at most 2 cards globally, but be safe.
  const indicesToRemove = [];
  for (const [pairId, idxs] of byPair.entries()) {
    if (idxs.length >= 2) {
      // remove in pairs of 2
      for (let k = 0; k + 1 < idxs.length; k += 2) {
        indicesToRemove.push(idxs[k], idxs[k + 1]);
      }
    }
  }
  if (indicesToRemove.length === 0) return [];

  indicesToRemove.sort((a, b) => b - a);
  const removed = [];
  for (const idx of indicesToRemove) {
    removed.push(hand.splice(idx, 1)[0]);
  }
  return removed;
}

function findMatchIndex(hand, pairId) {
  if (!pairId) return -1;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].pairId === pairId) return i;
  }
  return -1;
}

function nextActivePlayerIndex(players, startIdx) {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (startIdx + step) % n;
    if (!players[idx].out) return idx;
  }
  return -1;
}

function prevActivePlayerIndex(players, startIdx) {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (startIdx - step + n) % n;
    if (!players[idx].out) return idx;
  }
  return -1;
}

function countNonJokerCards(players) {
  let c = 0;
  for (const p of players) {
    for (const card of p.hand) if (card.type !== "joker") c++;
  }
  return c;
}

function findJokerHolder(players) {
  for (const p of players) {
    if (p.hand.some((c) => c.type === "joker")) return p;
  }
  return null;
}

function dealPendingJokerToPlayer(game, playerIndex) {
  if (!game || game.gameOver) return game;
  if (!game.jokerPending) return game;

  const tracker = window.__GAME_ROUND_TRACKER__;
  const currentLevel = tracker ? tracker.currentLevel : 1;
  let targetIdx = playerIndex;

  // ============ 第1关：Joker保护 ============
  if (currentLevel === 1 && playerIndex === 0) {
    // 第1关：Joker不发给玩家，改为随机发给AI
    const aiIndices = [1, 2, 3];
    targetIdx = aiIndices[Math.floor(Math.random() * aiIndices.length)];
    console.log(`[第1关] Joker保护：不发给玩家，改为发给 ${game.players[targetIdx].name}`);
  }
  // ============ 第2关及以后：Joker正常发牌 ============
  else {
    // 第2/3关：Joker可以发给任何人（包括玩家）
    console.log(`[第${currentLevel}关] Joker正常发牌给 ${game.players[targetIdx].name}`);
  }

  const p = game.players[targetIdx];
  if (!p) return game;
  p.hand.push(game.jokerPending);
  p.out = p.hand.length === 0;
  game.lastEvent = { type: "joker_deal", playerId: p.id, playerIndex: targetIdx };
  game.jokerPending = null;
  return game;
}

function createGame({ pairs, playerCount, seed = "" }) {
  const rand = seed ? createRng(seed) : Math.random;
  const { joker, rest } = extractJoker(buildDeckFromImagePairs(pairs));
  // 🚨 统一使用 initialDeal，不再使用 dealConstrained22Pairs
  const players = initialDeal(rest, playerCount, rand);

  // Choose first non-out player; if all out (unlikely), pick 0.
  let currentPlayerIndex = players.findIndex((p) => !p.out);
  if (currentPlayerIndex < 0) currentPlayerIndex = 0;

  const game = {
    players,
    currentPlayerIndex,
    lastEvent: null,
    gameOver: false,
    winnerText: null,
    discardPile: [],
    turnHasDrawn: false,
    jokerPending: joker,
    humanDrawAttempts: 0,  // 🚨 修复：初始化概率追踪器（第2关及以后使用）
  };

  return game;
}

function getNextPlayerIndex(game) {
  return nextActivePlayerIndex(game.players, game.currentPlayerIndex);
}

function getUpstreamPlayerIndex(game) {
  // 上家：回合顺序中的前一位（逆时针）
  return prevActivePlayerIndex(game.players, game.currentPlayerIndex);
}

function canDrawFrom(game, targetPlayerIndex) {
  const target = game.players[targetPlayerIndex];
  return target && !target.out && target.hand.length > 0;
}

function drawCard(game, targetPlayerIndex, cardIndexInTargetHand) {
  if (game.gameOver) return game;

  const current = game.players[game.currentPlayerIndex];
  const target = game.players[targetPlayerIndex];
  if (!current || current.out) throw new Error("Current player is out.");
  if (!target || target.out) throw new Error("Target player is out.");
  if (target.hand.length === 0) throw new Error("Target has no cards.");
  if (
    cardIndexInTargetHand < 0 ||
    cardIndexInTargetHand >= target.hand.length
  ) {
    throw new Error("Invalid card index.");
  }

  const drawn = target.hand.splice(cardIndexInTargetHand, 1)[0];
  current.hand.push(drawn);
  game.turnHasDrawn = true;

  const hasPotentialMatch =
    !!drawn.pairId &&
    current.hand.some((c) => c !== drawn && c.pairId === drawn.pairId);

  // Update out flags
  current.out = current.hand.length === 0;
  target.out = target.hand.length === 0;

  // End condition: no non-joker cards remain
  if (countNonJokerCards(game.players) === 0) {
    game.gameOver = true;
    const loser = findJokerHolder(game.players);
    game.winnerText = loser
      ? `游戏结束：${loser.name} 手里留着“王八牌”，失败！`
      : "游戏结束";
  }

  game.lastEvent = {
    type: "draw",
    currentPlayerId: current.id,
    targetPlayerId: target.id,
    drawn,
    hasPotentialMatch,
  };

  return game;
}

function tryDiscardPairByCardIds(game, playerIndex, cardIdA, cardIdB) {
  if (game.gameOver) return { ok: false, reason: "game_over" };
  const player = game.players[playerIndex];
  if (!player || player.out) return { ok: false, reason: "player_out" };
  if (cardIdA === cardIdB) return { ok: false, reason: "same_card" };

  const a = player.hand.find((c) => c.id === cardIdA);
  const b = player.hand.find((c) => c.id === cardIdB);
  if (!a || !b) return { ok: false, reason: "not_found" };
  if (!a.pairId || !b.pairId) return { ok: false, reason: "joker_or_invalid" };
  if (a.pairId !== b.pairId) {
    game.lastEvent = { type: "mismatch", playerId: player.id, cardIds: [cardIdA, cardIdB] };
    return { ok: false, reason: "mismatch" };
  }
  // Must be A <-> B
  if (!a.side || !b.side || a.side === b.side) {
    game.lastEvent = { type: "mismatch", playerId: player.id, cardIds: [cardIdA, cardIdB] };
    return { ok: false, reason: "same_side" };
  }

  // Remove cards
  const removed = [];
  for (const cid of [cardIdA, cardIdB]) {
    const idx = player.hand.findIndex((c) => c.id === cid);
    if (idx >= 0) removed.push(player.hand.splice(idx, 1)[0]);
  }
  game.discardPile.push(...removed);
  player.out = player.hand.length === 0;

  const pairId = a.pairId;
  game.lastEvent = { type: "discard_pair", playerId: player.id, pairId, cards: removed };

  if (countNonJokerCards(game.players) === 0) {
    game.gameOver = true;
    const loser = findJokerHolder(game.players);
    game.winnerText = loser
      ? `游戏结束：${loser.name} 手里留着“王八牌”，失败！`
      : "游戏结束";
  }

  return { ok: true };
}

function findAnyPairInHand(hand) {
  const byKey = new Map(); // pairId -> {A?,B?}
  for (const c of hand) {
    if (!c.pairId) continue;
    if (!byKey.has(c.pairId)) byKey.set(c.pairId, { A: null, B: null });
    const slot = byKey.get(c.pairId);
    if (c.side === "A") slot.A = c;
    if (c.side === "B") slot.B = c;
  }
  for (const slot of byKey.values()) {
    if (slot.A && slot.B) return [slot.A, slot.B];
  }
  return null;
}

function advanceTurn(game) {
  if (game.gameOver) return game;

  // 检查玩家是否已结束手牌
  const humanPlayer = game.players[0];
  if (humanPlayer && humanPlayer.hand.length === 0) {
    game.gameOver = true;
    game.winnerText = "🎉 恭喜你获胜！手牌全部出完！";
    game.winner = humanPlayer;
    return game;
  }

  const nextIdx = nextActivePlayerIndex(game.players, game.currentPlayerIndex);
  if (nextIdx < 0) {
    game.gameOver = true;
    game.winnerText = "游戏结束";
    return game;
  }
  game.currentPlayerIndex = nextIdx;
  game.turnHasDrawn = false;
  game.lastEvent = { type: "turn", currentPlayerId: game.players[nextIdx].id };
  return game;
}

// AI完全随机抽牌
function getAiDrawIndex(game, aiPlayerIdx, targetPlayerIdx) {
  if (!game || game.gameOver) return -1;
  const target = game.players[targetPlayerIdx];
  if (!target || target.out || target.hand.length === 0) return -1;
  return Math.floor(Math.random() * target.hand.length);
}

// AI抽牌延迟（根据手牌数量）- 减半版
function getAiDrawDelay(game, aiPlayerIdx) {
  const ai = game.players[aiPlayerIdx];
  if (!ai || ai.hand.length === 0) return 500;

  if (ai.hand.length === 1) return 400 + Math.random() * 300;  // 0.4-0.7s
  if (ai.hand.length <= 3) return 500 + Math.random() * 400;  // 0.5-0.9s
  return 1000 + Math.random() * 600;  // 1.0-1.6s
}

// 检查玩家AB卡平衡（调试用）
function checkAllPlayersBalance(game) {
  console.log("======================");
  console.log("所有玩家 A/B 平衡检查:");
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    let aCount = 0, bCount = 0;
    for (const c of p.hand) {
      if (!c || c.type === "joker" || !c.side) continue;
      if (c.side === "A") aCount++;
      else if (c.side === "B") bCount++;
    }
    const diff = aCount - bCount;
    const status = Math.abs(diff) <= 1 ? "✅" : "❌";
    console.log(`${status} ${p.name}: A=${aCount} B=${bCount} 差异=${diff} (手牌${p.hand.length}张)`);
  }
  console.log("======================");
}

// Expose API on window for non-module usage.
window.Game = {
  createRng,
  shuffleInPlace,
  buildDeckFromImagePairs,
  initialDeal,
  dealConstrained22Pairs,
  dealPendingJokerToPlayer,
  discardAllPairsInPlace,
  findMatchIndex,
  nextActivePlayerIndex,
  prevActivePlayerIndex,
  countNonJokerCards,
  findJokerHolder,
  createGame,
  getNextPlayerIndex,
  getUpstreamPlayerIndex,
  canDrawFrom,
  drawCard,
  tryDiscardPairByCardIds,
  findAnyPairInHand,
  advanceTurn,
  getAiDrawIndex,
  getAiDrawDelay,
  checkAllPlayersBalance,
};

