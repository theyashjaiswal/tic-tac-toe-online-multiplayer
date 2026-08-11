import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { GameBoard } from './GameBoard'
import { pickMove, BOT_NAMES, DIFFICULTY_INFO } from './ai'
import './index.css'

// ─── Socket ─────────────────────────────────────────────────────────────────
// Connect to current origin so vite proxy (dev) and same-origin (prod) both work
const SOCKET_URL = import.meta.env.DEV ? '' : import.meta.env.VITE_SERVER_URL || ''
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

  // ── Auto-join when opened from a shared invite link ────────────────────────
  useEffect(() => {
    if (!prefilledRoom) return
    setName('Guest')
    const code = prefilledRoom.trim().toUpperCase()
    if (!/^[A-Z0-9]{5}$/.test(code)) return

    const sock = getSocket()
    const tryJoin = () => {
      sock.emit('join_room', { roomCode: code, playerName: 'Guest' }, (res) => {
        if (res.success) onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: false, name: 'Guest', players: res.players, board: res.board, currentTurn: res.currentTurn, scores: res.scores, messages: res.messages || [] })
        else { setMode('create'); setError(`"${code}" is invalid or expired — create a new room`) }
      })
    }

    if (sock.connected) { tryJoin(); return }
    const onConnect = () => { sock.off('connect', onConnect); tryJoin() }
    sock.on('connect', onConnect)
    return () => sock.off('connect', onConnect)
  }, [prefilledRoom])

  const handleCreate = () => {
    if (!name.trim()) { setError('Enter your name'); return }
    setError(''); setLoading(true)
    const sock = getSocket()
      console.log('[handleCreate] socket id:', sock.id, 'connected:', sock.connected)
      if (!sock.connected) { setError('Not connected — check your internet'); setLoading(false); return }
      sock.emit('create_room', { playerName: name.trim() }, (res) => {
      console.log('[DEBUG] create_room response:', res)
      setLoading(false)
      if (!res) { setError('Server error — no response'); return }
      if (res.success) {
        console.log('[DEBUG] calling onEnter with:', { roomCode: res.roomCode, symbol: res.symbol, isFirst: true, name: name.trim() })
        onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: true, name: name.trim(), messages: [] })
      } else {
        setError(res.error || 'Failed to create room')
      }
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
      if (res.success) onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: true, name: autoName, autoCreated: true, scores: res.scores, messages: [] })
      else setError(res.error || 'Failed to create test room')
    })
  }

  const handleJoin = () => {
    if (!name.trim()) { setError('Enter your name'); return }
    if (!roomCode.trim()) { setError('Enter room code'); return }
    setError(''); setLoading(true)
    getSocket().emit('join_room', { roomCode: roomCode.trim().toUpperCase(), playerName: name.trim() }, (res) => {
      setLoading(false)
      if (res.success) onEnter({ roomCode: res.roomCode, symbol: res.symbol, isFirst: false, name: name.trim(), players: res.players, board: res.board, currentTurn: res.currentTurn, scores: res.scores, messages: res.messages || [] })
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
            {error && (
              <div className="error-with-action">
                <p className="input-error">{error}</p>
                <button className="btn-primary" style={{ marginTop: '8px' }} onClick={handleCreate} disabled={loading}>
                  CREATE ROOM
                </button>
              </div>
            )}
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

// ─── Home Screen (mode picker) ───────────────────────────────────────────────
function HomeScreen({ onChoose }) {
  return (
    <motion.div
      className="home"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="home-title">
        <span className="title-line">TIC TAC TOE</span>
        <span className="title-sub">· PICK A MODE ·</span>
      </div>

      <div className="home-card">
        <h2 className="lobby-heading">CHOOSE YOUR MODE</h2>
        <p className="lobby-sub">Play a friend online or take on the AI bot solo</p>

        <div className="mode-grid">
          <motion.button
            className="mode-card mode-online"
            onClick={() => onChoose('online')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="mode-icon">🌐</span>
            <span className="mode-title">ONLINE</span>
            <span className="mode-desc">2-player multiplayer with a friend. Create or join a room.</span>
            <span className="mode-cta">PLAY ONLINE →</span>
          </motion.button>

          <motion.button
            className="mode-card mode-ai"
            onClick={() => onChoose('ai')}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="mode-icon">🤖</span>
            <span className="mode-title">VS AI</span>
            <span className="mode-desc">Single-player against a bot. Pick a difficulty and play instantly.</span>
            <span className="mode-cta">PLAY VS AI →</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── AI Menu Screen ──────────────────────────────────────────────────────────
function AIMenuScreen({ onStart, onBack }) {
  const [name, setName] = useState('')
  const [diff, setDiff] = useState('medium')

  const handleStart = () => {
    onStart(name.trim() || 'Player', diff)
  }

  return (
    <motion.div
      className="lobby"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="home-title">
        <span className="title-line">TIC TAC TOE</span>
        <span className="title-sub">· VS AI ·</span>
      </div>

      <div className="lobby-card">
        <h2 className="lobby-heading">PLAY VS AI</h2>
        <p className="lobby-sub">Pick a difficulty, jump straight in</p>

        <div className="input-group">
          <label className="input-label">YOUR NAME</label>
          <input
            className="input-field"
            type="text"
            placeholder="Enter name..."
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={16}
            onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
            autoFocus
          />
        </div>

        <div className="input-group">
          <label className="input-label">DIFFICULTY</label>
          <div className="diff-grid">
            {['easy', 'medium', 'hard'].map(d => (
              <button
                key={d}
                className={`diff-chip ${diff === d ? 'active' : ''} diff-${d}`}
                onClick={() => setDiff(d)}
                type="button"
              >
                <span className="diff-name">{d.toUpperCase()}</span>
                <span className="diff-bot">{BOT_NAMES[d]}</span>
              </button>
            ))}
          </div>
          <p className="diff-hint">{DIFFICULTY_INFO[diff].desc}</p>
        </div>

        <div className="lobby-buttons">
          <button className="btn-primary btn-lg" onClick={handleStart}>
            ▶ START GAME
          </button>
          <button className="btn-ghost" onClick={onBack}>
            BACK
          </button>
        </div>
      </div>
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
function RoomScreen({ roomCode, mySymbol, myName, players, board, currentTurn, gameOver, winner, winLine, lastMove, onMove, onPlayAgain, onLeave, onSendMessage, messages, error, isAI, aiDifficulty }) {
  const isMyTurn = currentTurn === mySymbol && !gameOver
  const isWaiting = players.length < 2 && !gameOver
  const isOpponentTurn = !isMyTurn && !isWaiting && !gameOver && players.length === 2
  const [copied, setCopied] = useState(false)
  const [denyFlash, setDenyFlash] = useState(0)

  // Wrap onMove so clicking during opponent's turn gives visual feedback
  const handleMove = (index) => {
    if (isMyTurn) {
      onMove(index)
    }
    // Only show denial popup when the SERVER explicitly rejects the move
    // (denyFlash++ lives in the sock.emit callback — not here)
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
        {isAI ? (
          <div className="room-code-block">
            <span className="room-code-label">VS AI · DIFFICULTY</span>
            <span className="room-code ai-tag">{aiDifficulty?.toUpperCase()}</span>
          </div>
        ) : (
          <div className="room-code-block">
            <span className="room-code-label">ROOM CODE</span>
            <span className="room-code">{roomCode}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          {!isAI && (
            <button className="btn-ghost btn-sm" onClick={copyShare}>
              {copied ? '✓ COPIED!' : '🔗 SHARE'}
            </button>
          )}
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

      {/* Chat */}
      {!isAI && onSendMessage && messages !== undefined && (
        <ChatBox messages={messages} onSend={onSendMessage} myName={myName} />
      )}

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
  const [screen, setScreen] = useState('home')    // 'home' | 'landing' | 'room'
  const [selectedMode, setSelectedMode] = useState(null) // 'online' | 'ai' — chosen on HomeScreen
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
  const [messages, setMessages] = useState([])
  const [mode, setMode] = useState('friend')
  const [prefilledRoom, setPrefilledRoom] = useState('')
  // Top-level screen: 'home' | 'lobby' | 'room'
  // 'home' = the new start screen with ONLINE vs VS AI choice
  const [playMode, setPlayMode] = useState('home')
  const [aiDifficulty, setAiDifficulty] = useState('medium')
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
      if (data.scores) setScores(data.scores)
    })

    sock.on('game_reset', (data) => {
      setBoard(data.board)
      setCurrentTurn(data.currentTurn)
      setGameOver(false)
      setWinner(null)
      setWinLine(null)
      setLastMove(null)
      setShowOverlay(false)
      if (data.scores) setScores(data.scores)
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

    sock.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg])
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
    console.log('[DEBUG] handleEnter called:', data)
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
    if (data.messages) setMessages(data.messages)
    else if (data.isFirst) setMessages([])
    setScreen('room')

    // Remember so we can auto-rejoin on HMR / reconnect
    try {
      sessionStorage.setItem('dcttt_roomCode', data.roomCode)
      sessionStorage.setItem('dcttt_playerName', data.name)
      sessionStorage.setItem('dcttt_symbol', data.symbol)
    } catch {}
  }, [])

  // ── VS AI: skip socket, set user + bot straight into a local room ─────────
  const startAIGame = useCallback((name, difficulty) => {
    const safeName = (name || 'Player').trim() || 'Player'
    setMode('ai')
    setAiDifficulty(difficulty)
    setMySymbol('X')
    setMyName(safeName)
    setRoomCode('AI')
    setPlayers([
      { id: 'me', name: safeName, symbol: 'X' },
      { id: 'bot', name: BOT_NAMES[difficulty], symbol: 'O' },
    ])
    setBoard(Array(9).fill(null))
    setCurrentTurn('X')
    setGameOver(false)
    setWinner(null)
    setWinLine(null)
    setLastMove(null)
    setShowOverlay(false)
    setRoomError('')
    setScores({ X: 0, O: 0, draws: 0 })
    setScreen('room')
  }, [])

  const handleMove = useCallback((index) => {
    // ONLINE mode: send to server
    if (mode === 'online') {
      const sock = getSocket()
      sock.emit('make_move', { index }, (res) => {
        if (!res.success) {
          setRoomError(res.error || 'Move failed')
          setDenyFlash(n => n + 1)
        } else {
          setRoomError('')
        }
      })
      return
    }

    // AI mode: local game, update board immediately
    if (mode !== 'ai') return
    if (gameOver || currentTurn !== 'X') return
    if (board[index] !== null) return

    const nextBoard = board.slice()
    nextBoard[index] = 'X'

    // Win check (same pattern as server)
    const WIN_PATTERNS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    let wonSym = null, winLine = null
    for (const p of WIN_PATTERNS) {
      const [a,b,c] = p
      if (nextBoard[a] && nextBoard[a] === nextBoard[b] && nextBoard[b] === nextBoard[c]) {
        wonSym = nextBoard[a]; winLine = p; break
      }
    }
    const draw = !wonSym && nextBoard.every(c => c !== null)

    setBoard(nextBoard)
    setLastMove({ index, symbol: 'X' })
    if (wonSym) {
      setGameOver(true); setWinner(wonSym); setWinLine(winLine); setShowOverlay(true)
      setScores(s => ({ ...s, [wonSym]: s[wonSym] + 1 }))
      return
    }
    if (draw) {
      setGameOver(true); setWinner(null); setShowOverlay(true)
      setScores(s => ({ ...s, draws: s.draws + 1 }))
      return
    }
    setCurrentTurn('O')

    // AI replies after a short delay so it feels like thinking
    setTimeout(() => {
      const aiMove = pickMove(nextBoard, aiDifficulty, 'O')
      if (aiMove === -1 || aiMove == null) return
      const aiBoard = nextBoard.slice()
      aiBoard[aiMove] = 'O'
      let aiWonSym = null, aiWinLine = null
      for (const p of WIN_PATTERNS) {
        const [a,b,c] = p
        if (aiBoard[a] && aiBoard[a] === aiBoard[b] && aiBoard[b] === aiBoard[c]) {
          aiWonSym = aiBoard[a]; aiWinLine = p; break
        }
      }
      const aiDraw = !aiWonSym && aiBoard.every(c => c !== null)
      setBoard(aiBoard)
      setLastMove({ index: aiMove, symbol: 'O' })
      if (aiWonSym) {
        setGameOver(true); setWinner(aiWonSym); setWinLine(aiWinLine); setShowOverlay(true)
        setScores(s => ({ ...s, [aiWonSym]: s[aiWonSym] + 1 }))
        return
      }
      if (aiDraw) {
        setGameOver(true); setWinner(null); setShowOverlay(true)
        setScores(s => ({ ...s, draws: s.draws + 1 }))
        return
      }
      setCurrentTurn('X')
    }, 550)
  }, [mode, board, currentTurn, gameOver, aiDifficulty])

  const handlePlayAgain = useCallback(() => {
    setShowOverlay(false)
    setGameOver(false)
    setWinner(null)
    setWinLine(null)
    setBoard(Array(9).fill(null))
    setCurrentTurn('X')
    setLastMove(null)
    if (mode === 'online') {
      getSocket().emit('play_again', () => {
        // Scores are server-authoritative now — server fires `scores_update` automatically on every game end.
      })
    }
  }, [mode])

  const handleLeave = useCallback(() => {
    // Online mode: tell server explicitly so we don't appear as a "disconnect ghost"
    if (mode === 'online') {
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
    }
    // Both modes: wipe room state + bounce back to home
    setScreen('home')
    setPlayMode('home')
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
    setScores({ X: 0, O: 0, draws: 0 })
    setMessages([])
  }, [])

  return (
    <div className="app-container">
      <StarsBG />

      <div className="content">
        {screen === 'home' && (
          <HomeScreen
            onChoose={(choice) => {
              setSelectedMode(choice)
              if (choice === 'online') {
                setScreen('landing')
              } else {
                setScreen('ai-menu')
              }
            }}
          />
        )}

        {screen === 'landing' && (
          <div className="landing-shell">
            <div className="game-title" style={{ marginBottom: 12 }}>
              <span className="title-line">TIC TAC TOE</span>
              <span className="title-sub">· ONLINE MULTIPLAYER ·</span>
            </div>
            <button className="back-to-home" onClick={() => setScreen('home')}>
              ← Back
            </button>
            <LandingScreen onEnter={handleEnter} prefilledRoom={prefilledRoom} />
          </div>
        )}

        {screen === 'ai-menu' && (
          <AIMenuScreen
            onStart={startAIGame}
            onBack={() => setScreen('home')}
          />
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
            onPlayAgain={onPlayAgain}
            onLeave={handleLeave}
            onSendMessage={async (text) => { await sendMessage(text) }}
            messages={messages}
            error={roomError}
            isAI={mode === 'ai'}
            aiDifficulty={mode === 'ai' ? aiDifficulty : null}
          />
        )}

        {/* Live score panel — all modes feed scores into the same state */}
        {screen === 'room' && <ScorePanel scores={scores} variant={mode} />}
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
function sendMessage(text) {
  return new Promise((resolve) => {
    getSocket().emit('send_message', { text }, resolve)
  })
}

// ─── Chat Box ─────────────────────────────────────────────────────────────────
function ChatBox({ messages = [], onSend, myName }) {
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    await onSend(trimmed)
  }

  return (
    <div className="chat-box">
      <div className="chat-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Room Chat
      </div>
      <div className="chat-messages">
        {messages.length === 0 && <div className="chat-empty">No messages yet — say hi!</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg${m.sender === myName ? ' chat-msg-me' : ''}`}>
            <span className="chat-sender">{m.sender}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          className="chat-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message..."
          maxLength={300}
        />
        <button type="submit" className="chat-send-btn">Send</button>
      </form>
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
