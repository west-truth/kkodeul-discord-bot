// kkodeul_engine.js

// ... (disassembleWord, checkGuess, assembleJamo 함수는 이전과 완전히 동일) ...

const hangul = require('hangul-js');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');

registerFont(path.join(__dirname, 'fonts', 'NanumGothicExtraBold.ttf'), { family: 'NanumGothic' });

function disassembleWord(word) {
  const jamoArray = hangul.disassemble(word);
  if (jamoArray.length === 6) { return jamoArray; }
  return [];
}

function checkGuess(guessJamo, answerJamo) {
  let results = Array(6).fill('Gray');
  let answerCheck = [...answerJamo];
  for (let i = 0; i < 6; i++) {
    if (guessJamo[i] === answerCheck[i]) {
      results[i] = 'Green';
      answerCheck[i] = null;
    }
  }
  for (let i = 0; i < 6; i++) {
    if (results[i] === 'Green') continue;
    const guess = guessJamo[i];
    const yellowIndex = answerCheck.indexOf(guess);
    if (yellowIndex !== -1) {
      results[i] = 'Yellow';
      answerCheck[yellowIndex] = null;
    }
  }
  return results;
}

function assembleJamo(jamoArray) {
  return hangul.assemble(jamoArray);
}

async function generateImage(guessesJamo, results, options = {}) {
  const { showJamo = true } = options;
  const CELL_SIZE = 80;
  const PADDING = 10;
  const FONT_SIZE = 40;
  const WIDTH = (CELL_SIZE + PADDING) * 6 + PADDING;
  const HEIGHT = (CELL_SIZE + PADDING) * 6 + PADDING;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1A1A1B';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.font = `${FONT_SIZE}px 'NanumGothic'`; 
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const x = PADDING + c * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
      const y = PADDING + r * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
      if (r < results.length) { 
        const color = results[r][c];
        if (color === 'Green') ctx.fillStyle = '#538D4E';
        else if (color === 'Yellow') ctx.fillStyle = '#B59F3B';
        else ctx.fillStyle = '#3A3A3C';
      } else { 
        ctx.fillStyle = '#121213';
      }
      ctx.fillRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
      ctx.strokeStyle = '#3A3A3C'; 
      ctx.lineWidth = 2;
      ctx.strokeRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
      if (showJamo && r < guessesJamo.length) { 
        ctx.fillStyle = '#FFFFFF'; 
        ctx.fillText(guessesJamo[r][c], x, y);
      }
    }
  }
  return canvas.toBuffer('image/png');
}

/**
 * [추가] 대결 모드 게임 보드 이미지를 생성합니다.
 * @param {object} duelState - 대결 상태 정보 객체
 * @returns {Buffer} 생성된 이미지의 Buffer
 */
async function generateDuelImage(duelState) {
  const CELL_SIZE = 60; // 대결 모드는 셀 크기를 약간 줄입니다.
  const PADDING = 8;
  const FONT_SIZE = 20;
  const PLAYER_PADDING = 20; // 두 플레이어 보드 사이의 간격

  const BOARD_WIDTH = (CELL_SIZE + PADDING) * 6 + PADDING;
  const WIDTH = BOARD_WIDTH * 2 + PLAYER_PADDING;
  const HEIGHT = (CELL_SIZE + PADDING) * 6 + PADDING + 40; // 이름 표시를 위한 추가 높이

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1A1A1B';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.font = `${FONT_SIZE}px 'Noto Sans KR', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';

  duelState.players.forEach((player, playerIndex) => {
    const offsetX = playerIndex * (BOARD_WIDTH + PLAYER_PADDING);
    const results = duelState.results[player.id] || [];
    
    // 플레이어 이름과 시도 횟수 표시
    const attemptCount = results.length;
    ctx.fillText(`${player.username} (${attemptCount}/6)`, offsetX + BOARD_WIDTH / 2, 20);

    // 각 플레이어의 보드 그리기
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const x = offsetX + PADDING + c * (CELL_SIZE + PADDING) + CELL_SIZE / 2;
        const y = 40 + PADDING + r * (CELL_SIZE + PADDING) + CELL_SIZE / 2;

        if (r < results.length) {
          const color = results[r][c];
          if (color === 'Green') ctx.fillStyle = '#538D4E';
          else if (color === 'Yellow') ctx.fillStyle = '#B59F3B';
          else ctx.fillStyle = '#3A3A3C';
        } else {
          ctx.fillStyle = '#121213';
        }
        ctx.fillRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = '#3A3A3C';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
      }
    }
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  disassembleWord,
  checkGuess,
  assembleJamo,
  rawDisassemble: hangul.disassemble, 
  generateImage,
  generateDuelImage // [추가]
};