// ==========================================================
// 1. AWS CONFIGURATION: REPLACE THESE PLACEHOLDERS
// ==========================================================
const awsConfig = {
    Auth: {
        region: 'us-east-2', // e.g., 'us-east-2'
        userPoolId: 'us-east-2_oqwdFbFdN', // e.g., 'us-east-2_XXXXXXX' (StudyCAPool ID)
        userPoolWebClientId: '186msa18odo5mbg1rfr5sg0akv', // App Client ID from Cognito
        oauth: {
            // IMPORTANT: domain must be the hosted UI domain hostname only (no https://)
            // e.g. 'study-ai-companion.auth.us-east-2.amazoncognito.com'
            domain: 'us-east-2oqwdfbfdn.auth.us-east-2.amazoncognito.com',
            scope: ['openid', 'email', 'profile'],
            redirectSignIn: window.location.origin,
            redirectSignOut: window.location.origin,
            responseType: 'token' // implicit flow for SPA
        }
    }
};

const API_INVOKE_URL = 'https://qvtngqs05b.execute-api.us-east-2.amazonaws.com/prod/explain';

// Ensure Amplify (and Auth) is available (either via the full aws-amplify bundle or imports)
if (typeof Amplify === 'undefined' || !Amplify.Auth) {
    console.error('Amplify.Auth is not available. Include the full aws-amplify bundle (with Auth) before app.js.');
}
// Initialize Amplify with your config
Amplify.configure(awsConfig);
// ==========================================================
// 2. AUTHENTICATION HANDLERS
// ==========================================================

// Redirects user to the Cognito Hosted UI
function handleLoginRedirect() {
    // Use hosted UI redirect via Amplify Auth
    if (Amplify && Amplify.Auth && typeof Amplify.Auth.federatedSignIn === 'function') {
        Amplify.Auth.federatedSignIn();
    } else {
        console.error('Amplify.Auth.federatedSignIn is not available.');
    }
}

// Signs the user out and clears the session
function handleLogout() {
    if (Amplify && Amplify.Auth && typeof Amplify.Auth.signOut === 'function') {
        Amplify.Auth.signOut()
            .then(() => {
                // Reset UI
                document.getElementById('auth-section').classList.remove('hidden');
                document.getElementById('app-section').classList.add('hidden');
            })
            .catch(err => console.error('Sign out error', err));
    } else {
        console.error('Amplify.Auth.signOut is not available.');
    }
}

// Runs when the page loads to check if the user is signed in
async function checkUserStatus() {
    try {
        // Use Amplify Auth methods that return current user/session
        const user = await Amplify.Auth.currentAuthenticatedUser();
        const session = await Amplify.Auth.currentSession();
        // Get JWT token from session
        const idToken = session.getIdToken().getJwtToken();

        // Show application section
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');

        // Safely choose a display name (username or email)
        const displayName = user.username || (user.attributes && user.attributes.email) || 'User';
        document.getElementById('user-info').innerText = `Welcome, ${displayName}!`;

        // Set the global token variable for API calls (use Bearer when sending to API)
        window.ID_TOKEN = idToken;

    } catch (e) {
        // User is not signed in
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
}
// ...existing code...
// ==========================================================
// 3. API CALL LOGIC
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
                // Use Bearer convention unless your backend expects raw token without prefix
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

// Check auth status when the page loads
window.onload = checkUserStatus;
