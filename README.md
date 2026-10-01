# UNO — Draw-Card Stacking House Rules Engine & Game

A full-stack, server-authoritative implementation of **UNO** featuring the custom **Draw-Card Stacking House Rule**.

---

## 🎯 House Rule Specification

### 1. +2 Chain (`draw2_chain`)
When a player plays a **Draw Two (+2)**:
- The next player receives a pending **+2 penalty**.
- That player may play another **+2** to pass the accumulated penalty onward (chain remains a **+2-compatible chain**).
- That player may also play a **Wild Draw Four (+4)** (chain transitions into a **+4-only chain**).
- The accumulated penalty is carried forward.

**Examples:**
- `+2 → +2 → +2` = next player draws **6** if unable to continue.
- `+2 → +4` = next player receives total penalty of **6** and may play **+4 only**.
- `+2 → +2 → +4` = next player receives total penalty of **8** and may play **+4 only**.

### 2. +4 Chain (`draw4_chain`)
Once a **Wild Draw Four (+4)** has been played in an active stacking chain:
- **Only another +4** may be played by the next affected player.
- **A +2 cannot be played on a +4** (`INVALID MOVE`).
- Normal number cards cannot be played.
- Skip cannot be played.
- Reverse cannot be played.
- Standard Wild cannot be played.
- Only +4 continues the penalty chain.

**Examples:**
- `+4 → +4 → +4` = next player draws **12** if unable to continue.
- `+2 → +4 → +4` = next player draws **10** if unable to continue.
- `+4 → +2` = **INVALID MOVE** (rejected authoritatively by the server).

### 3. Server-Authoritative Enforcement & Penalty Resolution
- When a player cannot continue an active draw chain (or chooses to draw), they draw the **entire accumulated penalty** cards and their turn immediately ends.
- The server independently rejects invalid stacking attempts without mutating game state.
- The distinction between a `+2-compatible chain` (`draw2_chain`) and a `+4-only chain` (`draw4_chain`) is an explicit first-class property of the server-side game state (`gameState.stackingChain.type`).
- The game UI clearly displays the active accumulated penalty (e.g. **`+8 PENALTY`** or **`DRAW 8`**) and chain type.
- Invalid cards in the player's hand are visually dimmed and disabled during an active chain.

---

## 🏗️ Architecture

```
UNO/
├── shared/
│   ├── types.ts              # StackingChainState, Card, Player, PublicGameState
│   └── rules.ts              # validateCardPlay() & stacking chain validation logic
├── server/
│   ├── index.ts              # Express + Socket.io authoritative game server
│   └── game/
│       ├── unoGame.ts        # UnoGame core engine, turn management, AI bot logic
│       └── deck.ts           # Standard 108-card deck generator and Fisher-Yates shuffler
├── client/
│   ├── index.html            # Vite HTML shell with Google Fonts & Tailwind CDN
│   ├── src/
│   │   ├── main.tsx          # React 18 DOM mount
│   │   ├── App.tsx           # Main game table, player seats, turn flow, debug tester
│   │   ├── index.css         # Styling and animations
│   │   └── components/
│   │       ├── CardView.tsx           # UNO card component with disabled states
│   │       ├── PenaltyBanner.tsx      # Prominent animated penalty badge & chain trail
│   │       ├── ColorPickerModal.tsx   # Wild color selection dialog
│   │       └── RulesGuideModal.tsx    # In-game interactive house rules documentation
└── tests/
    ├── stacking.test.ts               # Verification of all stacking rules & examples
    └── server_authoritative.test.ts   # Server rejection & state immutability tests
```

---

## 🧪 Testing

Run the automated test suite powered by Node's native test runner:

```bash
npm run test
```

### Verified Test Cases:
- ✔ `+2 → +2 → +2` = next player draws 6 if unable to continue
- ✔ `+2 → +4` = next player receives total penalty of 6 and may play +4 only
- ✔ `+2 → +2 → +4` = next player receives total penalty of 8 and may play +4 only
- ✔ `+4 → +4 → +4` = next player draws 12 if unable to continue
- ✔ `+2 → +4 → +4` = next player draws 10 if unable to continue
- ✔ `+4 → +2` = **INVALID MOVE** (rejected authoritatively by server)
- ✔ Non-stacking cards (Normal, Skip, Reverse, Wild) rejected during +4 chain
- ✔ Non-stacking cards (Normal, Skip, Reverse, Wild) rejected during +2 chain
- ✔ Bot AI stacks valid cards or draws accumulated penalty
- ✔ Server State: `getPublicState()` includes distinct chain type and accumulated penalty
- ✔ Rejection of out-of-turn plays, missing hand cards, invalid wild color declarations
- ✔ Immutability of game state upon rejected stacking moves

---

## 🚀 Running the Application

1. **Build frontend assets:**
   ```bash
   npm run build
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   Server starts at `http://localhost:3001`.

3. **Development mode (with Vite HMR):**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.
