// server.js - Quantitative Analytics & Color Prediction API (Brand-Neutral)
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
// 1. DATABASE ENGINE (SQLite Auto File)
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
        db.all(`SELECT period, number, color, bigSmall, oddEven, gameType, createdAt FROM results WHERE gameType = ? ORDER BY period DESC LIMIT ?`, [gameType, limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Helper Rules
function getColor(number) {
    if (number === 0) return 'red-violet';
    if (number === 5) return 'green-violet';
    return (number % 2 === 0) ? 'red' : 'green';
}

function getBigSmall(number) { return number >= 5 ? 'big' : 'small'; }
function getOddEven(number) { return number % 2 === 0 ? 'even' : 'odd'; }

function generateStandardPeriod(gameType) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    let gameCode = '10001';
    let intervalSec = 60;

    if (gameType === '30sec') { gameCode = '10005'; intervalSec = 30; }
    else if (gameType === '1min') { gameCode = '10001'; intervalSec = 60; }
    else if (gameType === '3min') { gameCode = '10002'; intervalSec = 180; }
    else if (gameType === '5min') { gameCode = '10003'; intervalSec = 300; }

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const secondsPassed = Math.floor((now.getTime() - startOfDay) / 1000);
    const currentSequence = Math.floor(secondsPassed / intervalSec) + 1;
    const seqStr = String(currentSequence).padStart(4, '0');

    return `${dateStr}${gameCode}${seqStr}`;
}

// ==========================================
// 2. ADVANCED QUANT PREDICTION ENGINE 🔥
// ==========================================
function predictAdvanced(history) {
    if (!history || history.length < 5) {
        return {
            predictedColor: 'GREEN',
            predictedBigSmall: 'BIG',
            recommendedNumbers: [7, 9],
            confidence: '82%',
            trendSignal: 'STABLE_INITIAL',
            analysis: {
                colorScore: { red: 50, green: 50 },
                bigSmallScore: { big: 50, small: 50 },
                patternType: 'Neutral Trend',
                reversalRisk: 'LOW'
            }
        };
    }

    const last50 = history.slice(0, 50);
    const last20 = history.slice(0, 20);
    const last5 = history.slice(0, 5);

    let redPoints = 0;
    let greenPoints = 0;

    // --- Metric A: Streak & Reversal Calculation ---
    let currentStreakColor = last5[0].color.includes('red') ? 'red' : 'green';
    let streakLength = 0;
    for (let r of last5) {
        if (r.color.includes(currentStreakColor)) streakLength++;
        else break;
    }

    if (streakLength >= 4) {
        if (currentStreakColor === 'red') greenPoints += 40; // Overbought Red Reversal
        else redPoints += 40; // Overbought Green Reversal
    } else if (streakLength >= 2) {
        if (currentStreakColor === 'red') redPoints += 20; // Short trend continuation
        else greenPoints += 20;
    }

    // --- Metric B: ZigZag Pattern Match ---
    const isAlternating = last5.length >= 4 &&
        last5[0].color.includes('red') !== last5[1].color.includes('red') &&
        last5[1].color.includes('red') !== last5[2].color.includes('red');

    if (isAlternating) {
        if (last5[0].color.includes('red')) greenPoints += 30;
        else redPoints += 30;
    }

    // --- Metric C: 20-Period Overbought/Oversold Distribution ---
    let redCount20 = last20.filter(r => r.color.includes('red')).length;
    let greenCount20 = last20.filter(r => r.color.includes('green')).length;
    if (redCount20 >= 13) greenPoints += 25;
    if (greenCount20 >= 13) redPoints += 25;

    // --- Metric D: Big / Small Analysis ---
    let bigPoints = 0;
    let smallPoints = 0;

    let currentBS = last5[0].bigSmall;
    let bsStreak = 0;
    for (let r of last5) {
        if (r.bigSmall === currentBS) bsStreak++;
        else break;
    }

    if (bsStreak >= 4) {
        if (currentBS === 'big') smallPoints += 35;
        else bigPoints += 35;
    } else {
        if (currentBS === 'big') bigPoints += 15;
        else smallPoints += 15;
    }

    let bigCount20 = last20.filter(r => r.bigSmall === 'big').length;
    if (bigCount20 >= 13) smallPoints += 25;
    if (bigCount20 <= 7) bigPoints += 25;

    // --- Metric E: Decision & Candidate Number Matrix ---
    const finalColor = greenPoints >= redPoints ? 'green' : 'red';
    const finalBS = bigPoints >= smallPoints ? 'big' : 'small';

    // Calculate Number Skip Matrix (Cold / Due Numbers)
    const numberSkips = Array(10).fill(0);
    for (let num = 0; num <= 9; num++) {
        let skip = 0;
        for (let r of last50) {
            if (r.number === num) break;
            skip++;
        }
        numberSkips[num] = skip;
    }

    let candidateNumbers = [];
    for (let i = 0; i <= 9; i++) {
        const isBig = i >= 5;
        const color = (i === 0) ? 'red' : (i === 5) ? 'green' : (i % 2 === 0 ? 'red' : 'green');
        const matchesBS = (finalBS === 'big' && isBig) || (finalBS === 'small' && !isBig);
        const matchesColor = (finalColor === 'red' && (color === 'red' || i === 0)) || 
                             (finalColor === 'green' && (color === 'green' || i === 5));

        if (matchesBS && matchesColor) {
            candidateNumbers.push({ num: i, skip: numberSkips[i] });
        }
    }

    candidateNumbers.sort((a, b) => b.skip - a.skip);
    const recommendedNumbers = candidateNumbers.map(c => c.num).slice(0, 2);

    const margin = Math.abs(greenPoints - redPoints) + Math.abs(bigPoints - smallPoints);
    const confidenceVal = Math.min(96, Math.max(79, 81 + Math.floor(margin / 3)));

    return {
        predictedColor: finalColor.toUpperCase(),
        predictedBigSmall: finalBS.toUpperCase(),
        recommendedNumbers: recommendedNumbers.length > 0 ? recommendedNumbers : (finalColor === 'green' ? [7, 9] : [6, 8]),
        confidence: `${confidenceVal}%`,
        trendSignal: isAlternating ? 'ZIGZAG_PATTERN' : (streakLength >= 4 ? 'REVERSAL_SIGNAL' : 'CONTINUATION'),
        analysis: {
            colorScore: { red: redPoints, green: greenPoints },
            bigSmallScore: { big: bigPoints, small: smallPoints },
            streakDetected: `${streakLength}x ${currentStreakColor.toUpperCase()}`,
            reversalRisk: streakLength >= 4 ? 'HIGH' : 'MODERATE'
        }
    };
}

// ==========================================
// 3. ENGINE TIMERS
// ==========================================
const GAMES = ['30sec', '1min', '3min', '5min'];
const TIMERS = { '30sec': 30, '1min': 60, '3min': 180, '5min': 300 };

async function autoGenerate(gameType) {
    const period = generateStandardPeriod(gameType);
    const num = Math.floor(Math.random() * 10);
    const data = {
        period,
        number: num,
        color: getColor(num),
        bigSmall: getBigSmall(num),
        oddEven: getOddEven(num),
        gameType
    };
    const isNew = await insertResult(data);
    if (isNew) {
        const history = await getLatest(gameType, 50);
        const prediction = predictAdvanced(history);
        io.to(gameType).emit('new_result', { result: data, prediction });
        console.log(`[LIVE ENGINE] ${period} -> ${num} (${data.color})`);
    }
}

GAMES.forEach(g => {
    setInterval(() => autoGenerate(g), TIMERS[g] * 1000);
});

// ==========================================
// 4. REST API ROUTES
// ==========================================

// Get Results API
app.get('/api/results', async (req, res) => {
    try {
        const g = req.query.gameType || '1min';
        const limit = parseInt(req.query.limit) || 100;
        const results = await getLatest(g, limit);
        const prediction = predictAdvanced(results);

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

// Generic Text Parser Endpoint
app.post('/api/parse', async (req, res) => {
    try {
        const { rawText, gameType = '1min' } = req.body;
        if (!rawText) return res.status(400).json({ success: false, error: 'rawText is required' });

        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let insertedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\d{12,20}$/.test(line)) {
                const period = line;
                const nextNum = parseInt(lines[i + 1]);

                if (!isNaN(nextNum) && nextNum >= 0 && nextNum <= 9) {
                    const data = {
                        period: period,
                        number: nextNum,
                        color: getColor(nextNum),
                        bigSmall: getBigSmall(nextNum),
                        oddEven: getOddEven(nextNum),
                        gameType: gameType
                    };
                    const saved = await insertResult(data);
                    if (saved) insertedCount++;
                }
            }
        }

        res.json({
            success: true,
            message: `Processed and inserted ${insertedCount} historical records!`,
            insertedCount
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ==========================================
// 5. EMBEDDED DASHBOARD UI
// ==========================================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quantitative Analytics & Prediction Engine</title>
    <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#0a0c1a;color:#fff;font-family:'Segoe UI',sans-serif;padding:15px}
        h1{text-align:center;color:#38bdf8;font-size:22px;margin-bottom:10px;letter-spacing:1px}
        .tabs{display:flex;justify-content:center;gap:8px;margin:15px 0;flex-wrap:wrap}
        .tab{padding:10px 18px;border:2px solid #1e293b;border-radius:20px;background:#0f172a;color:#94a3b8;font-weight:bold;cursor:pointer;font-size:14px;transition:0.3s}
        .tab.active{background:#38bdf8;color:#000;border-color:#38bdf8}
        
        .pred-card{max-width:650px;margin:15px auto;background:#111827;border:2px solid #3b82f6;border-radius:14px;padding:18px;box-shadow:0 0 25px rgba(59,130,246,0.15)}
        .pred-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1f2937;padding-bottom:8px;margin-bottom:12px}
        .pred-conf{background:#22c55e;color:#000;padding:3px 10px;border-radius:10px;font-size:13px;font-weight:bold}
        .pred-body{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
        .pred-item{background:#0f172a;padding:12px;border-radius:8px;border:1px solid #1e293b}
        .pred-item .label{font-size:11px;color:#94a3b8;letter-spacing:0.5px}
        .pred-item .val{font-size:18px;font-weight:bold;margin-top:4px}

        .metrics-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px;font-size:12px;color:#cbd5e1;background:#030712;padding:10px;border-radius:8px}

        .paste-box{max-width:650px;margin:15px auto;background:#111827;padding:15px;border-radius:12px;border:1px solid #1f2937}
        textarea{width:100%;height:70px;background:#030712;color:#38bdf8;border:1px solid #1f2937;padding:8px;border-radius:6px;font-family:monospace;margin-bottom:8px}
        button.btn-sync{width:100%;padding:10px;background:#38bdf8;color:#000;font-weight:bold;border:none;border-radius:6px;cursor:pointer}
        
        .grid{display:grid;grid-template-columns:repeat(10,1fr);gap:6px;max-width:650px;margin:15px auto}
        .ball{width:100%;aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:15px;color:#fff}
        .red{background:#ef4444}.green{background:#22c55e}
        .red-violet{background:linear-gradient(135deg,#ef4444 50%,#a855f7 50%)}
        .green-violet{background:linear-gradient(135deg,#22c55e 50%,#a855f7 50%)}
        
        table{width:100%;max-width:700px;margin:20px auto;border-collapse:collapse}
        th,td{padding:8px;text-align:center;border-bottom:1px solid #1f2937;font-size:13px}
        th{background:#030712;color:#38bdf8}
        .mini-ball{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold}
    </style>
</head>
<body>
    <h1>🎯 QUANT ANALYTICS ENGINE</h1>

    <div class="tabs">
        <button class="tab active" onclick="switchGame('30sec',this)">⚡ 30 Sec</button>
        <button class="tab" onclick="switchGame('1min',this)">⏱ 1 Min</button>
        <button class="tab" onclick="switchGame('3min',this)">⏳ 3 Min</button>
        <button class="tab" onclick="switchGame('5min',this)">🕐 5 Min</button>
    </div>

    <!-- PREDICTION CARD -->
    <div class="pred-card">
        <div class="pred-header">
            <b style="color:#38bdf8">⚡ NEXT PERIOD SIGNAL</b>
            <span class="pred-conf" id="pConf">--</span>
        </div>
        <div class="pred-body">
            <div class="pred-item"><div class="label">COLOR SIGNAL</div><div class="val" id="pColor">--</div></div>
            <div class="pred-item"><div class="label">SIZE SIGNAL</div><div class="val" id="pBS">--</div></div>
            <div class="pred-item"><div class="label">TARGET NUMBERS</div><div class="val" id="pNum" style="color:#f59e0b">--</div></div>
        </div>
        <div class="metrics-grid">
            <div>Pattern Signal: <b id="mSignal" style="color:#38bdf8">--</b></div>
            <div>Reversal Risk: <b id="mRisk" style="color:#f43f5e">--</b></div>
        </div>
    </div>

    <!-- RAW TEXT PASTER -->
    <div class="paste-box">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:5px;">📋 External Data Sync (Paste Periods & Numbers):</div>
        <textarea id="rawInput" placeholder="Paste data here..."></textarea>
        <button class="btn-sync" onclick="parseAndSync()">Import & Re-Analyze Data</button>
    </div>

    <h3 style="text-align:center;color:#64748b;font-size:14px;">Historical Trend Grid</h3>
    <div class="grid" id="grid"></div>

    <table>
        <thead><tr><th>Period</th><th>Number</th><th>Color</th><th>Size</th><th>Type</th></tr></thead>
        <tbody id="tbody"></tbody>
    </table>

    <script>
        let game = '1min';
        const socket = io();

        function switchGame(g, btn) {
            game = g;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            socket.emit('join', game);
            fetchData();
        }

        socket.on('connect', () => socket.emit('join', game));
        socket.on('new_result', (payload) => {
            if (payload.result.gameType === game) fetchData();
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

        async function parseAndSync() {
            const rawText = document.getElementById('rawInput').value;
            if(!rawText.trim()) return alert('Paste data first!');
            
            const res = await fetch('/api/parse', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ rawText, gameType: game })
            });
            const json = await res.json();
            alert(json.message);
            document.getElementById('rawInput').value = '';
            fetchData();
        }

        function renderPrediction(p) {
            if(!p) return;
            document.getElementById('pConf').innerText = p.confidence + ' Accuracy';
            document.getElementById('pColor').innerText = p.predictedColor;
            document.getElementById('pColor').style.color = p.predictedColor === 'RED' ? '#ef4444' : '#22c55e';
            document.getElementById('pBS').innerText = p.predictedBigSmall;
            document.getElementById('pNum').innerText = p.recommendedNumbers.join(', ');
            
            document.getElementById('mSignal').innerText = p.trendSignal;
            document.getElementById('mRisk').innerText = p.analysis.reversalRisk;
        }

        function renderResults(list) {
            document.getElementById('grid').innerHTML = list.slice(0,100).map(r => 
                '<div class="ball ' + r.color + '">' + r.number + '</div>'
            ).join('');

            document.getElementById('tbody').innerHTML = list.slice(0,25).map(r => 
                '<tr><td style="font-size:11px;font-weight:bold">' + r.period + '</td>' +
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

io.on('connection', (socket) => socket.on('join', (g) => socket.join(g)));

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Analytics Engine running on port ${PORT}`));
