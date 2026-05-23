const draw = document.querySelector("#draw");
const label = document.querySelector("#drawLabel");
const meta = document.querySelector("#drawMeta");
const shuffleButton = document.querySelector("#shuffleButton");
const simulateButton = document.querySelector("#simulateButton");
const tourModal = document.querySelector("#tourModal");
const resultModal = document.querySelector("#resultModal");
const resultContent = document.querySelector("#resultContent");
const closeResultButton = document.querySelector("#closeResultButton");
const shareButton = document.querySelector("#shareButton");
const shareStatus = document.querySelector("#shareStatus");
const roundNames = ["First Round", "Second Round", "Third Round", "Fourth Round", "Quarter-Final", "Semi-Final", "Final"];
const rowHeight = 28;
const columnGap = 10;
const columnWidth = 335;
const sectionGap = 16;
const matchGap = 4;
let drawState = null;
let activeTour = "ATP";


function shuffle(list) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function countryCode(country) {
  const overrides = { GBR: "GB", MON: "MC", SLO: "SI", PAR: "PY" };
  const code = overrides[country] || country;
  if (!code || code.length !== 2 && code.length !== 3) {
    return "";
  }

  const alpha2 = code.length === 2 ? code : {
    AND: "AD", ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BIH: "BA", BLR: "BY", BRA: "BR", CAN: "CA", CHI: "CL",
    CHN: "CN", COL: "CO", CRO: "HR", CZE: "CZ", DEN: "DK", ESP: "ES", FRA: "FR", GEO: "GE", GER: "DE", GRE: "GR",
    HKG: "HK", HUN: "HU", INA: "ID", ITA: "IT", JPN: "JP", KAZ: "KZ", LAT: "LV", MEX: "MX", NED: "NL", NOR: "NO",
    NZL: "NZ", PER: "PE", PHI: "PH", POL: "PL", POR: "PT", ROU: "RO", RUS: "RU", SRB: "RS", SUI: "CH", SVK: "SK",
    THA: "TH", TUR: "TR", UKR: "UA", USA: "US", UZB: "UZ"
  }[code];

  if (!alpha2) {
    return "";
  }

  return alpha2.toLowerCase();
}

function flagImage(country) {
  const code = countryCode(country);
  if (!code) {
    return "";
  }

  return `<img class="flag-img" src="https://flagcdn.com/20x15/${code}.png" alt="${country}" loading="lazy">`;
}

function playersForTour(tour) {
  if (tour === "WTA") {
    return WTA_PLAYERS.map((player) => ({ ...player, id: `WTA-${player.rank}` }));
  }

  return ATP_PLAYERS.map((player) => ({ ...player, id: `ATP-${player.rank}` }));
}

function playerStrength(player) {
  return Math.max(0.18, 1.08 - player.rank / 170);
}

function randomSetScore(winnerFirst) {
  const options = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 5], [7, 6]];
  const score = options[Math.floor(Math.random() * options.length)];
  return winnerFirst ? score : [score[1], score[0]];
}

function simulateMatch(first, second) {
  const firstScores = [];
  const secondScores = [];
  let firstSets = 0;
  let secondSets = 0;
  const setsToWin = activeTour === "WTA" ? 2 : 3;
  const firstChance = playerStrength(first) / (playerStrength(first) + playerStrength(second));

  while (firstSets < setsToWin && secondSets < setsToWin) {
    const firstWinsSet = Math.random() < firstChance;
    const [firstGames, secondGames] = randomSetScore(firstWinsSet);
    firstScores.push(firstGames);
    secondScores.push(secondGames);

    if (firstWinsSet) {
      firstSets += 1;
    } else {
      secondSets += 1;
    }
  }

  while (firstScores.length < 5) {
    firstScores.push("");
    secondScores.push("");
  }

  return {
    first,
    second,
    firstScores,
    secondScores,
    winner: firstSets > secondSets ? first : second
  };
}

function simulateNextRound() {
  const round = drawState.currentRound;
  if (round >= 7) {
    return;
  }

  const matches = [];
  const winners = [];
  const roundPlayers = drawState.rounds[round];

  for (let index = 0; index < roundPlayers.length; index += 2) {
    const match = simulateMatch(roundPlayers[index], roundPlayers[index + 1]);
    matches.push(match);
    winners.push(match.winner);
  }

  drawState.matchesByRound[round] = matches;
  drawState.rounds[round + 1] = winners;
  drawState.currentRound += 1;
}

function encodeShareData() {
  const bytes = [activeTour === "WTA" ? 1 : 0];
  drawState.rounds[0].forEach((player) => bytes.push(player.rank));
  drawState.matchesByRound.forEach((roundMatches) => {
    roundMatches.forEach((match) => {
      bytes.push(match.winner === match.first ? 0 : 1);
      for (let index = 0; index < 5; index += 1) {
        bytes.push(scoreByte(match.firstScores[index], match.secondScores[index]));
      }
    });
  });
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeShareData(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return [...atob(padded)].map((char) => char.charCodeAt(0));
}

function scoreByte(firstScore, secondScore) {
  if (firstScore === "" || secondScore === "") {
    return 255;
  }

  return Number(firstScore) * 16 + Number(secondScore);
}

function scorePair(byte) {
  if (byte === 255) {
    return ["", ""];
  }

  return [Math.floor(byte / 16), byte % 16];
}

function restoreSharedDraw(bytes) {
  activeTour = bytes[0] === 1 ? "WTA" : "ATP";
  const playerMap = new Map(playersForTour(activeTour).map((player) => [player.rank, player]));
  const openingRound = bytes.slice(1, 129).map((rank) => playerMap.get(rank)).filter(Boolean);
  const rounds = [openingRound];
  const matchesByRound = [];
  let cursor = 129;

  for (let round = 0; round < 7; round += 1) {
    const matchCount = rounds[round].length / 2;
    const winners = [];
    matchesByRound[round] = Array.from({ length: matchCount }, (_, index) => {
      const first = rounds[round][index * 2];
      const second = rounds[round][index * 2 + 1];
      const winner = bytes[cursor] === 0 ? first : second;
      cursor += 1;
      const firstScores = [];
      const secondScores = [];
      for (let set = 0; set < 5; set += 1) {
        const [firstScore, secondScore] = scorePair(bytes[cursor]);
        firstScores.push(firstScore);
        secondScores.push(secondScore);
        cursor += 1;
      }
      winners.push(winner);
      return {
        first,
        second,
        firstScores,
        secondScores,
        winner
      };
    });
    rounds[round + 1] = winners;
  }

  drawState = {
    rounds,
    matchesByRound,
    currentRound: 7,
    highlightId: null,
    resultShown: Boolean(rounds[7])
  };
}

function scoreCells(player, match) {
  if (!match) {
    return Array.from({ length: 5 }, () => '<span class="score"></span>').join("");
  }

  const isFirst = match.first === player;
  const scores = isFirst ? match.firstScores : match.secondScores;
  const otherScores = isFirst ? match.secondScores : match.firstScores;

  return scores.map((score, index) => {
    const wonSet = score !== "" && Number(score) > Number(otherScores[index]);
    return `<span class="score ${wonSet ? "set-won" : ""}">${score}</span>`;
  }).join("");
}

function roundPlayers(round, size) {
  if (!drawState.rounds[round]) {
    return Array.from({ length: size / (2 ** round) }, () => null);
  }

  return drawState.rounds[round];
}

function matchForPlayer(round, index) {
  const matches = drawState.matchesByRound[round];
  return matches ? matches[Math.floor(index / 2)] : null;
}

function matchGapBefore(index) {
  return Math.floor(index / 2) * matchGap;
}

function entryTop(round, index) {
  if (round === 0) {
    return rowHeight * index + Math.floor(index / 16) * sectionGap + matchGapBefore(index);
  }

  const sourceSpan = 2 ** (round + 1);
  const matchIndex = Math.floor(index / 2);
  const rowInMatch = index % 2;
  const sourceStart = matchIndex * sourceSpan;
  const sourceCenter = sourceStart + sourceSpan / 2;
  const baseTop = rowHeight * (sourceCenter - 1 + rowInMatch);
  const sectionBreaksBefore = Math.floor(sourceStart / 16);
  return baseTop + sectionBreaksBefore * sectionGap + matchGapBefore(index);
}

function bracketHeight(rows) {
  const sectionBreaks = Math.max(0, Math.ceil(rows / 16) - 1);
  const matchBreaks = Math.max(0, rows / 2 - 1);
  return rowHeight * rows + sectionBreaks * sectionGap + matchBreaks * matchGap;
}

function entryElement({ player, match, round, index }) {
  const entry = document.createElement("div");
  const winnerClass = match && match.winner === player ? " winner" : "";
  const emptyClass = player ? "" : " placeholder";
  const highlightClass = player && drawState.highlightId === player.id ? " is-highlight" : "";
  entry.className = `entry${winnerClass}${emptyClass}${highlightClass}`;
  entry.style.left = `${(columnWidth + columnGap) * round}px`;
  entry.style.top = `${entryTop(round, index)}px`;
  entry.innerHTML = `
    ${player ? `<span class="rank">#${player.rank}</span>` : '<span class="rank"></span>'}
    ${player ? `<span class="flag" title="${player.country}">${flagImage(player.country)}</span>` : '<span class="flag"></span>'}
    <div class="player">
      ${player ? `<button class="player-button" type="button" data-player-id="${player.id}"><span class="name">${player.name}</span></button>` : '<span class="name">TBD</span>'}
    </div>
    ${scoreCells(player, match)}
  `;
  return entry;
}

function connectorElement(kind, x, y, width, height) {
  const connector = document.createElement("span");
  connector.className = `connector ${kind}`;
  connector.style.left = typeof x === "number" ? `${x}px` : x;
  connector.style.top = typeof y === "number" ? `${y}px` : y;
  connector.style.width = typeof width === "number" ? `${width}px` : width;
  connector.style.height = typeof height === "number" ? `${height}px` : height;
  return connector;
}

function addConnectors(bracket, roundCount, rows) {
  for (let round = 0; round < roundCount - 1; round += 1) {
    const count = rows / (2 ** (round + 1));
    for (let index = 0; index < count; index += 1) {
      const firstY = entryTop(round, index * 2) + rowHeight / 2;
      const secondY = entryTop(round, index * 2 + 1) + rowHeight / 2;
      const nextY = entryTop(round + 1, index) + rowHeight / 2;
      const fromX = (columnWidth + columnGap) * round + columnWidth;
      const midX = fromX + 5;
      const toX = (columnWidth + columnGap) * (round + 1);
      const verticalTop = Math.min(firstY, secondY, nextY);
      const verticalBottom = Math.max(firstY, secondY, nextY);

      bracket.appendChild(connectorElement("horizontal", fromX, firstY, "5px", 1));
      bracket.appendChild(connectorElement("horizontal", fromX, secondY, "5px", 1));
      bracket.appendChild(connectorElement("vertical", midX, verticalTop, 1, verticalBottom - verticalTop));
      bracket.appendChild(connectorElement("horizontal", midX, nextY, toX - midX, 1));
    }
  }
}

function renderBlock({ title, startRound, roundCount, rows, compact = false }) {
  const block = document.createElement("section");
  block.className = `draw-block${compact ? " compact" : ""}`;
  block.style.setProperty("--round-count", roundCount);
  block.style.setProperty("--rows", rows);
  block.style.setProperty("--bracket-height", `${bracketHeight(rows)}px`);
  block.innerHTML = `
    <h2 class="block-title">${title}</h2>
    <div class="round-headers">
      ${roundNames.slice(startRound, startRound + roundCount).map((round) => `<div>${round}</div>`).join("")}
    </div>
  `;

  const bracket = document.createElement("div");
  bracket.className = "bracket";
  addConnectors(bracket, roundCount, rows);

  for (let localRound = 0; localRound < roundCount; localRound += 1) {
    const actualRound = startRound + localRound;
    const playersInRound = roundPlayers(actualRound, 128).slice(0, rows / (2 ** localRound));

    playersInRound.forEach((player, index) => {
      bracket.appendChild(entryElement({
        player,
        match: player ? matchForPlayer(actualRound, index) : null,
        round: localRound,
        index
      }));
    });
  }

  block.appendChild(bracket);
  return block;
}

function renderChampion() {
  if (!drawState.rounds[7]) {
    return null;
  }

  const champion = document.createElement("div");
  champion.className = "champion";
  champion.innerHTML = `
    <span>Champion</span>
    <div class="champion-row">
      <div class="champion-name">${drawState.rounds[7][0].name}</div>
      <button class="champion-share" type="button" data-share-result>Share</button>
    </div>
  `;
  return champion;
}

function matchLine(match, player) {
  const isFirst = match.first === player;
  const scores = isFirst ? match.firstScores : match.secondScores;
  const otherScores = isFirst ? match.secondScores : match.firstScores;
  return scores
    .map((score, index) => score === "" ? "" : `${score}-${otherScores[index]}`)
    .filter(Boolean)
    .join(" ");
}

function championPath(champion) {
  return drawState.matchesByRound.map((matches, round) => {
    const match = matches.find((candidate) => candidate.winner === champion);
    const opponent = match.first === champion ? match.second : match.first;
    return {
      round: roundNames[round],
      opponent,
      score: matchLine(match, champion)
    };
  });
}

function showResultModal() {
  const champion = drawState.rounds[7][0];
  const path = championPath(champion);
  resultContent.innerHTML = `
    <p class="result-winner">#${champion.rank} ${flagImage(champion.country)} ${champion.name}</p>
    <ul class="result-list">
      ${path.map((match) => `
        <li><strong>${match.round}</strong>: def. #${match.opponent.rank} ${flagImage(match.opponent.country)} ${match.opponent.name}, ${match.score}</li>
      `).join("")}
    </ul>
  `;
  shareStatus.textContent = "";
  resultModal.hidden = false;
}

function renderDraw() {
  draw.innerHTML = "";
  draw.classList.toggle("has-highlight", Boolean(drawState.highlightId));

  if (drawState.currentRound >= 4) {
    const champion = renderChampion();
    if (champion) {
      draw.appendChild(champion);
    }
    draw.appendChild(renderBlock({ title: "Finals", startRound: 4, roundCount: 3, rows: 8 }));
    draw.appendChild(renderBlock({ title: "Completed Early Rounds", startRound: 0, roundCount: 4, rows: 128, compact: true }));
  } else {
    draw.appendChild(renderBlock({ title: "Main Draw", startRound: 0, roundCount: 4, rows: 128 }));
  }

  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  label.textContent = drawState.rounds[7]
    ? `Tournament completed at ${time}`
    : drawState.currentRound > 0
      ? `${roundNames[drawState.currentRound - 1]} simulated at ${time}`
      : `Random draw generated at ${time}`;
  meta.textContent = drawState.rounds[7]
    ? `Tournament simulated. Champion: ${drawState.rounds[7][0].name}.`
    : drawState.currentRound > 0
      ? `Next click will simulate: ${roundNames[drawState.currentRound]}.`
      : `${activeTour} draw ready.`;
  simulateButton.disabled = drawState.currentRound >= 7;
  simulateButton.textContent = drawState.currentRound >= 7 ? "Complete" : "Simulate";
}

function resetDraw() {
  drawState = {
    rounds: [shuffle(playersForTour(activeTour))],
    matchesByRound: [],
    currentRound: 0,
    highlightId: null,
    resultShown: false
  };
  renderDraw();
}

shuffleButton.addEventListener("click", resetDraw);
simulateButton.addEventListener("click", () => {
  simulateNextRound();
  renderDraw();
  if (drawState.rounds[7] && !drawState.resultShown) {
    drawState.resultShown = true;
    showResultModal();
  }
});

draw.addEventListener("click", (event) => {
  if (event.target.closest("[data-share-result]")) {
    copyShareLink();
    return;
  }

  const button = event.target.closest(".player-button");
  if (!button) {
    return;
  }

  drawState.highlightId = drawState.highlightId === button.dataset.playerId ? null : button.dataset.playerId;
  renderDraw();
});

document.querySelectorAll("[data-tour]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTour = button.dataset.tour;
    tourModal.hidden = true;
    resetDraw();
  });
});

closeResultButton.addEventListener("click", () => {
  resultModal.hidden = true;
});

async function copyShareLink() {
  const shareUrl = `${location.origin}${location.pathname}#result=${encodeShareData()}`;
  try {
    await navigator.clipboard.writeText(shareUrl);
    shareStatus.textContent = "Share link copied.";
  } catch (_error) {
    shareStatus.textContent = shareUrl;
  }
}

shareButton.addEventListener("click", copyShareLink);

function boot() {
  if (location.hash.startsWith("#result=")) {
    try {
      restoreSharedDraw(decodeShareData(location.hash.slice("#result=".length)));
      tourModal.hidden = true;
      renderDraw();
      if (drawState.rounds[7]) {
        showResultModal();
      }
      return;
    } catch (_error) {
      location.hash = "";
    }
  }

  resetDraw();
}

boot();
