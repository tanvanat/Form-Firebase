//It reads all existing docs from Firestore and inserts/upserts them into MySQL

// functions/scripts/migrate.js
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import admin from "firebase-admin";
import fs from "node:fs";

dotenv.config();

/** ========= Firestore Admin init =========
 * Option A (prod Firestore): put a service account JSON at functions/serviceAccountKey.json
 *   - In GCP: IAM & Admin → Service Accounts → Create key (JSON)
 *   - DO NOT commit this file. Add to .gitignore.
 * Option B (Emulator): set env FIRESTORE_EMULATOR_HOST=localhost:8080 and skip credential
 */
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  if (!fs.existsSync(saPath)) {
    console.error("Missing service account JSON at", saPath);
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in functions/");
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(saPath),
    projectId: process.env.FIREBASE_PROJECT_ID, // optional
  });
} else {
  // emulator needs no creds
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-project" });
  console.log("Using Firestore emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}

const db = admin.firestore();

/** ========= MySQL pool ========= */
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,  // e.g. form_backup
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONN_LIMIT || 5),
  queueLimit: 0,
});

/** ========= Upsert helpers ========= */
async function upsertOneResponse(conn, id, data) {
  const {
    name,
    answers,            // array length 21
    totalQuestions,
    totalScore,
    maxScore,
    percent,
    createdAt,
  } = data || {};

  const created =
    createdAt && createdAt._seconds ? new Date(createdAt._seconds * 1000) : new Date();

  const arr = Array.isArray(answers) ? answers : [];

  await conn.query(
    `INSERT INTO responses (id, name, totalQuestions, totalScore, maxScore, percent, createdAt, createdAtMs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name),
       totalQuestions=VALUES(totalQuestions),
       totalScore=VALUES(totalScore),
       maxScore=VALUES(maxScore),
       percent=VALUES(percent),
       createdAt=VALUES(createdAt),
       createdAtMs=VALUES(createdAtMs)`,
    [
      id,
      name || null,
      totalQuestions ?? arr.length ?? 0,
      totalScore ?? 0,
      maxScore ?? 0,
      percent ?? 0,
      created,
      created.getTime(),
    ]
  );

  // replace per-question rows
  await conn.query(`DELETE FROM response_answers WHERE response_id = ?`, [id]);

  if (arr.length > 0) {
    const rows = arr.map((v, i) => [id, i + 1, Number(v) || 0]);
    await conn.query(
      `INSERT INTO response_answers (response_id, q_no, value)
       VALUES ${rows.map(() => "(?, ?, ?)").join(",")}`,
      rows.flat()
    );
  }
}

/** ========= Main migration ========= */
async function main() {
  console.time("migrate");
  const snap = await db.collection("responses").get();
  console.log(`Found ${snap.size} documents`);

  const conn = await pool.getConnection();
  
  try {
    // upsert per doc (commit per doc to avoid huge transactions)
    let i = 0;
    for (const doc of snap.docs) {
      i++;
      const data = doc.data();
      await conn.beginTransaction();
      await upsertOneResponse(conn, doc.id, data);
      await conn.commit();
      if (i % 50 === 0) console.log(`Upserted ${i}/${snap.size}...`);
    }
    console.log(`Done. Upserted ${i} docs ✅`);
  } catch (e) {
    await pool.query("ROLLBACK");
    console.error("Migration error:", e);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
    console.timeEnd("migrate");
  }
}

main();
