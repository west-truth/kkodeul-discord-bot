// cleanup-commands.js
// 이 스크립트는 봇에 등록된 모든 "전역" 명령어를 삭제합니다.
// 딱 한 번만 실행하고, 문제가 해결되면 이 파일은 삭제해도 됩니다.

const { REST, Routes } = require('discord.js');
const { token, clientId } = require('./config.json');

const rest = new REST({ version: '10' }).setToken(token);

// 전역 명령어 삭제
rest.put(Routes.applicationCommands(clientId), { body: [] })
	.then(() => console.log('[시스템] 모든 전역 명령어를 성공적으로 삭제했습니다.'))
	.catch(console.error);