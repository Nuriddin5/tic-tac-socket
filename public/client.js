// Vercel uchun to'g'ri Socket.IO konfiguratsiyasi
const socket = io('https://tic-tac-socket.vercel.app', {
  // FAQT polling transport'ni ishlating
  transports: ['polling'], // 'websocket' ni O'CHIRING!
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 15000,
  path: '/socket.io/',
  withCredentials: false, // false qiling
  forceNew: true,
  multiplex: false
});

// Connection monitoring
socket.on('connect', () => {
  console.log('✅ Serverga HTTP polling orqali ulandik!');
  console.log('Socket ID:', socket.id);
  
  // UI ga statusni yangilash
  if (document.getElementById('connectionStatus')) {
    document.getElementById('connectionStatus').innerHTML = 
      '<span style="color: green;">🟢 Onlayn (Polling)</span>';
  }
});

socket.on('connect_error', (error) => {
  console.error('❌ Ulanish xatosi:', error.message);
  
  if (document.getElementById('connectionStatus')) {
    document.getElementById('connectionStatus').innerHTML = 
      '<span style="color: red;">🔴 Ulanishda muammo</span>';
  }
  
  // 5 soniyadan keyin qayta urinish
  setTimeout(() => {
    console.log('🔄 Qayta ulanishga urinmoqda...');
    socket.connect();
  }, 5000);
});

// Auto-reconnect
socket.on('disconnect', (reason) => {
  console.log('🔌 Uzildi:', reason);
  if (reason === 'io server disconnect') {
    socket.connect();
  }
});

let currentGameId = null;
let mySymbol = null;
let myUsername = null;
let currentGamePlayers = {};

// DOM Elements
const loginSection = document.getElementById('loginSection');
const lobbySection = document.getElementById('lobbySection');
const gameSection = document.getElementById('gameSection');

const usernameInput = document.getElementById('usernameInput');
const setUsernameBtn = document.getElementById('setUsernameBtn');
const usernameDisplay = document.getElementById('usernameDisplay');

const createGameBtn = document.getElementById('createGameBtn');
const refreshGamesBtn = document.getElementById('refreshGamesBtn');
const gamesList = document.getElementById('gamesList');

const gameIdDisplay = document.getElementById('gameIdDisplay');
const leaveGameBtn = document.getElementById('leaveGameBtn');
const playerXName = document.getElementById('playerXName');
const playerOName = document.getElementById('playerOName');
const currentPlayerIndicator = document.getElementById('currentPlayerIndicator');
const gameStatus = document.getElementById('gameStatus');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');

// Event Listeners
setUsernameBtn.addEventListener('click', setUsername);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setUsername();
});

createGameBtn.addEventListener('click', createGame);
refreshGamesBtn.addEventListener('click', refreshGames);
leaveGameBtn.addEventListener('click', leaveGame);
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Game board cells
const cells = document.querySelectorAll('.cell');
cells.forEach(cell => {
    cell.addEventListener('click', () => makeMove(parseInt(cell.dataset.index)));
});

// Functions
function setUsername() {
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Iltimos, username kiriting!');
        return;
    }
    
    myUsername = username;
    socket.emit('set_username', username);
    
    // UI ni yangilash
    usernameDisplay.textContent = username;
    loginSection.classList.remove('active');
    loginSection.classList.add('hidden');
    lobbySection.classList.remove('hidden');
    lobbySection.classList.add('active');
    
    // Chatga xabar qo'shish
    addMessage('system', new Date().toLocaleTimeString(), `Xush kelibsiz, ${username}!`);
}

function createGame() {
    socket.emit('create_game');
}

function refreshGames() {
    if (myUsername) {
        socket.emit('set_username', myUsername);
    }
}

function joinGame(gameId) {
    socket.emit('join_game', gameId);
}

function makeMove(cellIndex) {
    // if (!currentGameId || !mySymbol) {
    //     alert('O\'yin boshlanmagan!');
    //     return;
    // }
    
    socket.emit('make_move', { gameId: currentGameId, cellIndex });
    
    // Click animation
    const cell = document.querySelector(`.cell[data-index="${cellIndex}"]`);
    cell.style.transform = 'scale(0.9)';
    setTimeout(() => {
        cell.style.transform = 'scale(1)';
    }, 150);
}

function leaveGame() {
    if (currentGameId) {
        socket.emit('leave_game', currentGameId);
    }
    
    currentGameId = null;
    mySymbol = null;
    currentGamePlayers = {};
    
    // UI ni yangilash
    gameSection.classList.remove('active');
    gameSection.classList.add('hidden');
    lobbySection.classList.remove('hidden');
    lobbySection.classList.add('active');
    
    // Game boardni tozalash
    clearBoard();
    refreshGames(); // Available o'yinlarni yangilash
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !currentGameId) {
        alert('Xabar yozish uchun o\'yin ichida bo\'lishingiz kerak!');
        return;
    }
    
    socket.emit('send_message', { gameId: currentGameId, message });
    chatInput.value = '';
}

function addMessage(username, time, message, isSystem = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSystem ? 'system' : ''}`;
    
    messageDiv.innerHTML = `
        <span class="time">${time}</span>
        ${isSystem ? '' : '<strong>' + username + ':</strong>'}
        <span class="content">${message}</span>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateBoard(board) {
    board.forEach((value, index) => {
        const cell = document.querySelector(`.cell[data-index="${index}"]`);
        cell.textContent = value || '';
        cell.className = 'cell';
        if (value === 'X') {
            cell.classList.add('x');
        } else if (value === 'O') {
            cell.classList.add('o');
        }
    });
}

function clearBoard() {
    cells.forEach(cell => {
        cell.textContent = '';
        cell.className = 'cell';
    });
}

function updatePlayerNames(players, symbols) {
    // Playerlarni aniqlash
    let xPlayerId = null;
    let oPlayerId = null;
    
    for (const [playerId, symbol] of Object.entries(symbols)) {
        if (symbol === 'X') xPlayerId = playerId;
        if (symbol === 'O') oPlayerId = playerId;
    }
    
    // Ismlarni o'rnatish
    playerXName.textContent = xPlayerId ? players[xPlayerId] || 'X o\'yinchi' : 'Kutilmoqda...';
    playerOName.textContent = oPlayerId ? players[oPlayerId] || 'O o\'yinchi' : 'Kutilmoqda...';
}

// Socket.IO Event Handlers
socket.on('connect', () => {
    console.log('Serverga ulandik!');
    addMessage('system', new Date().toLocaleTimeString(), 'Serverga ulandi', true);
    
    // Agar oldin username kiritilgan bo'lsa
    if (myUsername) {
        socket.emit('set_username', myUsername);
    }
});

socket.on('available_games', (games) => {
    gamesList.innerHTML = '';
    
    if (games.length === 0) {
        gamesList.innerHTML = '<p class="empty-text">Hozircha o\'yinlar mavjud emas...</p>';
        return;
    }
    
    games.forEach(gameId => {
        const gameItem = document.createElement('div');
        gameItem.className = 'game-item';
        gameItem.innerHTML = `
            <span>O'yin: <strong>${gameId}</strong></span>
            <button class="join-game-btn" onclick="joinGame('${gameId}')">
                <i class="fas fa-gamepad"></i> Qo'shilish
            </button>
        `;
        gamesList.appendChild(gameItem);
    });
});

socket.on('game_created', (data) => {
    currentGameId = data.gameId;
    mySymbol = data.symbol;
    currentGamePlayers = data.players || {};
    
    // UI ni yangilash
    gameIdDisplay.textContent = currentGameId;
    updatePlayerNames(data.players, { [socket.id]: mySymbol });
    
    // Sahifalarni o'zgartirish
    lobbySection.classList.remove('active');
    lobbySection.classList.add('hidden');
    gameSection.classList.remove('hidden');
    gameSection.classList.add('active');
    
    gameStatus.textContent = 'Ikkinchi o\'yinchi kutilmoqda...';
    gameStatus.style.color = '#ffd700';
    
    addMessage('system', new Date().toLocaleTimeString(), 
        `Siz ${currentGameId} o'yinini yaratdingiz. Ikkinchi o'yinchi kutilmoqda...`, true);
});

socket.on('game_started', (data) => {
    currentGameId = data.gameId;
    currentGamePlayers = data.players || {};
    
    // UI ni yangilash
    gameIdDisplay.textContent = currentGameId;
    updatePlayerNames(data.players, data.symbols);
    
    // Agar o'yin boshlamagan bo'lsa, sahifani o'zgartirish
    if (gameSection.classList.contains('hidden')) {
        lobbySection.classList.remove('active');
        lobbySection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        gameSection.classList.add('active');
    }
    
    gameStatus.textContent = 'O\'yin boshlandi!';
    gameStatus.style.color = '#00ff9d';
    currentPlayerIndicator.textContent = data.currentPlayer;
    currentPlayerIndicator.style.color = data.currentPlayer === 'X' ? '#00ff9d' : '#ff416c';
    
    updateBoard(data.board);
    
    addMessage('system', new Date().toLocaleTimeString(), 
        'O\'yin boshlandi! Xush o\'yin!', true);
});

socket.on('game_updated', (data) => {
    updateBoard(data.board);
    currentPlayerIndicator.textContent = data.currentPlayer;
    currentPlayerIndicator.style.color = data.currentPlayer === 'X' ? '#00ff9d' : '#ff416c';
    
    if (data.status === 'finished') {
        if (data.winner === 'draw') {
            gameStatus.textContent = 'Durrang!';
            gameStatus.style.color = '#ffd700';
        } else {
            console.log(data);
            gameStatus.textContent = `${data.winner} g'olib bo'ldi!`;
            gameStatus.style.color = data.winner === 'X' ? '#00ff9d' : '#ff416c';
        }
    } else {
        gameStatus.textContent = `Navbat: ${data.currentPlayer}`;
    }
});

socket.on('new_message', (data) => {
    const time = new Date().toLocaleTimeString();
    addMessage(data.username, time, data.message);
});

socket.on('player_left', (data) => {
    addMessage('system', new Date().toLocaleTimeString(), 
        `${data.username} o'yindan chiqdi.`, true);
    
    gameStatus.textContent = `${data.username} o'yindan chiqdi`;
    gameStatus.style.color = '#ff416c';
});

socket.on('left_game', () => {
    currentGameId = null;
    mySymbol = null;
    currentGamePlayers = {};
    
    // UI ni yangilash
    gameSection.classList.remove('active');
    gameSection.classList.add('hidden');
    lobbySection.classList.remove('hidden');
    lobbySection.classList.add('active');
    
    // Game boardni tozalash
    clearBoard();
    refreshGames();
    
    addMessage('system', new Date().toLocaleTimeString(), 
        'Siz o\'yindan chiqdingiz.', true);
});

socket.on('error', (message) => {
    alert(`Xato: ${message}`);
    console.error('Socket.IO xato:', message);
});

// Disconnect handling
socket.on('disconnect', () => {
    addMessage('system', new Date().toLocaleTimeString(), 
        'Serverga ulanishingiz uzildi. Qayta ulanmoqda...', true);
    
    gameStatus.textContent = 'Serverga ulanishingiz uzildi...';
    gameStatus.style.color = '#ff416c';
});

socket.on('connect_error', (error) => {
    console.error('Ulanishda xato:', error);
    addMessage('system', new Date().toLocaleTimeString(), 
        'Serverga ulanib bo\'lmadi. Iltimos, qayta urinib ko\'ring.', true);
});

// Auto-reconnect uchun
setInterval(() => {
    if (!socket.connected) {
        console.log('Qayta ulanmoqda...');
        socket.connect();
    }
}, 5000);

// Global function for joinGame
window.joinGame = joinGame;