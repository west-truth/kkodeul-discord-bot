// data_manager.js

const fs = require('fs');
const path = require('path');

// 데이터 파일을 저장할 경로 설정
const dataDir = path.join(__dirname, 'data');
const usersPath = path.join(dataDir, 'users.json');
const dailyInfoPath = path.join(dataDir, 'daily_info.json');

// (프로그램 최초 실행 시) data 폴더 및 json 파일들이 없으면 생성합니다.
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
  console.log('[데이터] /data 폴더를 생성했습니다.');
}
if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, JSON.stringify({}, null, 2));
  console.log('[데이터] users.json 파일을 생성했습니다.');
}
if (!fs.existsSync(dailyInfoPath)) {
  const defaultDailyInfo = {
    word: "",
    participants: []
  };
  fs.writeFileSync(dailyInfoPath, JSON.stringify(defaultDailyInfo, null, 2));
  console.log('[데이터] daily_info.json 파일을 생성했습니다.');
}

/**
 * 특정 유저의 통계 데이터를 불러옵니다. 유저가 없으면 기본값을 반환합니다.
 * @param {string} userId - Discord User ID
 * @returns {object} 유저 통계 객체
 */
function getUserStats(userId) {
  const usersData = JSON.parse(fs.readFileSync(usersPath));
  const defaultStats = {
    daily_streak: 0,
    max_streak: 0,
    total_wins: 0,
    total_games: 0
  };
  return usersData[userId] || defaultStats;
}

/**
 * 게임 결과에 따라 유저의 통계 데이터를 업데이트합니다.
 * @param {string} userId - Discord User ID
 * @param {object} gameResult - { win: boolean, isDaily: boolean } 형태의 게임 결과
 */
function updateUserStats(userId, gameResult) {
  const usersData = JSON.parse(fs.readFileSync(usersPath));
  const stats = getUserStats(userId);

  stats.total_games += 1;
  if (gameResult.win) {
    stats.total_wins += 1;
    if (gameResult.isDaily) {
      stats.daily_streak += 1;
      if (stats.daily_streak > stats.max_streak) {
        stats.max_streak = stats.daily_streak;
      }
    }
  } else {
    if (gameResult.isDaily) {
      stats.daily_streak = 0;
    }
  }
  
  usersData[userId] = stats;

  fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
  console.log(`[데이터] 유저 ${userId}의 통계를 업데이트했습니다.`, stats);
}

/**
 * 오늘의 꼬들 정보를 불러옵니다.
 * @returns {object} { word: string, participants: string[] }
 */
function getDailyInfo() {
  return JSON.parse(fs.readFileSync(dailyInfoPath));
}

/**
 * 오늘의 단어를 새로 선정하고 참가자 목록을 초기화합니다.
 * @param {string[]} answerlist - 정답 목록 배열
 */
function setDailyWord(answerlist) {
  const newWord = answerlist[Math.floor(Math.random() * answerlist.length)];
  const newDailyInfo = {
    word: newWord,
    participants: []
  };
  fs.writeFileSync(dailyInfoPath, JSON.stringify(newDailyInfo, null, 2));
  console.log(`[시스템] 오늘의 단어가 '${newWord}'(으)로 설정되었습니다.`);
}

/**
 * 오늘의 꼬들 참가자 목록에 유저를 추가합니다.
 * @param {string} userId - Discord User ID
 */
function updateDailyParticipants(userId) {
  const dailyInfo = getDailyInfo();
  if (!dailyInfo.participants.includes(userId)) {
    dailyInfo.participants.push(userId);
    fs.writeFileSync(dailyInfoPath, JSON.stringify(dailyInfo, null, 2));
  }
}

/**
 * 모든 유저의 통계 데이터를 불러옵니다.
 * @returns {object} 모든 유저의 통계 데이터 객체
 */
function getAllUsersData() {
  return JSON.parse(fs.readFileSync(usersPath));
}

module.exports = {
  getUserStats,
  updateUserStats,
  getDailyInfo,
  setDailyWord,
  updateDailyParticipants,
  getAllUsersData // [수정] 이 줄을 추가하여 함수를 외부에서 사용할 수 있도록 합니다.
};