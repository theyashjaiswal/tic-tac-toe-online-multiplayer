const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
})

// ─── State ─────────────────────────────────────────────────────────────────
const rooms = {}  // code -> { players:[{id,name,symbol}], board, currentTurn, gameOver, winner, winLine }

const WIN_PATTERNS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]

function checkWinner(board) {
  for (const p of WIN_PATTERNS) {
    const [a,b,c] = p
    if (board[a] && board[a] === board[b] && board[b] === board[c])
      return { winner: board[a], line: p }
  }
  return null
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let c = ''
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]
  return c
}

function resetRoom(room) {
  room.board = Array(9).fill(null)
  room.currentTurn = 'X'
  room.gameOver = false
  room.winner = null
  room.winLine = null
}

// ─── REST ─────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }))
app.get('/room/:code', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()]
  if (!room) return res.json({ exists: false })
  res.json({ exists: true, players: room.players.length, full: room.players.length >= 2 })
})

// ─── Socket ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[+]', socket.id)

  socket.on('create_room', ({ playerName }, cb) => {
    let code = generateCode()
    while (rooms[code]) code = generateCode()
    rooms[code] = {
      code,
      players: [{ id: socket.id, name: playerName || 'Player', symbol: 'X' }],
      board: Array(9).fill(null),
      currentTurn: 'X', gameOver: false, winner: null, winLine: null,
    }
    socket.join(code)
    socket.roomCode = code
    socket.symbol = 'X'
    socket.playerName = playerName || 'Player'
    console.log('[room]', code, 'created by', playerName)
    cb({ success: true, roomCode: code, symbol: 'X' })
  })

  socket.on('join_room', ({ roomCode, playerName }, cb) => {
    const code = roomCode.toUpperCase().trim()
    const room = rooms[code]
    if (!room) return cb({ success: false, error: 'Room not found' })
    if (room.players.length >= 2) return cb({ success: false, error: 'Room is full (2 players max)' })
    if (room.players.some(p => p.name === playerName)) return cb({ success: false, error: 'Name already taken in this room' })

    room.players.push({ id: socket.id, name: playerName || 'Player', symbol: 'O' })
    socket.join(code)
    socket.roomCode = code
    socket.symbol = 'O'
    socket.playerName = playerName || 'Player'

    io.to(code).emit('player_joined', {
      players: room.players,
      board: room.board,
      currentTurn: room.currentTurn,
    })
    console.log('[room]', code, 'joined by', playerName)
    cb({ success: true, roomCode: code, symbol: 'O', players: room.players, board: room.board, currentTurn: room.currentTurn })
  })

  socket.on('make_move', ({ index }, cb) => {
    const room = rooms[socket.roomCode]
    if (!room) return cb({ success: false, error: 'No room' })
    const player = room.players.find(p => p.id === socket.id)
    if (!player) return cb({ success: false, error: 'Not in room' })
    if (room.gameOver) return cb({ success: false, error: 'Game over' })
    if (room.currentTurn !== player.symbol) return cb({ success: false, error: 'Not your turn' })
    if (room.board[index] !== null) return cb({ success: false, error: 'Cell taken' })

    room.board[index] = player.symbol
    const result = checkWinner(room.board)
    if (result) { room.gameOver = true; room.winner = result.winner; room.winLine = result.line }
    else if (room.board.every(c => c !== null)) { room.gameOver = true }
    else { room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X' }

    io.to(socket.roomCode).emit('game_update', {
      board: room.board, currentTurn: room.currentTurn, gameOver: room.gameOver,
      winner: room.winner, winLine: room.winLine, lastMove: { index, symbol: player.symbol },
    })
    cb({ success: true })
  })

  socket.on('play_again', (cb) => {
    const room = rooms[socket.roomCode]
    if (!room) return cb?.({ success: false })
    resetRoom(room)
    io.to(socket.roomCode).emit('game_reset', { board: room.board, currentTurn: room.currentTurn })
    cb?.({ success: true })
  })

  socket.on('leave_room', () => {
    handleDisconnect(socket)
  })

  function handleDisconnect(sock) {
    const code = sock.roomCode
    if (!code || !rooms[code]) return
    const room = rooms[code]
    const before = room.players.length
    room.players = room.players.filter(p => p.id !== sock.id)
    const after = room.players.length
    if (after === 0) { delete rooms[code]; console.log('[room]', code, 'deleted') }
    else {
      if (!room.gameOver) { room.gameOver = true; room.winner = room.players[0].symbol }
      io.to(code).emit('opponent_left', {
        players: room.players, gameOver: room.gameOver, winner: room.winner,
      })
    }
    sock.leave(code)
    sock.roomCode = null
  }

  socket.on('disconnect', () => { console.log('[-]', socket.id); handleDisconnect(socket) })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`[server] :${PORT}`))
