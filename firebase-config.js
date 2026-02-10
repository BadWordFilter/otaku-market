// Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, onSnapshot, updateDoc, doc, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyCPThFhtkvXAXA2N2qGCDqOpXawkUAQgbE",
    authDomain: "otaku-market-36a27.firebaseapp.com",
    projectId: "otaku-market-36a27",
    storageBucket: "otaku-market-36a27.firebasestorage.app",
    messagingSenderId: "516937935514",
    appId: "1:516937935514:web:578416a40d714184e08d23",
    measurementId: "G-Y4N10CWMWD"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export
export {
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    onSnapshot,
    updateDoc,
    doc,
    where,
    deleteDoc
};
