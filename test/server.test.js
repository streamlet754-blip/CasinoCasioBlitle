const test = require('node:test');
const assert = require('node:assert/strict');
const { app, createCode, formatEuro, sessions } = require('../server');

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(base, path, payload) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

test('formats integer cents consistently for the C calculator', () => {
  assert.equal(formatEuro(0), '0.00');
  assert.equal(formatEuro(2050), '20.50');
});

test('reports local-only storage during development', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, storage: 'local-memory', demoOnly: true });
  });
});

test('requires one-time pass redemption before simulated withdrawal', async () => {
  await withServer(async (base) => {
    const deposit = await post(base, '/api/deposit', { amount: 20 });
    assert.equal(deposit.response.status, 201);
    assert.match(deposit.body.sessionId, /^[A-F0-9]{8}$/);
    assert.match(deposit.body.depositCode, /^[A-F0-9]{8}$/);
    assert.equal(deposit.body.amount, 20);

    const premature = await post(base, '/api/withdraw', {
      sessionId: deposit.body.sessionId,
      exitCode: createCode(deposit.body.sessionId, '17.25'),
      reportedEuroAmount: 17.25,
    });
    assert.equal(premature.response.status, 409);

    const wrongPasscode = await post(base, '/api/redeem', {
      sessionId: deposit.body.sessionId,
      depositCode: '00000000',
    });
    assert.equal(wrongPasscode.response.status, 400);

    const redemption = await post(base, '/api/redeem', {
      sessionId: deposit.body.sessionId,
      depositCode: deposit.body.depositCode,
    });
    assert.equal(redemption.response.status, 200);
    assert.equal(redemption.body.status, 'REDEEMED');
    assert.equal(redemption.body.startingChips, 2000);

    const replayedPasscode = await post(base, '/api/redeem', {
      sessionId: deposit.body.sessionId,
      depositCode: deposit.body.depositCode,
    });
    assert.equal(replayedPasscode.response.status, 409);

    const code = createCode(deposit.body.sessionId, '17.25');
    const receipt = { sessionId: deposit.body.sessionId, exitCode: code, reportedEuroAmount: 17.25 };
    const first = await post(base, '/api/withdraw', receipt);
    assert.equal(first.response.status, 200);
    assert.equal(first.body.status, 'SIMULATED');

    const replay = await post(base, '/api/withdraw', receipt);
    assert.equal(replay.response.status, 409);
    assert.equal(sessions.get(deposit.body.sessionId).status, 'USED');
  });
});

test('rejects invalid amounts and mismatched receipt codes', async () => {
  await withServer(async (base) => {
    const badAmount = await post(base, '/api/deposit', { amount: 12 });
    assert.equal(badAmount.response.status, 400);

    const deposit = await post(base, '/api/deposit', { amount: 10 });
    const invalid = await post(base, '/api/redeem', {
      sessionId: deposit.body.sessionId,
      depositCode: '00000000',
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(sessions.get(deposit.body.sessionId).status, 'ACTIVE');
  });
});

test('limits repeated API attempts in the current process', async () => {
  await withServer(async (base) => {
    let result;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      result = await post(base, '/api/deposit', { amount: 10 });
    }
    assert.equal(result.response.status, 429);
  });
});