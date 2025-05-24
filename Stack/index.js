// server/index.js
const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves your frontend (index.html, CSS, etc.)
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI; // Store your MongoDB URI in .env
const client = new MongoClient(uri);
let db;

async function connectToDB() {
  await client.connect();
  db = client.db('Data'); // or any name you prefer
  console.log('✅ Connected to MongoDB');
}
connectToDB();

app.get('/api/match-history', (req, res) => {
  const rawData = fs.readFileSync('./data/match.json'); // adjust path
  const match = JSON.parse(rawData);

  // Simplify match object here
  const participant = match.info.participants.find(p => p.summonerName === 'lolarmon1');

  const summary = {
    gameMode: match.info.gameMode,
    outcome: participant.win ? 'Win' : 'Loss',
    duration: `${Math.floor(match.info.gameDuration / 60)}:${String(match.info.gameDuration % 60).padStart(2, '0')}`,
    kda: `${participant.kills} / ${participant.deaths} / ${participant.assists}`,
    cs: `${participant.totalMinionsKilled} (${(participant.totalMinionsKilled / (match.info.gameDuration / 60)).toFixed(1)})`,
    champLevel: participant.champLevel,
    championId: participant.championId,
    itemIds: [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5],
    summonerSpells: [participant.summoner1Id, participant.summoner2Id],
    runes: participant.perks.styles.map(style => style.selections[0].perk),
    visionScore: participant.visionScore,
    tags: [] // fill in if you want like 'MVP', 'ACE', etc.
  };

  res.json(summary);
});

/**
 * Route 1: Get PUUID from Riot ID
 */
app.get('/api/summoner/:gameName/:tagLine', async (req, res) => {
  const { gameName, tagLine } = req.params;

  try {
    const url = `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;
    console.log('➡️ Requesting:', url);

    const response = await fetch(url, {
      headers: { 'X-Riot-Token': process.env.RIOT_API_KEY },
    });

    const text = await response.text();
    console.log('📥 Riot API Status:', response.status);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch data from Riot API' });
    }

    const data = JSON.parse(text);
    res.json(data);
  } catch (err) {
    console.error('❌ Server error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Route 2: Get Match IDs from PUUID
 */
app.get('/api/matches/:puuid', async (req, res) => {
  const { puuid } = req.params;
  const count = req.query.count || 20;

  try {
    const response = await fetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`,
      {
        headers: { 'X-Riot-Token': process.env.RIOT_API_KEY },
      }
    );

    const matchIds = await response.json();

    // Fetch match details in parallel
    const matchDetails = await Promise.all(
      matchIds.map(id =>
        fetch(`https://americas.api.riotgames.com/lol/match/v5/matches/${id}`, {
          headers: { 'X-Riot-Token': process.env.RIOT_API_KEY },
        }).then(res => res.json())
      )
    );

    const filteredMatches = req.query.mode
      ? matchDetails.filter(m => m.info.gameMode === req.query.mode)
      : matchDetails;

    res.json(filteredMatches);
  } catch (err) {
    console.error('❌ Match fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Route 3: Get Match Details from Match ID
 */
app.get('/api/match/:matchId', async (req, res) => {
  const { matchId } = req.params;

  try {
    const cached = await db.collection('matches').findOne({ matchId });
    if (cached) {
      console.log('🔁 Returning cached match');
      return res.json(cached.data);
    }

    const response = await fetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      { headers: { 'X-Riot-Token': process.env.RIOT_API_KEY } }
    );

    const data = await response.json();

    // Cache match in MongoDB
    await db.collection('matchData').insertOne({ matchId, data });


    res.json(data);
  } catch (err) {
    console.error('❌ Match fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
