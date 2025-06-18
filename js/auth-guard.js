import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAg8EIRoDGo3uPP0oCXAtDL7xNreJQeY7k",
  authDomain: "brumoutloud-3dd92.firebaseapp.com",
  projectId: "brumoutloud-3dd92",
  storageBucket: "brumoutloud-3dd92.appspot.com",
  messagingSenderId: "803476014859",
  appId: "1:803476014859:web:660ab2967e64955b0d440e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// This function checks the user's auth state
onAuthStateChanged(auth, (user) => {
  // If there's no user, and we are not already on the login page...
  if (!user && window.location.pathname !== '/admin-login.html') {
    // ...redirect them to the login page.
    console.log("No user found, redirecting to login.");
    window.location.href = '/admin/login';
  } else {
    // If they are logged in, make the page content visible
    document.body.style.display = 'block';
  }
});

// Hide the body by default to prevent a flash of content before the check runs
document.body.style.display = 'none';
