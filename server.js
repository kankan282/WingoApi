// server.js - Complete Wingo API Server
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { insertResult, getLatest, getStats, getCount } = require('./database');
const { getColor, getBigSmall, getOddEven, generatePeriod } = require('./utils');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GAMES = ['30sec', '1min', '3min', '5min'];
const TIMERS = { '30sec': 30, '1min': 60, '3min': 180, '5min': 300 };

// ========== GAME ENGINE ==========
async function newResult(gameType, num = null, period = null) {
    try {
        const number = num !== null ? num : Math.floor(Math.random() * 10);
        const data = {
            period: period || generatePeriod(gameType),
            number,
            color: getColor(number),
            bigSmall: getBigSmall(number),
            oddEven: getOddEven(number),
            gameType
        };
        const isNew = await insertResult(data);
        if (isNew) {
            console.log(`[${gameType}] #${data.period.slice(-6)} → ${number} (${data.color})`);
            io.to(gameType).emit('new_result', data);
        }
    } catch (e) {
        console.error(`Error ${gameType}:`, e.message);
    }
}

// ========== SEED 120 RECORDS ON START ==========
async function seedAll() {
    for (const g of GAMES) {
        const count = await getCount(g);
        if (count < 50) {
            console.log(`🌱 Seeding 120 records for ${g}...`);
            const now = Date.now();
            const interval = TIMERS[g] * 1000;
            for (let i = 120; i >= 1; i--) {
                const num = Math.floor(Math.random() * 10);
                const p = `SEED_${g}_${now - i * interval}`;
                await insertResult({
                    period: p, number: num,
                    color: getColor(num),
                    bigSmall: getBigSmall(num),
                    oddEven: getOddEven(num),
                    gameType: g
                });
            }
            console.log(`✅ ${g} seeded!`);
        }
    }
}

// ========== START TIMERS ==========
function startTimers() {
    GAMES.forEach(g => {
        setInterval(() => newResult(g), TIMERS[g] * 1000);
        console.log(`⏱️  Timer started: ${g} (every ${TIMERS[g]}s)`);
    });
}

// ========== API ROUTES ==========

// Home → Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get Results: /api/results?gameType=1min&limit=100
app.get('/api/results', async (req, res) => {
    try {
        const g = req.query.gameType || '1min';
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        if (!GAMES.includes(g))
            return res.status(400).json({ success: false, error: `Use: ${GAMES.join(', ')}` });
        const data = await getLatest(g, limit);
        res.json({ success: true, gameType: g, total: data.length, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get Stats: /api/stats?gameType=1min&limit=100
app.get('/api/stats', async (req, res) => {
    try {
        const g = req.query.gameType || '1min';
        const limit = parseInt(req.query.limit) || 100;
        const stats = await getStats(g, limit);
        res.json({ success: true, gameType: g, stats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Add Result Manually: POST /api/add
app.post('/api/add', async (req, res) => {
    try {
        const { gameType, period, number } = req.body;
        if (!gameType || number === undefined)
            return res.status(400).json({ success: false, error: 'Need gameType & number' });
        await newResult(gameType, parseInt(number), period);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'running', uptime: Math.floor(process.uptime()) + 's', games: GAMES });
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
    console.log('⚡ Connected:', socket.id);
    socket.on('join', async (gameType) => {
        socket.join(gameType);
        const history = await getLatest(gameType, 100);
        socket.emit('history', history);
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 WINGO API LIVE → http://localhost:${PORT}\n`);
    await seedAll();
    startTimers();
});
