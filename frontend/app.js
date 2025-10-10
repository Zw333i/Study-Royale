// app.js
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://study-royale.up.railway.app/api';

let currentUser = null;
let currentReviewerId = null;
let selectedQuizTypes = []; 
let currentQuestions = [];
let userToken = null;
let confirmationResult = null;
let currentFlashcardIndex = 0;
let matchingSelections = { column1: null, column2: null };
let matchedPairs = [];
let importedQuizzes = [];
let quizSubmitted = false;
let learnMessages = [];
let learnInput = '';
let currentLearnReviewerId = null;

// ===== THROTTLING UTILITY =====
const throttledFunctions = new Map();

function throttle(func, delay = 1000) {
    const funcName = func.name || 'anonymous';
    
    return function(...args) {
        if (throttledFunctions.has(funcName)) {
            showAlert('Please wait before trying again', 'error');
            return;
        }
        
        throttledFunctions.set(funcName, true);
        
        const result = func.apply(this, args);
        
        setTimeout(() => {
            throttledFunctions.delete(funcName);
        }, delay);
        
        return result;
    };
}

function debounce(func, delay = 500) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// ===== SESSION TIMEOUT =====
let sessionTimeout;
const SESSION_DURATION = 30 * 60 * 1000;

function resetSessionTimer() {
    clearTimeout(sessionTimeout);
    if (currentUser) {
        sessionTimeout = setTimeout(() => {
            showAlert('Session expired. Please log in again.', 'error');
            logout();
        }, SESSION_DURATION);
    }
}

['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetSessionTimer, { passive: true });
});

// ===== FIREBASE INITIALIZATION =====
const firebaseConfig = {
    apiKey: "AIzaSyAZQXz7yiBKhAvxnv1dAQpMWwqAB5rvktk",
    authDomain: "study-royal333.firebaseapp.com",
    projectId: "study-royal333",
    storageBucket: "study-royal333.firebasestorage.app",
    messagingSenderId: "9073144683",
    appId: "1:9073144683:web:f9df440d7f80fac0c6922e",
    measurementId: "G-GC7F09LB8T"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ===== AUTH STATE OBSERVER =====
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        userToken = await user.getIdToken();
        resetSessionTimer();
        await loadImportedQuizzes();
        showAppPage();
        loadReviewers();
        
        // Update both desktop and mobile usernames
        const displayName = user.displayName || user.email;
        const userNameElement = document.getElementById('userName');
        const mobileUserNameElement = document.getElementById('mobileUserName');
        if (userNameElement) userNameElement.textContent = displayName;
        if (mobileUserNameElement) mobileUserNameElement.textContent = displayName;
    } else {
        clearTimeout(sessionTimeout);
        currentUser = null;
        userToken = null;
        importedQuizzes = [];
        showAuthPage();
    }
});

// ===== DARK MODE TOGGLE =====
function toggleDarkMode() {
    const body = document.body;
    const desktopSwitch = document.getElementById('switch-desktop');
    const mobileSwitch = document.getElementById('switch');
    
    // Toggle light mode
    body.classList.toggle('light-mode');
    
    // Sync both switches
    const isLightMode = body.classList.contains('light-mode');
    if (desktopSwitch) desktopSwitch.checked = isLightMode;
    if (mobileSwitch) mobileSwitch.checked = isLightMode;
}

// Set minimum date to today and load dark mode preference
document.addEventListener('DOMContentLoaded', () => {
    const examDateInput = document.getElementById('examDate');
    if (examDateInput) {
        examDateInput.min = new Date().toISOString().split('T')[0];
    }
    
    const lightModeEnabled = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    if (lightModeEnabled) {
        document.body.classList.add('light-mode');
        const switchElement = document.getElementById('switch');
        if (switchElement) switchElement.checked = true;
    }
    
    if (!currentUser) {
        showAuthPage();
    }
});

// ===== PAGE NAVIGATION =====
function showAuthPage() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('authPage').classList.add('active');
    document.getElementById('appPage').style.display = 'none';
    document.getElementById('appPage').classList.remove('active');
    document.getElementById('quizPage').style.display = 'none';
    document.getElementById('quizPage').classList.remove('active');
    document.body.style.overflow = 'hidden';
}

function showAppPage() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('authPage').classList.remove('active');
    document.getElementById('appPage').style.display = 'block';
    document.getElementById('appPage').classList.add('active');
    document.getElementById('quizPage').style.display = 'none';
    document.getElementById('quizPage').classList.remove('active');
    
    const userNameElement = document.getElementById('userName');
    if (userNameElement && currentUser) {
        userNameElement.textContent = currentUser.displayName || currentUser.email;
    }
    
    document.body.style.overflow = 'auto';
}

function showQuizPage() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('authPage').classList.remove('active');
    document.getElementById('appPage').style.display = 'none';
    document.getElementById('appPage').classList.remove('active');
    document.getElementById('quizPage').style.display = 'block';
    document.getElementById('quizPage').classList.add('active');
    document.body.style.overflow = 'auto';
}

// ===== AUTH FUNCTIONS =====
function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('phoneForm').classList.add('hidden');
}

function showSignup() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupForm').classList.remove('hidden');
    document.getElementById('phoneForm').classList.add('hidden');
}

function showPhoneAuth() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('phoneForm').classList.remove('hidden');
    
    if (!window.recaptchaVerifier) {
        try {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                'size': 'normal',
                'callback': () => console.log('reCAPTCHA solved'),
                'expired-callback': () => showAlert('reCAPTCHA expired. Please try again.', 'error')
            });
            window.recaptchaVerifier.render();
        } catch (error) {
            console.log('reCAPTCHA initialization:', error);
        }
    }
}

async function login(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // Validation
    const errors = [];
    
    if (!email) {
        errors.push('Email is required');
    } else if (!validateEmail(email)) {
        errors.push('Please enter a valid email address');
    }
    
    if (!password) {
        errors.push('Password is required');
    }
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    
    const loginBtn = event.target.querySelector('button[type="submit"]');
    const originalText = loginBtn.textContent;
    
    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        
        await auth.signInWithEmailAndPassword(email, password);
        showAlert('Welcome back! 🎉');
    } catch (error) {
        let errorMessage = 'Login failed';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format';
        } else if (error.code === 'auth/user-disabled') {
            errorMessage = 'This account has been disabled';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many failed attempts. Please try again later';
        }
        
        showAlert(errorMessage, 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = originalText;
    }
}

async function signup(event) {
    if (event) event.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    // Validation
    const errors = [];
    
    if (!name) {
        errors.push('Display name is required');
    } else if (name.length < 2) {
        errors.push('Display name must be at least 2 characters');
    }
    
    if (!email) {
        errors.push('Email is required');
    } else if (!validateEmail(email)) {
        errors.push('Please enter a valid email address');
    }
    
    if (!password) {
        errors.push('Password is required');
    } else if (!validatePassword(password)) {
        errors.push('Password must be at least 6 characters');
    }
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    
    const signupBtn = event.target.querySelector('button[type="submit"]');
    const originalText = signupBtn.textContent;
    
    try {
        signupBtn.disabled = true;
        signupBtn.textContent = 'Creating account...';
        
        const result = await auth.createUserWithEmailAndPassword(email, password);
        await result.user.updateProfile({ displayName: name });
        
        showAlert('Account created successfully! Welcome to Study Royale! 🎉');
    } catch (error) {
        let errorMessage = 'Signup failed';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'An account with this email already exists';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak. Use at least 6 characters';
        }
        
        showAlert(errorMessage, 'error');
    } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = originalText;
    }
}

async function googleSignIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    try {
        const result = await auth.signInWithPopup(provider);
        
        if (!result.user.displayName && result.additionalUserInfo && result.additionalUserInfo.profile && result.additionalUserInfo.profile.name) {
            await result.user.updateProfile({ 
                displayName: result.additionalUserInfo.profile.name 
            });
        }
        showAlert('Signed in with Google!');
    } catch (error) {
        console.error('Google sign-in error:', error);
        
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment') {
            try {
                showAlert('Opening Google sign-in...', 'success');
                await auth.signInWithRedirect(provider);
            } catch (redirectError) {
                console.error('Redirect error:', redirectError);
                showAlert('Google sign-in not available. Please use email/password or phone authentication.', 'error');
            }
        } else if (error.code === 'auth/cancelled-popup-request') {
            // User closed popup
        } else {
            showAlert('Failed to sign in with Google. Try email/password instead.', 'error');
        }
    }
}

auth.getRedirectResult().then((result) => {
    if (result.user) {
        showAlert('Signed in with Google successfully!');
    }
}).catch((error) => {
    // Silently ignore redirect errors in unsupported environments
    if (error.code !== 'auth/popup-closed-by-user' && 
        error.code !== 'auth/operation-not-supported-in-this-environment') {
        console.error('Redirect result error:', error);
    }
});

const sendVerificationCode = throttle(async function() {
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const sendBtn = document.getElementById('sendCodeBtn');
    
    // Validation
    const errors = [];
    
    if (!phoneNumber) {
        errors.push('Phone number is required');
    } else if (!phoneNumber.startsWith('+')) {
        errors.push('Phone number must include country code (e.g., +63)');
    } else if (!validatePhoneNumber(phoneNumber)) {
        errors.push('Invalid Philippines phone format. Use: +639171234567');
    }
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    
    const originalText = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                'size': 'normal',
                'callback': () => console.log('reCAPTCHA solved'),
                'expired-callback': () => showAlert('reCAPTCHA expired. Please try again.', 'error')
            });
            await window.recaptchaVerifier.render();
        }
        
        const appVerifier = window.recaptchaVerifier;
        confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, appVerifier);
        
        showAlert('Verification code sent to your phone! 📱', 'success');
        document.getElementById('verificationCodeSection').classList.remove('hidden');
        sendBtn.textContent = 'Code Sent ✓';
        
    } catch (error) {
        console.error('SMS send error:', error);
        
        let errorMessage = 'Failed to send verification code';
        
        if (error.code === 'auth/invalid-phone-number') {
            errorMessage = 'Invalid phone number format';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many requests. Please try again in a few minutes';
        } else if (error.code === 'auth/billing-not-enabled') {
            errorMessage = 'Phone authentication requires a paid Firebase plan. Please use email or Google sign-in instead.';
        } else if (error.code === 'auth/captcha-check-failed') {
            errorMessage = 'reCAPTCHA verification failed. Please try again';
        }
        
        showAlert(errorMessage, 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = originalText;
        
        if (window.recaptchaVerifier) {
            window.recaptchaVerifier.clear();
            window.recaptchaVerifier = null;
        }
    }
}, 3000); // 3 second throttle

async function verifyPhoneCode() {
    const code = document.getElementById('verificationCode').value.trim();

    if (!code || code.length !== 6) {
        showAlert('Please enter the 6-digit code', 'error');
        return;
    }

    try {
        const result = await confirmationResult.confirm(code);
        showAlert('Phone verified successfully!');
        
        if (!result.user.displayName) {
            const name = prompt('Enter your display name:');
            if (name) {
                await result.user.updateProfile({ displayName: name });
            }
        }
    } catch (error) {
        console.error('Verification error:', error);
        showAlert('Invalid verification code', 'error');
    }
}

async function logout() {
    try {
        clearTimeout(sessionTimeout);
        await auth.signOut();
        showAlert('Logged out successfully');
        closeUserMenu();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// ===== UI FUNCTIONS =====
function showAlert(message, type = 'success', duration = 5000) {
    const container = document.getElementById('alertContainer');
    if (!container) return;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    alert.innerHTML = `
        <span class="alert-icon">${icons[type] || icons.info}</span>
        <span class="alert-message">${message}</span>
        <button class="alert-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => alert.remove(), 300);
    }, duration);
}

function showValidationErrors(errors) {
    const container = document.getElementById('alertContainer');
    if (!container) return;
    
    const alert = document.createElement('div');
    alert.className = 'alert alert-error alert-list';
    
    const errorList = errors.map(err => `<li>${err}</li>`).join('');
    
    alert.innerHTML = `
        <span class="alert-icon">⚠</span>
        <div class="alert-content">
            <strong>Please fix the following:</strong>
            <ul>${errorList}</ul>
        </div>
        <button class="alert-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => alert.remove(), 300);
    }, 7000);
}

// ===== FORM VALIDATION =====
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhoneNumber(phone) {
    // Philippines format: +63 followed by 10 digits
    const re = /^\+63\d{10}$/;
    return re.test(phone);
}

function validatePassword(password) {
    return password.length >= 6;
}

function validateFileSize(file, maxSizeMB = 20) {
    return file.size <= maxSizeMB * 1024 * 1024;
}

function validateFileType(file, allowedTypes = ['.pdf', '.docx', '.txt']) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return allowedTypes.includes(ext);
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentElement.querySelector('.password-toggle');
    
    if (input.type === 'password') {
        input.type = 'text';
        button.classList.add('active');
        button.innerHTML = `
            <svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    } else {
        input.type = 'password';
        button.classList.remove('active');
        button.innerHTML = `
            <svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('userMenu');
    const dropdown = menu.parentElement;
    menu.classList.toggle('active');
    dropdown.classList.toggle('active');
}

function closeUserMenu() {
    const menu = document.getElementById('userMenu');
    const dropdown = menu.parentElement;
    menu.classList.remove('active');
    dropdown.classList.remove('active');
}

document.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        closeUserMenu();
    }
});

// ===== NAVIGATION =====
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            
            if (page === 'upload') {
                document.getElementById('uploadSection').classList.add('active');
            } else if (page === 'import') {
                document.getElementById('importSection').classList.add('active');
            } else if (page === 'materials') {
                document.getElementById('materialsSection').classList.add('active');
                loadReviewers();
            }
        });
    });
});

// ===== FILE UPLOAD =====
function handleFileSelect(input) {
    const fileNamesContainer = document.getElementById('fileNames');
    const mergeOptionsContainer = document.getElementById('mergeOptionsContainer');
    
    if (input.files && input.files.length > 0) {
        fileNamesContainer.innerHTML = '';
        
        Array.from(input.files).forEach((file, index) => {
            const fileDiv = document.createElement('div');
            fileDiv.innerHTML = `📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            fileNamesContainer.appendChild(fileDiv);
        });
        
        if (input.files.length > 1) {
            mergeOptionsContainer.style.display = 'block';
        } else {
            mergeOptionsContainer.style.display = 'none';
        }
    } else {
        fileNamesContainer.innerHTML = '';
        mergeOptionsContainer.style.display = 'none';
    }
}

const uploadFiles = throttle(async function() {
    const fileInput = document.getElementById('fileInput');
    const examDate = document.getElementById('examDate').value;
    const uploadBtn = document.getElementById('uploadBtn');
    const mergeOption = document.getElementById('mergeOption').value;
    
    // Validation
    const errors = [];
    
    if (!fileInput.files || fileInput.files.length === 0) {
        errors.push('Please select at least one file');
    }
    
    if (!examDate) {
        errors.push('Please select an exam date');
    } else {
        const selectedDate = new Date(examDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
            errors.push('Exam date cannot be in the past');
        }
    }
    
    // Validate each file
    if (fileInput.files) {
        for (let file of fileInput.files) {
            if (!validateFileType(file)) {
                errors.push(`"${file.name}" - Only PDF, DOCX, and TXT files are allowed`);
            }
            if (!validateFileSize(file, 20)) {
                errors.push(`"${file.name}" - File size exceeds 20MB limit`);
            }
        }
    }
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    
    const originalText = uploadBtn.textContent;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
        if (fileInput.files.length === 1 || mergeOption === 'separate') {
            let successCount = 0;
            const totalFiles = fileInput.files.length;
            
            for (let i = 0; i < fileInput.files.length; i++) {
                uploadBtn.textContent = `Uploading ${i + 1}/${totalFiles}...`;
                
                const formData = new FormData();
                formData.append('file', fileInput.files[i]);
                formData.append('examDate', examDate);

                const response = await fetch(`${API_URL}/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${userToken}`
                    },
                    body: formData
                });

                const data = await response.json();
                if (data.success) {
                    successCount++;
                }
            }
            
            if (successCount === fileInput.files.length) {
                showAlert(`✓ Successfully uploaded ${successCount} file(s)!`, 'success');
            } else {
                showAlert(`⚠ Uploaded ${successCount} of ${totalFiles} files`, 'warning');
            }
        } else {
            uploadBtn.textContent = 'Merging and uploading...';
            
            const formData = new FormData();
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append('files', fileInput.files[i]);
            }
            formData.append('examDate', examDate);

            const response = await fetch(`${API_URL}/upload/upload-merged`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                showAlert(`✓ Files merged and uploaded successfully! (${data.fileCount} files combined)`, 'success');
            } else {
                showAlert(data.error || 'Upload failed', 'error');
            }
        }

        // Reset form
        fileInput.value = '';
        document.getElementById('fileNames').innerHTML = '';
        document.getElementById('examDate').value = '';
        document.getElementById('mergeOptionsContainer').style.display = 'none';
        
        loadReviewers();
        showAlert('✓ Redirecting to My Materials...', 'info', 2000);
        
        setTimeout(() => {
            document.querySelector('[data-page="materials"]').click();
        }, 2000);

    } catch (error) {
        showAlert('Network error: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}, 2000); // 2 second throttle

// ===== IMPORT QUIZ =====
function updateImportExample() {
    const quizType = document.getElementById('importQuizType').value;
    const exampleDiv = document.getElementById('importExample');
    
    const examples = {
        'multiple-choice': `<h4>Format Example (Multiple Choice):</h4>
<pre>1. What is the powerhouse of the cell?
A) Nucleus
B) Mitochondria
C) Ribosome
D) Golgi apparatus
Answer: B

2. What is H2O?
A) Hydrogen
B) Oxygen
C) Water
D) Carbon dioxide
Correct: C</pre>`,
        'identification': `<h4>Format Example (Identification):</h4>
<pre>Q: The _____ is the largest organ in the human body.
A: skin

Q: The capital of France is _____.
A: Paris</pre>`,
        'true-false': `<h4>Format Example (True or False):</h4>
<pre>Statement: The Earth is flat.
Answer: False

Statement: Water boils at 100°C at sea level.
Answer: True</pre>`,
        'enumeration': `<h4>Format Example (Enumeration):</h4>
<pre>Q: List the three states of matter.
A: solid, liquid, gas

Q: Name the primary colors.
A: red, blue, yellow</pre>`,
        'association': `<h4>Format Example (Association):</h4>
<pre>1. All of the following are capital cities EXCEPT:
A) Paris
B) London
C) New York
D) Tokyo
Answer: C

2. Which does NOT belong to the group?
A) Apple
B) Banana
C) Carrot
D) Orange
Answer: C

3. Statement 1: Earth revolves around Sun
   Statement 2: Moon revolves around Earth
A) If statement 1 is true
B) If statement 2 is true
C) If both are true
D) If neither is true
Answer: C</pre>`
    };
    
    exampleDiv.innerHTML = examples[quizType] || examples['multiple-choice'];
}

const importQuiz = throttle(function() {
    const title = document.getElementById('importTitle').value.trim();
    const quizType = document.getElementById('importQuizType').value;
    const questionsText = document.getElementById('importQuestions').value.trim();
    
    // Validation
    const errors = [];
    
    if (!title) {
        errors.push('Quiz title is required');
    } else if (title.length < 3) {
        errors.push('Quiz title must be at least 3 characters');
    }
    
    if (!questionsText) {
        errors.push('Questions text is required');
    } else if (questionsText.length < 20) {
        errors.push('Please provide more detailed questions (minimum 20 characters)');
    }
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    
    saveImportedQuizToDatabase(title, quizType, questionsText, 'mix');
}, 2000);

async function saveImportedQuizToDatabase(title, type, questionsText, associationType = 'mix') {
    const importBtn = document.getElementById('importBtn');
    const originalText = importBtn.textContent;
    importBtn.disabled = true;
    importBtn.textContent = 'Parsing with AI...';
    
    try {
        const response = await fetch(`${API_URL}/imported-quiz`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                title: title,
                type: type,
                questionsText: questionsText,
                associationType: associationType
            })
        });

        const data = await response.json();

        if (data.success) {
            showAlert(`Quiz "${title}" imported successfully with ${data.questionCount} questions!`);
            
            document.getElementById('importTitle').value = '';
            document.getElementById('importQuestions').value = '';
            
            await loadImportedQuizzes();
            
            document.querySelector('[data-page="materials"]').click();
        } else {
            showAlert(data.error || 'Failed to import quiz', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showAlert('Network error: ' + error.message, 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.textContent = originalText;
    }
}

// ===== LOAD REVIEWERS & IMPORTED QUIZZES =====
async function loadImportedQuizzes() {
    if (!userToken) return;
    
    try {
        const response = await fetch(`${API_URL}/imported-quiz`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        const data = await response.json();
        
        if (data.success) {
            importedQuizzes = data.quizzes;
        }
    } catch (error) {
        console.error('Failed to load imported quizzes:', error);
    }
}

async function loadReviewers() {
    const listContainer = document.getElementById('reviewersList');
    listContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p class="loading-text">Loading your materials...</p></div>';

    try {
        const response = await fetch(`${API_URL}/reviewer`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        const data = await response.json();

        // Sort uploaded materials by exam date (earliest first)
        let uploadedMaterials = [];
        if (data.success && data.reviewers.length > 0) {
            uploadedMaterials = data.reviewers.sort((a, b) => {
                return new Date(a.examDate) - new Date(b.examDate);
            });
        }

        // Sort imported quizzes by upload date (newest first)
        let importedMaterials = [...importedQuizzes].sort((a, b) => {
            return new Date(b.uploadDate) - new Date(a.uploadDate);
        });

        // Check if we have any materials
        if (uploadedMaterials.length === 0 && importedMaterials.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📚</div>
                    <h3>No Materials Yet</h3>
                    <p>Upload your first study file or import a quiz to begin!</p>
                </div>
            `;
            return;
        }

        // Helper function to check if exam date is within 7 days
        const isExamUrgent = (examDate) => {
            const today = new Date();
            const exam = new Date(examDate);
            const diffTime = exam - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7 && diffDays >= 0;
        };

        // Build uploaded materials HTML
        let uploadedHTML = '';
        if (uploadedMaterials.length > 0) {
            uploadedHTML = uploadedMaterials.map(reviewer => {
                const isUrgent = isExamUrgent(reviewer.examDate);
                return `
                    <div class="material-card">
                        <div class="material-header">
                            <div class="material-icon">📄</div>
                            <div class="material-info">
                                <h3>${reviewer.fileName}</h3>
                                <p>💾 ${(reviewer.fileSize / 1024).toFixed(2)} KB • ${reviewer.textLength} characters</p>
                                <span class="exam-date-badge ${isUrgent ? 'urgent' : ''}">
                                    📅 Exam: ${new Date(reviewer.examDate).toLocaleDateString()}
                                    ${isUrgent ? ' • SOON!' : ''}
                                </span>
                            </div>
                        </div>
                        <div class="material-actions">
                            <button class="btn-start" onclick="startQuiz('${reviewer.id}')">Start Quiz</button>
                            <button class="btn-delete" onclick="deleteReviewer('${reviewer.id}')">Delete</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            uploadedHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <div class="empty-icon" style="font-size: 48px; margin-bottom: 10px;">📄</div>
                    <h3 style="font-size: 18px; margin-bottom: 5px;">No Uploaded Materials</h3>
                    <p style="font-size: 14px; color: var(--text-muted);">Upload study files to generate AI quizzes</p>
                </div>
            `;
        }

        // Build imported quizzes HTML
        let importedHTML = '';
        if (importedMaterials.length > 0) {
            importedHTML = importedMaterials.map(quiz => `
                <div class="material-card">
                    <div class="material-header">
                        <div class="material-icon">📚</div>
                        <div class="material-info">
                            <h3>${quiz.title}</h3>
                            <p>📝 ${quiz.type.replace('-', ' ').toUpperCase()} • ${quiz.questions.length} questions</p>
                        </div>
                    </div>
                    <div class="material-actions">
                        <button class="btn-start" onclick="startImportedQuiz('${quiz.id}')">Start Quiz</button>
                        <button class="btn-delete" onclick="deleteImportedQuiz('${quiz.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            importedHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <div class="empty-icon" style="font-size: 48px; margin-bottom: 10px;">📚</div>
                    <h3 style="font-size: 18px; margin-bottom: 5px;">No Imported Quizzes</h3>
                    <p style="font-size: 14px; color: var(--text-muted);">Import pre-made quizzes to practice</p>
                </div>
            `;
        }

        // Combine into two-column layout
        listContainer.innerHTML = `
            <div class="materials-wrapper">
                <div class="materials-column">
                    <div class="materials-column-header">
                        <div class="materials-column-icon">📄</div>
                        <h2>Uploaded Materials <span style="color: var(--text-muted); font-weight: 400; font-size: 16px;">(${uploadedMaterials.length})</span></h2>
                    </div>
                    <div class="materials-grid">
                        ${uploadedHTML}
                    </div>
                </div>
                
                <div class="materials-column">
                    <div class="materials-column-header">
                        <div class="materials-column-icon">📚</div>
                        <h2>Imported Quizzes <span style="color: var(--text-muted); font-weight: 400; font-size: 16px;">(${importedMaterials.length})</span></h2>
                    </div>
                    <div class="materials-grid">
                        ${importedHTML}
                    </div>
                </div>
            </div>
        `;

    } catch (error) {
        listContainer.innerHTML = '<div class="empty-state"><p style="color: var(--error);">Failed to load materials</p></div>';
        showAlert('Failed to load reviewers: ' + error.message, 'error');
    }
}

// ===== START IMPORTED QUIZ =====
function startImportedQuiz(quizId) {
    const quiz = importedQuizzes.find(q => q.id === quizId);
    if (!quiz) {
        showAlert('Quiz not found', 'error');
        return;
    }
    
    currentQuestions = quiz.questions;
    quizSubmitted = false;
    showQuizPage();
    
    const quizTitle = document.getElementById('quizTitle');
    const quizContent = document.getElementById('quizContent');
    
    quizTitle.textContent = quiz.title;
    
    if (quiz.type === 'multiple-choice' || quiz.type === 'association') {
        quizContent.innerHTML = displayImportedMultipleChoice(quiz.questions);
    } else if (quiz.type === 'identification') {
        quizContent.innerHTML = displayImportedIdentification(quiz.questions);
    } else if (quiz.type === 'true-false') {
        quizContent.innerHTML = displayImportedTrueFalse(quiz.questions);
    } else if (quiz.type === 'enumeration') {
        quizContent.innerHTML = displayImportedEnumeration(quiz.questions);
    }
}

function displayImportedMultipleChoice(questions) {
    return questions.map((q, idx) => `
        <div class="question-card">
            <span class="question-number">Question ${idx + 1}</span>
            <div class="question-text">${q.question}</div>
            ${q.options.map(opt => `
                <div class="option" onclick="selectOption(this, ${idx + 1})">${opt}</div>
            `).join('')}
            <div class="explanation" id="explain-${idx + 1}">
                <strong>Correct Answer:</strong> ${q.correctAnswer}
            </div>
        </div>
    `).join('');
}

function displayImportedIdentification(questions) {
    return questions.map((q, idx) => `
        <div class="question-card">
            <span class="question-number">Question ${idx + 1}</span>
            <div class="question-text">${q.question}</div>
            <input type="text" class="form-control" id="answer-${idx + 1}" placeholder="Type your answer here">
            <div class="explanation" id="explain-${idx + 1}">
                <strong>Correct Answer:</strong> ${q.answer}
            </div>
        </div>
    `).join('');
}

function displayImportedTrueFalse(questions) {
    return questions.map((q, idx) => `
        <div class="question-card">
            <span class="question-number">Statement ${idx + 1}</span>
            <div class="question-text">${q.statement}</div>
            <div class="option" onclick="selectOption(this, ${idx + 1})">True</div>
            <div class="option" onclick="selectOption(this, ${idx + 1})">False</div>
            <div class="explanation" id="explain-${idx + 1}">
                <strong>Correct Answer:</strong> ${q.answer}
            </div>
        </div>
    `).join('');
}

function displayImportedEnumeration(questions) {
    return questions.map((q, idx) => `
        <div class="question-card">
            <span class="question-number">Question ${idx + 1}</span>
            <div class="question-text">${q.question}</div>
            <textarea class="form-control" id="answer-${idx + 1}" rows="3" placeholder="Enter items separated by commas"></textarea>
            <small style="color: var(--text-muted); margin-top: 8px; display: block;">Separate multiple answers with commas (e.g., red, blue, yellow)</small>
            <div class="explanation" id="explain-${idx + 1}">
                <strong>Correct Answer:</strong> ${q.answer}
            </div>
        </div>
    `).join('');
}

function deleteImportedQuiz(quizId) {
    if (!confirm('Are you sure you want to delete this imported quiz?')) {
        return;
    }
    
    deleteImportedQuizFromDatabase(quizId);
}

async function deleteImportedQuizFromDatabase(quizId) {
    try {
        const response = await fetch(`${API_URL}/imported-quiz/${quizId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Imported quiz deleted successfully');
            await loadImportedQuizzes();
            loadReviewers();
        } else {
            showAlert(data.error || 'Failed to delete quiz', 'error');
        }
    } catch (error) {
        showAlert('Network error: ' + error.message, 'error');
    }
}

// ===== MULTI-SELECT QUIZ TYPE HANDLER =====
function toggleQuizType(button) {
    const type = button.getAttribute('data-type');
    
    // If flashcard is clicked
    if (type === 'flashcard') {
        // Deselect all others
        document.querySelectorAll('.quiz-type-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        // Select only flashcard
        button.classList.add('selected');
        selectedQuizTypes = ['flashcard'];
    }
    // If flashcard is already selected and user clicks another type
    else if (selectedQuizTypes.includes('flashcard')) {
        // Remove flashcard
        selectedQuizTypes = selectedQuizTypes.filter(t => t !== 'flashcard');
        document.querySelector('.quiz-type-btn[data-type="flashcard"]').classList.remove('selected');
        // Add the new type
        button.classList.add('selected');
        selectedQuizTypes.push(type);
    }
    // Normal toggle behavior
    else {
        if (button.classList.contains('selected')) {
            button.classList.remove('selected');
            selectedQuizTypes = selectedQuizTypes.filter(t => t !== type);
        } else {
            button.classList.add('selected');
            selectedQuizTypes.push(type);
        }
    }
    
    // Update counter
    const quizTypesContainer = document.querySelector('.quiz-types');
    quizTypesContainer.setAttribute('data-selected', selectedQuizTypes.length);
    
    // Show/hide True/False dropdown
    const modalTrueFalseGroup = document.getElementById('modalTrueFalseGroup');
    if (selectedQuizTypes.includes('true-false')) {
        modalTrueFalseGroup.style.display = 'block';
    } else {
        modalTrueFalseGroup.style.display = 'none';
    }
}

// ===== START QUIZ =====
// ===== LEARN MODE =====
async function startLearnMode() {
    if (!currentReviewerId) {
        showAlert('No material selected', 'error');
        return;
    }
    
    currentLearnReviewerId = currentReviewerId;
    closeModal();
    showQuizPage();
    
    const quizTitle = document.getElementById('quizTitle');
    const quizContent = document.getElementById('quizContent');
    
    quizTitle.textContent = 'Learn Mode';
    
    // Get reviewer data
    try {
        const response = await fetch(`${API_URL}/reviewer/${currentLearnReviewerId}`, {
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });
        const data = await response.json();
        
        const materialName = data.reviewer ? data.reviewer.fileName : 'your study material';
        
        learnMessages = [{
            role: 'assistant',
            content: `Hi! I'm here to help you learn from "${materialName}". Ask me anything about the content, request explanations, or discuss any topic from your material!`
        }];
        
        renderLearnMode();
    } catch (error) {
        console.error('Error loading material:', error);
        learnMessages = [{
            role: 'assistant',
            content: "Hi! I'm here to help you learn. Ask me anything about your study material!"
        }];
        renderLearnMode();
    }
    
    document.getElementById('submitBtn').style.display = 'none';
}

function renderLearnMode() {
    const quizContent = document.getElementById('quizContent');
    
    quizContent.innerHTML = `
        <div id="learnChatContainer" class="chat">
            <div class="chat-title">
                <h1>Learn Mode</h1>
                <h2>AI Study Assistant</h2>
                <figure class="avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                </figure>
            </div>
            <div class="messages">
                <div class="messages-content" id="learnMessages">
                    ${learnMessages.map((msg, idx) => `
                        <div class="message ${msg.role === 'user' ? 'message-personal' : ''} new">
                            ${msg.role === 'assistant' ? `
                                <figure class="avatar">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                </figure>
                            ` : ''}
                            ${msg.content}
                            <div class="timestamp">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="message-box">
                <textarea class="message-input" id="learnInput" placeholder="Ask questions about your study material! :) "></textarea>
                <button type="submit" class="message-submit" id="sendLearnBtn">Send</button>
            </div>
        </div>
    `;
    
    // Auto-scroll to bottom
    setTimeout(() => {
        const messagesDiv = document.getElementById('learnMessages');
        if (messagesDiv) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }, 100);
    
    // Add enter key handler
    const input = document.getElementById('learnInput');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendLearnMessage();
            }
        });
    }
}

async function sendLearnMessage() {
    const input = document.getElementById('learnInput');
    const sendBtn = document.getElementById('sendLearnBtn');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    learnMessages.push({ role: 'user', content: message });
    input.value = '';
    
    // Add loading message before re-rendering
    const messagesContent = document.getElementById('learnMessages');
    if (messagesContent) {
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'message loading new';
        loadingMsg.innerHTML = `
            <figure class="avatar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            </figure>
            <span></span>
        `;
        messagesContent.appendChild(loadingMsg);
        messagesContent.scrollTop = messagesContent.scrollHeight;
    }
    
    // Disable input while processing
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Thinking...';
    
    try {
        const response = await fetch(`${API_URL}/learn`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                message: message,
                reviewerId: currentLearnReviewerId,
                conversationHistory: learnMessages
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            learnMessages.push({ role: 'assistant', content: data.response });
            renderLearnMode();
        } else {
            showAlert('Failed to get response', 'error');
        }
    } catch (error) {
        console.error('Learn mode error:', error);
        showAlert('Network error', 'error');
    } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        const newInput = document.getElementById('learnInput');
        if (newInput) newInput.focus();
    }
}

function startQuiz(reviewerId) {
    currentReviewerId = reviewerId;
    selectedQuizTypes = [];
    quizSubmitted = false;
    
    document.querySelectorAll('.quiz-type-btn').forEach(btn => {
        btn.classList.remove('selected');
        
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleQuizType(this);
        });
    });
    
    // Reset counter
    const quizTypesContainer = document.querySelector('.quiz-types');
    quizTypesContainer.setAttribute('data-selected', '0');
    
    document.getElementById('questionCount').value = '10';
    document.getElementById('specialInstructions').value = '';
    
    // Hide True/False dropdown by default
    const modalTrueFalseGroup = document.getElementById('modalTrueFalseGroup');
    if (modalTrueFalseGroup) {
        modalTrueFalseGroup.style.display = 'none';
    }
    
    openModal();
}

function openModal() {
    document.getElementById('quizModal').classList.add('active');
}

function closeModal() {
    document.getElementById('quizModal').classList.remove('active');
}

const generateWithSettings = throttle(async function() {
    // Validation
    const errors = [];
    
    if (selectedQuizTypes.length === 0) {
        errors.push('Please select at least one quiz type');
    }

    const count = document.getElementById('questionCount').value;
    if (!count || count < 1) {
        errors.push('Please specify number of questions (minimum 1)');
    } else if (count > 50) {
        errors.push('Maximum 50 questions allowed');
    }
    
    if (errors.length > 0) {
        showValidationErrors(errors);
        return;
    }
    
    showAlert('🔄 Generating your quiz...', 'info', 3000);
    
    const instructions = document.getElementById('specialInstructions').value.trim();
    
    let trueFalseVariant = 'traditional';
    
    if (selectedQuizTypes.includes('true-false')) {
        trueFalseVariant = document.getElementById('modalTrueFalseType').value;
    }
    
    const typesToGenerate = [...selectedQuizTypes];
    
    const requestBody = {
        reviewerId: currentReviewerId,
        questionTypes: typesToGenerate,
        count: parseInt(count),
        specialInstructions: instructions,
        trueFalseVariant: trueFalseVariant
    };
    
    closeModal();
    showQuizPage();

    const quizContent = document.getElementById('quizContent');
    const quizTitle = document.getElementById('quizTitle');

    quizContent.innerHTML = '<div class="loading"><div class="spinner"></div><p class="loading-text">AI is generating your personalized quiz...</p></div>';
    quizTitle.textContent = `Generating ${typesToGenerate.length} type(s) of quiz...`;

    try {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.success) {
            quizTitle.textContent = `Mixed Quiz (${typesToGenerate.join(', ')})`;
            displayQuestions(data.questions, typesToGenerate);
            showAlert('✓ Quiz generated successfully!', 'success');
        } else {
            quizContent.innerHTML = `<p style="color: var(--error); text-align: center;">Failed to generate questions: ${data.error}</p>`;
            showAlert('Failed to generate quiz', 'error');
        }
    } catch (error) {
        quizContent.innerHTML = `<p style="color: var(--error); text-align: center;">Network error: ${error.message}</p>`;
        showAlert('Network error occurred', 'error');
    }
    
    selectedQuizTypes = [];
}, 3000); // 3 second throttle

// ===== DISPLAY QUESTIONS (MIXED TYPES) =====
function displayQuestions(questionsText, questionTypes) {
    console.log('=== GENERATED TEXT START ===');
    console.log(questionsText);
    console.log('=== GENERATED TEXT END ===');
    console.log('Question Types:', questionTypes);
    
    const quizContent = document.getElementById('quizContent');
    currentQuestions = [];
    
    // Handle flashcards separately (exclusive)
    if (questionTypes.includes('flashcard')) {
        displayFlashcards(questionsText);
        document.getElementById('submitBtn').style.display = 'none';
        return;
    }

    const lines = questionsText.split('\n').filter(line => line.trim());
    let html = '';
    let questionNum = 1;
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        
        // ==========================================
        // PRIORITY 1: CASE STUDY (before Q: catches it)
        // ==========================================
        if (line.startsWith('Case:')) {
            const caseText = line.substring(5).trim();
            const nextLine = lines[i + 1];
            
            if (nextLine && nextLine.startsWith('Q:')) {
                const question = nextLine.substring(2).trim();
                let options = [];
                let correctAnswer = '';
                let answerLineIndex = -1;
                
                // Check if it has options (multiple choice format that needs conversion)
                for (let j = i + 2; j < Math.min(i + 10, lines.length); j++) {
                    const checkLine = lines[j].trim();
                    
                    if (checkLine.match(/^[A-D]\)/)) {
                        options.push(checkLine);
                    } else if (checkLine.startsWith('Correct:') || checkLine.startsWith('Answer:')) {
                        correctAnswer = checkLine.split(':')[1].trim();
                        answerLineIndex = j;
                        break;
                    }
                }
                
                // Convert multiple choice case study to text answer format
                if (options.length >= 4 && correctAnswer && answerLineIndex !== -1) {
                    const correctLetter = correctAnswer.charAt(0);
                    const correctOption = options.find(opt => opt.startsWith(correctLetter));
                    const modelAnswer = correctOption ? correctOption.substring(3).trim() : correctAnswer;
                    
                    currentQuestions.push({
                        case: caseText,
                        question,
                        answer: modelAnswer,
                        type: 'case-study'
                    });
                    
                    html += `
                        <div class="question-card case-study-card">
                            <span class="question-number">Case Study ${questionNum}</span>
                            <div class="case-scenario">
                                <strong>Scenario:</strong>
                                <p>${caseText}</p>
                            </div>
                            <div class="question-text">${question}</div>
                            <textarea class="form-control case-answer" id="answer-${questionNum}" rows="4" placeholder="Type your answer based on the scenario..."></textarea>
                            <small style="color: var(--text-muted); margin-top: 8px; display: block;">Provide a thoughtful response. AI will evaluate your answer.</small>
                            <div class="explanation" id="explain-${questionNum}">
                                <strong>Model Answer:</strong> ${modelAnswer}
                            </div>
                        </div>
                    `;
                    questionNum++;
                    i = answerLineIndex + 1;
                    continue;
                }
            }
            i++;
        }
        // CASE STUDY: New format with "Scenario:"
        else if (line.startsWith('Scenario:')) {
            const scenario = line.substring(9).trim();
            const questionLine = lines[i + 1];
            const answerLine = lines[i + 2];
            
            if (questionLine && questionLine.startsWith('Question:') && answerLine && answerLine.startsWith('ModelAnswer:')) {
                const question = questionLine.substring(9).trim();
                const answer = answerLine.substring(12).trim();
                
                currentQuestions.push({
                    case: scenario,
                    question,
                    answer,
                    type: 'case-study'
                });
                
                html += `
                    <div class="question-card case-study-card">
                        <span class="question-number">Case Study ${questionNum}</span>
                        <div class="case-scenario">
                            <strong>Scenario:</strong>
                            <p>${scenario}</p>
                        </div>
                        <div class="question-text">${question}</div>
                        <textarea class="form-control case-answer" id="answer-${questionNum}" rows="4" placeholder="Type your answer based on the scenario..."></textarea>
                        <small style="color: var(--text-muted); margin-top: 8px; display: block;">Provide a thoughtful response. AI will evaluate your answer.</small>
                        <div class="explanation" id="explain-${questionNum}">
                            <strong>Model Answer:</strong> ${answer}
                        </div>
                    </div>
                `;
                questionNum++;
                i += 3;
                continue;
            }
            i++;
        }
        
        // ==========================================
        // PRIORITY 2: ASSOCIATION (before Q: catches it)
        // ==========================================
        // Format: Q: [statement] \n a. [item] \n b. [item]
        else if (line.startsWith('Q:') && lines[i + 1]?.startsWith('a.') && lines[i + 2]?.startsWith('b.')) {
            const statement = line.substring(2).trim();
            const itemA = lines[i + 1].substring(2).trim();
            const itemB = lines[i + 2].substring(2).trim();
            let correctAnswer = '';
            let answerLineIndex = -1;
            
            // Look for the answer
            for (let j = i + 3; j < Math.min(i + 10, lines.length); j++) {
                const nextLine = lines[j].trim();
                if (nextLine.startsWith('Correct:') || nextLine.startsWith('Answer:')) {
                    correctAnswer = nextLine.split(':')[1].trim();
                    answerLineIndex = j;
                    break;
                }
            }
            
            if (correctAnswer && answerLineIndex !== -1) {
                // Standard association options (converting a/b to I/II)
                const options = [
                    'A) If "I" is associated with the statement',
                    'B) If "II" is associated with the statement',
                    'C) If both are associated with the statement',
                    'D) Neither are associated with the statement'
                ];
                
                const fullQuestion = `${statement}\nI. ${itemA}\nII. ${itemB}`;
                
                currentQuestions.push({ 
                    question: fullQuestion,
                    options, 
                    correctAnswer, 
                    type: 'association' 
                });
                
                html += `
                    <div class="question-card association-card">
                        <span class="question-number">Association ${questionNum}</span>
                        <div class="association-statement">
                            <strong>Statement:</strong> ${statement}
                        </div>
                        <div class="association-items">
                            <div class="association-item"><strong>I.</strong> ${itemA}</div>
                            <div class="association-item"><strong>II.</strong> ${itemB}</div>
                        </div>
                        <div class="question-text" style="font-size: 15px; margin-top: 16px; margin-bottom: 12px;">Which option is correct?</div>
                        ${options.map(opt => `
                            <div class="option" onclick="selectOption(this, ${questionNum})">${opt}</div>
                        `).join('')}
                        <div class="explanation" id="explain-${questionNum}">
                            <strong>Correct Answer:</strong> ${correctAnswer}
                        </div>
                    </div>
                `;
                questionNum++;
                i = answerLineIndex + 1;
                continue;
            }
            i++;
        }
        // ASSOCIATION: New format with "Statement:" and Roman numerals
        else if (line.startsWith('Statement:') && !lines[i + 1]?.startsWith('Answer:')) {
            const statement = line.substring(10).trim();
            let item1 = '';
            let item2 = '';
            let options = [];
            let correctAnswer = '';
            let answerLineIndex = -1;
            
            // Look for items and options
            for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                const nextLine = lines[j].trim();
                
                if (nextLine.startsWith('I.')) {
                    item1 = nextLine.substring(2).trim();
                } else if (nextLine.startsWith('II.')) {
                    item2 = nextLine.substring(3).trim();
                } else if (nextLine.match(/^[A-D]\)/)) {
                    options.push(nextLine);
                } else if (nextLine.startsWith('Correct:') || nextLine.startsWith('Answer:')) {
                    correctAnswer = nextLine.split(':')[1].trim();
                    answerLineIndex = j;
                    break;
                }
            }
            
            // If we have all components, it's association
            if (item1 && item2 && options.length === 4 && correctAnswer && answerLineIndex !== -1) {
                const fullQuestion = `${statement}\nI. ${item1}\nII. ${item2}`;
                
                currentQuestions.push({ 
                    question: fullQuestion,
                    options, 
                    correctAnswer, 
                    type: 'association' 
                });
                
                html += `
                    <div class="question-card association-card">
                        <span class="question-number">Association ${questionNum}</span>
                        <div class="association-statement">
                            <strong>Statement:</strong> ${statement}
                        </div>
                        <div class="association-items">
                            <div class="association-item"><strong>I.</strong> ${item1}</div>
                            <div class="association-item"><strong>II.</strong> ${item2}</div>
                        </div>
                        <div class="question-text" style="font-size: 15px; margin-top: 16px; margin-bottom: 12px;">Which option is correct?</div>
                        ${options.map(opt => `
                            <div class="option" onclick="selectOption(this, ${questionNum})">${opt}</div>
                        `).join('')}
                        <div class="explanation" id="explain-${questionNum}">
                            <strong>Correct Answer:</strong> ${correctAnswer}
                        </div>
                    </div>
                `;
                questionNum++;
                i = answerLineIndex + 1;
                continue;
            }
            i++;
        }
        
        // ==========================================
        // PRIORITY 3: TRUE/FALSE
        // ==========================================
        else if (line.startsWith('Statement:')) {
            const statement = line.substring(10).trim();
            const answerLine = lines[i + 1];
            const explanationLine = lines[i + 2];
            
            // Check if it's True/False (has Answer: immediately after Statement:)
            if (answerLine && answerLine.startsWith('Answer:')) {
                const answer = answerLine.substring(7).trim();
                const explanation = explanationLine && explanationLine.startsWith('Explanation:') 
                    ? explanationLine.substring(12).trim() 
                    : '';
                
                currentQuestions.push({ 
                    statement, 
                    answer, 
                    explanation, 
                    type: 'true-false' 
                });
                
                html += `
                    <div class="question-card">
                        <span class="question-number">Statement ${questionNum}</span>
                        <div class="question-text">${statement}</div>
                        <div class="option" onclick="selectOption(this, ${questionNum})">True</div>
                        <div class="option" onclick="selectOption(this, ${questionNum})">False</div>
                        <div class="explanation" id="explain-${questionNum}">
                            <strong>Correct Answer:</strong> ${answer}<br>
                            ${explanation ? `<strong>Explanation:</strong> ${explanation}` : ''}
                        </div>
                    </div>
                `;
                questionNum++;
                i += explanation ? 3 : 2;
                continue;
            }
            i++;
        }
        
        // ==========================================
        // PRIORITY 4: MATCHING TYPE
        // ==========================================
        else if (line.startsWith('Column A |')) {
            let pairs = [];
            let j = i + 1;
            
            // Collect all matching pairs
            while (j < lines.length && lines[j].includes('|')) {
                const parts = lines[j].split('|').map(p => p.trim());
                if (parts.length === 2 && !parts[0].includes('Column')) {
                    pairs.push({ left: parts[0], right: parts[1] });
                    j++;
                } else {
                    break;
                }
            }
            
            if (pairs.length > 0) {
                currentQuestions.push({
                    type: 'matching',
                    pairs: pairs
                });
                
                const shuffledRight = [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5);
                
                html += `
                    <div class="question-card matching-card" data-question-num="${questionNum}" data-complete="false">
                        <span class="question-number">Matching Type ${questionNum}</span>
                        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">Match items from Column A with their corresponding items in Column B</p>
                        <div class="matching-container-inline">
                            <div class="matching-column">
                                <h4>Column A</h4>
                                ${pairs.map((p, idx) => `
                                    <div class="matching-item" data-col="1" data-idx="${idx}" onclick="selectMatching(this, ${questionNum})">
                                        ${p.left}
                                    </div>
                                `).join('')}
                            </div>
                            <div class="matching-column">
                                <h4>Column B</h4>
                                ${shuffledRight.map((item) => `
                                    <div class="matching-item" data-col="2" data-value="${item}" onclick="selectMatching(this, ${questionNum})">
                                        ${item}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="matching-status" id="matching-status-${questionNum}">Matched 0 of ${pairs.length}</div>
                    </div>
                `;
                questionNum++;
                i = j;
                continue;
            }
        }
        
        // ==========================================
        // PRIORITY 5: ENUMERATION
        // ==========================================
        else if (line.match(/^Q:.*list|name|enumerate|states|identify|give/i) && lines[i + 1]?.startsWith('A:')) {
            const question = line.substring(2).trim();
            const answer = lines[i + 1].substring(2).trim();
            
            currentQuestions.push({ 
                question, 
                answer, 
                type: 'enumeration' 
            });
            
            html += `
                <div class="question-card">
                    <span class="question-number">Question ${questionNum}</span>
                    <div class="question-text">${question}</div>
                    <textarea class="form-control" id="answer-${questionNum}" rows="3" placeholder="Enter items separated by commas"></textarea>
                    <small style="color: var(--text-muted); margin-top: 8px; display: block;">Separate multiple answers with commas</small>
                    <div class="explanation" id="explain-${questionNum}">
                        <strong>Correct Answer:</strong> ${answer}
                    </div>
                </div>
            `;
            questionNum++;
            i += 2;
            continue;
        }
        
        // ==========================================
        // PRIORITY 6: MULTIPLE CHOICE (runs after everything else)
        // ==========================================
        else if (line.startsWith('Q:')) {
            const question = line.substring(2).trim();
            let options = [];
            let correctAnswer = '';
            let answerLineIndex = -1;
            
            // Look for options and answer
            for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                const nextLine = lines[j].trim();
                
                if (nextLine.match(/^[A-D]\)/)) {
                    options.push(nextLine);
                }
                
                if (nextLine.startsWith('Correct:') || nextLine.startsWith('Answer:')) {
                    correctAnswer = nextLine.split(':')[1].trim();
                    answerLineIndex = j;
                    break;
                }
            }
            
            // If we have 4 options AND an answer, it's multiple choice
            if (options.length === 4 && correctAnswer && answerLineIndex !== -1) {
                currentQuestions.push({ 
                    question, 
                    options, 
                    correctAnswer, 
                    type: 'multiple-choice' 
                });
                
                html += `
                    <div class="question-card">
                        <span class="question-number">Question ${questionNum}</span>
                        <div class="question-text">${question}</div>
                        ${options.map(opt => `
                            <div class="option" onclick="selectOption(this, ${questionNum})">${opt}</div>
                        `).join('')}
                        <div class="explanation" id="explain-${questionNum}">
                            <strong>Correct Answer:</strong> ${correctAnswer}
                        </div>
                    </div>
                `;
                questionNum++;
                i = answerLineIndex + 1;
                continue;
            }
            
            // === IDENTIFICATION (if no options found) ===
            const nextLine = lines[i + 1];
            if (nextLine && nextLine.startsWith('A:')) {
                const answer = nextLine.substring(2).trim();
                
                currentQuestions.push({ 
                    question, 
                    answer, 
                    type: 'identification' 
                });
                
                html += `
                    <div class="question-card">
                        <span class="question-number">Question ${questionNum}</span>
                        <div class="question-text">${question}</div>
                        <input type="text" class="form-control" id="answer-${questionNum}" placeholder="Type your answer here">
                        <div class="explanation" id="explain-${questionNum}">
                            <strong>Correct Answer:</strong> ${answer}
                        </div>
                    </div>
                `;
                questionNum++;
                i += 2;
                continue;
            }
            
            i++;
        }
        
        else {
            i++;
        }
    }
    
    // Log unparsed lines for debugging
    if (questionNum === 1) {
        console.warn('⚠️ No questions were parsed! Check the AI response format.');
    }
    
    if (html) {
        quizContent.innerHTML = html;
    } else {
        quizContent.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <p style="color: var(--error); font-size: 18px; margin-bottom: 20px;">
                    ⚠️ Could not parse questions from AI response
                </p>
                <p style="color: var(--text-muted); margin-bottom: 20px;">
                    The AI generated text in an unexpected format. Try regenerating the quiz.
                </p>
                <button class="btn-primary" onclick="exitQuiz()">Go Back</button>
            </div>
        `;
    }
}

// ===== AI-POWERED ANSWER CHECKING =====
async function checkAnswerWithAI(userAnswer, correctAnswer, questionText) {
    try {
        const response = await fetch(`${API_URL}/generate/check-answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                questionText: questionText
            })
        });

        const data = await response.json();
        
        if (data.success) {
            return data.isCorrect;
        }
        
        // Fallback to simple check
        return userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
    } catch (error) {
        console.error('AI checking error:', error);
        return userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
    }
}

// ===== AI CHECKING =====
const submitQuiz = throttle(async function() {
    const questions = document.querySelectorAll('.question-card');
    
    if (questions.length === 0) {
        showAlert('No questions to submit', 'error');
        return;
    }
    
    // Check if any questions are unanswered
    let unansweredCount = 0;
    questions.forEach(question => {
        const textInput = question.querySelector('input[type="text"]');
        const textArea = question.querySelector('textarea');
        const selectedOption = question.querySelector('.option.selected');
        const isMatching = question.classList.contains('matching-card');
        
        if (!isMatching && !textInput && !textArea && !selectedOption) {
            unansweredCount++;
        } else if (textInput && !textInput.value.trim()) {
            unansweredCount++;
        } else if (textArea && !textArea.value.trim()) {
            unansweredCount++;
        }
    });
    
    if (unansweredCount > 0) {
        const confirmed = confirm(`You have ${unansweredCount} unanswered question(s). Submit anyway?`);
        if (!confirmed) return;
    }
    
    showAlert('🔍 Checking your answers with AI...', 'info', 3000);
    
    let correct = 0;
    let total = 0;
    
    for (const [idx, question] of Array.from(questions).entries()) {
        total++;

        if (question.classList.contains('matching-card')) {
            const isComplete = question.dataset.complete === 'true';
            if (isComplete) {
                correct++;
                question.style.borderColor = 'var(--success)';
            } else {
                question.style.borderColor = 'var(--error)';
            }
            
            question.querySelectorAll('.matching-item').forEach(item => {
                item.style.pointerEvents = 'none';
                item.style.opacity = '0.7';
            });
            
            continue; 
        }
        
        const textInput = question.querySelector('input[type="text"]');
        if (textInput) {
            const userAnswer = textInput.value.trim();
            const correctAnswer = currentQuestions[idx]?.answer || '';
            const questionText = currentQuestions[idx]?.question || '';
            
            const isCorrect = await checkAnswerWithAI(userAnswer, correctAnswer, questionText);
            
            textInput.style.borderColor = isCorrect ? 'var(--success)' : 'var(--error)';
            textInput.disabled = true;
            
            if (isCorrect) correct++;
        }
        
        const textArea = question.querySelector('textarea');
        if (textArea) {
            const userAnswer = textArea.value.trim();
            const correctAnswer = currentQuestions[idx]?.answer || '';
            const questionText = currentQuestions[idx]?.question || '';
            
            const isCorrect = await checkAnswerWithAI(userAnswer, correctAnswer, questionText);
            
            textArea.style.borderColor = isCorrect ? 'var(--success)' : 'var(--error)';
            textArea.disabled = true;
            
            if (isCorrect) correct++;
        }
        
        const selectedOption = question.querySelector('.option.selected');
        if (selectedOption) {
            const userAnswer = selectedOption.textContent.trim();
            const correctAnswer = currentQuestions[idx]?.correctAnswer || currentQuestions[idx]?.answer || '';
            const isCorrect = userAnswer.charAt(0) === correctAnswer.charAt(0) || userAnswer === correctAnswer;
            
            if (isCorrect) {
                selectedOption.classList.add('correct');
                correct++;
            } else {
                selectedOption.classList.add('incorrect');
            }
        }
    }
    
    if (total > 0) {
        const percentage = ((correct / total) * 100).toFixed(1);
        
        const quizContent = document.getElementById('quizContent');
        const summary = document.createElement('div');
        summary.className = 'results-summary';
        
        let emoji = '🎉';
        let message = '';
        
        if (percentage >= 90) {
            emoji = '🏆';
            message = 'Outstanding! You\'ve mastered this material!';
        } else if (percentage >= 80) {
            emoji = '🎉';
            message = 'Excellent work! You have a strong understanding!';
        } else if (percentage >= 70) {
            emoji = '👍';
            message = 'Good job! Review the explanations to improve further.';
        } else if (percentage >= 60) {
            emoji = '📚';
            message = 'Keep practicing! Check the explanations below.';
        } else {
            emoji = '💪';
            message = 'Don\'t give up! Review and try again.';
        }
        
        summary.innerHTML = `
            <div class="results-emoji">${emoji}</div>
            <h2>Quiz Results</h2>
            <div class="score-display">${correct} / ${total}</div>
            <div class="percentage">${percentage}%</div>
            <p class="results-message">${message}</p>
        `;
        quizContent.insertBefore(summary, quizContent.firstChild);
        summary.scrollIntoView({ behavior: 'smooth' });
        
        document.getElementById('submitBtn').style.display = 'none';
        document.querySelectorAll('.explanation').forEach(exp => exp.classList.add('visible'));
        
        quizSubmitted = true;
        showChatbot();
        
        showAlert(`✓ Quiz submitted! You scored ${percentage}%`, percentage >= 70 ? 'success' : 'warning', 6000);
    }
}, 3000); // 3 second throttle

// ===== CHATBOT FUNCTIONALITY =====
function showChatbot() {
    const existingChatbot = document.getElementById('chatbotContainer');
    if (existingChatbot) {
        existingChatbot.style.display = 'block';
    } else {
        createChatbot();
    }
}

function createChatbot() {
    const chatbotHTML = `
        <div class="chat">
            <div class="chat-title">
                <h1>Study Wizard</h1>
                <figure class="avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                </figure>
            </div>
            <div class="messages">
                <div class="messages-content"></div>
            </div>
            <div class="message-box">
                <textarea class="message-input" placeholder="Type message..." onkeydown="handleChatKeyPress(event)"></textarea>
                <button type="submit" class="message-submit" onclick="sendChatMessage()">Send</button>
            </div>
        </div>
    `;
    
    const quizContainer = document.querySelector('.quiz-container');
    const chatbotContainer = document.createElement('div');
    chatbotContainer.id = 'chatbotContainer';
    chatbotContainer.innerHTML = chatbotHTML;
    quizContainer.appendChild(chatbotContainer);
    
    setTimeout(() => {
        addChatMessage('Hi there, I\'m your Study Wizard!', 'bot');
    }, 300);
    
    setTimeout(() => {
        addChatMessage('Ask me about any questions you got wrong or need clarification on.', 'bot');
    }, 1200);
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage() {
    const input = document.querySelector('.message-input');
    const message = input ? input.value.trim() : '';
    
    if (!message) return;
    
    // Add user message
    addChatMessage(message, 'user');
    input.value = '';
    
    // Adjust textarea height
    input.style.height = '36px';
    
    // Add loading message
    const messagesContent = document.querySelector('.messages-content');
    if (!messagesContent) return;
    
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message loading new';
    loadingMsg.innerHTML = `
        <figure class="avatar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        </figure>
        <span></span>
    `;
    messagesContent.appendChild(loadingMsg);
    updateScrollbar();
    
    try {
        const response = await fetch(`${API_URL}/chatbot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                message: message,
                questions: currentQuestions
            })
        });
        
        const data = await response.json();
        
        // Remove loading message
        loadingMsg.remove();
        
        if (data.success) {
            addChatMessage(data.response, 'bot');
        } else {
            addChatMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }
    } catch (error) {
        console.error('Chat error:', error);
        loadingMsg.remove();
        addChatMessage('Sorry, I could not process your request.', 'bot');
    }
}

function addChatMessage(message, sender) {
    const messagesContent = document.querySelector('.messages-content');
    if (!messagesContent) return;
    
    const messageDiv = document.createElement('div');
    
    if (sender === 'user') {
        messageDiv.className = 'message message-personal new';
        messageDiv.textContent = message;
    } else {
        messageDiv.className = 'message new';
        messageDiv.innerHTML = `
            <figure class="avatar">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
            </figure>
            ${message}
        `;
    }
    
    messagesContent.appendChild(messageDiv);
    setTimestamp(messageDiv);
    updateScrollbar();
}

function setTimestamp(messageElement) {
    const d = new Date();
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = `${hours}:${minutes}`;
    messageElement.appendChild(timestamp);
}

function updateScrollbar() {
    const messagesContent = document.querySelector('.messages-content');
    if (messagesContent) {
        setTimeout(() => {
            messagesContent.scrollTop = messagesContent.scrollHeight;
        }, 50);
    }
}

function toggleChatbot() {
    const chatbot = document.getElementById('chatbotContainer');
    if (chatbot) {
        const chat = chatbot.querySelector('.chat');
        if (chat.classList.contains('minimized')) {
            chat.classList.remove('minimized');
        } else {
            chat.classList.add('minimized');
        }
    }
}

// ===== FLASHCARD FUNCTIONS =====
function displayFlashcards(text) {
    const lines = text.split('\n').filter(line => line.trim());
    currentQuestions = [];
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('Front:')) {
            const front = lines[i].substring(6).trim();
            const back = lines[i + 1] && lines[i + 1].startsWith('Back:') ? lines[i + 1].substring(5).trim() : '';
            currentQuestions.push({ front, back });
        }
    }
    
    currentFlashcardIndex = 0;
    renderFlashcard();
}

function renderFlashcard() {
    if (currentQuestions.length === 0) {
        document.getElementById('quizContent').innerHTML = '<p>No flashcards could be parsed.</p>';
        return;
    }
    
    const card = currentQuestions[currentFlashcardIndex];
    const html = `
        <div class="flashcard-container">
            <div class="book" id="flashcardBook">
                <span class="flashcard-label">ANSWER</span>
                <p>${card.back}</p>
                <div class="cover" id="flashcardCover">
                    <span class="flashcard-label">QUESTION</span>
                    <p>${card.front}</p>
                </div>
            </div>
        </div>
        <div class="flashcard-navigation">
            <button class="nav-btn" onclick="previousCard()" ${currentFlashcardIndex === 0 ? 'disabled' : ''}>←</button>
            <button class="nav-btn" onclick="flipFlashcard()" title="Click to flip">⟲</button>
            <button class="nav-btn" onclick="nextCard()" ${currentFlashcardIndex === currentQuestions.length - 1 ? 'disabled' : ''}>→</button>
        </div>
        <div style="text-align: center;">
            <div class="card-counter">
                Card ${currentFlashcardIndex + 1} of ${currentQuestions.length}
            </div>
        </div>
    `;
    
    document.getElementById('quizContent').innerHTML = html;
    
    const cover = document.getElementById('flashcardCover');
    const book = document.getElementById('flashcardBook');
    
    cover.addEventListener('click', function(e) {
        e.stopPropagation();
        book.classList.toggle('flipped');
    });
    
    book.addEventListener('click', function(e) {
        if (book.classList.contains('flipped') && e.target !== cover && !cover.contains(e.target)) {
            book.classList.toggle('flipped');
        }
    });
}

function flipFlashcard() {
    const book = document.getElementById('flashcardBook');
    book.classList.toggle('flipped');
}

function previousCard() {
    if (currentFlashcardIndex > 0) {
        currentFlashcardIndex--;
        renderFlashcard();
    }
}

function nextCard() {
    if (currentFlashcardIndex < currentQuestions.length - 1) {
        currentFlashcardIndex++;
        renderFlashcard();
    }
}

function selectMatching(element, questionNum) {
    const col = element.dataset.col;
    const card = element.closest('.matching-card');
    
    if (element.classList.contains('matched')) return;
    
    // Get or initialize selections for this specific matching question
    if (!window.matchingSelections) {
        window.matchingSelections = {};
    }
    if (!window.matchingSelections[questionNum]) {
        window.matchingSelections[questionNum] = { 
            column1: null, 
            column2: null,
            matchedPairs: 0,
            totalPairs: card.querySelectorAll('.matching-item[data-col="1"]').length
        };
    }
    
    const selections = window.matchingSelections[questionNum];
    
    if (col === '1') {
        card.querySelectorAll('.matching-item[data-col="1"]').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        selections.column1 = element;
    } else {
        card.querySelectorAll('.matching-item[data-col="2"]').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        selections.column2 = element;
    }
    
    // Check if both selections are made
    if (selections.column1 && selections.column2) {
        const idx = parseInt(selections.column1.dataset.idx);
        const selectedValue = selections.column2.dataset.value;
        
        // Find the matching question data
        const matchingQuestion = currentQuestions.find(q => q.type === 'matching');
        
        if (matchingQuestion && matchingQuestion.pairs && matchingQuestion.pairs[idx]) {
            const correctValue = matchingQuestion.pairs[idx].right;
            
            if (selectedValue === correctValue) {
                selections.column1.classList.add('matched');
                selections.column2.classList.add('matched');
                selections.column1.classList.remove('selected');
                selections.column2.classList.remove('selected');
                selections.matchedPairs++;
                
                const statusDiv = document.getElementById(`matching-status-${questionNum}`);
                if (statusDiv) {
                    statusDiv.textContent = `Matched ${selections.matchedPairs} of ${selections.totalPairs}`;
                    statusDiv.style.color = 'var(--success)';
                }
                
                if (selections.matchedPairs === selections.totalPairs) {
                    card.dataset.complete = 'true';
                    showAlert('All pairs matched correctly!', 'success');
                }
                
                showAlert('Correct match!', 'success');
            } else {
                showAlert('Incorrect match. Try again!', 'error');
                selections.column1.classList.remove('selected');
                selections.column2.classList.remove('selected');
            }
            
            selections.column1 = null;
            selections.column2 = null;
        }
    }
}

function selectOption(element, questionNum) {
    const container = element.parentElement;
    container.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
}

// ===== DELETE FUNCTIONS =====
async function deleteReviewer(reviewerId) {
    if (!confirm('Are you sure you want to delete this study material?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/delete/${reviewerId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showAlert('Study material deleted successfully');
            loadReviewers();
        } else {
            showAlert(data.error || 'Failed to delete', 'error');
        }
    } catch (error) {
        showAlert('Network error: ' + error.message, 'error');
    }
}

function exitQuiz() {
    showAppPage();
    document.querySelector('[data-page="materials"]').click();
    document.getElementById('submitBtn').style.display = 'block';
    currentReviewerId = null;
    quizSubmitted = false;
    
    // Remove chatbot if exists
    const chatbot = document.getElementById('chatbotContainer');
    if (chatbot) {
        chatbot.remove();
    }
}

// ===== MOBILE MENU FUNCTIONS =====
function toggleMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    
    navMenu.classList.toggle('active');
    overlay.classList.toggle('active');
    hamburger.classList.toggle('active');
    
    // Prevent body scroll when menu is open
    if (navMenu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

function closeMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const hamburger = document.getElementById('hamburgerBtn');
    
    navMenu.classList.remove('active');
    overlay.classList.remove('active');
    hamburger.classList.remove('active');
    document.body.style.overflow = '';
}
