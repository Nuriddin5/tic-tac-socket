const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

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
      players: {}
    };
    
    players[socket.id].gameId = gameId;
    players[socket.id].symbol = 'X';
    
    games[gameId].players[socket.id] = players[socket.id].username;
    
    socket.join(gameId);
    socket.emit('game_created', { gameId, symbol: 'X' });
    
    console.log(`Yangi o'yin yaratildi: ${gameId}`);
    
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
    
    // Player2 ni o'rnatish
    game.player2 = socket.id;
    game.status = 'playing';
    game.players[socket.id] = players[socket.id].username;
    
    players[socket.id].gameId = gameId;
    players[socket.id].symbol = 'O';
    
    socket.join(gameId);
    
    // O'yinchilarga xabar berish
    io.to(gameId).emit('game_started', {
      gameId,
      board: game.board,
      currentPlayer: game.currentPlayer,
      players: game.players
    });
    
    console.log(`${players[socket.id].username} ${gameId} o'yiniga qo'shildi`);
    
    // Available o'yinlarni yangilash
    io.emit('available_games', Object.keys(games)
      .filter(gId => !games[gId].player2 && games[gId].status === 'waiting'));
  });

  // Harakat qilish
  socket.on('make_move', ({ gameId, cellIndex }) => {
    const game = games[gameId];
    const player = players[socket.id];
    
    if (!game || game.status !== 'playing') return;
    
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portda ishga tushdi`);
});