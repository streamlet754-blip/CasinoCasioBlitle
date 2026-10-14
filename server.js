require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const { Redis } = require('@upstash/redis');

const MASTER_SECRET = process.env.MASTER_SECRET || 'YOUR_SHARED_SECRET_KEY';
const DEMO_ONLY = 'This demo uses virtual credits only. No deposits or payouts are processed.';
const ALLOWED_AMOUNTS = new Set([10, 20, 50]);
const sessions = new Map();
const rateLimits = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_WINDOW_SECONDS = RATE_WINDOW_MS / 1000;
const RATE_LIMIT = 20;
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_PREFIX = 'pocket-arcade:session:';
const RATE_PREFIX = 'pocket-arcade:rate:';
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

if (process.env.VERCEL && !redis) {
  throw new Error('Connect a Redis store in the Vercel Marketplace before deploying the demo API.');
}

function formatEuro(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function createCode(sessionId, euroAmount) {
  return crypto
    .createHmac('sha256', MASTER_SECRET)
    .update(`${sessionId}:${euroAmount}`, 'utf8')
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
}

function constantTimeMatch(expected, supplied) {
  const expectedBytes = Buffer.from(expected, 'ascii');
  const suppliedBytes = Buffer.from(supplied, 'ascii');
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

async function rateLimit(req, res, next) {
  try {
    const now = Date.now();
    const clientIp = req.headers['x-real-ip'] || req.ip || req.socket.remoteAddress || 'unknown';
    const fingerprint = crypto.createHash('sha256').update(String(clientIp)).digest('hex').slice(0, 32);
    let count;

    if (redis) {
      count = Number(await redis.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
        [`${RATE_PREFIX}${fingerprint}`],
        [RATE_WINDOW_SECONDS],
      ));
    } else {
      const current = rateLimits.get(fingerprint);
      const entry = !current || now - current.startedAt >= RATE_WINDOW_MS
        ? { startedAt: now, count: 0 }
        : current;
      entry.count += 1;
      count = entry.count;
      rateLimits.set(fingerprint, entry);
    }

    if (count > RATE_LIMIT) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    return next();
  } catch (error) {
    console.error('Rate limit store is unavailable:', error.message);
    return res.status(503).json({ error: 'Demo service is temporarily unavailable.' });
  }
}

function sessionKey(sessionId) {
  return `${SESSION_PREFIX}${sessionId}`;
}

async function saveSession(sessionId, session) {
  if (redis) {
    return (await redis.set(sessionKey(sessionId), session, { ex: SESSION_TTL_SECONDS, nx: true })) === 'OK';
  }
  if (sessions.has(sessionId)) return false;
  sessions.set(sessionId, session);
  return true;
}

async function getSession(sessionId) {
  const session = redis ? await redis.get(sessionKey(sessionId)) : sessions.get(sessionId);
  if (!session || Date.now() - session.createdAt >= SESSION_TTL_SECONDS * 1000) return null;
  return session;
}

async function transitionSession(sessionId, expectedStatus, nextStatus, timestampField) {
  if (redis) {
    const result = await redis.eval(
      "local value = redis.call('GET', KEYS[1]); if not value then return 0 end; local session = cjson.decode(value); if session.status ~= ARGV[1] then return 0 end; session.status = ARGV[2]; session[ARGV[3]] = tonumber(ARGV[4]); redis.call('SET', KEYS[1], cjson.encode(session), 'EX', tonumber(ARGV[5])); return 1",
      [sessionKey(sessionId)],
      [expectedStatus, nextStatus, timestampField, Date.now(), SESSION_TTL_SECONDS],
    );
    return Number(result) === 1;
  }

  const session = await getSession(sessionId);
  if (!session || session.status !== expectedStatus) return false;
  session.status = nextStatus;
  session[timestampField] = Date.now();
  return true;
}

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  return res.json({ ok: true, storage: redis ? 'redis' : 'local-memory', demoOnly: true });
});

app.post('/api/deposit', rateLimit, async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!ALLOWED_AMOUNTS.has(amount)) {
    return res.status(400).json({ error: 'Choose a demo amount of €10, €20, or €50.' });
  }

  const amountCents = amount * 100;
  const euroAmount = formatEuro(amountCents);
  let sessionId;
  let created = false;
  try {
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      sessionId = crypto.randomBytes(4).toString('hex').toUpperCase();
      created = await saveSession(sessionId, {
        amountCents,
        status: 'ACTIVE',
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    console.error('Session store is unavailable:', error.message);
    return res.status(503).json({ error: 'Demo service is temporarily unavailable.' });
  }
  if (!created) return res.status(503).json({ error: 'Could not create a demo pass. Try again.' });

  const depositCode = createCode(sessionId, euroAmount);
  return res.status(201).json({ sessionId, depositCode, amount, demoOnly: DEMO_ONLY });
});

app.post('/api/redeem', rateLimit, async (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.toUpperCase() : '';
  const depositCode = typeof req.body?.depositCode === 'string' ? req.body.depositCode.toUpperCase() : '';

  if (!/^[A-F0-9]{8}$/.test(sessionId) || !/^[A-F0-9]{8}$/.test(depositCode)) {
    return res.status(400).json({ error: 'Session ID and demo code must each contain 8 hexadecimal characters.' });
  }

  try {
    const session = await getSession(sessionId);
    if (!session || session.status !== 'ACTIVE') {
      return res.status(409).json({ error: 'Demo code was not found, has expired, or has already been used.' });
    }
    const expected = createCode(sessionId, formatEuro(session.amountCents));
    if (!constantTimeMatch(expected, depositCode)) {
      return res.status(400).json({ error: 'Demo code does not match this session.' });
    }
    const redeemed = await transitionSession(sessionId, 'ACTIVE', 'PLAYING', 'redeemedAt');
    if (!redeemed) {
      return res.status(409).json({ error: 'Demo code has already been used.' });
    }
    return res.json({
      status: 'REDEEMED',
      startingChips: session.amountCents,
      message: 'Demo credits added. No money was charged.',
    });
  } catch (error) {
    console.error('Session store is unavailable:', error.message);
    return res.status(503).json({ error: 'Demo service is temporarily unavailable.' });
  }
});

app.post('/api/withdraw', rateLimit, async (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.toUpperCase() : '';
  const exitCode = typeof req.body?.exitCode === 'string' ? req.body.exitCode.toUpperCase() : '';
  const reportedAmount = Number(req.body?.reportedEuroAmount);

  if (!/^[A-F0-9]{8}$/.test(sessionId) || !/^[A-F0-9]{8}$/.test(exitCode)) {
    return res.status(400).json({ error: 'Session ID and code must each contain 8 hexadecimal characters.' });
  }
  if (!Number.isFinite(reportedAmount) || reportedAmount < 0 || reportedAmount > 100000) {
    return res.status(400).json({ error: 'Enter a valid non-negative demo amount.' });
  }
  const amountCents = Math.round(reportedAmount * 100);
  if (Math.abs(reportedAmount * 100 - amountCents) > 1e-7) {
    return res.status(400).json({ error: 'Demo amounts support at most two decimal places.' });
  }

  let session;
  try {
    session = await getSession(sessionId);
  } catch (error) {
    console.error('Session store is unavailable:', error.message);
    return res.status(503).json({ error: 'Demo service is temporarily unavailable.' });
  }
  if (!session || session.status !== 'PLAYING') {
    return res.status(409).json({ error: 'Redeem a demo code before submitting a demo receipt.' });
  }
  const expected = createCode(sessionId, formatEuro(amountCents));
  if (!constantTimeMatch(expected, exitCode)) {
    return res.status(400).json({ error: 'Receipt code does not match this session and amount.' });
  }

  try {
    const consumed = await transitionSession(sessionId, 'PLAYING', 'USED', 'usedAt');
    if (!consumed) {
      return res.status(409).json({ error: 'Demo pass was not found, has expired, or has already been used.' });
    }
  } catch (error) {
    console.error('Session store is unavailable:', error.message);
    return res.status(503).json({ error: 'Demo service is temporarily unavailable.' });
  }

  return res.json({
    status: 'SIMULATED',
    reportedEuroAmount: formatEuro(amountCents),
    message: 'Demo receipt accepted. No money, cryptocurrency, or wallet transfer is involved.',
  });
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'), (error) => {
    if (error) next(error);
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Pocket Arcade demo listening on http://localhost:${port}`));
}

module.exports = app;
module.exports.app = app;
module.exports.createCode = createCode;
module.exports.formatEuro = formatEuro;
module.exports.sessions = sessions;