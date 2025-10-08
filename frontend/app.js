// app.js - Complete Enhanced Version
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://study-royale.up.railway.app/api';

let currentUser = null;
let currentReviewerId = null;
let selectedQuizTypes = []; // Changed to array for multi-select
let currentQuestions = [];
let userToken = null;
let confirmationResult = null;
let currentFlashcardIndex = 0;
let matchingSelections = { column1: null, column2: null };
let matchedPairs = [];
let importedQuizzes = [];
let quizSubmitted = false;

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
    const isChecked = document.getElementById('switch').checked;
    
    if (isChecked) {
        body.classList.add('light-mode');
    } else {
        body.classList.remove('light-mode');
    }
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

    if (!email || !password) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showAlert('Welcome back!');
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function signup(event) {
    if (event) event.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !password) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showAlert('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        await result.user.updateProfile({ displayName: name });
        showAlert('Account created successfully!');
    } catch (error) {
        showAlert(error.message, 'error');
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

async function sendVerificationCode() {
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const sendBtn = document.getElementById('sendCodeBtn');

    if (!phoneNumber) {
        showAlert('Please enter your phone number', 'error');
        return;
    }

    if (!phoneNumber.startsWith('+')) {
        showAlert('Phone number must include country code (e.g., +63)', 'error');
        return;
    }

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
        
        showAlert('Verification code sent to your phone!');
        document.getElementById('verificationCodeSection').classList.remove('hidden');
        sendBtn.textContent = 'Code Sent!';
        
    } catch (error) {
        console.error('SMS send error:', error);
        if (error.code === 'auth/invalid-phone-number') {
            showAlert('Invalid phone number format', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            showAlert('Too many requests. Please try again later.', 'error');
        } else {
            showAlert('Failed to send code: ' + error.message, 'error');
        }
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Code';
        
        if (window.recaptchaVerifier) {
            window.recaptchaVerifier.clear();
            window.recaptchaVerifier = null;
        }
    }
}

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
function showAlert(message, type = 'success') {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
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

async function uploadFiles() {
    const fileInput = document.getElementById('fileInput');
    const examDate = document.getElementById('examDate').value;
    const uploadBtn = document.getElementById('uploadBtn');
    const mergeOption = document.getElementById('mergeOption').value;

    if (!fileInput.files || fileInput.files.length === 0 || !examDate) {
        showAlert('Please select at least one file and exam date', 'error');
        return;
    }

    for (let file of fileInput.files) {
        if (file.size > 20 * 1024 * 1024) {
            showAlert(`File "${file.name}" exceeds 20MB limit`, 'error');
            return;
        }
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Processing...';

    try {
        if (fileInput.files.length === 1 || mergeOption === 'separate') {
            let successCount = 0;
            for (let i = 0; i < fileInput.files.length; i++) {
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
                showAlert(`${successCount} file(s) uploaded successfully!`);
            } else {
                showAlert(`${successCount} of ${fileInput.files.length} files uploaded`, 'error');
            }
        } else {
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
                showAlert('Files merged and uploaded successfully!');
            } else {
                showAlert(data.error || 'Upload failed', 'error');
            }
        }

        fileInput.value = '';
        document.getElementById('fileNames').innerHTML = '';
        document.getElementById('examDate').value = '';
        document.getElementById('mergeOptionsContainer').style.display = 'none';
        loadReviewers();
        
        document.querySelector('[data-page="materials"]').click();

    } catch (error) {
        showAlert('Network error: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload';
    }
}

// ===== IMPORT QUIZ =====
function updateImportExample() {
    const quizType = document.getElementById('importQuizType').value;
    const exampleDiv = document.getElementById('importExample');
    const associationGroup = document.getElementById('associationTypeGroup');
    
    if (quizType === 'association') {
        associationGroup.style.display = 'block';
    } else {
        associationGroup.style.display = 'none';
    }
    
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

function importQuiz() {
    const title = document.getElementById('importTitle').value.trim();
    const quizType = document.getElementById('importQuizType').value;
    const questionsText = document.getElementById('importQuestions').value.trim();
    
    if (!title || !questionsText) {
        showAlert('Please provide a title and questions', 'error');
        return;
    }
    
    let associationType = 'mix';
    if (quizType === 'association') {
        associationType = document.getElementById('associationType').value;
    }
    
    saveImportedQuizToDatabase(title, quizType, questionsText, associationType);
}

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

        let materialsHTML = '';
        
        if (importedQuizzes.length > 0) {
            materialsHTML += importedQuizzes.map(quiz => `
                <div class="material-card">
                    <div class="material-header">
                        <div class="material-icon">📚</div>
                        <div class="material-info">
                            <h3>${quiz.title}</h3>
                            <p>📝 Imported ${quiz.type.replace('-', ' ')} • ${quiz.questions.length} questions</p>
                        </div>
                    </div>
                    <div class="material-actions">
                        <button class="btn-start" onclick="startImportedQuiz('${quiz.id}')">Start Quiz</button>
                        <button class="btn-delete" onclick="deleteImportedQuiz('${quiz.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        }
        
        if (data.success && data.reviewers.length > 0) {
            materialsHTML += data.reviewers.map(reviewer => `
                <div class="material-card">
                    <div class="material-header">
                        <div class="material-icon">📄</div>
                        <div class="material-info">
                            <h3>${reviewer.fileName}</h3>
                            <p>📅 Exam: ${reviewer.examDate} • 💾 ${(reviewer.fileSize / 1024).toFixed(2)} KB</p>
                        </div>
                    </div>
                    <div class="material-actions">
                        <button class="btn-start" onclick="startQuiz('${reviewer.id}')">Start Quiz</button>
                        <button class="btn-delete" onclick="deleteReviewer('${reviewer.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        }
        
        if (materialsHTML) {
            listContainer.innerHTML = '<div class="materials-grid">' + materialsHTML + '</div>';
        } else {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📚</div>
                    <h3>No Materials Yet</h3>
                    <p>Upload your first study file or import a quiz to begin!</p>
                </div>
            `;
        }
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
    
    if (button.classList.contains('selected')) {
        button.classList.remove('selected');
        selectedQuizTypes = selectedQuizTypes.filter(t => t !== type);
    } else {
        button.classList.add('selected');
        selectedQuizTypes.push(type);
    }
    
    // Update counter
    const quizTypesContainer = document.querySelector('.quiz-types');
    quizTypesContainer.setAttribute('data-selected', selectedQuizTypes.length);
    
    // Show association dropdown if association is selected
    const modalAssociationGroup = document.getElementById('modalAssociationTypeGroup');
    if (selectedQuizTypes.includes('association')) {
        modalAssociationGroup.style.display = 'block';
    } else {
        modalAssociationGroup.style.display = 'none';
    }
}

// ===== START QUIZ =====
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
    document.getElementById('modalAssociationTypeGroup').style.display = 'none';
    
    openModal();
}

function openModal() {
    document.getElementById('quizModal').classList.add('active');
}

function closeModal() {
    document.getElementById('quizModal').classList.remove('active');
}

async function generateWithSettings() {
    if (selectedQuizTypes.length === 0) {
        showAlert('Please select at least one quiz type', 'error');
        return;
    }

    const count = document.getElementById('questionCount').value;
    const instructions = document.getElementById('specialInstructions').value.trim();
    
    let associationType = 'mix';
    if (selectedQuizTypes.includes('association')) {
        associationType = document.getElementById('modalAssociationType').value;
    }
    
    // Store types before clearing
    const typesToGenerate = [...selectedQuizTypes];
    
    const requestBody = {
        reviewerId: currentReviewerId,
        questionTypes: typesToGenerate,
        count: parseInt(count),
        specialInstructions: instructions,
        associationType: associationType
    };
    
    console.log('Sending request:', requestBody);
    
    closeModal();
    showQuizPage();

    const quizContent = document.getElementById('quizContent');
    const quizTitle = document.getElementById('quizTitle');

    quizContent.innerHTML = '<div class="loading"><div class="spinner"></div><p class="loading-text">Generating your quiz...</p></div>';
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
        console.log('Response:', data);

        if (data.success) {
            quizTitle.textContent = `Mixed Quiz (${typesToGenerate.join(', ')})`;
            displayQuestions(data.questions, typesToGenerate);
        } else {
            quizContent.innerHTML = `<p style="color: var(--error); text-align: center;">Failed to generate questions: ${data.error}</p>`;
        }
    } catch (error) {
        console.error('Request error:', error);
        quizContent.innerHTML = `<p style="color: var(--error); text-align: center;">Network error: ${error.message}</p>`;
    }
    
    // Clear after request is made
    selectedQuizTypes = [];
}

// ===== DISPLAY QUESTIONS (MIXED TYPES) =====
function displayQuestions(questionsText, questionTypes) {
    const quizContent = document.getElementById('quizContent');
    currentQuestions = [];
    
    if (questionTypes.includes('flashcard')) {
        displayFlashcards(questionsText);
        document.getElementById('submitBtn').style.display = 'none';
        return;
    } else if (questionTypes.includes('matching')) {
        displayMatchingType(questionsText);
        return;
    }
    
    const lines = questionsText.split('\n').filter(line => line.trim());
    let html = '';
    let questionNum = 1;
    
    for (let i = 0; i < lines.length; i++) {
        // Multiple choice or association
        if (lines[i].startsWith('Q:')) {
            const question = lines[i].substring(2).trim();
            let options = [];
            let correctAnswer = '';
            
            for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
                if (lines[j].match(/^[A-D]\)/)) {
                    options.push(lines[j]);
                }
                if (lines[j].startsWith('Correct:')) {
                    correctAnswer = lines[j].substring(8).trim();
                }
            }
            
            if (options.length > 0) {
                currentQuestions.push({ question, options, correctAnswer, type: 'multiple-choice' });
                
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
            }
        }
        // True/False
        else if (lines[i].startsWith('Statement:')) {
            const statement = lines[i].substring(10).trim();
            const answer = lines[i + 1] && lines[i + 1].startsWith('Answer:') ? lines[i + 1].substring(7).trim() : '';
            const explanation = lines[i + 2] && lines[i + 2].startsWith('Explanation:') ? lines[i + 2].substring(12).trim() : '';
            
            currentQuestions.push({ statement, answer, explanation, type: 'true-false' });
            
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
        }
        // Identification
        else if (lines[i].match(/Q:.*_____/) || (lines[i].startsWith('Q:') && !lines[i+1]?.match(/^[A-D]\)/))) {
            const question = lines[i].substring(2).trim();
            const answer = lines[i + 1] && lines[i + 1].startsWith('A:') ? lines[i + 1].substring(2).trim() : '';
            
            if (answer) {
                currentQuestions.push({ question, answer, type: 'identification' });
                
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
            }
        }
    }
    
    quizContent.innerHTML = html || '<p>No questions could be parsed.</p>';
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

// ===== SUBMIT QUIZ WITH AI CHECKING =====
async function submitQuiz() {
    const questions = document.querySelectorAll('.question-card');
    let correct = 0;
    let total = 0;
    
    showAlert('Checking answers with AI...', 'success');
    
    for (const [idx, question] of Array.from(questions).entries()) {
        total++;
        
        // Text input (identification)
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
        
        // Textarea (enumeration)
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
        
        // Multiple choice options
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
        summary.innerHTML = `
            <h2>Quiz Results</h2>
            <div class="score-display">${correct} / ${total}</div>
            <div class="percentage">${percentage}%</div>
            <p class="results-message">
                ${percentage >= 80 ? 'Excellent work! You have mastered this material!' : 
                  percentage >= 60 ? 'Good job! Review the explanations to improve further.' : 
                  'Keep studying! Check the explanations below for better understanding.'}
            </p>
        `;
        quizContent.insertBefore(summary, quizContent.firstChild);
        summary.scrollIntoView({ behavior: 'smooth' });
        
        document.getElementById('submitBtn').style.display = 'none';
        document.querySelectorAll('.explanation').forEach(exp => exp.classList.add('visible'));
        
        quizSubmitted = true;
        showChatbot();
    }
}

// ===== CHATBOT FUNCTIONALITY =====
function showChatbot() {
    const existingChatbot = document.getElementById('chatbotContainer');
    if (existingChatbot) {
        existingChatbot.style.display = 'flex';
    } else {
        createChatbot();
    }
}

function createChatbot() {
    const chatbotHTML = `
        <div id="chatbotContainer" class="chatbot-container">
            <div class="chatbot-header">
                <h3>💬 Study Assistant</h3>
                <button onclick="toggleChatbot()" class="chatbot-close">−</button>
            </div>
            <div id="chatbotMessages" class="chatbot-messages">
                <div class="bot-message">
                    Hi! I'm your study assistant. Ask me about any questions you got wrong or need clarification on!
                </div>
            </div>
            <div class="chatbot-input-area">
                <input type="text" id="chatbotInput" placeholder="Ask about a question..." onkeypress="if(event.key==='Enter') sendChatMessage()">
                <button onclick="sendChatMessage()" class="btn-send">Send</button>
            </div>
        </div>
    `;
    
    document.getElementById('quizPage').insertAdjacentHTML('beforeend', chatbotHTML);
}

async function sendChatMessage() {
    const input = document.getElementById('chatbotInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    addChatMessage(message, 'user');
    input.value = '';
    
    addChatMessage('Thinking...', 'bot-thinking');
    
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
        
        // Remove thinking message
        const thinkingMsg = document.querySelector('.bot-thinking');
        if (thinkingMsg) thinkingMsg.remove();
        
        if (data.success) {
            addChatMessage(data.response, 'bot');
        } else {
            addChatMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }
    } catch (error) {
        const thinkingMsg = document.querySelector('.bot-thinking');
        if (thinkingMsg) thinkingMsg.remove();
        addChatMessage('Sorry, I could not process your request.', 'bot');
    }
}

function addChatMessage(message, sender) {
    const messagesDiv = document.getElementById('chatbotMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = sender === 'user' ? 'user-message' : sender === 'bot-thinking' ? 'bot-message bot-thinking' : 'bot-message';
    messageDiv.textContent = message;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function toggleChatbot() {
    const chatbot = document.getElementById('chatbotContainer');
    if (chatbot.classList.contains('minimized')) {
        chatbot.classList.remove('minimized');
    } else {
        chatbot.classList.add('minimized');
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

// ===== MATCHING TYPE =====
function displayMatchingType(text) {
    const lines = text.split('\n').filter(line => line.trim());
    let column1 = [];
    let column2 = [];
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('|')) {
            const parts = lines[i].split('|').map(p => p.trim());
            if (parts.length === 2 && !parts[0].includes('Column')) {
                column1.push(parts[0]);
                column2.push(parts[1]);
            }
        }
    }
    
    const shuffled = [...column2].sort(() => Math.random() - 0.5);
    
    currentQuestions = column1.map((item, idx) => ({
        left: item,
        right: column2[idx],
        type: 'matching'
    }));
    
    matchedPairs = [];
    matchingSelections = { column1: null, column2: null };
    
    const html = `
        <div class="matching-container">
            <div class="matching-column">
                <h3>Column A</h3>
                ${column1.map((item, idx) => `
                    <div class="matching-item" data-col="1" data-idx="${idx}" onclick="selectMatching(this)">
                        ${item}
                    </div>
                `).join('')}
            </div>
            <div class="matching-column">
                <h3>Column B</h3>
                ${shuffled.map((item, idx) => `
                    <div class="matching-item" data-col="2" data-value="${item}" onclick="selectMatching(this)">
                        ${item}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.getElementById('quizContent').innerHTML = html;
}

function selectMatching(element) {
    const col = element.dataset.col;
    
    if (element.classList.contains('matched')) return;
    
    if (col === '1') {
        document.querySelectorAll('.matching-item[data-col="1"]').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        matchingSelections.column1 = element;
    } else {
        document.querySelectorAll('.matching-item[data-col="2"]').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        matchingSelections.column2 = element;
    }
    
    if (matchingSelections.column1 && matchingSelections.column2) {
        const idx = parseInt(matchingSelections.column1.dataset.idx);
        const selectedValue = matchingSelections.column2.dataset.value;
        const correctValue = currentQuestions[idx].right;
        
        if (selectedValue === correctValue) {
            matchingSelections.column1.classList.add('matched');
            matchingSelections.column2.classList.add('matched');
            matchingSelections.column1.classList.remove('selected');
            matchingSelections.column2.classList.remove('selected');
            matchedPairs.push({ left: idx, right: selectedValue });
            showAlert('Correct match!', 'success');
        } else {
            showAlert('Incorrect match. Try again!', 'error');
            matchingSelections.column1.classList.remove('selected');
            matchingSelections.column2.classList.remove('selected');
        }
        
        matchingSelections = { column1: null, column2: null };
        
        if (matchedPairs.length === currentQuestions.length) {
            setTimeout(() => {
                showAlert('All pairs matched correctly! Great job!', 'success');
                document.getElementById('submitBtn').style.display = 'none';
            }, 500);
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
    
    // bye chatbot
    const chatbot = document.getElementById('chatbotContainer');
    if (chatbot) {
        chatbot.remove();
    }
}