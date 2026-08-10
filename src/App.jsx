import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { GameBoard } from './GameBoard'
import './index.css'

// ─── Socket ─────────────────────────────────────────────────────────────────
// Connect to current origin so vite proxy (dev) and same-origin (prod) both work
const SOCKET_URL = import.meta.env.DEV ? '' : ''
let socket = null

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    autoRejoinOnConnect(socket)
  }
  return socket
}

// On a fresh socket.io connect, if we have a remembered room, rejoin it so HMR /
// reconnects don't strand the client with no `socket.roomCode` server-side.
function autoRejoinOnConnect(sock) {
  if (sock.__autoRejoinBound) return
  sock.__autoRejoinBound = true
  sock.on('connect', () => {
    try {
      const roomCode = sessionStorage.getItem('dcttt_roomCode')
      const playerName = sessionStorage.getItem('dcttt_playerName')
      if (roomCode && playerName) {
        sock.emit('join_room', { roomCode, playerName }, (res) => {
          if (res?.success) {
            console.log('[autoRejoin] rejoined', roomCode)
          } else {
            sessionStorage.removeItem('dcttt_roomCode')
            sessionStorage.removeItem('dcttt_playerName')
            sessionStorage.removeItem('dcttt_symbol')
          }
        })
      }
    } catch {}
  })
}

// ─── Landing Screen ─────────────────────────────────────────────────────────
function LandingScreen({ onEnter, prefilledRoom = '' }) {
  const [mode, setMode] = useState(prefilledRoom ? 'join' : null) // 'create' | 'join'
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState(prefilledRoom)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleCreate = () => {
    if (!name.trim()) { setError('Enter your name'); return }
    setError(''); setLoading(true)
    getSocket().emit('create_room', { playerName: name.trim() }, (res) => {
      setLoading(false)
      if (res.success) onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: true, name: name.trim() })
      else setError(res.error || 'Failed to create room')
    })
  }

  // Test room — instant random room, no input needed
  const handleTest = () => {
    setError(''); setLoading(true)
    const adj = ['Quick', 'Fast', 'Sneaky', 'Lucky', 'Neon', 'Pixel', 'Cosmic', 'Turbo']
    const nouns = ['Fox', 'Cat', 'Star', 'Wolf', 'Ace', 'Nova', 'Jet', 'Echo']
    const tag = adj[Math.floor(Math.random() * adj.length)] + nouns[Math.floor(Math.random() * nouns.length)]
    const autoName = `${tag}${Math.floor(Math.random() * 90 + 10)}`
    getSocket().emit('create_room', { playerName: autoName }, (res) => {
      setLoading(false)
      if (res.success) onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: true, name: autoName, autoCreated: true })
      else setError(res.error || 'Failed to create test room')
    })
  }

  const handleJoin = () => {
    if (!name.trim()) { setError('Enter your name'); return }
    if (!roomCode.trim()) { setError('Enter room code'); return }
    setError(''); setLoading(true)
    getSocket().emit('join_room', { roomCode: roomCode.trim().toUpperCase(), playerName: name.trim() }, (res) => {
      setLoading(false)
      if (res.success) onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: false, name: name.trim(), players: res.players, board: res.board, currentTurn: res.currentTurn })
      else setError(res.error || 'Failed to join room')
    })
  }

  return (
    <motion.div
      className="lobby"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >

      <div className="lobby-card">
        {!mode ? (
          <>
            <h2 className="lobby-heading">PLAY ONLINE</h2>
            <p className="lobby-sub">Create a room or join a friend's room</p>
            <div className="lobby-buttons">
              <button className="btn-primary" onClick={() => setMode('create')}>
                CREATE ROOM
              </button>
              <button className="btn-secondary" onClick={() => setMode('join')}>
                JOIN ROOM
              </button>
              <button className="btn-ghost" onClick={handleTest} disabled={loading}>
                {loading ? 'CREATING…' : '⚡ TEST ROOM'}
              </button>
              <button className="btn-ghost" onClick={() => setShowHelp(true)}>
                ? HOW TO PLAY
              </button>
            </div>
            <p className="lobby-sub" style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
              Test room creates a random room instantly — great for trying it out
            </p>
          </>
        ) : (
          <>
            <h2 className="lobby-heading">{mode === 'create' ? 'CREATE ROOM' : 'JOIN ROOM'}</h2>
            {prefilledRoom && mode === 'join' && (
              <p className="lobby-sub" style={{ color: 'var(--accent-cyan)' }}>
                You've been invited to room <strong>{prefilledRoom}</strong>
              </p>
            )}
            <div className="input-group">
              <label className="input-label">YOUR NAME</label>
              <input
                className="input-field"
                type="text"
                placeholder="Enter name..."
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={16}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (mode === 'create') handleCreate()
                    else handleJoin()
                  }
                }}
              />
            </div>
            {mode === 'join' && (
              <div className="input-group">
                <label className="input-label">ROOM CODE</label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="e.g. XK7T2P"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
                />
              </div>
            )}
            {error && <p className="input-error">{error}</p>}
            <div className="lobby-buttons">
              <button className="btn-primary" onClick={mode === 'create' ? handleCreate : handleJoin} disabled={loading}>
                {loading ? '...' : mode === 'create' ? 'CREATE' : 'JOIN'}
              </button>
              <button className="btn-ghost" onClick={() => { setMode(null); setError(''); setRoomCode('') }}>
                BACK
              </button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showHelp && (
          <motion.div
            className="help-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              className="help-card"
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
              onClick={e => e.stopPropagation()}
            >
              <div className="help-title">? HOW TO PLAY</div>
              <ul className="help-list">
                <li><span className="help-key">CREATE</span> a room and share the code with a friend</li>
                <li><span className="help-key">JOIN</span> a friend's room with their 6-character code</li>
                <li><span className="help-key">TEST</span> spins up an instant solo room to try the UI</li>
                <li><span className="help-key">X</span> goes first. Take turns. Get 3 in a row to win</li>
                <li><span className="help-key">SHARE</span> button copies an invite link to your clipboard</li>
              </ul>
              <button className="btn-primary btn-lg" onClick={() => setShowHelp(false)} style={{ marginTop: 8 }}>
                GOT IT
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Player Badge ────────────────────────────────────────────────────────────
function PlayerBadge({ name, symbol, isYou, isWinner, isActive }) {
  const color = symbol === 'X' ? 'var(--accent-pink)' : 'var(--accent-cyan)'
  const glow = symbol === 'X' ? 'var(--neon-pink)' : 'var(--neon-cyan)'
  return (
    <div className={`player-badge ${isActive ? 'active' : ''} ${isWinner ? 'winner' : ''}`}
      style={{ '--badge-color': color, '--badge-glow': glow }}>
      <span className="badge-symbol" style={{ color }}>{symbol}</span>
      <span className="badge-name">{name}{isYou ? ' (you)' : ''}</span>
    </div>
  )
}

// ─── Room Screen ────────────────────────────────────────────────────────────
function RoomScreen({ roomCode, mySymbol, myName, players, board, currentTurn, gameOver, winner, winLine, lastMove, onMove, onPlayAgain, onLeave, error }) {
  const isMyTurn = currentTurn === mySymbol && !gameOver
  const isWaiting = players.length < 2 && !gameOver
  const isOpponentTurn = !isMyTurn && !isWaiting && !gameOver && players.length === 2
  const [copied, setCopied] = useState(false)
  const [denyFlash, setDenyFlash] = useState(0)

  // Wrap onMove so clicking during opponent's turn gives visual feedback
  const handleMove = (index) => {
    if (isMyTurn) {
      onMove(index)
    } else if (isOpponentTurn) {
      setDenyFlash(n => n + 1)
    }
  }

  // Build invite link — preserves the room code so the recipient lands ready to join
  const inviteUrl = `${window.location.origin}/?room=${roomCode}`

  const copyShare = async () => {
    const text =
      `🎮 Join my Tic Tac Toe online multiplayer game!\n` +
      `Room code: ${roomCode}\n` +
      `Link: ${inviteUrl}`
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        // Fallback for non-secure contexts
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('copy failed', e)
      alert(`Room code: ${roomCode}\nLink: ${inviteUrl}`)
    }
  }

  return (
    <motion.div
      className="room"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="room-header">
        <div className="room-code-block">
          <span className="room-code-label">ROOM CODE</span>
          <span className="room-code">{roomCode}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ghost btn-sm" onClick={copyShare}>
            {copied ? '✓ COPIED!' : '🔗 SHARE'}
          </button>
          <button className="btn-ghost btn-sm" onClick={onLeave}>LEAVE</button>
        </div>
      </div>

      {/* Players */}
      <div className="players-row">
        {players.find(p => p.symbol === 'X')
          ? <PlayerBadge {...players.find(p => p.symbol === 'X')} isYou={players.find(p => p.symbol === 'X')?.name === myName} isActive={currentTurn === 'X' && !gameOver} isWinner={winner === 'X'} />
          : <div className="player-badge empty"><span className="badge-symbol" style={{color:'var(--accent-pink)',opacity:0.3}}>X</span><span className="badge-name">Waiting...</span></div>}
        <span className="vs-label">VS</span>
        {players.find(p => p.symbol === 'O')
          ? <PlayerBadge {...players.find(p => p.symbol === 'O')} isYou={players.find(p => p.symbol === 'O')?.name === myName} isActive={currentTurn === 'O' && !gameOver} isWinner={winner === 'O'} />
          : <div className="player-badge empty"><span className="badge-symbol" style={{color:'var(--accent-cyan)',opacity:0.3}}>O</span><span className="badge-name">Waiting...</span></div>}
      </div>

      {/* Turn status */}
      <div className="turn-status">
        {isWaiting ? (
          <span className="status-waiting">⏳ Waiting for opponent to join...</span>
        ) : gameOver ? (
          winner ? (
            <span style={{ color: winner === 'X' ? 'var(--accent-pink)' : 'var(--accent-cyan)', textShadow: winner === 'X' ? 'var(--neon-pink)' : 'var(--neon-cyan)' }}>
              {players.find(p => p.symbol === winner)?.name} WINS!
            </span>
          ) : (
            <span style={{ color: 'var(--accent-yellow)', textShadow: 'var(--neon-yellow)' }}>IT'S A DRAW!</span>
          )
        ) : (
          <span style={{ color: isMyTurn ? (mySymbol === 'X' ? 'var(--accent-pink)' : 'var(--accent-cyan)') : 'var(--text-secondary)', textShadow: isMyTurn ? (mySymbol === 'X' ? 'var(--neon-pink)' : 'var(--neon-cyan)') : 'none' }}>
            {isMyTurn ? 'YOUR TURN' : `${players.find(p => p.symbol === currentTurn)?.name}'s turn`}
          </span>
        )}
      </div>

      {/* Board */}
      <div className="room-board">
        <div key={denyFlash} className={`board-inner${denyFlash > 0 ? ' shake' : ''}`}>
          <GameBoard
            board={board}
            onCellClick={handleMove}
            disabled={gameOver}
            winLine={winLine}
            lastMove={lastMove}
          />
        </div>
        {/* Pop-up that fires ONLY when the user clicks during opponent's turn */}
        {denyFlash > 0 && isOpponentTurn && (
          <div key={denyFlash} className="board-deny-flash">
            <span className="deny-icon">⏳</span>
            <span className="deny-label">PLEASE WAIT</span>
            <span className="deny-sub">
              {players.find(p => p.symbol === currentTurn)?.name || 'opponent'}'s turn — sit tight
            </span>
          </div>
        )}
      </div>

      {/* Play Again / Error */}
      <AnimatePresence>
        {gameOver && !isWaiting && (
          <motion.div
            className="room-actions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <button className="btn-primary btn-lg" onClick={onPlayAgain}>
              PLAY AGAIN
            </button>
          </motion.div>
        )}
        {error && (
          <motion.p className="room-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Win Overlay ────────────────────────────────────────────────────────────
function WinOverlay({ winner, mySymbol, myName, players, mode, onPlayAgain, onResetScores, onClose }) {
  const isMe = players.find(p => p.symbol === winner)?.name === myName
  return (
    <motion.div
      className="win-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="win-card"
        initial={{ scale: 0.6, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <div className={`win-title ${winner === 'X' ? 'winner-x' : winner === 'O' ? 'winner-o' : 'draw-title'}`}>
          {winner === null ? '🤝 DRAW!' : winner === 'X' ? 'X WINS!' : 'O WINS!'}
        </div>
        <div className="win-sub">
          {winner === null ? 'Great minds think alike!' : isMe ? 'You win!' : `${players.find(p => p.symbol === winner)?.name} wins!`}
        </div>
        <div className="win-actions">
          <button className="btn-play-again" onClick={onPlayAgain}>PLAY AGAIN</button>
          <button className="btn-reset-all" onClick={onResetScores}>LEAVE ROOM</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('landing') // 'landing' | 'room'
  const [mySymbol, setMySymbol] = useState(null)
  const [myName, setMyName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [players, setPlayers] = useState([])
  const [board, setBoard] = useState(Array(9).fill(null))
  const [currentTurn, setCurrentTurn] = useState('X')
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState(null)
  const [winLine, setWinLine] = useState(null)
  const [lastMove, setLastMove] = useState(null)
  const [roomError, setRoomError] = useState('')
  const [showOverlay, setShowOverlay] = useState(false)
  const [scores, setScores] = useState({ X: 0, O: 0, draws: 0 })
  const [localScores, setLocalScores] = useState({ X: 0, O: 0, draws: 0 })
  const [mode, setMode] = useState('friend')
  const [prefilledRoom, setPrefilledRoom] = useState('')
  const socketRef = useRef(null)

  // ── Read ?room=CODE on first load so shared invite links work ─────────────
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = (params.get('room') || '').toUpperCase().trim()
      if (code) setPrefilledRoom(code)
    } catch {}
  }, [])

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sock = getSocket()
    socketRef.current = sock
    autoRejoinOnConnect(sock)

    sock.on('game_update', (data) => {
      setBoard(data.board)
      setCurrentTurn(data.currentTurn)
      setGameOver(data.gameOver)
      setWinner(data.winner)
      setWinLine(data.winLine)
      setLastMove(data.lastMove)
      if (data.gameOver) setShowOverlay(true)
    })

    sock.on('game_reset', (data) => {
      setBoard(data.board)
      setCurrentTurn(data.currentTurn)
      setGameOver(false)
      setWinner(null)
      setWinLine(null)
      setLastMove(null)
      setShowOverlay(false)
    })

    sock.on('player_joined', (data) => {
      setPlayers(data.players)
      if (data.board) setBoard(data.board)
      if (data.currentTurn) setCurrentTurn(data.currentTurn)
      if (data.scores) setScores(data.scores)
      setRoomError('')
    })

    sock.on('scores_update', (data) => {
      setScores(data)
    })

    sock.on('opponent_left', (data) => {
      // (already wired in cleanup somewhere — let's just keep scores synced if provided)
      if (data.scores) setScores(data.scores)
    })

    sock.on('player_left', (data) => {
      setPlayers(data.players)
      if (data.gameOver) {
        setGameOver(true)
        setWinner(data.winner)
        setShowOverlay(true)
      }
    })

    return () => {
      sock.off('game_update')
      sock.off('game_reset')
      sock.off('player_joined')
      sock.off('player_left')
    }
  }, [])

  const handleEnter = useCallback((data) => {
    setRoomCode(data.roomCode)
    setMySymbol(data.symbol)
    setMyName(data.name)
    setMode('online')
    if (data.isFirst) {
      setPlayers([{ id: socketRef.current.id, name: data.name, symbol: data.symbol }])
    } else {
      setPlayers(data.players || [
        { id: socketRef.current.id, name: data.name, symbol: data.symbol }
      ])
      if (data.board) setBoard(data.board)
      if (data.currentTurn) setCurrentTurn(data.currentTurn)
    }
    if (data.scores) setScores(data.scores)
    setScreen('room')

    // Remember so we can auto-rejoin on HMR / reconnect
    try {
      sessionStorage.setItem('dcttt_roomCode', data.roomCode)
      sessionStorage.setItem('dcttt_playerName', data.name)
      sessionStorage.setItem('dcttt_symbol', data.symbol)
    } catch {}
  }, [])

  const handleMove = useCallback((index) => {
    if (mode !== 'online') return
    const sock = getSocket()
    sock.emit('make_move', { index }, (res) => {
      if (!res.success) setRoomError(res.error || 'Move failed')
      else setRoomError('')
    })
  }, [mode])

  const handlePlayAgain = useCallback(() => {
    setShowOverlay(false)
    setGameOver(false)
    setWinner(null)
    setWinLine(null)
    setBoard(Array(9).fill(null))
    setCurrentTurn('X')
    getSocket().emit('play_again', (res) => {
      // Scores are server-authoritative now — server fires `scores_update` automatically on every game end.
      // This callback just acknowledges the round reset.
    })
  }, [mode, mySymbol, winner])

  const handleLeave = useCallback(() => {
    // Tell server explicitly so we don't appear as a "disconnect ghost"
    try { socketRef.current?.emit('leave_room') } catch {}
    socketRef.current.disconnect()
    socketRef.current = null
    socket = null
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    autoRejoinOnConnect(socket)
    try {
      sessionStorage.removeItem('dcttt_roomCode')
      sessionStorage.removeItem('dcttt_playerName')
      sessionStorage.removeItem('dcttt_symbol')
    } catch {}
    setScreen('landing')
    setPlayers([])
    setBoard(Array(9).fill(null))
    setGameOver(false)
    setWinner(null)
    setWinLine(null)
    setShowOverlay(false)
    setRoomCode('')
    setMySymbol(null)
    setMyName('')
    setRoomError('')
    setLocalScores({ X: 0, O: 0, draws: 0 })
    setScores({ X: 0, O: 0, draws: 0 })
  }, [])

  return (
    <div className="app-container">
      <StarsBG />

      <div className="content">
        {screen === 'landing' && (
          <>
            <div className="game-title" style={{ marginBottom: 12 }}>
              <span className="title-line">TIC TAC TOE</span>
              <span className="title-sub">· ONLINE MULTIPLAYER ·</span>
            </div>
            <LandingScreen onEnter={handleEnter} prefilledRoom={prefilledRoom} />
          </>
        )}

        {screen === 'room' && (
          <RoomScreen
            roomCode={roomCode}
            mySymbol={mySymbol}
            myName={myName}
            players={players}
            board={board}
            currentTurn={currentTurn}
            gameOver={gameOver}
            winner={winner}
            winLine={winLine}
            lastMove={lastMove}
            onMove={handleMove}
            onPlayAgain={handlePlayAgain}
            onLeave={handleLeave}
            error={roomError}
          />
        )}

        {/* Live score panel — uses server-fed scores in online rooms, local scores otherwise */}
        {mode === 'online'
          ? <ScorePanel scores={scores} variant="online" />
          : <ScorePanel scores={localScores} />}
      </div>

      <AnimatePresence>
        {showOverlay && winner !== undefined && (
          <WinOverlay
            winner={winner}
            mySymbol={mySymbol}
            myName={myName}
            players={players}
            mode={mode}
            onPlayAgain={handlePlayAgain}
            onResetScores={handleLeave}
            onClose={() => setShowOverlay(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ScorePanel({ scores, variant }) {
  const isOnline = variant === 'online'
  return (
    <div className="score-panel" style={{ marginTop: 12 }}>
      {isOnline && (
        <>
          <span className="score-live-dot" />
          <span className="score-live-label">LIVE</span>
          <div className="score-divider" />
        </>
      )}
      <div className="score-block">
        <div className="score-label x-label">X WINS</div>
        <div className="score-value x-score">{scores.X}</div>
      </div>
      <div className="score-divider" />
      <div className="score-block">
        <div className="score-label draw-label">DRAWS</div>
        <div className="score-value draw-score">{scores.draws}</div>
      </div>
      <div className="score-divider" />
      <div className="score-block">
        <div className="score-label o-label">O WINS</div>
        <div className="score-value o-score">{scores.O}</div>
      </div>
    </div>
  )
}

function StarsBG() {
  return (
    <div className="stars-bg">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 100 }, (_, i) => (
          <circle
            key={i}
            cx={`${(i * 137.508) % 100}%`}
            cy={`${(i * 97.371) % 100}%`}
            r={i % 5 === 0 ? 1.2 : 0.6}
            fill="white"
            opacity={0.3 + (i % 7) * 0.08}
          >
            <animate attributeName="opacity"
              values={`${0.2 + (i % 3) * 0.1};${0.5 + (i % 4) * 0.1};${0.2 + (i % 3) * 0.1}`}
              dur={`${2 + (i % 4)}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    </div>
  )
}
