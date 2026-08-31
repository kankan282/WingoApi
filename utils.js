// utils.js - Color, BigSmall, OddEven Logic

function getColor(number) {
    if (number === 0) return 'red-violet';
    if (number === 5) return 'green-violet';
    return (number % 2 === 0) ? 'red' : 'green';
}

function getBigSmall(number) {
    return number >= 5 ? 'big' : 'small';
}

function getOddEven(number) {
    return number % 2 === 0 ? 'even' : 'odd';
}

function generatePeriod(gameType) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${y}${m}${d}${h}${min}${s}${ms}_${gameType}`;
}

module.exports = { getColor, getBigSmall, getOddEven, generatePeriod };
