// server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { insertResult, getLatest, getStats, getCount } = require('./database');
const { getColor, getBigSmall, getOddEven, generatePeriod, predictNext } = require('./utils');

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
            console.log(`[${gameType}] Added: ${number} (${data.color})`);
            
            // Calculate next prediction for live stream
            const history = await getLatest(gameType, 20);
            const prediction = predictNext(history);

            io.to(gameType).emit('new_result', {
                result: data,
                prediction: prediction
            });
        }
    } catch (e) {
        console.error(`Error ${gameType}:`, e.message);
    }
}

// ========== SEED INITIAL DATA ==========
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
        }
    }
}

// ========== START TIMERS ==========
function startTimers() {
    GAMES.forEach(g => {
        setInterval(() => newResult(g), TIMERS[g] * 1000);
        console.log(`⏱️  Timer running: ${g} (every ${TIMERS[g]}s)`);
    });
}

// ========== API ROUTES ==========

// Home -> Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📌 MAIN API: Results + Next Prediction
// URL: /api/results?gameType=1min&limit=100
app.get('/api/results', async (req, res) => {
    try {
        const g = req.query.gameType || '1min';
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);

        if (!GAMES.includes(g)) {
            return res.status(400).json({ success: false, error: `Invalid gameType. Use: ${GAMES.join(', ')}` });
        }

        const results = await getLatest(g, limit);
        const prediction = predictNext(results);

        res.json({
            success: true,
            gameType: g,
            totalReturned: results.length,
            nextPrediction: prediction,
            results: results // Full 100+ items array here
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 📌 PREDICTION ONLY API
// URL: /api/prediction?gameType=1min
app.get('/api/prediction', async (req, res) => {
    try {
        const g = req.query.gameType || '1min';
        const history = await getLatest(g, 20);
        const prediction = predictNext(history);

        res.json({
            success: true,
            gameType: g,
            prediction
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 📌 STATS API
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

// 📌 ADD RESULT MANUAL (POST)
app.post('/api/add', async (req, res) => {
    try {
        const { gameType, period, number } = req.body;
        if (!gameType || number === undefined) {
            return res.status(400).json({ success: false, error: 'Missing gameType or number' });
        }
        await newResult(gameType, parseInt(number), period);
        res.json({ success: true, message: 'Result added successfully' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'running', uptime: Math.floor(process.uptime()) + 's' });
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
    socket.on('join', async (gameType) => {
        socket.join(gameType);
        const history = await getLatest(gameType, 100);
        const prediction = predictNext(history);
        socket.emit('initial_data', { history, prediction });
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 WINGO API LIVE -> http://localhost:${PORT}`);
    await seedAll();
    startTimers();
});
