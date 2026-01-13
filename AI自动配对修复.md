# AI 自动配对出牌修复

## 问题描述

发牌阶段结束后，AI 玩家不会主动检查手牌中的配对并出牌，需要等待玩家操作。

## 问题原因

### 旧逻辑流程

```
发牌完成 → startInitialPairingAnimation()
  → 所有AI出初始配对
  → proceedAfterInitialPairs()
  → runAiLoop()
    → 检查 current.kind !== "ai" → 返回（如果是玩家回合）
    → 否则：抽牌 → 配对
```

**问题**：
1. 发牌后的初始配对只执行一次
2. 之后 AI 回合的逻辑是"先抽牌，再配对"
3. 如果 AI 在回合开始时手上已有配对，不会自动出牌

## 解决方案

### 新逻辑流程

```
runAiLoop() 开始
  ↓
检查 current.kind !== "ai"？ → 是 → 返回
  ↓ 否
检查手上是否有配对？
  ↓ 有                    ↓ 无
等待 600-1000ms         等待 aiDrawDelay
（AI "思考"）           （AI "准备抽牌"）
  ↓                       ↓
先出牌（递归）          直接抽牌
  ↓
出完所有配对
  ↓
继续抽牌流程
  ↓
抽牌后再检查配对
  ↓
出牌（递归）
  ↓
结束回合
```

---

## 代码修改

### 位置
- **文件**：`src/ui.js`
- **函数**：`runAiLoop(game, settings)`
- **行数**：约 1277-1431

### 关键改动

#### 1. 回合开始时检查配对（带延迟）

```javascript
// 🆕 回合开始时先检查是否有配对，如果有则先出牌再抽牌
const initialPair = window.Game.findAnyPairInHand(current.hand);
if (initialPair && !game.turnHasDrawn) {
  console.log(`[AI回合开始] AI${game.currentPlayerIndex} 发现初始配对，先出牌`);

  // ⏱️ 延迟后开始出牌（给AI一个"思考"的时间）
  const initialThinkingDelay = speedUpAi ? 400 : (600 + Math.random() * 400);

  window.clearTimeout(runAiLoop._t);
  runAiLoop._t = window.setTimeout(() => {
    // 递归出牌直到没有配对
    const discardAllInitialPairs = () => {
    const pair = window.Game.findAnyPairInHand(current.hand);
    if (!pair) {
      // 没有配对了，继续正常抽牌流程
      proceedToDrawPhase();
      return;
    }

    // 出牌动画
    animateAiDiscardPair(aiIdx, pair[0], pair[1], () => {
      window.Game.tryDiscardPairByCardIds(game, aiIdx, pair[0].id, pair[1].id);
      renderAll(game, settings);

      // 检查是否出局
      if (current.out || game.gameOver) {
        window.Game.advanceTurn(game);
        renderAll(game, settings);
        runAiLoop(game, settings);
        return;
      }

      // 等待后继续出下一对
      const thinkingDelay = speedUpAi ? 300 : (800 + Math.random() * 400);
      window.setTimeout(discardAllInitialPairs, thinkingDelay);
    });
  };

    discardAllInitialPairs();
  }, initialThinkingDelay);
  return;
}
```

#### 2. 抽牌逻辑封装成函数

```javascript
// 正常抽牌流程
function proceedToDrawPhase() {
  // AI：从上家抽一张（使用智能抽牌逻辑）
  const targetIdx = window.Game.getUpstreamPlayerIndex(game);
  const target = game.players[targetIdx];

  // ... 原有的抽牌逻辑 ...

  window.setTimeout(() => {
    // 抽牌动画 + 执行 + 再次配对
  }, aiDrawDelay);
}

// 如果没有初始配对，直接进入抽牌阶段
proceedToDrawPhase();
```

---

## 效果对比

### 旧版（有问题）

```
T+0s   发牌完成
       AI1: 🎴🎴🎴🎴  (有2对)
       AI2: 🎴🎴🎴    (有1对)

T+0s   startInitialPairingAnimation()
       AI1 出2对 → 🗑️
       AI2 出1对 → 🗑️

T+1s   轮到玩家
       玩家操作...

T+10s  轮到 AI1
       runAiLoop() → 抽牌
       (不检查初始配对！)
```

### 新版（已修复）

```
T+0s   发牌完成
       AI1: 🎴🎴🎴🎴  (有2对)
       AI2: 🎴🎴🎴    (有1对)

T+0s   startInitialPairingAnimation()
       AI1 出2对 → 🗑️
       AI2 出1对 → 🗑️

T+1s   轮到玩家
       玩家操作...

T+10s  轮到 AI1
       runAiLoop()
       → 检查手上配对
       → 如果有配对：
         → 等待 600-1000ms（AI "思考"）
         → 先出牌
         → 出完后再抽牌
       → 否则：
         → 等待 aiDrawDelay（AI "准备抽牌"）
         → 直接抽牌
       → 抽牌后再检查配对
       → 结束回合
```

---

## 时间线对比

### 有初始配对的情况

```
T+0.0s   AI 回合开始
         runAiLoop() 被调用
         检测到手上有 2 对配对

T+0.6s   ⏱️ 延迟结束（600-1000ms 随机）
         开始出第 1 对

T+1.3s   第 1 对动画完成（680ms）
         ⏱️ 等待 800-1200ms

T+2.4s   开始出第 2 对

T+3.1s   第 2 对动画完成
         没有更多配对，准备抽牌

T+3.3s   ⏱️ 等待 aiDrawDelay
         开始抽牌动画

T+3.9s   抽牌完成，检查新配对...
```

### 无初始配对的情况

```
T+0.0s   AI 回合开始
         runAiLoop() 被调用
         检测到手上没有配对

T+0.0s   ⏱️ 等待 aiDrawDelay（直接进入抽牌）

T+0.6s   开始抽牌动画

T+1.2s   抽牌完成，检查新配对...
```

---

## 延迟时间设置

| 延迟类型 | 正常速度 | 玩家出局后加速 |
|---------|---------|---------------|
| **初始配对思考** | 600-1000ms | 400ms |
| **配对间隔** | 800-1200ms | 300ms |
| **抽牌延迟** | aiDrawDelay | 200ms |

---

## 新增日志

为了方便调试，添加了 console.log：

```javascript
console.log(`[AI回合开始] AI${game.currentPlayerIndex} 发现初始配对，先出牌`);
console.log(`[AI回合开始] AI${game.currentPlayerIndex} 配对完成，开始抽牌`);
```

---

## 测试场景

### 场景1：发牌后立即有配对

1. 开始游戏
2. 发牌完成
3. 观察 AI 是否自动出初始配对
4. 轮到 AI 回合时，检查是否先出牌再抽牌

### 场景2：抽牌后形成新配对

1. AI 抽到一张牌
2. 与手上的牌形成配对
3. 观察 AI 是否立即出牌
4. 如果有多对，观察是否连续出牌

### 场景3：连续多对配对

1. AI 手上有3对配对
2. 观察 AI 是否连续出3对
3. 每对之间有 800-1200ms 的"思考"延迟

---

## 兼容性

### 不影响现有功能

- ✅ 玩家出牌逻辑不变
- ✅ 发牌阶段的初始配对不变
- ✅ 抽牌动画不变
- ✅ 大王卡特效不变

### 增强的功能

- ✅ AI 回合开始时主动检查配对
- ✅ 递归出牌，直到没有配对
- ✅ 与现有的"抽牌后配对"逻辑兼容

---

## 性能影响

- **额外检查**：每次 AI 回合开始时调用 `findAnyPairInHand()`
- **性能开销**：O(n²) 最坏情况，n = 手牌数量（通常 < 12）
- **实际影响**：<1ms，可忽略

---

## 相关文件

- `src/ui.js` - 主逻辑修改
- `src/game.js` - 游戏引擎（未修改）
- `AI配对出牌动画说明.md` - 动画效果文档

---

**更新时间**：2026-01-11
**版本**：v3.1 - AI Auto-Pairing Fix
