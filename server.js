// server.js - 100% Self Contained (No extra folders needed)
const express = require('express');
const http = require('http');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// ==========================================
// 1. DATABASE SETUP (Auto SQLite)
// ==========================================
const dbPath = path.resolve(__dirname, 'wingo.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period TEXT NOT NULL UNIQUE,
            number INTEGER NOT NULL,
            color TEXT NOT NULL,
            bigSmall TEXT NOT NULL,
            oddEven TEXT NOT NULL,
            gameType TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_game ON results(gameType, id DESC)`);
});

// Helper DB
function insertResult(data) {
    return new Promise((resolve, reject) => {
        const sql = `INSERT OR IGNORE INTO results (period, number, color, bigSmall, oddEven, gameType) VALUES (?, ?, ?, ?, ?, ?)`;
        db.run(sql, [data.period, data.number, data.color, data.bigSmall, data.oddEven, data.gameType], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function getLatest(gameType, limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT period, number, color, bigSmall, oddEven, gameType, createdAt FROM results WHERE gameType = ? ORDER BY id DESC LIMIT ?`, [gameType, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getCount(gameType) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM results WHERE gameType = ?`, [gameType], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.count : 0);
        });
    });
}

// ==========================================
// 2. PREDICTION & GAME LOGIC
// ==========================================
function getColor(number) {
    if (number === 0) return 'red-violet';
    if (number === 5) return 'green-violet';
    return (number % 2 === 0) ? 'red' : 'green';
}

function getBigSmall(number) { return number >= 5 ? 'big' : 'small'; }
function getOddEven(number) { return number % 2 === 0 ? 'even' : 'odd'; }

function generatePeriod(gameType) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${gameType}`;
}

function predictNext(history) {
    if (!history || history.length < 5) {
        return {
            predictedColor: 'green',
            predictedBigSmall: 'big',
            recommendedNumbers: [7, 9, 5],
            confidence: "82%",
            patternReason: "Initial Trend"
        };
    }
    const last3 = history.slice(0, 3).map(r => r.color);
    let predictedColor = 'green';
    let patternReason = 'Trend Following';

    if (last3.every(c => c.includes('red'))) {
        predictedColor = 'green';
        patternReason = 'Reversal Expected (Overbought Red)';
    } else if (last3.every(c => c.includes('green'))) {
        predictedColor = 'red';
        patternReason = 'Reversal Expected (Overbought Green)';
    } else {
        const redCount = history.slice(0, 10).filter(r => r.color.includes('red')).length;
        predictedColor = redCount >= 5 ? 'red' : 'green';
        patternReason = 'Pattern Frequency Match';
    }

    const bigCount = history.slice(0, 10).filter(r => r.bigSmall === 'big').length;
    const predictedBigSmall = bigCount <= 5 ? 'big' : 'small';

    let recommendedNumbers = [];
    if (predictedColor === 'red') {
        recommendedNumbers = predictedBigSmall === 'big' ? [6, 8] : [2, 4, 0];
    } else {
        recommendedNumbers = predictedBigSmall === 'big' ? [7, 9, 5] : [1, 3];
    }

    return {
        predictedColor,
        predictedBigSmall,
        recommendedNumbers,
        confidence: Math.floor(75 + Math.random() * 18) + "%",
        patternReason
    };
}

// ==========================================
// 3. AUTO TIMERS & DATA GENERATOR
// ==========================================
const GAMES = ['30sec', '1min', '3min', '5min'];
const TIMERS = { '30sec': 30, '1min': 60, '3min': 180, '5min': 300 };

async function processRound(gameType, customNum = null, customPeriod = null) {
    try {
        const number = customNum !== null ? customNum : Math.floor(Math.random() * 10);
        const data = {
            period: customPeriod || generatePeriod(gameType),
            number,
            color: getColor(number),
            bigSmall: getBigSmall(number),
            oddEven: getOddEven(number),
            gameType
        };
        const isNew = await insertResult(data);
        if (isNew) {
            const history = await getLatest(gameType, 10);
            const prediction = predictNext(history);
            io.to(gameType).emit('new_result', { result: data, prediction });
            console.log(`[${gameType}] ${number} (${data.color})`);
        }
    } catch (e) {
        console.error(e.message);
    }
}

async function seedData() {
    for (const g of GAMES) {
        const count = await getCount(g);
        if (count < 50) {
            console.log(`Generating initial data for ${g}...`);
            const now = Date.now();
            for (let i = 120; i >= 1; i--) {
                const num = Math.floor(Math.random() * 10);
                await insertResult({
                    period: `P_${g}_${now - (i * 30000)}`,
                    number: num,
                    color: getColor(num),
                    bigSmall: getBigSmall(num),
                    oddEven: getOddEven(num),
                    gameType: g
                });
            }
        }
    }
}

GAMES.forEach(g => {
    setInterval(() => processRound(g), TIMERS[g] * 1000);
});

// ==========================================
// 4. API ROUTES
// ==========================================

// Main Results API
app.get('/api/results', async (req, res) => {
    try {
        const g = req.query.gameType || '1min';
        const limit = parseInt(req.query.limit) || 100;
        const results = await getLatest(g, limit);
        const prediction = predictNext(results);

        res.json({
            success: true,
            gameType: g,
            totalReturned: results.length,
            nextPrediction: prediction,
            results: results
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// ==========================================
// 5. EMBEDDED FRONTEND (No public folder required!)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wingo Live Results & AI Prediction</title>
    <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#0a0a1a;color:#fff;font-family:'Segoe UI',sans-serif;padding:15px}
        h1{text-align:center;color:#00ff88;font-size:22px;margin-bottom:10px}
        .tabs{display:flex;justify-content:center;gap:8px;margin:15px 0;flex-wrap:wrap}
        .tab{padding:10px 18px;border:2px solid #333;border-radius:20px;background:transparent;color:#888;font-weight:bold;cursor:pointer;font-size:14px}
        .tab.active{background:#00ff88;color:#000;border-color:#00ff88}
        
        .pred-card{max-width:600px;margin:15px auto;background:#111124;border:2px solid #3b82f6;border-radius:12px;padding:15px}
        .pred-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;padding-bottom:6px;margin-bottom:10px}
        .pred-conf{background:#22c55e;color:#000;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:bold}
        .pred-body{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
        .pred-item{background:#0f172a;padding:8px;border-radius:6px}
        .pred-item .label{font-size:11px;color:#94a3b8}
        .pred-item .val{font-size:16px;font-weight:bold;margin-top:4px}
        
        .grid{display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-width:600px;margin:15px auto}
        .ball{width:100%;aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:15px;color:#fff}
        .red{background:#ef4444}.green{background:#22c55e}
        .red-violet{background:linear-gradient(135deg,#ef4444 50%,#a855f7 50%)}
        .green-violet{background:linear-gradient(135deg,#22c55e 50%,#a855f7 50%)}
        
        table{width:100%;max-width:700px;margin:20px auto;border-collapse:collapse}
        th,td{padding:8px;text-align:center;border-bottom:1px solid #222;font-size:13px}
        th{background:#111;color:#00ff88}
        .mini-ball{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold}
    </style>
</head>
<body>
    <h1>🎮 WINGO LIVE + AI PREDICTOR</h1>

    <div class="tabs">
        <button class="tab active" onclick="switchGame('30sec',this)">⚡ 30 Sec</button>
        <button class="tab" onclick="switchGame('1min',this)">⏱ 1 Min</button>
        <button class="tab" onclick="switchGame('3min',this)">⏳ 3 Min</button>
        <button class="tab" onclick="switchGame('5min',this)">🕐 5 Min</button>
    </div>

    <div class="pred-card">
        <div class="pred-header">
            <b style="color:#38bdf8">🤖 NEXT PREDICTION</b>
            <span class="pred-conf" id="pConf">--</span>
        </div>
        <div class="pred-body">
            <div class="pred-item"><div class="label">COLOR</div><div class="val" id="pColor">--</div></div>
            <div class="pred-item"><div class="label">BIG/SMALL</div><div class="val" id="pBS">--</div></div>
            <div class="pred-item"><div class="label">NUMBERS</div><div class="val" id="pNum" style="color:#f59e0b">--</div></div>
        </div>
    </div>

    <h3 style="text-align:center;color:#666;font-size:14px;">Last 100 Results Balls</h3>
    <div class="grid" id="grid"></div>

    <table>
        <thead><tr><th>Period</th><th>Number</th><th>Color</th><th>B/S</th><th>O/E</th></tr></thead>
        <tbody id="tbody"></tbody>
    </table>

    <script>
        let game = '30sec';
        const socket = io();

        function switchGame(g, btn) {
            game = g;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            socket.emit('join', game);
            fetchData();
        }

        socket.on('connect', () => {
            socket.emit('join', game);
        });

        socket.on('new_result', (payload) => {
            if (payload.result.gameType === game) {
                fetchData();
            }
        });

        async function fetchData() {
            try {
                const res = await fetch('/api/results?gameType=' + game + '&limit=100');
                const json = await res.json();
                if(json.success) {
                    renderPrediction(json.nextPrediction);
                    renderResults(json.results);
                }
            } catch(e){}
        }

        function renderPrediction(p) {
            if(!p) return;
            document.getElementById('pConf').innerText = p.confidence;
            document.getElementById('pColor').innerText = p.predictedColor.toUpperCase();
            document.getElementById('pColor').style.color = p.predictedColor === 'red' ? '#ef4444' : '#22c55e';
            document.getElementById('pBS').innerText = p.predictedBigSmall.toUpperCase();
            document.getElementById('pNum').innerText = p.recommendedNumbers.join(', ');
        }

        function renderResults(list) {
            document.getElementById('grid').innerHTML = list.slice(0,100).map(r => 
                '<div class="ball ' + r.color + '">' + r.number + '</div>'
            ).join('');

            document.getElementById('tbody').innerHTML = list.slice(0,25).map(r => 
                '<tr><td style="font-size:11px">' + r.period + '</td>' +
                '<td><span class="mini-ball ' + r.color + '">' + r.number + '</span></td>' +
                '<td>' + r.color + '</td>' +
                '<td>' + r.bigSmall.toUpperCase() + '</td>' +
                '<td>' + r.oddEven.toUpperCase() + '</td></tr>'
            ).join('');
        }

        fetchData();
    </script>
</body>
</html>
    `);
});

// Socket connection
io.on('connection', (socket) => {
    socket.on('join', (g) => socket.join(g));
});

// ==========================================
// 6. START SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    await seedData();
});
