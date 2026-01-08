const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Vercel uchun Socket.IO sozlamalari
const io = new Server(server, {
  cors: {
    origin: [
      'https://tic-tac-socket.vercel.app',
      'http://localhost:3000'
    ],
    credentials: true,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Test endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online',
    socketio: 'ready',
    games: Object.keys(games).length
  });
});

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game state
const games = {};
const players = {};

// Generate unique game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Yangi foydalanuvchi ulandi:', socket.id);

  // Username o'rnatish
  socket.on('set_username', (username) => {
    players[socket.id] = {
      username: username || `Player_${socket.id.substring(0, 4)}`,
      gameId: null,
      symbol: null
    };
    
    // Available o'yinlarni qaytarish
    const availableGames = Object.keys(games)
      .filter(gameId => !games[gameId].player2 && games[gameId].status === 'waiting');
    
    socket.emit('available_games', availableGames);
    console.log(`${players[socket.id].username} username bilan ulandi`);
  });

  // Yangi o'yin yaratish
  socket.on('create_game', () => {
    const gameId = generateGameId();
    games[gameId] = {
      board: Array(9).fill(null),
      player1: socket.id,
      player2: null,
      currentPlayer: 'X',
      status: 'waiting',
      winner: null,
      players: {},
      symbols: {}
    };
    
    players[socket.id].gameId = gameId;
    players[socket.id].symbol = 'X';
    
    games[gameId].players[socket.id] = players[socket.id].username;
    games[gameId].symbols[socket.id] = 'X';
    
    socket.join(gameId);
    
    // Yaratuvchiga xabar yuborish
    socket.emit('game_created', { 
      gameId, 
      symbol: 'X',
      players: { [socket.id]: players[socket.id].username }
    });
    
    console.log(`${players[socket.id].username} yangi o'yin yaratdi: ${gameId}`);
    
    // Available o'yinlarni yangilash
    io.emit('available_games', Object.keys(games)
      .filter(gId => !games[gId].player2 && games[gId].status === 'waiting'));
  });

  // O'yinqa qo'shilish
  socket.on('join_game', (gameId) => {
    const game = games[gameId];
    
    if (!game) {
      socket.emit('error', 'O\'yin topilmadi');
      return;
    }
    
    if (game.player2) {
      socket.emit('error', 'O\'yin to\'liq');
      return;
    }
    
    if (game.player1 === socket.id) {
      socket.emit('error', 'Siz allaqachon bu o\'yindasiz');
      return;
    }
    
    // Player2 ni o'rnatish
    game.player2 = socket.id;
    game.status = 'playing';
    game.players[socket.id] = players[socket.id].username;
    game.symbols[socket.id] = 'O';
    
    players[socket.id].gameId = gameId;
    players[socket.id].symbol = 'O';
    
    socket.join(gameId);
    
    console.log(`${players[socket.id].username} ${gameId} o'yiniga qo'shildi`);
    
    // IKKALA O'YINCHIGA HAM GAME_STARTED XABARINI YUBORISH
    io.to(gameId).emit('game_started', {
      gameId,
      board: game.board,
      currentPlayer: game.currentPlayer,
      players: game.players,
      symbols: game.symbols
    });
    
    // Available o'yinlarni yangilash
    io.emit('available_games', Object.keys(games)
      .filter(gId => !games[gId].player2 && games[gId].status === 'waiting'));
  });

  // Harakat qilish
  socket.on('make_move', ({ gameId, cellIndex }) => {
    const game = games[gameId];
    const player = players[socket.id];
    
    if (!game || game.status !== 'playing') {
      socket.emit('error', 'O\'yin boshlamagan yoki tugagan');
      return;
    }
    
    // O'yinchimi tekshirish
    if (socket.id !== game.player1 && socket.id !== game.player2) {
      socket.emit('error', 'Siz bu o\'yinda emassiz');
      return;
    }
    
    // Turni tekshirish
    if (player.symbol !== game.currentPlayer) {
      socket.emit('error', 'Sizning navbatingiz emas');
      return;
    }
    
    // Cell bandligini tekshirish
    if (game.board[cellIndex] !== null) {
      socket.emit('error', 'Bu katak band');
      return;
    }
    
    // Harakatni amalga oshirish
    game.board[cellIndex] = game.currentPlayer;
    
    // G'olibni tekshirish
    const winner = checkWinner(game.board);
    
    if (winner) {
      game.winner = winner;
      game.status = 'finished';
    } else if (game.board.every(cell => cell !== null)) {
      // Durrang
      game.status = 'finished';
      game.winner = 'draw';
    } else {
      // Navbatni o'zgartirish
      game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
    }
    
    // Yangilangan holatni yuborish
    io.to(gameId).emit('game_updated', {
      board: game.board,
      currentPlayer: game.currentPlayer,
      status: game.status,
      winner: game.winner,
      players: game.players
    });
    
    console.log(`${player.username} ${cellIndex} katakka ${player.symbol} qo'ydi`);
  });

  // Chat xabari
  socket.on('send_message', ({ gameId, message }) => {
    const player = players[socket.id];
    if (!player || !gameId) return;
    
    io.to(gameId).emit('new_message', {
      username: player.username,
      message: message,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  // O'yindan chiqish
  socket.on('leave_game', (gameId) => {
    const player = players[socket.id];
    const game = games[gameId];
    
    if (game && player) {
      game.status = 'finished';
      io.to(gameId).emit('player_left', {
        username: player.username
      });
      
      // O'yinchilarni o'chirish
      delete game.players[socket.id];
      delete game.symbols[socket.id];
      
      if (socket.id === game.player1) {
        game.player1 = null;
      } else if (socket.id === game.player2) {
        game.player2 = null;
      }
      
      // Agar o'yinda o'yinchi qolmagan bo'lsa
      if (!game.player1 && !game.player2) {
        delete games[gameId];
      }
    }
    
    // Player ma'lumotlarini yangilash
    if (player) {
      player.gameId = null;
      player.symbol = null;
    }
    
    socket.leave(gameId);
    socket.emit('left_game');
  });

  // Disconnect
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player && player.gameId) {
      const game = games[player.gameId];
      if (game) {
        game.status = 'finished';
        io.to(player.gameId).emit('player_left', {
          username: player.username
        });
        
        // O'yinchilarni o'chirish
        delete game.players[socket.id];
        delete game.symbols[socket.id];
        
        if (socket.id === game.player1) {
          game.player1 = null;
        } else if (socket.id === game.player2) {
          game.player2 = null;
        }
        
        // Agar o'yinda o'yinchi qolmagan bo'lsa
        if (!game.player1 && !game.player2) {
          delete games[player.gameId];
        }
      }
    }
    
    delete players[socket.id];
    console.log('Foydalanuvchi chiqib ketdi:', socket.id);
  });
});

// G'olibni aniqlash funksiyasi
function checkWinner(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Gorizontal
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Vertikal
    [0, 4, 8], [2, 4, 6]             // Diagonal
  ];
  
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  
  return null;
}

// Vercel port
const PORT = process.env.PORT || 3000;

// Faqat localda server ishlatish
if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`🚀 Server ${PORT} portda`);
  });
}

// Vercel uchun export
module.exports = (req, res) => {
  // Socket.IO so'rovlarini handle qilish
  if (req.url.startsWith('/socket.io/')) {
    server.emit('request', req, res);
  } else {
    app(req, res);
  }
};