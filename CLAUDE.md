# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**English Old Maid (抽王八)** - A card-matching game for English learning that pairs word cards (A side) with animal cards (B side). Features 4-player gameplay (1 human + 3 AI), physics-based card dragging, and a Three.js particle system for the Joker card reveal.

**Tech Stack**: Vanilla JavaScript (no build tools), Three.js (r128), GLSL shaders
**No ES modules** - Uses global `window` namespace to support `file://` protocol

## Development Commands

```bash
# Start local development server (REQUIRED - loads images/textures)
cd /Users/karnoz/english-old-maid
python3 -m http.server 8000

# Access main game
open http://127.0.0.1:8000/

# Test Joker particle effect
open http://127.0.0.1:8000/test-joker-summon.html

# Test card animations
open http://127.0.0.1:8000/test-3d-flip.html
open http://127.0.0.1:8000/test-joker-fly.html
```

## Critical Architecture Principles

### 1. Coordinate System Convention

**"屏幕" (screen) = `.tableBg` region, NOT browser window**

All animations, positioning, and effects are calculated relative to `.tableBg` (880px max-width, 5501×2552 aspect ratio background image):

```javascript
// Get .tableBg boundaries
const tableBg = document.querySelector('.tableBg');
const tableBgRect = tableBg.getBoundingClientRect();

// Screen center = .tableBg center
const centerX = tableBgRect.left + tableBgRect.width / 2;
const centerY = tableBgRect.top + tableBgRect.height / 2;
```

**All hand zones use percentage positioning relative to `.tableBg`:**
- `.zone-top`: 33% left, 2.5% top (AI opposite)
- `.zone-left`: 0.5% left, 29% top (AI left)
- `.zone-right`: 72.5% left, 29% top (AI right)
- `.zone-bottom`: 20% left, 72.5% top (human player)
- `.zone-center`: 30% left, 34.5% top (discard pile)

### 2. Animation Rules

**NEVER clone DOM elements for animations** - All animations must operate directly on original DOM elements to avoid state synchronization issues and performance overhead.

**Physics-based animations**: Use spring damping, arc trajectories, and realistic easing (not linear):
- Card dragging: Underdamped spring with velocity clamping
- Card flight: Bézier curve arcs with rotation interpolation
- Spring-back: `requestAnimationFrame` with omega/zeta physics model

### 3. Card Size Specifications

Different card sizes across the table (all using CSS custom properties):

| Location | Base Size | Scale | Final Size | Border Radius |
|----------|-----------|-------|------------|---------------|
| Player hand (`.faceCard`) | 86×124px | 0.85 | 73×105px | 13.6px (19%) |
| AI top (`.zone-top .miniBack`) | 52×72px | 1.29 | 67×93px | 10.3px (15%) |
| AI left/right (`.miniBack`) | 52×72px | 1.25 | 65×90px | 12.5px (19%) |
| Discard pile | 86×124px | 0.82 | 71×102px | 13.1px |

All adjustable via layout tuner (`#tunerPanel`) which saves to localStorage.

## Core System Architecture

### Game State Management (`src/game.js` - 936 lines)

**Pure game logic with no DOM dependencies**. Exposes API via `window.Game`:

```javascript
// Game state structure
game = {
  players: [{ id, name, kind: 'human'|'ai', hand: [], out: boolean }],
  discardPile: [],
  currentPlayerIndex: number,
  phase: 'initial-deal' | 'draw-phase' | 'discard-phase',
  jokerPending: boolean,  // Joker held back during initial deal
  roundMode: 0|1|2        // Difficulty progression
}
```

**Key mechanisms:**

1. **A/B Balance System**: `balanceHandSides()` ensures each player has equal A/B cards (±1) by swapping between players after initial deal

2. **Human Advantage**: `ensureHumanHasAtLeastNPairs()` guarantees player starts with 2 pairs (roundMode 0) by swapping with AI hands

3. **AI Draw Intelligence** (`getAiDrawIndex()`):
   - Assigns scores to each upstream card: Joker=+8, matchable=+5
   - After human eliminated: matchable=+20, 80% chance to pick optimal card
   - Uses weighted randomness to avoid predictability

4. **Joker Reveal Delay**: Joker is dealt separately AFTER initial pairs are discarded to create dramatic reveal moment

### UI Layer (`src/ui.js` - 4598 lines)

**Handles all DOM rendering, animations, and user interaction**. Key subsystems:

#### Player Hand Dragging Physics (lines ~2100-2400)

Joystick-style dragging with elliptical boundary constraints:

```javascript
// Drag limits
CARD_DRAG_CAP_X_PX = 200   // Horizontal
CARD_DRAG_CAP_UP_PX = 250  // Vertical (up only, no down)

// Damping starts at 1/3 of max distance, increases with out-curve
DAMP_START_FRAC = 0.33
CARD_DRAG_DAMP_P = 2.2     // Power for out-easing

// Scale increases with damping (not on click)
CARD_DRAG_SCALE_BASE = 1.0
CARD_DRAG_SCALE_EXTRA = 0.3  // Max scale at full damp
```

**Damping decomposition:**
- **Radial (outward)**: Heavy damping near boundary
- **Tangential (arc)**: Lighter damping for smooth circular motion
- **Edge awareness**: Closer to `.tableBg` edge = more resistance

**Spring-back on release**: Underdamped spring with velocity injection (clamped to reduce overshoot)

#### Animation State Machine

```javascript
// Animation phases (non-blocking, promise-based)
phases = {
  initialDeal: 'deal',           // Rapid card distribution
  jokerReveal: 'summon',          // Particle effect (4s) + fly (0.56s)
  initialPairing: 'auto-discard', // AI auto-pairs for 3s
  gameplay: 'player-turn'         // Human draw/match or AI turn
}
```

**Critical timing constraints:**
- AI draw delay: 800-1400ms (1 card) to 2000-3200ms (many cards)
- Card flip animation: 400ms (3D rotateY)
- Discard fly animation: 560ms (arc to center)

### Joker Particle System (`src/joker-summon.js` - 472 lines)

Three.js-based particle summoning effect (triggered once during initial deal):

**Architecture:**
- 15,000 GPU-accelerated particles
- Multi-point SDF (Signed Distance Field) with 4 seed points
- Perlin noise for organic edge irregularity
- GLSL vertex/fragment shaders for performance

**Timeline:**
```
T=0.0s   Particles spawn at random positions, fly toward target UV coords
T=0.5s   Card outline begins to form (SDF value crosses 0)
T=2.0s   Card body fully materialized
T=4.0s   Summon complete → triggers flyJokerToPlayer()
T=4.56s  Joker lands in player hand
```

**Fallback**: If Three.js unavailable, uses simple fade-in (1.28s instead of 4.56s)

## Data Files

### Card Definitions (`deck/image_pairs.js`)

```javascript
window.__IMAGE_PAIRS__ = [
  { key: "1_1", A: "./assets/word_cards/1_1_A.png", B: "./assets/animal_cards/1_1_B.png" },
  // ... 26 pairs total
];
```

**Matching rule**: Cards with same `key` prefix can pair (e.g., `1_1_A` ↔ `1_1_B`)

**Joker card**: Unmatchable card (type='joker', pairId=null) added during deck build

## Known Issues & Design Decisions

### 1. End-Game Unpaired Cards Bug

**Symptom**: Rarely, game ends with 1-2 unpaired cards remaining (besides Joker)

**Root cause**: A/B balance is maintained per-player but not validated for cross-player pairing availability. If Player A holds `5_2_A` and Player B discards `5_2_B` early, the A card becomes unmatchable.

**Attempted fixes** (commented out in game.js ~lines 150-200):
- Strict validation with retry: Too restrictive, caused infinite loops
- Swap validation: Complex state tracking, performance issues

**Current mitigation**: Human starting pair guarantee + AI intelligence reduces occurrence to <5% of games

### 2. Coordinate System Confusion

**Historical problem**: Early code mixed window-relative and .tableBg-relative coordinates, causing animations to fly offscreen on narrow viewports.

**Solution**: All animation code now uses `tableBgRect` boundaries (see Coordinate System Convention above)

### 3. No Build Process

**Design choice**: No webpack/vite to keep deployment simple (works via `file://` protocol)

**Tradeoffs:**
- ✅ Zero dependencies, instant preview
- ✅ Easy to debug (no source maps needed)
- ❌ No TypeScript, no imports
- ❌ Global namespace pollution (`window.Game`, `window.JokerSummon`)

## Testing Strategy

**Manual testing only** - No automated test suite

**Test pages** (in project root):
- `test-joker-summon.html` - Particle effect with progress slider
- `test-3d-flip.html` - Card flip animation
- `test-joker-fly.html` - Joker flight trajectory
- `test-draw-flip.html` - Draw animation
- `debug_ai_discard.html` - AI discard logic

**Browser console debugging:**
```javascript
// Inspect player hands
game.players.forEach(p => console.log(p.name, p.hand.map(c => c.id)))

// Check A/B balance across all cards
const allCards = [...game.players.flatMap(p => p.hand), ...game.discardPile]
const aCnt = allCards.filter(c => c.side === 'A').length
const bCnt = allCards.filter(c => c.side === 'B').length
console.log(`A: ${aCnt}, B: ${bCnt}`)

// Find which pairs are split across players
const byPair = {}
allCards.forEach(c => {
  if (c.type === 'joker') return
  if (!byPair[c.pairId]) byPair[c.pairId] = { A: 0, B: 0 }
  byPair[c.pairId][c.side]++
})
Object.entries(byPair).filter(([k, v]) => v.A !== v.B)
```

## Important Documentation

Read before making changes:
- `约定.md` - Coordinate system, animation rules, card sizing (Chinese)
- `PROJECT_HANDOFF.md` - Architecture overview, known issues (Chinese)
- `JOKER_SUMMON_README.md` - Particle effect technical details (Chinese)

## PWA Configuration

- `manifest.json` - Web app metadata
- Icons referenced but not version-controlled
- Service worker not implemented (offline mode disabled)
