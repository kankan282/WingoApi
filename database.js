// database.js - SQLite Local Database (No MongoDB Needed)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'wingo.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('✅ SQLite Connected → wingo.db');
});

// Table banao
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

// ===== HELPER FUNCTIONS =====

function insertResult(data) {
    return new Promise((resolve, reject) => {
        const sql = `INSERT OR IGNORE INTO results 
                     (period, number, color, bigSmall, oddEven, gameType) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        db.run(sql, [
            data.period, data.number, data.color,
            data.bigSmall, data.oddEven, data.gameType
        ], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function getLatest(gameType, limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT period, number, color, bigSmall, oddEven, gameType, createdAt 
             FROM results WHERE gameType = ? ORDER BY id DESC LIMIT ?`,
            [gameType, limit],
            (err, rows) => err ? reject(err) : resolve(rows)
        );
    });
}

function getStats(gameType, limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT number, color, bigSmall, oddEven 
             FROM results WHERE gameType = ? ORDER BY id DESC LIMIT ?`,
            [gameType, limit],
            (err, rows) => {
                if (err) return reject(err);
                const s = {
                    total: rows.length,
                    colors: { red: 0, green: 0, violet: 0, 'red-violet': 0, 'green-violet': 0 },
                    bigSmall: { big: 0, small: 0 },
                    oddEven: { odd: 0, even: 0 },
                    numbers: {}
                };
                for (let i = 0; i <= 9; i++) s.numbers[i] = 0;
                rows.forEach(r => {
                    s.colors[r.color] = (s.colors[r.color] || 0) + 1;
                    s.bigSmall[r.bigSmall]++;
                    s.oddEven[r.oddEven]++;
                    s.numbers[r.number]++;
                });
                resolve(s);
            }
        );
    });
}

function getCount(gameType) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM results WHERE gameType = ?`,
            [gameType],
            (err, row) => err ? reject(err) : resolve(row.count)
        );
    });
}

module.exports = { db, insertResult, getLatest, getStats, getCount };
