// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDOkC8aU2xjZSKdplAlTjo6I0YAs-1pBqM",
  authDomain: "form-test-5906d.firebaseapp.com",
  projectId: "form-test-5906d",
  storageBucket: "form-test-5906d.firebasestorage.app",
  messagingSenderId: "586975002404",
  appId: "1:586975002404:web:ce41b7957996c73f0cfdb1",
  measurementId: "G-DZ2RNLCY4G"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);