// utils/db.js — MySQL connection pool untuk Solomon Agent
// Setup: npm install mysql2
// .env: DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT

const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DB_HOST || !process.env.DB_NAME) {
      console.warn('[DB] DB_HOST / DB_NAME tidak dikonfigurasi. DB logging dinonaktifkan.');
      return null;
    }
    pool = mysql.createPool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '3306'),
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASS     || '',
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit:    5,
      queueLimit:         0,
      timezone: '+07:00', // WIB
    });
    console.log(`[DB] Pool siap → ${process.env.DB_USER}@${process.env.DB_HOST}/${process.env.DB_NAME}`);
  }
  return pool;
}

// ── Safe query (tidak throw jika DB belum dikonfigurasi) ──
async function query(sql, params = []) {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.execute(sql, params);
    return rows;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '|', sql.slice(0, 80));
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// 1. TOKEN USAGE & ACTIVITY LOG
// ──────────────────────────────────────────────────────────

/**
 * Simpan satu run agen ke database.
 * @param {Object} opts
 * @param {string} opts.agent        - 'trend' | 'analyst' | 'seo' | 'content' | 'monetization' | 'distribution' | 'orchestrator'
 * @param {string} opts.model        - 'haiku-4.5' | 'sonnet-4.6'
 * @param {number} opts.tokensIn     - estimasi input tokens
 * @param {number} opts.tokensOut    - estimasi output tokens
 * @param {number} opts.costIdr      - estimasi biaya dalam IDR
 * @param {number} opts.durationMs   - durasi run dalam ms
 * @param {string} opts.topic        - topik yang ditanyakan (max 200 char)
 * @param {string} opts.sessionToken - token sesi user (opsional)
 * @param {string} opts.ip           - IP address (opsional)
 */
async function logRun({ agent, model, tokensIn, tokensOut, costIdr, durationMs, topic, sessionToken, ip }) {
  const totalTokens = (tokensIn || 0) + (tokensOut || 0);
  return query(
    `INSERT INTO sol_token_usage
       (agent, model, tokens_in, tokens_out, tokens_total, cost_idr, duration_ms, topic, session_token, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      agent, model,
      tokensIn || 0, tokensOut || 0, totalTokens,
      costIdr || 0, durationMs || 0,
      (topic || '').slice(0, 200),
      sessionToken || null, ip || null,
    ]
  );
}

/**
 * Ambil statistik token per periode.
 * @param {'today'|'week'|'month'|'all'} period
 */
async function getTokenStats(period = 'all') {
  const periodSql = {
    today: 'WHERE DATE(created_at) = CURDATE()',
    week:  'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
    month: 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
    all:   '',
  }[period] || '';

  const rows = await query(
    `SELECT
       COALESCE(SUM(tokens_total), 0) AS tokens_total,
       COALESCE(SUM(cost_idr), 0)     AS cost_idr,
       COUNT(*)                        AS runs
     FROM sol_token_usage ${periodSql}`
  );
  return rows?.[0] || { tokens_total: 0, cost_idr: 0, runs: 0 };
}

/**
 * Ambil stats per agen untuk chart.
 */
async function getTokenStatsByAgent(period = 'month') {
  const periodSql = {
    today: 'AND DATE(created_at) = CURDATE()',
    week:  'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
    month: 'AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
    all:   '',
  }[period] || '';

  return await query(
    `SELECT agent, model,
       COUNT(*) AS runs,
       SUM(tokens_total) AS tokens_total,
       SUM(cost_idr) AS cost_idr,
       AVG(duration_ms) AS avg_duration_ms
     FROM sol_token_usage
     WHERE 1=1 ${periodSql}
     GROUP BY agent, model
     ORDER BY tokens_total DESC`
  );
}

// ──────────────────────────────────────────────────────────
// 2. ACTIVITY LOG (rinci per run, dengan topik)
// ──────────────────────────────────────────────────────────

/**
 * Ambil activity log terbaru.
 * @param {number} limit - jumlah baris
 */
async function getActivityLog(limit = 50) {
  return await query(
    `SELECT id, agent, model, tokens_total, cost_idr, duration_ms, topic, ip, created_at
     FROM sol_token_usage
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );
}

// ──────────────────────────────────────────────────────────
// 3. MEMORY / TOPIC HISTORY PER AGEN
// ──────────────────────────────────────────────────────────

/**
 * Simpan topik yang pernah ditanyakan ke agen.
 */
async function saveMemory({ agent, topic, sessionToken }) {
  // output_snippet dihapus — tidak ditampilkan di app, hemat storage
  return query(
    `INSERT INTO sol_memory (agent, topic, session_token, created_at)
     VALUES (?, ?, ?, NOW())`,
    [
      agent,
      (topic || '').slice(0, 200),
      sessionToken || null,
    ]
  );
}

/**
 * Ambil memory topik per agen.
 * @param {string} agent  - nama agen, atau null untuk semua
 * @param {number} limit
 */
async function getMemory(agent = null, limit = 30) {
  if (agent) {
    return await query(
      `SELECT id, agent, topic, created_at
       FROM sol_memory WHERE agent = ?
       ORDER BY created_at DESC LIMIT ?`,
      [agent, limit]
    );
  }
  return await query(
    `SELECT id, agent, topic, created_at
     FROM sol_memory
     ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

/**
 * Cari topik serupa yang pernah dijalankan (untuk context hints).
 */
async function searchMemory(agent, keyword) {
  return await query(
    `SELECT topic, created_at
     FROM sol_memory
     WHERE agent = ? AND topic LIKE ?
     ORDER BY created_at DESC LIMIT 5`,
    [agent, `%${keyword}%`]
  );
}

// ──────────────────────────────────────────────────────────
// 4. USER LOGGING SYSTEM
// ──────────────────────────────────────────────────────────

/**
 * Log event login/logout.
 * @param {'login'|'logout'|'login_failed'} eventType
 */
async function logUserEvent({ eventType, username, sessionToken, ip, userAgent }) {
  return query(
    `INSERT INTO sol_user_log (event_type, username, session_token, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      eventType,
      (username || '').slice(0, 50),
      sessionToken || null,
      ip || null,
      (userAgent || '').slice(0, 300),
    ]
  );
}

/**
 * Ambil log user terbaru.
 */
async function getUserLog(limit = 50) {
  return await query(
    `SELECT id, event_type, username, ip, user_agent, created_at
     FROM sol_user_log
     ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

/**
 * Hitung session aktif (login dalam 7 hari terakhir tanpa logout).
 */
async function getActiveSessions() {
  return await query(
    `SELECT COUNT(DISTINCT session_token) AS count
     FROM sol_user_log
     WHERE event_type = 'login'
     AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
  );
}

// ──────────────────────────────────────────────────────────
// AUTO-INIT: Buat tabel jika belum ada
// ──────────────────────────────────────────────────────────
async function initDB() {
  const p = getPool();
  if (!p) return;

  const sqls = [
    // Tabel 1: Token Usage + Activity Log
    `CREATE TABLE IF NOT EXISTS sol_token_usage (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      agent         VARCHAR(30)  NOT NULL,
      model         VARCHAR(40)  NOT NULL,
      tokens_in     INT          DEFAULT 0,
      tokens_out    INT          DEFAULT 0,
      tokens_total  INT          DEFAULT 0,
      cost_idr      INT          DEFAULT 0,
      duration_ms   INT          DEFAULT 0,
      topic         VARCHAR(200),
      session_token VARCHAR(100),
      ip            VARCHAR(45),
      created_at    DATETIME     NOT NULL,
      INDEX idx_agent (agent),
      INDEX idx_created (created_at),
      INDEX idx_session (session_token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Tabel 2: Memory / Topic History
    `CREATE TABLE IF NOT EXISTS sol_memory (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      agent          VARCHAR(30)   NOT NULL,
      topic          VARCHAR(200)  NOT NULL,
      session_token  VARCHAR(100),
      created_at     DATETIME      NOT NULL,
      INDEX idx_agent_topic (agent, topic(50)),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Tabel 3: User Logging
    `CREATE TABLE IF NOT EXISTS sol_user_log (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      event_type    ENUM('login','logout','login_failed') NOT NULL,
      username      VARCHAR(50),
      session_token VARCHAR(100),
      ip            VARCHAR(45),
      user_agent    VARCHAR(300),
      created_at    DATETIME NOT NULL,
      INDEX idx_event (event_type),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // Tabel 4: Agent Config
    `CREATE TABLE IF NOT EXISTS sol_agent_config (
      agent       VARCHAR(30)  PRIMARY KEY,
      model       VARCHAR(50)  NOT NULL,
      max_tokens  INT          DEFAULT 2048,
      updated_at  DATETIME     DEFAULT NOW()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  for (const sql of sqls) {
    const result = await query(sql);
    if (result !== null) {
      const tableName = sql.match(/TABLE IF NOT EXISTS (\w+)/)?.[1];
      console.log(`[DB] Tabel siap: ${tableName}`);
    }
  }
}

// ──────────────────────────────────────────────────────────
// 5. AGENT CONFIG (max_tokens per agent)
// ──────────────────────────────────────────────────────────

const AGENT_DEFAULTS = {
  trend:        { model: 'claude-haiku-4-5-20251001', max_tokens: 2048 },
  analyst:      { model: 'claude-sonnet-4-6',         max_tokens: 2048 },
  seo:          { model: 'claude-haiku-4-5-20251001', max_tokens: 2048 },
  content:      { model: 'claude-haiku-4-5-20251001', max_tokens: 4096 },
  monetization: { model: 'claude-sonnet-4-6',         max_tokens: 2048 },
  distribution: { model: 'claude-haiku-4-5-20251001', max_tokens: 1024 },
  orchestrator: { model: 'claude-sonnet-4-6',         max_tokens: 2048 },
};

async function getAgentConfigs() {
  const rows = await query('SELECT agent, model, max_tokens, updated_at FROM sol_agent_config ORDER BY agent');
  if (!rows?.length) {
    // Return defaults jika tabel kosong
    return Object.entries(AGENT_DEFAULTS).map(([agent, cfg]) => ({
      agent, model: cfg.model, max_tokens: cfg.max_tokens, updated_at: null, is_default: true
    }));
  }
  return rows.map(r => ({ ...r, is_default: false }));
}

async function upsertAgentConfig({ agent, model, maxTokens }) {
  return query(
    `INSERT INTO sol_agent_config (agent, model, max_tokens, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE model=VALUES(model), max_tokens=VALUES(max_tokens), updated_at=NOW()`,
    [agent, model, maxTokens]
  );
}

module.exports = {
  query,
  getPool,
  initDB,
  // Token & Activity
  logRun,
  getTokenStats,
  getTokenStatsByAgent,
  getActivityLog,
  // Memory
  saveMemory,
  getMemory,
  searchMemory,
  // User Log
  logUserEvent,
  getUserLog,
  getActiveSessions,
  // Agent Config
  getAgentConfigs,
  upsertAgentConfig,
  AGENT_DEFAULTS,
};