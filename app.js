// ==========================================================
// 1. AWS CONFIGURATION: REPLACE THESE PLACEHOLDERS
// ==========================================================
const awsConfig = {
    Auth: {
        region: 'us-east-2', // Your AWS Region (Ohio)
        userPoolId: 'us-east-2_oqwdFbFdN', // Your StudyCAPool ID
        userPoolWebClientId: '186msa18odo5mbg1rfr5sg0akv', // Your App Client ID
        oauth: {
            // Your Cognito Hosted UI Domain (e.g., [prefix].auth.[region].amazoncognito.com)
            domain: 'us-east-2oqwdfbfdn.auth.us-east-2.amazoncognito.com',
            scope: ['openid', 'email', 'profile'],
            // Ensures the user is redirected back to the current Amplify URL
            redirectSignIn: window.location.origin,
            redirectSignOut: window.location.origin,
            responseType: 'token' // Implicit flow for Single Page Apps (SPA)
        }
    }
};

const API_INVOKE_URL = 'https://qvtngqs05b.execute-api.us-east-2.amazonaws.com/prod/explain';

// ==========================================================
// 2. AUTHENTICATION & INITIALIZATION HANDLERS
// ==========================================================

// Function to handle the actual login button click
function handleLoginRedirect() {
    // This call redirects the user to the Cognito Hosted UI
    if (typeof Amplify !== 'undefined') {
        Amplify.Auth.federatedSignIn();
    } else {
        console.error('Amplify not initialized. Check CDN link.');
    }
}

// Signs the user out and clears the session
function handleLogout() {
    if (typeof Amplify !== 'undefined') {
        Amplify.Auth.signOut()
            .then(() => {
                // UI reset handled by checkUserStatus on redirect/reload
            })
            .catch(err => console.error('Sign out error', err));
    }
}

// Runs when the page loads to check authentication status
async function checkUserStatus() {
    try {
        // Use Amplify Auth methods that return current user/session
        const user = await Amplify.Auth.currentAuthenticatedUser();
        const session = await Amplify.Auth.fetchAuthSession(); 
        const idToken = session.tokens.idToken.toString();

        // Show application section
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');

        const displayName = (user.attributes && user.attributes.email) || user.username || 'User';
        document.getElementById('user-info').innerText = `Welcome, ${displayName}!`;

        // Set the global token variable for API calls
        window.ID_TOKEN = idToken;

    } catch (e) {
        // User is not signed in
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
}

// --- CRITICAL INITIALIZATION FIX ---
// Configure Amplify and check status only after the window has loaded
window.onload = function() {
    if (typeof Amplify !== 'undefined') {
        Amplify.configure(awsConfig); // Configure now that Amplify object is defined
        checkUserStatus();            // Check if the user is already logged in
    } else {
        console.error("Fatal Error: AWS Amplify library failed to load.");
        // Display a simple error to the user if the script failed to run
        document.getElementById('output').innerText = 'System initialization failed. Check your internet connection.';
    }
};

// ==========================================================
// 3. API CALL LOGIC (Remains the same as before)
// ==========================================================

async function submitExplanation() {
    const concept = document.getElementById('concept-input').value;
    const style = document.getElementById('style-input').value;
    const outputDiv = document.getElementById('output');

    outputDiv.innerText = 'Generating explanation...';

    if (!window.ID_TOKEN) {
        outputDiv.innerText = 'Error: Not authenticated. Please log in.';
        return;
    }

    try {
        const response = await fetch(API_INVOKE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // CRITICAL SECURITY HEADER: Using 'Bearer' for the token
                'Authorization': `Bearer ${window.ID_TOKEN}` 
            },
            body: JSON.stringify({ concept: concept, style: style })
        });

        const data = await response.json();

        if (response.status === 403) {
            outputDiv.innerHTML = `<strong style="color:red;">QUOTA EXCEEDED:</strong> ${data.message}`;
        } else if (response.ok) {
            outputDiv.innerText = data.explanation;
            if (data.remaining_free_uses !== undefined) {
                document.getElementById('usage-display').innerText = `Remaining Free Uses: ${data.remaining_free_uses}`;
            }
        } else {
            outputDiv.innerText = `API Error (${response.status}): ${data.message || 'Could not process request.'}`;
        }

    } catch (error) {
        outputDiv.innerText = 'Network connection failed. Check your console.';
        console.error('API call failed:', error);
    }
}