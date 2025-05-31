function toggleDetails(card) {
  const detail = card.querySelector(".match-details");
  detail.classList.toggle("visible");
}

function getChampImgName(name) {
  const overrides = {
    FiddleSticks: "Fiddlesticks",
    Wukong: "MonkeyKing",
    NunuWillump: "Nunu",
    Renata: "RenataGlasc",
    Belveth: "Belveth",
    Kaisa: "Kaisa",
    Kogmaw: "KogMaw",
    AurelionSol: "AurelionSol",
  };
  return overrides[name] || name;
}

function daysAgoFromTimestamp(timestamp) {
  // Riot API gives gameEndTimestamp in ms, fallback to gameCreation if needed
  const matchTime = timestamp ? new Date(timestamp) : null;
  if (!matchTime) return "";
  const now = new Date();
  const diffMs = now - matchTime;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}
const summonerSpellMap = {
  21: "SummonerBarrier",
  1: "SummonerBoost",
  14: "SummonerDot",
  3: "SummonerExhaust",
  4: "SummonerFlash",
  6: "SummonerHaste",
  7: "SummonerHeal",
  13: "SummonerMana",
  30: "SummonerPoroRecall",
  31: "SummonerPoroThrow",
  11: "SummonerSmite",
  39: "SummonerSnowURFSnowball_Mark",
  32: "SummonerSnowball",
  12: "SummonerTeleport",
};

const runeIconMap = {
  8100: "7200_Domination",
  8000: "7201_Precision",
  8200: "7202_Sorcery",
  8300: "7203_Whimsy",
  8400: "7204_Resolve",
};

async function getWinProbability(position, champA, champB) {
  console.log("wee Sending request...");
  const res = await fetch("http://localhost:5001/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      position: position,
      champion_A: champA,
      champion_B: champB,
      // zero-diff for a neutral lane matchup
      csdiffat10_A: 0,
      csdiffat15_A: 0,
      csdiffat20_A: 0,
      csdiffat25_A: 0,
      golddiffat10_A: 0,
      golddiffat15_A: 0,
      golddiffat20_A: 0,
      golddiffat25_A: 0,
      xpdiffat10_A: 0,
      xpdiffat15_A: 0,
      xpdiffat20_A: 0,
      xpdiffat25_A: 0,
    }),
  });
  const result = await res.json();
  return result.probability;
}
console.log("✅ Script loaded");
async function predictMatchup() {
  console.log("🔍 Button clicked");
  const position = document.getElementById("position").value;
  const champA = document.getElementById("championA").value.trim();
  const champB = document.getElementById("championB").value.trim();

  if (!champA || !champB) {
    document.getElementById("predictionResult").innerText =
      "Please enter both champion names.";
    return;
  }

  const prob = await getWinProbability(position, champA, champB);
  document.getElementById(
    "predictionResult"
  ).innerText = `${champA} win chance vs ${champB} in ${position}: ${(
    prob * 100
  ).toFixed(2)}%`;
}
async function fetchMatchStats() {
  const input = document.getElementById("riotId").value;
  const [gameName, tagLine] = input.split("#");
  if (!gameName || !tagLine) return alert("Invalid Riot ID");

  const res1 = await fetch(
    `http://localhost:3000/api/summoner/${gameName}/${tagLine}`
  );
  const summoner = await res1.json();
  const puuid = summoner.puuid;

  // ✅ Get filters from the user
  const mode = document.getElementById("gameModeSelect").value;
  const count = document.getElementById("gameCount").value || 10;

  // ✅ Request filtered matches from backend
  const res2 = await fetch(
    `http://localhost:3000/api/matches/${puuid}?count=${count}&mode=${mode}`
  );
  const matches = await res2.json();

  const container = document.getElementById("matchContainer");
  container.innerHTML = "";

  let totalDealt = 0;
  let totalTaken = 0;
  let totalMitigated = 0;
  let totalHealing = 0;
  let wins = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;

  for (const match of matches) {
    const player = match.info.participants.find((p) => p.puuid === puuid);
    const redTeam = match.info.participants.filter((p) => p.teamId === 200);
    const blueTeam = match.info.participants.filter((p) => p.teamId === 100);

    if (player.win) wins++;
    totalKills += player.kills;
    totalDeaths += player.deaths;
    totalAssists += player.assists;

    const redWin = redTeam[0].win;
    const blueWin = blueTeam[0].win;

    let victoryTeam, defeatTeam;
    let victoryLabel, defeatLabel;

    if (redWin) {
      victoryTeam = redTeam;
      defeatTeam = blueTeam;
      victoryLabel = "Victory (Red Team)";
      defeatLabel = "Defeat (Blue Team)";
    } else {
      victoryTeam = blueTeam;
      defeatTeam = redTeam;
      victoryLabel = "Victory (Blue Team)";
      defeatLabel = "Defeat (Red Team)";
    }

    totalDealt += player.totalDamageDealtToChampions || 0;
    totalTaken += player.totalDamageTaken || 0;
    totalMitigated += player.damageSelfMitigated || 0;
    totalHealing += player.totalHeal || 0;

    const win = player.win;
    const kdaRatio =
      player.deaths === 0
        ? (player.kills + player.assists).toFixed(2)
        : ((player.kills + player.assists) / player.deaths).toFixed(2);
    const kda = `${player.kills} / ${player.deaths} / ${player.assists} (${kdaRatio})`;
    const cs = player.totalMinionsKilled;
    const csPerMin = (cs / (match.info.gameDuration / 60)).toFixed(1);
    const wards = player.wardsPlaced;
    const showVision = match.info.gameMode.toUpperCase() === "CLASSIC";
    let champ = player.championName;

    // Normalize the name for image URL
    const overrides = {
      FiddleSticks: "Fiddlesticks",
      Wukong: "MonkeyKing",
      NunuWillump: "Nunu",
      Renata: "RenataGlasc",
      Belveth: "Belveth",
      Kaisa: "Kaisa",
      Kogmaw: "KogMaw",
      AurelionSol: "AurelionSol",
    };
    const spell1Name = summonerSpellMap[player.summoner1Id] || "Unknown";
    const spell2Name = summonerSpellMap[player.summoner2Id] || "Unknown";
    const primaryRuneStyleId = player.perks.styles[0].style;
    const secondaryRuneStyleId = player.perks.styles[1].style;
    const primaryRuneFile = runeIconMap[primaryRuneStyleId] || "RunesIcon";
    const secondaryRuneFile = runeIconMap[secondaryRuneStyleId] || "RunesIcon";

    const primaryRuneUrl = `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${primaryRuneFile}.png`;
    const secondaryRuneUrl = `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/${secondaryRuneFile}.png`;

    const champImgName = overrides[champ] || champ;
    const duration = `${Math.floor(match.info.gameDuration / 60)}:${String(
      match.info.gameDuration % 60
    ).padStart(2, "0")}`;
    const items = [
      player.item0,
      player.item1,
      player.item2,
      player.item3,
      player.item4,
      player.item5,
      player.item6,
    ];
    const itemImgs = items
      .map((id) =>
        id
          ? `<img src="https://ddragon.leagueoflegends.com/cdn/15.10.1/img/item/${id}.png" alt="Item">`
          : `<div class="empty-slot"></div>`
      )
      .join("");
    const maxDamage = Math.max(
      ...match.info.participants.map((p) => p.totalDamageDealtToChampions)
    );
    const matchTimestamp =
      match.info.gameEndTimestamp || match.info.gameCreation;
    const daysAgo = daysAgoFromTimestamp(matchTimestamp);

    const card = document.createElement("div");
    card.className = `match-card ${win ? "win" : "loss"}`;
    card.onclick = () => toggleDetails(card);
    card.innerHTML = `
  <div class="tab-header" style="display: flex; gap: 12px; margin-bottom: 8px;">
    <button class="tab-btn active" data-tab="overview" style="padding:4px 12px; border-radius:6px; border:none; background:#334155; color:white; cursor:pointer;">Overview</button>
    <button class="tab-btn" data-tab="analysis" style="padding:4px 12px; border-radius:6px; border:none; background:#334155; color:white; cursor:pointer;">Analysis</button>
  </div>
  <div class="tab-content tab-overview">
    <div class="summary-row">
      <div style="display: flex; flex-direction: column; align-items: flex-start;">
        <strong>${match.info.gameMode}</strong>
        <span style="font-size:13px; color:#cbd5e1; margin-top:2px;">${daysAgo}</span>
      </div>
      <div>${duration}</div>
    </div>
    <div class="summary-row" style="align-items: center;">
  <div style="display: flex; align-items: center;">
    <img src="https://ddragon.leagueoflegends.com/cdn/15.10.1/img/champion/${champImgName}.png" alt="${champ}" style="width: 32px; height: 32px; margin-right: 8px; border-radius: 4px;">
    <div style="display: flex; flex-direction: column;">
      <div style="display: flex; gap: 4px;">
        <img src="https://ddragon.leagueoflegends.com/cdn/15.10.1/img/spell/${spell1Name}.png" style="width: 22px; height: 22px;" />
        <img src="https://ddragon.leagueoflegends.com/cdn/15.10.1/img/spell/${spell2Name}.png" style="width: 22px; height: 22px;" />
      </div>
      <div style="display: flex; gap: 4px; margin-top: 2px;">
          <img src="${primaryRuneUrl}" style="width: 22px; height: 22px;" />
  <img src="${secondaryRuneUrl}" style="width: 22px; height: 22px;" />

      </div>
    </div>
  </div>
  <div><strong>${win ? "Win" : "Loss"}</strong></div>
</div>

    <div class="summary-row">
      <div><strong>KDA:</strong> ${kda}</div>
      <div><strong>CS:</strong> ${cs} (${csPerMin})</div>
      <div style="visibility: ${
        showVision ? "visible" : "hidden"
      };"><strong>Wards:</strong> ${wards}</div>
    </div>
    <div class="summary-row" style="gap: 4px; flex-wrap: wrap; align-items: center;">
      <div class="items" style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${itemImgs}
      </div>
    </div>
    <div class="match-details">
      <div class="team-header team-victory">Victory (Red Team)</div>
      <table class="player-table team-victory">
        <tbody>
          ${victoryTeam
            .map(
              (p) => `
          <tr>
            <td><img src="https://ddragon.leagueoflegends.com/cdn/15.10.1/img/champion/${getChampImgName(
              p.championName
            )}.png"> ${p.summonerName}</td>
            <td>${p.kills}/${p.deaths}/${p.assists} (${(p.deaths === 0
                ? p.kills + p.assists
                : (p.kills + p.assists) / p.deaths
              ).toFixed(2)})</td>
            <td>
              ${p.totalDamageDealtToChampions}<br>
              <span class="bar" style="width:${
                (p.totalDamageDealtToChampions / maxDamage) * 100
              }%"></span>
            </td>
            <td>${p.goldEarned} (${(
                p.goldEarned /
                (match.info.gameDuration / 60)
              ).toFixed(1)})</td>
            <td>${p.totalMinionsKilled} (${(
                p.totalMinionsKilled /
                (match.info.gameDuration / 60)
              ).toFixed(1)})</td>
            <td>${p.wardsPlaced}</td>
            <td>${[
              p.item0,
              p.item1,
              p.item2,
              p.item3,
              p.item4,
              p.item5,
              p.item6,
            ]
              .map((id) =>
                id
                  ? `<img src=\"https://ddragon.leagueoflegends.com/cdn/15.10.1/img/item/${id}.png\">`
                  : `<div class=\"empty-slot\"></div>`
              )
              .join("")}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="team-header team-defeat">Defeat (Blue Team)</div>
      <table class="player-table team-defeat">
        <thead>
          <tr><th>Player</th><th>KDA</th><th>Damage</th><th>Gold</th><th>CS</th><th>Wards</th><th>Items</th></tr>
        </thead>
        <tbody>
          ${defeatTeam
            .map(
              (p) => `
          <tr>
            <td><img src="https://ddragon.leagueoflegends.com/cdn/15.10.1/img/champion/${getChampImgName(
              p.championName
            )}.png"> ${p.summonerName}</td>
            <td>${p.kills}/${p.deaths}/${p.assists} (${(p.deaths === 0
                ? p.kills + p.assists
                : (p.kills + p.assists) / p.deaths
              ).toFixed(2)})</td>
            <td>
              ${p.totalDamageDealtToChampions}<br>
              <span class="bar" style="width:${
                (p.totalDamageDealtToChampions / maxDamage) * 100
              }%"></span>
            </td>
            <td>${p.goldEarned} (${(
                p.goldEarned /
                (match.info.gameDuration / 60)
              ).toFixed(1)})</td>
            <td>${p.totalMinionsKilled} (${(
                p.totalMinionsKilled /
                (match.info.gameDuration / 60)
              ).toFixed(1)})</td>
            <td>${p.wardsPlaced}</td>
            <td>${[
              p.item0,
              p.item1,
              p.item2,
              p.item3,
              p.item4,
              p.item5,
              p.item6,
            ]
              .map((id) =>
                id
                  ? `<img src=\"https://ddragon.leagueoflegends.com/cdn/15.10.1/img/item/${id}.png\">`
                  : `<div class=\"empty-slot\"></div>`
              )
              .join("")}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </div>
  <div class="tab-content tab-analysis" style="display:none;">
    <div style="padding: 12px 0;">
      <h4 style="margin:0 0 8px 0; color:#60a5fa;">Performance Analysis</h4>
      <ul style="list-style:none; padding:0; margin:0;">
        <li><strong>KDA Ratio:</strong> ${kdaRatio}</li>
        <li><strong>Total Damage Dealt:</strong> ${player.totalDamageDealtToChampions.toLocaleString()}</li>
        <li><strong>Total Damage Taken:</strong> ${player.totalDamageTaken.toLocaleString()}</li>
        <li><strong>Self-Mitigated Damage:</strong> ${player.damageSelfMitigated.toLocaleString()}</li>
        <li><strong>Total Healing Done:</strong> ${player.totalHeal.toLocaleString()}</li>
        <li><strong>Gold Earned:</strong> ${player.goldEarned.toLocaleString()} (${(
      player.goldEarned /
      (match.info.gameDuration / 60)
    ).toFixed(1)} per min)</li>
        <li><strong>CS per Minute:</strong> ${csPerMin}</li>
        <li><strong>Wards Placed:</strong> ${wards}</li>
        <li><strong>Vision Score:</strong> ${player.visionScore}</li>
        <li><strong>Largest Killing Spree:</strong> ${
          player.largestKillingSpree
        }</li>
        <li><strong>Largest Multi Kill:</strong> ${player.largestMultiKill}</li>
      </ul>
    </div>
  </div>
`;
    // Add tab switching logic
    const tabBtns = card.querySelectorAll(".tab-btn");
    tabBtns.forEach((btn) => {
      btn.onclick = function (e) {
        e.stopPropagation();
        tabBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        card.querySelector(".tab-overview").style.display =
          btn.dataset.tab === "overview" ? "" : "none";
        card.querySelector(".tab-analysis").style.display =
          btn.dataset.tab === "analysis" ? "" : "none";
      };
    });

    container.appendChild(card);
  }
  const winRate = ((wins / matches.length) * 100).toFixed(1);
  const kdaRatioTotal =
    totalDeaths === 0
      ? "∞"
      : ((totalKills + totalAssists) / totalDeaths).toFixed(2);
  const totalKDA = `${totalKills}/${totalDeaths}/${totalAssists}`;

  document.getElementById(
    "stat-damage"
  ).textContent = `Total Damage Dealt: ${totalDealt.toLocaleString()}`;
  document.getElementById(
    "stat-taken"
  ).textContent = `Total Damage Taken: ${totalTaken.toLocaleString()}`;
  document.getElementById(
    "stat-mitigated"
  ).textContent = `Self-Mitigated Damage: ${totalMitigated.toLocaleString()}`;
  document.getElementById(
    "stat-healing"
  ).textContent = `Total Healing Done: ${totalHealing.toLocaleString()}`;
  document.getElementById("stat-winrate").textContent = `Winrate: ${winRate}%`;
  document.getElementById("stat-kda").textContent = `Total K/D/A: ${totalKDA}`;
  document.getElementById(
    "stat-kdaratio"
  ).textContent = `KDA Ratio: ${kdaRatioTotal}`;
}
