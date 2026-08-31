// utils.js
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
    return `${y}${m}${d}${h}${min}${s}_${gameType}`;
}

// 🧠 SMART PREDICTION ALGORITHM
function predictNext(history) {
    if (!history || history.length < 5) {
        return {
            predictedColor: 'green',
            predictedBigSmall: 'big',
            recommendedNumbers: [5, 7, 9],
            confidence: "70%",
            patternReason: "Default seed trend"
        };
    }

    const last10 = history.slice(0, 10);
    
    // 1. Color Streak & Reversal Analysis
    let redCount = 0;
    let greenCount = 0;
    last10.forEach(r => {
        if (r.color.includes('red')) redCount++;
        if (r.color.includes('green')) greenCount++;
    });

    // Check last 3 streak
    const last3Colors = history.slice(0, 3).map(r => r.color);
    let predictedColor = 'green';
    let patternReason = 'Trend Follow';

    if (last3Colors.every(c => c.includes('red'))) {
        predictedColor = 'green'; // Reversal after streak
        patternReason = 'Reversal Expected (Overbought Red)';
    } else if (last3Colors.every(c => c.includes('green'))) {
        predictedColor = 'red'; // Reversal after streak
        patternReason = 'Reversal Expected (Overbought Green)';
    } else {
        predictedColor = redCount >= greenCount ? 'red' : 'green';
        patternReason = 'Pattern Frequency Match';
    }

    // 2. Big / Small Prediction
    let bigCount = 0;
    let smallCount = 0;
    last10.forEach(r => {
        if (r.bigSmall === 'big') bigCount++;
        else smallCount++;
    });

    const predictedBigSmall = bigCount <= smallCount ? 'big' : 'small';

    // 3. Recommended Numbers
    let recommendedNumbers = [];
    if (predictedColor === 'red') {
        recommendedNumbers = predictedBigSmall === 'big' ? [6, 8] : [2, 4, 0];
    } else {
        recommendedNumbers = predictedBigSmall === 'big' ? [7, 9, 5] : [1, 3];
    }

    // 4. Calculate Confidence (70% - 92%)
    const confidence = Math.floor(75 + Math.random() * 18) + "%";

    return {
        predictedColor,
        predictedBigSmall,
        recommendedNumbers,
        confidence,
        patternReason
    };
}

module.exports = { getColor, getBigSmall, getOddEven, generatePeriod, predictNext };
