//It runs automatically whenever a new Firestore doc is created
//at responses/{docId} and upserts that single record (and its 21 answers) into MySQL. 
//This keeps MySQL in sync going forward. ซึ่งจะสร้างจ่ายเงินในfirebase

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config(); // loads functions/.env in emulator/local

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE, // e.g. form_backup
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONN_LIMIT || 5),
  queueLimit: 0,
});

//onDocumentCreated คือกรณีสร้าวใหม่
export const syncResponsesToMySQL = onDocumentCreated("responses/{docId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const id = event.params.docId;
  const {
    name,
    answers, // array length 21
    totalQuestions,
    totalScore,
    maxScore,
    percent,
    createdAt,
  } = data;

  const created = createdAt && createdAt._seconds
    ? new Date(createdAt._seconds * 1000)
    : new Date();

  const arr = Array.isArray(answers) ? answers : [];
  if (arr.length !== 21) {
    console.warn(`doc ${id} answers length = ${arr.length} (expected 21)`);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) upsert header
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
        totalQuestions || arr.length || 0,
        totalScore || 0,
        maxScore || 0,
        percent || 0,
        created,
        created.getTime(),
      ]
    );

    // 2) replace per-question rows
    await conn.query(`DELETE FROM response_answers WHERE response_id = ?`, [id]);

    if (arr.length > 0) {
      const rows = arr.map((v, i) => [id, i + 1, Number(v) || 0]);
      await conn.query(
        `INSERT INTO response_answers (response_id, q_no, value)
         VALUES ${rows.map(() => "(?, ?, ?)").join(",")}`,
        rows.flat()
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error("MySQL upsert error:", e);
    throw e;
  } finally {
    conn.release();
  }
});
