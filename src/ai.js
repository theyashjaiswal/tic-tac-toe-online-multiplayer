// Pure-function Tic-Tac-Toe bot.
// Input:  board = Array(9) of 'X' | 'O' | null, symbol = 'O' (or 'X'), difficulty.
// Output: integer 0–8 of the cell to play. Returns -1 if no moves available.

const WIN_PATTERNS = [
  [0,1,2], [3,4,5], [6,7,8],
  [0,3,6], [1,4,7], [2,5,8],
  [0,4,8], [2,4,6],
]

function avail(board) {
  const out = []
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i)
  return out
}

// Find a winning move for `sym` on the given board, or -1.
function findWinningMove(board, sym) {
  for (const [a, b, c] of WIN_PATTERNS) {
    const cells = [board[a], board[b], board[c]]
    const ours = cells.filter(x => x === sym).length
    const emptyIdx = [a, b, c].find(i => board[i] === null)
    if (ours === 2 && emptyIdx !== undefined) return emptyIdx
  }
  return -1
}

// Easy: pure random. Mostly useless, but available.
export function pickMoveEasy(board) {
  const moves = avail(board)
  if (moves.length === 0) return -1
  return moves[Math.floor(Math.random() * moves.length)]
}

// Medium: try to win, block opponent's win, else take center → corner → side.
export function pickMoveMedium(board, sym) {
  const opp = sym === 'X' ? 'O' : 'X'
  const moves = avail(board)
  if (moves.length === 0) return -1

  // 1. Can we win right now?
  const winAt = findWinningMove(board, sym)
  if (winAt !== -1) return winAt

  // 2. Can opponent win next move? Block it.
  const blockAt = findWinningMove(board, opp)
  if (blockAt !== -1) return blockAt

  // 3. Take center if free.
  if (board[4] === null) return 4

  // 4. Take any corner.
  const corners = [0, 2, 6, 8].filter(i => board[i] === null)
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]

  // 5. Take any side.
  return moves[0]
}

// Hard: full minimax. Tic-tac-toe has only ~5k states so this is instant.
export function pickMoveHard(board, sym) {
  const opp = sym === 'X' ? 'O' : 'X'
  const moves = avail(board)
  if (moves.length === 0) return -1

  let best = -Infinity
  let bestMove = moves[0]

  for (const m of moves) {
    const copy = board.slice()
    copy[m] = sym
    const score = -minimax(copy, opp, sym)
    if (score > best) {
      best = score
      bestMove = m
    }
  }
  return bestMove
}

// Returns the score from the perspective of `turnSym` (the player about to move).
// Scores: +10 win for the original caller, -10 loss, 0 draw.
function minimax(board, turnSym, callerSym) {
  // First check terminal states from the board as it is now (after the previous move).
  const win = checkWin(board)
  if (win === callerSym) return 10
  if (win && win !== callerSym) return -10
  if (board.every(c => c !== null)) return 0

  const moves = avail(board)
  const opp = turnSym === 'X' ? 'O' : 'X'
  let best = -Infinity
  for (const m of moves) {
    const copy = board.slice()
    copy[m] = turnSym
    const s = -minimax(copy, opp, callerSym)
    if (s > best) best = s
  }
  return best
}

function checkWin(board) {
  for (const [a, b, c] of WIN_PATTERNS) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a]
  }
  return null
}

export function pickMove(board, difficulty, symbol) {
  switch (difficulty) {
    case 'easy':   return pickMoveEasy(board)
    case 'medium': return pickMoveMedium(board, symbol)
    case 'hard':   return pickMoveHard(board, symbol)
    default:       return pickMoveMedium(board, symbol)
  }
}

export const BOT_NAMES = {
  easy:   'CHIP the Cat',
  medium: 'NEON Fox',
  hard:   'OMEGA-9',
}

export const DIFFICULTY_INFO = {
  easy:   { desc: 'Plays randomly. Easy to beat.' },
  medium: { desc: 'Plays smart. Will block and take wins.' },
  hard:   { desc: 'Unbeatable. Plays the perfect game.' },
}
