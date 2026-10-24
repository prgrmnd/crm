const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const databaseUrl = 'postgresql://crm_test:crm_test@127.0.0.1:55432/crm_test';
const composeArgs = [
  'compose',
  '--project-name',
  'luz-crm-integration-tests',
  '--file',
  'compose.test.yaml',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    timeout: 300_000,
    ...options,
  });

  if (result.error) {
    console.error(`Não foi possível executar ${command}: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

const dockerOnPath = spawnSync('docker', ['--version'], { stdio: 'ignore' });
const dockerCandidates = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
];
const dockerExecutable =
  !dockerOnPath.error && dockerOnPath.status === 0
    ? 'docker'
    : dockerCandidates.find((candidate) => fs.existsSync(candidate));

if (!dockerExecutable) {
  console.error('Docker não está disponível. Instale e inicie o Docker Desktop para executar npm test.');
  process.exit(1);
}

const dockerCheck = spawnSync(dockerExecutable, ['--version'], { stdio: 'ignore' });
if (dockerCheck.error || dockerCheck.status !== 0) {
  console.error('Docker CLI foi encontrado, mas não pôde ser executado.');
  process.exit(1);
}

const dockerEnv = { ...process.env };
if (process.platform === 'win32' && !dockerEnv.DOCKER_HOST) {
  dockerEnv.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
}
const runDocker = (args) => run(dockerExecutable, args, { env: dockerEnv });

const resetStatus = runDocker([...composeArgs, 'down', '--volumes', '--remove-orphans']);
if (resetStatus !== 0) {
  console.error('Não foi possível limpar a instância anterior do banco de teste. Verifique o Docker Engine.');
  process.exit(resetStatus);
}

const startStatus = runDocker([...composeArgs, 'up', '--detach', '--wait']);
if (startStatus !== 0) {
  console.error('Falha ao iniciar o PostgreSQL de teste. Verifique se o Docker Desktop está instalado e ativo.');
  runDocker([...composeArgs, 'down', '--volumes', '--remove-orphans']);
  process.exit(startStatus);
}

let testStatus = 1;
try {
  const testEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_TEST: databaseUrl,
  };
  const prismaCli = require.resolve('prisma/build/index.js');
  const generateStatus = run(process.execPath, [prismaCli, 'generate'], { env: testEnv });

  if (generateStatus !== 0) {
    console.error('Falha ao gerar o Prisma Client para os testes.');
    testStatus = generateStatus;
  } else {
    const migrationStatus = run(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: testEnv });

    if (migrationStatus !== 0) {
      console.error('Falha ao aplicar as migrations no PostgreSQL temporário de teste.');
      testStatus = migrationStatus;
    } else {
      testStatus = run(
        process.execPath,
        [
          '--experimental-strip-types',
          '--import',
          './tests/test-setup.mjs',
          '--test',
          'tests/*.test.cjs',
          'tests/*.test.js',
          'tests/*.test.ts',
        ],
        { env: testEnv },
      );
    }
  }
} finally {
  const stopStatus = runDocker([...composeArgs, 'down', '--volumes', '--remove-orphans']);
  if (stopStatus !== 0) {
    console.error('Aviso: não foi possível remover o container PostgreSQL de teste.');
    if (testStatus === 0) testStatus = stopStatus;
  }
}

process.exit(testStatus);
