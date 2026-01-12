import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCmDl-jlu1-_ydkXNJ0GeVAuebc6CmAXck",
  authDomain: "solar-tracker-44963.firebaseapp.com",
  databaseURL: "https://solar-tracker-44963-default-rtdb.firebaseio.com", // ✅ Add this line
  projectId: "solar-tracker-44963",
  storageBucket: "solar-tracker-44963.firebasestorage.app",
  messagingSenderId: "194145973983",
  appId: "1:194145973983:web:20507f1e81460a205f5b6a",
  measurementId: "G-55BSH6MT8R"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, ref, onValue };
