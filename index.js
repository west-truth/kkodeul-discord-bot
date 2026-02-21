// index.js

// 1. discord.js 및 필요 모듈 불러오기
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { token, clientId, guildId } = require('./config.json');
const cron = require('node-cron'); 

const { disassembleWord, checkGuess, assembleJamo, rawDisassemble, generateImage, generateDuelImage } = require('./kkodeul_engine.js');
const wordlist = require('./kkodeul_wordlist.json');
const answerlist = require('./kkodeul_answerlist.json');
const dataManager = require('./data_manager.js');

// 2. 봇 클라이언트(Client) 생성
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
  ]
});

// 3. 명령어(Slash Commands) 정의
const commands = [
  new SlashCommandBuilder()
    .setName('꼬들')
    .setDescription('오늘의 꼬들 게임을 시작합니다. (하루에 한 번)'),
  new SlashCommandBuilder()
    .setName('무제한')
    .setDescription('무제한 모드 꼬들 게임을 시작합니다.'),
  new SlashCommandBuilder()
    .setName('추측')
    .setDescription('현재 진행 중인 꼬들 게임의 단어를 추측합니다.')
    .addStringOption(option =>
      option.setName('단어')
        .setDescription('추측할 단어 (예: "설탕" 또는 "ㅅ ㅓ ㄹ ㅌ ㅏ ㅇ")')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('리더보드')
    .setDescription('게임 통계 순위를 확인합니다.'),
  new SlashCommandBuilder()
    .setName('대결')
    .setDescription('다른 유저에게 꼬들 대결을 신청합니다.')
    .addUserOption(option =>
      option.setName('상대')
        .setDescription('대결할 상대를 선택하세요.')
        .setRequired(true)
    ),
].map(command => command.toJSON());

// 4. 명령어 등록
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('[시스템] 슬래시(/) 명령어 등록을 시작합니다...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log('[시스템] 슬래시(/) 명령어가 테스트 서버에 성공적으로 등록되었습니다.');
  } catch (error) {
    console.error("명령어 등록 실패:", error);
  }
})();

// 5. 게임 상태 저장
const activeGames = new Map();
const activeDuels = new Map();

// 6. 봇 준비 완료 및 스케줄러
client.on('clientReady', () => {
  console.log(`[시스템] 봇이 로그인되었습니다! ${client.user.tag}`);
  if (dataManager.getDailyInfo().word === "") {
    dataManager.setDailyWord(answerlist);
  }
});
cron.schedule('0 0 * * *', () => {
  console.log('[시스템] 자정이 되어 오늘의 단어를 갱신합니다.');
  dataManager.setDailyWord(answerlist);
}, {
  scheduled: true,
  timezone: "Asia/Seoul" 
});

// 7. 상호작용 수신 이벤트
client.on('interactionCreate', async interaction => {
  // 버튼 처리
  if (interaction.isButton()) {
    const [action, duelId] = interaction.customId.split('-');
    const duel = activeDuels.get(duelId);
    if (!duel) {
      await interaction.update({ content: '만료되었거나 존재하지 않는 대결입니다.', components: [] });
      return;
    }
    if (interaction.user.id !== duel.players[1].id) {
      await interaction.reply({ content: '대결 상대만 수락 또는 거절할 수 있습니다.', ephemeral: true });
      return;
    }
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept-disabled').setLabel('수락').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('decline-disabled').setLabel('거절').setStyle(ButtonStyle.Danger).setDisabled(true)
    );
    if (action === 'accept') {
      duel.status = 'active';
      const initialDuelImage = await generateDuelImage(duel);
      const attachment = new AttachmentBuilder(initialDuelImage, { name: 'kkodeul_duel.png' });
      const gameMessage = await interaction.channel.send({
        content: `⚔️ **대결 시작!** | ${duel.players[0].username} vs ${duel.players[1].username}\n정답: **???**`,
        files: [attachment]
      });
      duel.messageId = gameMessage.id;
      await interaction.update({ content: `${interaction.user.username}님이 대결을 수락했습니다!`, components: [disabledRow] });
    } else if (action === 'decline') {
      activeDuels.delete(duelId);
      await interaction.update({ content: `${interaction.user.username}님이 대결을 거절했습니다.`, components: [disabledRow] });
    }
    return;
  }

  if (!interaction.isCommand()) return;
  const { commandName } = interaction;
  const userId = interaction.user.id;
  
  // 명령어 처리
  if (commandName === '대결') {
    const opponent = interaction.options.getUser('상대');
    if (opponent.bot) return interaction.reply({ content: '봇과는 대결할 수 없습니다.', ephemeral: true });
    if (opponent.id === userId) return interaction.reply({ content: '자기 자신과는 대결할 수 없습니다.', ephemeral: true });
    if (activeGames.has(userId) || activeGames.has(opponent.id)) return interaction.reply({ content: '이미 다른 게임을 플레이 중인 유저가 있습니다.', ephemeral: true });
    const isAnyPlayerInDuel = [...activeDuels.values()].some(d => d.players.some(p => p.id === userId || p.id === opponent.id));
    if (isAnyPlayerInDuel) return interaction.reply({ content: '이미 다른 대결에 참여 중인 유저가 있습니다.', ephemeral: true });

    const duelId = Date.now().toString();
    const answer = answerlist[Math.floor(Math.random() * answerlist.length)];
    const duelState = {
      id: duelId, status: 'pending', answer: answer, answerJamo: disassembleWord(answer),
      players: [{ id: userId, username: interaction.user.username }, { id: opponent.id, username: opponent.username }],
      guesses: { [userId]: [], [opponent.id]: [] }, results: { [userId]: [], [opponent.id]: [] },
      messageId: null, channelId: interaction.channel.id
    };
    activeDuels.set(duelId, duelState);
    console.log(`[대결 신청] ${interaction.user.username} -> ${opponent.username}, 정답: ${answer}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept-${duelId}`).setLabel('수락').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`decline-${duelId}`).setLabel('거절').setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ content: `${opponent}, ${interaction.user.username}님으로부터 **꼬들 대결** 신청이 왔습니다!`, components: [row] });
  }
  else if (commandName === '추측') {
    // [수정] '응답하지 않음' 오류를 해결하기 위해 로직 구조 변경
    const userGame = activeGames.get(userId);
    const userDuel = [...activeDuels.values()].find(d => d.status === 'active' && d.players.some(p => p.id === userId));

    if (!userGame && !userDuel) {
        return interaction.reply({ content: `😢 진행 중인 게임이 없습니다.\n\`/꼬들\`, \`/무제한\`, \`/대결\`로 게임을 시작해주세요!`, ephemeral: true });
    }

    // 1. 단어 유효성 검사 (공통 로직)
    const input = interaction.options.getString('단어').trim();
    let guessWord = '';
    let guessJamo = [];
    const jamoFromComplete = disassembleWord(input); 
    if (jamoFromComplete.length === 6 && wordlist.includes(input)) {
        guessWord = input;
        guessJamo = jamoFromComplete;
    } else {
        const cleanedInput = input.replace(/\s+/g, '');
        const jamoFromJamoInput = rawDisassemble(cleanedInput);
        if (jamoFromJamoInput.length === 6) {
            const assembledWord = assembleJamo(jamoFromJamoInput);
            if (wordlist.includes(assembledWord)) {
                guessWord = assembledWord;
                guessJamo = jamoFromJamoInput;
            } else { return interaction.reply({ content: `🧐 **'${assembledWord}'**(은)는 꼬들 사전에 없는 단어입니다.`, ephemeral: true }); }
        } else { return interaction.reply({ content: `❌ **'${input}'**(은)는 6자모 단어 또는 조합이 아닙니다.`, ephemeral: true }); }
    }

    // [수정] 3초 규칙을 준수하기 위해 즉시 응답을 보류(defer)합니다.
    await interaction.deferReply({ ephemeral: true });

    // 2. 싱글 플레이 추측 처리
    if (userGame) {
        const resultColors = checkGuess(guessJamo, userGame.answerJamo);
        userGame.guesses.push(guessJamo);
        userGame.results.push(resultColors);

        const isDailyMode = userGame.mode === 'daily';
        let isGameOver = false;
        let messageContent = '';
        const attemptCount = userGame.guesses.length;

        if (isDailyMode) { messageContent = `**☀️ 오늘의 꼬들**\n${interaction.user.username}님의 도전! (${attemptCount}/6)`; }
        else { messageContent = `**[${attemptCount}/6] ${guessWord}**\n\n`; }

        if (guessWord === userGame.answer) {
            const timeTaken = ((Date.now() - userGame.startTime) / 1000).toFixed(1);
            messageContent += `\n🎉 **정답!** (${attemptCount}/6) | ${timeTaken}초`;
            dataManager.updateUserStats(userId, { win: true, isDaily: isDailyMode });
            if (isDailyMode) dataManager.updateDailyParticipants(userId);
            activeGames.delete(userId);
            isGameOver = true;
        } else if (attemptCount >= 6) {
            messageContent += `\n😢 **실패...** 정답은 **'${userGame.answer}'**였습니다.`;
            dataManager.updateUserStats(userId, { win: false, isDaily: isDailyMode });
            if (isDailyMode) dataManager.updateDailyParticipants(userId);
            activeGames.delete(userId);
            isGameOver = true;
        }

        const showPublicJamo = !isDailyMode;
        const publicImageBuffer = await generateImage(userGame.guesses, userGame.results, { showJamo: showPublicJamo });
        const publicAttachment = new AttachmentBuilder(publicImageBuffer, { name: 'kkodeul_board.png' });

        try {
            const channel = await client.channels.fetch(userGame.channelId);
            const gameMessage = await channel.messages.fetch(userGame.messageId);
            await gameMessage.edit({ content: messageContent, files: [publicAttachment] });
        } catch (error) { console.error("공개 메시지 수정 실패:", error); }

        // [수정] reply 대신 followUp을 사용합니다.
        if (isDailyMode) {
            const privateImage = await generateImage(userGame.guesses, userGame.results, { showJamo: true });
            const privateAttachment = new AttachmentBuilder(privateImage, { name: 'kkodeul_private.png' });
            if (isGameOver) {
                await interaction.editReply({ content: "최종 결과입니다!", files: [privateAttachment], ephemeral: true });
            } else {
                await interaction.editReply({ content: `(${attemptCount}/6) 추측: **${guessWord}**\n비밀 진행판이 업데이트되었습니다.`, files: [privateAttachment], ephemeral: true });
            }
        } else {
            await interaction.editReply({ content: `✅ 추측이 반영되었습니다: **${guessWord}**`, ephemeral: true });
        }
        
    }
    // 3. 대결 모드 추측 처리
    else if (userDuel) {
        if (userDuel.results[userId].length >= 6) {
            return interaction.editReply({ content: '이미 6번의 시도를 모두 사용했습니다.', ephemeral: true });
        }
        
        const resultColors = checkGuess(guessJamo, userDuel.answerJamo);
        userDuel.guesses[userId].push(guessJamo);
        userDuel.results[userId].push(resultColors);
      
        let messageContent = `⚔️ **대결 진행중!** | ${userDuel.players[0].username} vs ${userDuel.players[1].username}\n정답: **???**`;
        let isGameOver = false;

        if (guessWord === userDuel.answer) {
            messageContent = `🏆 **대결 종료!** | **${interaction.user.username}**님의 승리! 🎉\n정답: **'${userDuel.answer}'**`;
            isGameOver = true;
        } else if (userDuel.results[userDuel.players[0].id].length >= 6 && userDuel.results[userDuel.players[1].id].length >= 6) {
            messageContent = `⚖️ **대결 종료!** | **무승부!**\n정답: **'${userDuel.answer}'**`;
            isGameOver = true;
        }
      
        const duelImage = await generateDuelImage(userDuel);
        const attachment = new AttachmentBuilder(duelImage, { name: 'kkodeul_duel.png' });
        const channel = await client.channels.fetch(userDuel.channelId);
        const gameMessage = await channel.messages.fetch(userDuel.messageId);
        await gameMessage.edit({ content: messageContent, files: [attachment] });

        const privateImage = await generateImage(userDuel.guesses[userId], userDuel.results[userId], { showJamo: true });
        const privateAttachment = new AttachmentBuilder(privateImage, { name: 'kkodeul_private.png' });
        // [수정] reply 대신 editReply를 사용합니다.
        await interaction.editReply({ content: '내 추측 결과입니다.', files: [privateAttachment], ephemeral: true });
      
        if (isGameOver) {
            activeDuels.delete(userDuel.id);
        }
    }
  }
  // --- 나머지 명령어들 (기존과 동일) ---
  else if (commandName === '꼬들') {
      if (activeGames.has(userId)) { return interaction.reply({ content: '⚠️ 이미 진행 중인 게임이 있습니다. 먼저 게임을 완료해주세요!', ephemeral: true }); }
      const dailyInfo = dataManager.getDailyInfo();
      if (dailyInfo.participants.includes(userId)) { return interaction.reply({ content: '☀️ 오늘의 꼬들은 이미 플레이했습니다. 내일 다시 도전해주세요!', ephemeral: true }); }
      const answer = dailyInfo.word;
      const answerJamo = disassembleWord(answer);
      console.log(`[게임 시작] (하루 제한) 유저: ${interaction.user.username}, 정답: ${answer}`);
      const publicImageBuffer = await generateImage([], [], { showJamo: false });
      const publicAttachment = new AttachmentBuilder(publicImageBuffer, { name: 'kkodeul_board.png' });
      const reply = await interaction.reply({ content: `**☀️ 오늘의 꼬들**\n${interaction.user.username}님이 도전을 시작합니다! (0/6)`, files: [publicAttachment], fetchReply: true });
      const privateImageBuffer = await generateImage([], [], { showJamo: true });
      const privateAttachment = new AttachmentBuilder(privateImageBuffer, { name: 'kkodeul_board_private.png' });
      await interaction.followUp({ content: '비밀 진행판입니다. `/추측` 명령어로 정답을 맞춰보세요!', files: [privateAttachment], ephemeral: true });
      activeGames.set(userId, { mode: 'daily', answer: answer, answerJamo: answerJamo, guesses: [], results: [], startTime: Date.now(), messageId: reply.id, channelId: interaction.channel.id });
  }
  else if (commandName === '무제한') {
      if (activeGames.has(userId)) { return interaction.reply({ content: '⚠️ 이미 진행 중인 게임이 있습니다. 먼저 게임을 완료해주세요!', ephemeral: true }); }
      const answer = answerlist[Math.floor(Math.random() * answerlist.length)];
      const answerJamo = disassembleWord(answer); 
      console.log(`[게임 시작] (무제한) 유저: ${interaction.user.username}, 정답: ${answer}`);
      const initialImageBuffer = await generateImage([], []);
      const attachment = new AttachmentBuilder(initialImageBuffer, { name: 'kkodeul_board.png' });
      const reply = await interaction.reply({ content: `🎮 **무제한 꼬들** 게임을 시작합니다! (6시도)\n\`/추측 [단어]\`로 첫 단어를 맞춰보세요!`, files: [attachment], ephemeral: false, fetchReply: true });
      activeGames.set(userId, { mode: 'unlimited', answer: answer, answerJamo: answerJamo, guesses: [], results: [], startTime: Date.now(), messageId: reply.id, channelId: interaction.channel.id });
  }
  else if (commandName === '리더보드') {
      await interaction.deferReply();
      const allUsersData = dataManager.getAllUsersData();
      const usersArray = Object.entries(allUsersData);
      if (usersArray.length === 0) { return interaction.editReply('아직 순위를 매길 데이터가 없습니다. 게임을 플레이해주세요!'); }
      const sortedByMaxStreak = usersArray.sort((a, b) => b[1].max_streak - a[1].max_streak).slice(0, 10);
      const leaderboardEntries = await Promise.all(
          sortedByMaxStreak.map(async ([userId, stats], index) => {
              try {
                  const user = await client.users.fetch(userId);
                  const rankEmoji = ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
                  return `${rankEmoji} ${user.username} - \`${stats.max_streak}\`회`;
              } catch {
                  const rankEmoji = ['🥇', '🥈', '🥉'][index] || `**${index + 1}.**`;
                  return `${rankEmoji} (알 수 없는 유저) - \`${stats.max_streak}\`회`;
              }
          })
      );
      const embed = new EmbedBuilder()
          .setColor('#538D4E').setTitle('🏆 꼬들 리더보드').setDescription('최대 연속 성공 횟수 기준 TOP 10입니다.')
          .addFields({ name: '👑 순위 (최대 연속 성공)', value: leaderboardEntries.join('\n') || '데이터 없음' }).setTimestamp().setFooter({ text: '게임을 플레이하여 순위를 올려보세요!' });
      await interaction.editReply({ embeds: [embed] });
  }
});

// 8. 봇 로그인
client.login(token);