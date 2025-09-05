// functions/scripts/migrate.js
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import admin from "firebase-admin";
import fs from "node:fs";

dotenv.config();

/** ========= Firestore Admin init ========= */
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  if (!fs.existsSync(saPath)) {
    console.error("Missing service account JSON at", saPath);
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in functions/");
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(saPath),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
} else {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-project" });
  console.log("Using Firestore emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}

const db = admin.firestore();

/** ========= MySQL pool ========= */
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE, // e.g. firebase_connect
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONN_LIMIT || 5),
  queueLimit: 0,
});

/** ========= Helpers ========= */
function toMysqlDatetime(input) {
  // รองรับ Firestore Timestamp { _seconds } / { seconds } / string / Date
  let d;
  if (input && typeof input === "object" && typeof input._seconds === "number") {
    d = new Date(input._seconds * 1000);
  } else if (input && typeof input === "object" && typeof input.seconds === "number") {
    d = new Date(input.seconds * 1000);
  } else if (typeof input === "string" || input instanceof Date) {
    d = new Date(input);
  } else {
    d = new Date();
  }
  // แปลงเป็น "YYYY-MM-DD HH:MM:SS" (UTC offset safe)
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  return z;
}

/** ========= Upsert helpers ========= */
async function upsertOneResponse(conn, id, data) {
  const {
    name,
    answers, // array length 21
    totalQuestions,
    totalScore,
    maxScore,
    percent,
    createdAt,
  } = data || {};

  const createdAtStr = toMysqlDatetime(createdAt);
  const arr = Array.isArray(answers) ? answers : [];

  // ⚠️ ตรงกับสคีมาใหม่: ไม่มี createdAtMs แล้ว
  await conn.execute(
    `INSERT INTO responses (id, name, totalQuestions, totalScore, maxScore, percent, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name),
       totalQuestions=VALUES(totalQuestions),
       totalScore=VALUES(totalScore),
       maxScore=VALUES(maxScore),
       percent=VALUES(percent),
       createdAt=VALUES(createdAt)`,
    [
      id,
      name ?? null,
      (totalQuestions ?? (arr.length || 0)),
      (typeof totalScore === "number" ? totalScore : Number(totalScore) || 0),
      (typeof maxScore === "number" ? maxScore : Number(maxScore) || 0),
      (typeof percent === "number" ? percent : Number(percent) || 0),
      createdAtStr,
    ]
  );

  // สคีมาตามที่คุณกำหนด: ใช้คอลัมน์ name เป็น FK -> responses(id)

  await conn.execute(`DELETE FROM response_answers WHERE name = ?`, [name]);

  if (arr.length > 0) {
    const rows = arr.map((v, i) => [name, i + 1, Number(v) || 0]);
    const placeholders = rows.map(() => "(?, ?, ?)").join(",");
    await conn.execute(
      `INSERT INTO response_answers (name, q_no, value)
       VALUES ${placeholders}`,
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
    try {
      await conn.rollback();
    } catch {}
    console.error("Migration error:", e);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
    console.timeEnd("migrate");
  }
}

main();
