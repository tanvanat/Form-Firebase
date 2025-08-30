// Firebase-app.js (ใช้ ES Module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// ⛳️ ใช้ config ของโปรเจกต์คุณ (ที่คุณแปะมา)
const firebaseConfig = {
  apiKey: "AIzaSyDOkC8aU2xjZSKdplAlTjo6I0YAs-1pBqM",
  authDomain: "form-test-5906d.firebaseapp.com",
  projectId: "form-test-5906d",
  storageBucket: "form-test-5906d.firebasestorage.app",
  messagingSenderId: "586975002404",
  appId: "1:586975002404:web:ce41b7957996c73f0cfdb1",
  measurementId: "G-DZ2RNLCY4G"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);     // ไม่ใช้ก็ลบได้
export const db = getFirestore(app);
