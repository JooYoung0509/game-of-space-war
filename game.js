// =====================================================================
//  벽돌깨기(Arkanoid) 게임 - game.js
//  이 파일 하나가 게임의 모든 동작(그리기, 물리, 입력, 점수 계산, 파워업)을 담당합니다.
//  위에서부터 순서대로 읽으면 게임이 어떻게 만들어지는지 이해할 수 있습니다.
// =====================================================================

// ---- 1) 화면(캔버스) 준비하기 ----
// getElementById로 index.html에 있는 <canvas>를 찾아오고,
// getContext("2d")로 그림을 그릴 수 있는 "붓"을 얻습니다.
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// HUD(점수/레벨/생명)와 오버레이(시작/종료 화면) 요소들도 미리 찾아둡니다.
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const missilesEl = document.getElementById("missiles");
const overlayEl = document.getElementById("overlay");
const overlayTextEl = document.getElementById("overlayText");
const actionBtn = document.getElementById("actionBtn");

// 10라운드 클리어 후 나오는 엔딩 영상 화면 요소
const endingWrapEl = document.getElementById("endingWrap");
const endingVideoEl = document.getElementById("endingVideo");

// 배경음악 <audio> 요소와 음소거 버튼
const bgMusic = document.getElementById("bgMusic");
const muteBtn = document.getElementById("muteBtn");
bgMusic.volume = 0.4; // 너무 시끄럽지 않도록 볼륨을 40%로 낮춰둠

muteBtn.addEventListener("click", () => {
  bgMusic.muted = !bgMusic.muted;
  muteBtn.textContent = bgMusic.muted ? "🔇" : "🔊";
});

// ---- 2) 게임 상태값 ----
// 게임 전체에서 계속 바뀌는 값들을 하나의 객체(state)로 모아 관리합니다.
const state = {
  running: false,   // 지금 게임이 진행 중인가?
  score: 0,
  lives: 3,
  level: 1,
  ballLaunched: false,  // 공이 패들에서 아직 안 떠났으면 false (발사 대기)
  showingEnding: false, // 엔딩 영상이 재생 중인가?
};

const MAX_ROUND = 10; // 이 라운드를 클리어하면 다음 라운드 대신 엔딩 영상이 나온다
const MAX_LIVES = 5;  // 보너스 목숨 아이템을 먹어도 이 이상은 늘어나지 않는다

// ---- 3) 패들(막대) ----
// 파워업으로 speed/width가 바뀌기 때문에, 되돌아갈 "기본값"과 상/하한선을 상수로 정해둔다.
const BASE_PADDLE_SPEED = 8;
const BASE_PADDLE_WIDTH = 100;
const PADDLE_MIN_SPEED = 4;
const PADDLE_MAX_SPEED = 15;
const PADDLE_MIN_WIDTH = 60;
const PADDLE_MAX_WIDTH = 170;

const paddle = {
  width: BASE_PADDLE_WIDTH,
  height: 14,
  x: canvas.width / 2 - BASE_PADDLE_WIDTH / 2,
  y: canvas.height - 30,
  speed: BASE_PADDLE_SPEED,
  moveLeft: false,
  moveRight: false,
  missiles: 0, // 보유중인 미사일 개수
};

const MAX_MISSILES = 9;
const MISSILE_COOLDOWN_MS = 300; // 미사일 연사 방지용 최소 발사 간격
let lastMissileTime = 0;
let missiles = []; // 발사되어 날아가는 미사일들 { x, y, width, height, dy }

// ---- 4) 공 ----
// 예전에는 공 하나(ball)만 있었지만, 이제 멀티볼 파워업으로 공이 여러 개가 될 수 있으므로
// balls 라는 배열로 관리한다. 배열 안의 각 항목은 { x, y, dx, dy, radius } 형태.
const BALL_RADIUS = 8;
const BALL_BASE_SPEED = 4.5; // 레벨이 오르면 이 속도가 조금씩 빨라집니다.
const BALL_MIN_SPEED = 3;
const BALL_MAX_SPEED = 13;
const MAX_BALLS = 6; // 멀티볼을 여러 번 먹어도 너무 정신없어지지 않도록 상한선을 둔다.

let balls = [
  { radius: BALL_RADIUS, x: canvas.width / 2, y: paddle.y - BALL_RADIUS, dx: 0, dy: 0 },
];

// ---- 5) 벽돌 ----
const brickInfo = {
  rows: 8,
  cols: 10,
  width: 72,
  height: 20,
  padding: 8,
  offsetTop: 50,
  offsetLeft: 24,
};

// 행(row)마다 다른 색을 줘서 위쪽 벽돌일수록 화려하게 보이도록 합니다.
const rowColors = [
  "#ff6b6b", "#ffa94d", "#ffd166", "#8ce99a",
  "#63e6be", "#6ec6ff", "#a78bfa", "#f783ac",
];

let bricks = []; // 실제 벽돌 객체들이 담기는 배열 (2차원: bricks[col][row])

// 벽돌 배열을 새로 만드는 함수. 레벨 시작/재시작할 때마다 호출됩니다.
function createBricks() {
  bricks = [];
  for (let c = 0; c < brickInfo.cols; c++) {
    bricks[c] = [];
    for (let r = 0; r < brickInfo.rows; r++) {
      // status: 1이면 살아있는 벽돌, 0이면 이미 깨진 벽돌
      bricks[c][r] = { x: 0, y: 0, status: 1 };
    }
  }
}
createBricks();

// ---- 6) 파워업 아이템 ----
// 벽돌을 깨면 일정 확률로 캡슐이 떨어지고, 패들로 받으면 효과가 발동한다.
const POWERUP_DROP_CHANCE = 0.25; // 벽돌 하나 깰 때마다 25% 확률로 드랍
const POWERUP_FALL_SPEED = 2.5;
const POWERUP_STYLE = {
  multiball:       { color: "#6ec6ff", label: "M" },   // 공 갯수 증가
  paddleSpeedUp:   { color: "#8ce99a", label: "S+" },  // 패들 스피드 증가
  paddleSpeedDown: { color: "#ff6b6b", label: "S-" },  // 패들 스피드 감소 (방해 아이템)
  paddleWidthUp:   { color: "#ffd166", label: "W+" },  // 패들 크기 증가
  paddleWidthDown: { color: "#e64980", label: "W-" },  // 패들 크기 감소 (방해 아이템)
  ballSpeedUp:     { color: "#20c997", label: "B+" },  // 공 속도 증가
  ballSpeedDown:   { color: "#868e96", label: "B-" },  // 공 속도 감소
  missile:         { color: "#ff922b", label: "🚀" }, // 미사일 충전 (↑ 로 발사, 벽돌 즉시 파괴)
  extraLife:       { color: "#ff4d6d", label: "❤" },   // 보너스 목숨 (최대 MAX_LIVES개까지)
};
const POWERUP_TYPES = Object.keys(POWERUP_STYLE);

let powerUps = []; // 화면에 떨어지고 있는 캡슐들 { x, y, width, height, dy, type }

function maybeSpawnPowerUp(brick) {
  if (Math.random() > POWERUP_DROP_CHANCE) return;
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  powerUps.push({
    x: brick.x + brickInfo.width / 2 - 17,
    y: brick.y,
    width: 34,
    height: 16,
    dy: POWERUP_FALL_SPEED,
    type,
  });
}

function applyPowerUp(type) {
  switch (type) {
    case "multiball":
      spawnExtraBalls();
      break;
    case "paddleSpeedUp":
      paddle.speed = Math.min(paddle.speed + 2, PADDLE_MAX_SPEED);
      break;
    case "paddleSpeedDown":
      paddle.speed = Math.max(paddle.speed - 2, PADDLE_MIN_SPEED);
      break;
    case "paddleWidthUp":
      paddle.width = Math.min(paddle.width + 20, PADDLE_MAX_WIDTH);
      break;
    case "paddleWidthDown":
      paddle.width = Math.max(paddle.width - 20, PADDLE_MIN_WIDTH);
      break;
    case "ballSpeedUp":
      scaleBallSpeed(1.25);
      break;
    case "ballSpeedDown":
      scaleBallSpeed(0.8);
      break;
    case "missile":
      paddle.missiles = Math.min(paddle.missiles + 3, MAX_MISSILES);
      updateHud();
      break;
    case "extraLife":
      state.lives = Math.min(state.lives + 1, MAX_LIVES);
      updateHud();
      break;
  }
  clampPaddle();
}

// 지금 날아다니는 공들을 복제해서 개수를 늘린다 (최대 MAX_BALLS개까지).
function spawnExtraBalls() {
  const source = balls.slice();
  for (const b of source) {
    if (balls.length >= MAX_BALLS) break;
    balls.push({
      radius: b.radius,
      x: b.x,
      y: b.y,
      dx: -b.dx || (Math.random() < 0.5 ? 3 : -3), // 반대 방향으로 튕겨나가게
      dy: b.dy,
    });
  }
}

// 날아다니는 모든 공의 속도(크기)를 factor배로 바꾼다. 방향은 그대로 유지하고
// 속도의 "크기"만 최소/최대 범위 안에서 조절한다.
function scaleBallSpeed(factor) {
  for (const b of balls) {
    const currentSpeed = Math.hypot(b.dx, b.dy);
    if (currentSpeed === 0) continue; // 발사 전인 공은 건너뜀
    const newSpeed = Math.min(Math.max(currentSpeed * factor, BALL_MIN_SPEED), BALL_MAX_SPEED);
    const scale = newSpeed / currentSpeed;
    b.dx *= scale;
    b.dy *= scale;
  }
}

// 미사일 발사: 보유 개수가 있고 연사 쿨다운이 끝났을 때만 패들 위에서 위로 쏜다.
function fireMissile() {
  if (!state.running || paddle.missiles <= 0) return;
  const now = Date.now();
  if (now - lastMissileTime < MISSILE_COOLDOWN_MS) return;
  lastMissileTime = now;

  paddle.missiles -= 1;
  missiles.push({
    x: paddle.x + paddle.width / 2 - 2,
    y: paddle.y - 12,
    width: 4,
    height: 14,
    dy: -9,
  });
  updateHud();
}

function updatePowerUps() {
  powerUps = powerUps.filter((p) => {
    p.y += p.dy;

    const caught =
      p.y + p.height >= paddle.y &&
      p.y <= paddle.y + paddle.height &&
      p.x + p.width >= paddle.x &&
      p.x <= paddle.x + paddle.width;

    if (caught) {
      applyPowerUp(p.type);
      return false; // 캡슐 사라짐
    }
    return p.y <= canvas.height; // 화면 밑으로 떨어지면 사라짐
  });
}

// 스페이스바/클릭/탭 하나로 "공 발사"와 "미사일 발사"를 겸하게 한다.
// fireMissile()은 게임이 진행 중이 아니거나(시작 화면 등) 미사일이 없으면
// 아무 일도 하지 않으므로, 상황에 안 맞게 눌러도 안전하다.
function launchOrFire() {
  launchBallOrStart();
  fireMissile();
}

// ---- 7) 키보드 / 마우스 입력 처리 ----
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") paddle.moveLeft = true;
  if (e.key === "ArrowRight") paddle.moveRight = true;
  if (e.key === " ") {
    e.preventDefault();
    launchOrFire();
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    fireMissile();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") paddle.moveLeft = false;
  if (e.key === "ArrowRight") paddle.moveRight = false;
});

// 화면 크기에 따라 캔버스가 CSS로 확대/축소되어 보일 수 있으므로(모바일 대응),
// 실제 클릭/터치 좌표(화면 픽셀)를 캔버스의 내부 좌표(840x640 기준)로 환산해준다.
function clientXToCanvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width; // 화면에 보이는 크기 대비 실제 해상도 비율
  return (clientX - rect.left) * scale;
}

function movePaddleCenterTo(clientX) {
  paddle.x = clientXToCanvasX(clientX) - paddle.width / 2;
  clampPaddle();
}

// 마우스를 캔버스 위에서 움직이면 패들이 마우스 x좌표를 따라갑니다.
canvas.addEventListener("mousemove", (e) => {
  movePaddleCenterTo(e.clientX);
});

canvas.addEventListener("click", () => launchOrFire());
actionBtn.addEventListener("click", () => launchBallOrStart());

// ---- 모바일 터치 조작 ----
// 캔버스를 손가락으로 드래그하면 패들이 따라가고(마우스 이동과 동일한 로직),
// 화면을 터치하는 순간에 공 발사/미사일 발사를 같이 처리한다(별도 버튼 없이
// 화면 탭만으로 미사일도 나가도록).
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault(); // 화면 스크롤/확대 제스처로 번지지 않도록 막는다
    movePaddleCenterTo(e.touches[0].clientX);
    launchOrFire();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    movePaddleCenterTo(e.touches[0].clientX);
  },
  { passive: false }
);

// 엔딩 화면도 탭으로 바로 닫을 수 있게 터치 이벤트를 추가로 걸어준다.
endingWrapEl.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    launchBallOrStart();
  },
  { passive: false }
);

// 패들이 화면 밖으로 나가지 않도록 좌우 경계를 고정하는 함수
function clampPaddle() {
  if (paddle.x < 0) paddle.x = 0;
  if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;
}

// 스페이스바/클릭을 눌렀을 때: 엔딩 화면이면 "처음으로", 멈춰있으면 "시작", 공이 대기중이면 "발사"
function launchBallOrStart() {
  if (state.showingEnding) {
    endEnding();
    return;
  }
  if (!state.running) {
    startGame();
    return;
  }
  if (!state.ballLaunched) {
    const speed = BALL_BASE_SPEED + (state.level - 1) * 0.6;
    for (const b of balls) {
      const angle = (Math.random() * 0.6 + 0.2) * Math.PI; // 대략 위쪽 방향으로 랜덤 발사
      b.dx = speed * Math.cos(angle) * (Math.random() < 0.5 ? 1 : -1);
      b.dy = -Math.abs(speed * Math.sin(angle));
    }
    state.ballLaunched = true;
  }
}

// ---- 8) 그리기 함수들 ----
function drawPaddle() {
  ctx.fillStyle = "#6ec6ff";
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 6);
  ctx.fill();
}

function drawBalls() {
  ctx.fillStyle = "#f0f0f5";
  for (const b of balls) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  }
}

function drawBricks() {
  for (let c = 0; c < brickInfo.cols; c++) {
    for (let r = 0; r < brickInfo.rows; r++) {
      const brick = bricks[c][r];
      if (brick.status === 0) continue; // 깨진 벽돌은 그리지 않음

      const x = c * (brickInfo.width + brickInfo.padding) + brickInfo.offsetLeft;
      const y = r * (brickInfo.height + brickInfo.padding) + brickInfo.offsetTop;
      brick.x = x;
      brick.y = y;

      ctx.fillStyle = rowColors[r % rowColors.length];
      ctx.beginPath();
      ctx.roundRect(x, y, brickInfo.width, brickInfo.height, 4);
      ctx.fill();
    }
  }
}

function drawMissiles() {
  ctx.fillStyle = "#ff922b";
  for (const m of missiles) {
    ctx.beginPath();
    ctx.roundRect(m.x, m.y, m.width, m.height, 2);
    ctx.fill();
  }
}

function drawPowerUps() {
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of powerUps) {
    const style = POWERUP_STYLE[p.type];
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.width, p.height, 4);
    ctx.fill();
    ctx.fillStyle = "#10131f";
    ctx.fillText(style.label, p.x + p.width / 2, p.y + p.height / 2 + 1);
  }
}

// ---- 9) 충돌 처리 ----
// [버그 수정] 예전에는 속도의 부호만 뒤집고(*= -1) 위치는 그대로 둬서,
// 공이 벽 안쪽으로 살짝 파고든 상태가 되면 다음 프레임에도 여전히 "벽에 박힌" 상태로
// 판정되어 다시 튕기고, 그게 반복되며 제자리에서 진동하듯 벽에 붙어버리는 버그가 있었다.
// 그래서 튕길 때 공의 위치도 벽 경계에 딱 맞춰 밀어내고, 속도의 방향도
// (부호를 뒤집는 대신) 항상 "안쪽을 향하도록" 명확히 정해준다.
function collideWalls(ball) {
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.dx = Math.abs(ball.dx);
  } else if (ball.x + ball.radius > canvas.width) {
    ball.x = canvas.width - ball.radius;
    ball.dx = -Math.abs(ball.dx);
  }

  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.dy = Math.abs(ball.dy);
  }
}

function collidePaddle(ball) {
  if (
    ball.y + ball.radius >= paddle.y &&
    ball.y + ball.radius <= paddle.y + paddle.height &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.width &&
    ball.dy > 0
  ) {
    // 패들의 어느 부분에 맞았는지에 따라 튕겨나가는 각도를 다르게 해서
    // 조작감을 더 재미있게 만듭니다. (가운데=수직, 끝쪽=비스듬히)
    const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    const speed = Math.hypot(ball.dx, ball.dy);
    const angle = hitPos * (Math.PI / 3); // 최대 60도까지 꺾임
    ball.dx = speed * Math.sin(angle);
    ball.dy = -Math.abs(speed * Math.cos(angle));
    ball.y = paddle.y - ball.radius; // 공이 패들에 파묻히지 않도록 위치도 보정
  }
}

// 미사일이 벽돌과 부딪히면 그 벽돌을 즉시 파괴한다 (공과 달리 튕기지 않고 미사일도 사라짐).
function collideMissileWithBricks(missile) {
  for (let c = 0; c < brickInfo.cols; c++) {
    for (let r = 0; r < brickInfo.rows; r++) {
      const brick = bricks[c][r];
      if (brick.status === 0) continue;

      if (
        missile.x < brick.x + brickInfo.width &&
        missile.x + missile.width > brick.x &&
        missile.y < brick.y + brickInfo.height &&
        missile.y + missile.height > brick.y
      ) {
        brick.status = 0;
        state.score += 10;
        updateHud();
        maybeSpawnPowerUp(brick);

        if (isLevelClear()) {
          advanceLevelOrWin();
        }
        return true; // 미사일 소모됨
      }
    }
  }
  return false;
}

function updateMissiles() {
  missiles = missiles.filter((m) => {
    m.y += m.dy;
    if (m.y + m.height < 0) return false; // 화면 위로 나가면 제거
    return !collideMissileWithBricks(m);
  });
}

function collideBricks(ball) {
  for (let c = 0; c < brickInfo.cols; c++) {
    for (let r = 0; r < brickInfo.rows; r++) {
      const brick = bricks[c][r];
      if (brick.status === 0) continue;

      if (
        ball.x + ball.radius > brick.x &&
        ball.x - ball.radius < brick.x + brickInfo.width &&
        ball.y + ball.radius > brick.y &&
        ball.y - ball.radius < brick.y + brickInfo.height
      ) {
        ball.dy *= -1;
        brick.status = 0;
        state.score += 10;
        updateHud();
        maybeSpawnPowerUp(brick);

        if (isLevelClear()) {
          advanceLevelOrWin();
        }
        return; // 한 프레임에 벽돌 하나만 처리
      }
    }
  }
}

function isLevelClear() {
  return bricks.every((col) => col.every((b) => b.status === 0));
}

// ---- 10) 공을 놓쳤을 때 / 게임 오버 / 다음 레벨 ----
function loseLife() {
  state.lives -= 1;
  updateHud();

  if (state.lives <= 0) {
    endGame(false);
    return;
  }
  resetBallOnPaddle();
}

// 목숨을 잃거나 레벨이 바뀔 때 공/패들/파워업을 모두 기본 상태로 되돌린다.
function resetBallOnPaddle() {
  state.ballLaunched = false;
  paddle.speed = BASE_PADDLE_SPEED;
  paddle.width = BASE_PADDLE_WIDTH;
  paddle.x = canvas.width / 2 - paddle.width / 2;
  paddle.missiles = 0;
  balls = [
    { radius: BALL_RADIUS, x: canvas.width / 2, y: paddle.y - BALL_RADIUS, dx: 0, dy: 0 },
  ];
  powerUps = [];
  missiles = [];
}

// 라운드를 클리어했을 때: 마지막 라운드(MAX_ROUND)였다면 엔딩 영상을, 아니면 다음 라운드를 진행한다.
function advanceLevelOrWin() {
  if (state.level >= MAX_ROUND) {
    showEnding();
  } else {
    nextLevel();
  }
}

function nextLevel() {
  state.level += 1;
  createBricks();
  resetBallOnPaddle();
  updateHud();
  showOverlay(`레벨 ${state.level} 클리어! 다음 레벨로 이동합니다.`, "계속하기");
  state.running = false; // 버튼을 눌러야 다음 레벨 시작 (잠깐 숨 돌리기)
}

// 10라운드를 모두 클리어하면 엔딩 영상을 재생한다.
function showEnding() {
  state.running = false;
  state.showingEnding = true;
  bgMusic.pause();
  overlayEl.classList.add("hidden");
  endingWrapEl.classList.remove("hidden");
  endingVideoEl.currentTime = 0;
  endingVideoEl.play().catch(() => {}); // 자동재생이 막히더라도 화면의 재생 버튼으로 볼 수 있다
}

// 엔딩 화면에서 클릭하거나 스페이스바를 누르면 호출되어, 처음 시작 화면으로 완전히 되돌린다.
function endEnding() {
  endingVideoEl.pause();
  endingWrapEl.classList.add("hidden");
  state.showingEnding = false;

  resetWholeGame();
  actionBtn.dataset.restart = "false"; // 이미 위에서 초기화했으므로 startGame()이 또 초기화하지 않도록
  showOverlay(
    "← → 방향키 또는 마우스로 패들을 움직이세요<br />스페이스바 또는 클릭으로 시작!",
    "게임 시작"
  );
}

endingWrapEl.addEventListener("click", () => launchBallOrStart());

function startGame() {
  // [버그 수정] 게임오버 후 다시 시작할 때는 점수/생명/벽돌을 반드시 초기화해야 한다.
  // 예전에는 이 초기화가 "다시 시작" 버튼 클릭 이벤트에만 따로 걸려 있어서,
  // 스페이스바로 재시작하면 초기화 없이 running만 true가 되고, 공이 하나도 없는
  // 상태 그대로라 바로 다음 프레임에 "공이 없다"→목숨 차감이 반복되며 생명이
  // 계속 마이너스로 내려가는 문제가 있었다. 이제 시작 경로(스페이스바/클릭/버튼)에
  // 상관없이 이 함수 하나에서 재시작 여부를 판단한다.
  if (actionBtn.dataset.restart === "true") {
    actionBtn.dataset.restart = "false";
    resetWholeGame();
  }

  overlayEl.classList.add("hidden");
  state.running = true;
  // 브라우저는 사용자 클릭/키 입력 같은 "제스처" 도중에만 오디오 재생을 허용하는데,
  // 이 함수는 항상 버튼 클릭/스페이스바 입력에서 호출되므로 여기서 재생을 시작한다.
  bgMusic.play().catch(() => {}); // 재생이 막히더라도 게임은 계속 진행되도록 에러 무시
}

function endGame(won) {
  state.running = false;
  showOverlay(
    won ? "🎉 모든 벽돌을 깼습니다! 승리!" : "💥 게임 오버! 다시 도전해보세요.",
    "다시 시작"
  );
  // 다음 클릭에서는 완전히 새 게임으로 시작하도록 표시해둔다.
  actionBtn.dataset.restart = "true";
}

function showOverlay(text, buttonText) {
  overlayTextEl.innerHTML = text;
  actionBtn.textContent = buttonText;
  overlayEl.classList.remove("hidden");
}

function resetWholeGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  createBricks();
  resetBallOnPaddle();
  updateHud();
}

function updateHud() {
  scoreEl.textContent = `점수: ${state.score}`;
  levelEl.textContent = `레벨: ${state.level} / ${MAX_ROUND}`;
  livesEl.textContent = `생명: ${state.lives}`;
  missilesEl.textContent = `🚀 ${paddle.missiles}`;
}

// ---- 11) 매 프레임마다 실행되는 메인 루프 ----
function update() {
  if (paddle.moveLeft) paddle.x -= paddle.speed;
  if (paddle.moveRight) paddle.x += paddle.speed;
  clampPaddle();

  if (!state.ballLaunched) {
    // 공이 아직 발사 전이면 패들 위에 딱 붙어서 따라다닌다. (이 시점엔 공이 하나뿐이다)
    const b = balls[0];
    b.x = paddle.x + paddle.width / 2;
    b.y = paddle.y - b.radius;
  } else {
    for (const b of balls) {
      b.x += b.dx;
      b.y += b.dy;
      collideWalls(b);
      collidePaddle(b);
      collideBricks(b);
    }

    // 화면 밑으로 떨어진 공은 제거하고, 공이 하나도 안 남으면 목숨을 잃는다.
    balls = balls.filter((b) => b.y - b.radius <= canvas.height);
    if (balls.length === 0) {
      loseLife();
    }
  }

  updatePowerUps();
  updateMissiles();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBricks();
  drawPowerUps();
  drawMissiles();
  drawPaddle();
  drawBalls();
}

function gameLoop() {
  if (state.running) {
    update();
    draw();
  }
  requestAnimationFrame(gameLoop);
}

// ---- 12) 초기 실행 ----
updateHud();
draw(); // 시작 전에도 벽돌/패들이 보이도록 한 번 그려둔다.
gameLoop();
