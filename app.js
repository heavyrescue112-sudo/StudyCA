// ==========================================================
// 1. AWS CONFIGURATION: REPLACE THESE PLACEHOLDERS
// ==========================================================
const awsConfig = {
    Auth: {
        region: 'us-east-2', // e.g., 'us-east-2'
        userPoolId: 'us-east-2_oqwdFbFdN', // e.g., 'us-east-2_XXXXXXX' (StudyCAPool ID)
        userPoolWebClientId: '186msa18odo5mbg1rfr5sg0akv', // App Client ID from Cognito
        oauth: {
            domain: 'https://us-east-2oqwdfbfdn.auth.us-east-2.amazoncognito.com', // e.g., study-ai-companion.auth.us-east-2.amazoncognito.com
            scope: ['email', 'openid'],
            redirectSignIn: window.location.origin, // Redirects back to the current Amplify URL
            redirectSignOut: window.location.origin, // Redirects back to the current Amplify URL
            responseType: 'token' // Used for implicit flow (easiest for SPA)
        }
    }
};

const API_INVOKE_URL = 'https://qvtngqs05b.execute-api.us-east-2.amazonaws.com/prod/explain'; // e.g., https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com/prod/explain

// Initialize Amplify with your config
Amplify.configure(awsConfig);

// ==========================================================
// 2. AUTHENTICATION HANDLERS
// ==========================================================

// Redirects user to the Cognito Hosted UI
function handleLoginRedirect() {
    Amplify.Auth.signInWithRedirect();
}

// Signs the user out and clears the session
function handleLogout() {
    Amplify.Auth.signOut();
}

// Runs when the page loads to check if the user is signed in
async function checkUserStatus() {
    try {
        // Gets the current session and token
        const user = await Amplify.Auth.getCurrentUser(); 
        const session = await Amplify.Auth.fetchAuthSession();
        const idToken = session.tokens.idToken.toString();
        
        // Show application section
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        document.getElementById('user-info').innerText = `Welcome, ${user.signInDetails.loginId}!`;
        
        // Set the global token variable for API calls
        window.ID_TOKEN = idToken; 

    } catch (e) {
        // User is not signed in
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
}

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
                // CRITICAL SECURITY HEADER: Token proved by Cognito
                'Authorization': window.ID_TOKEN 
            },
            body: JSON.stringify({ concept: concept, style: style })
        });

        const data = await response.json();
        
        if (response.status === 403) {
            outputDiv.innerHTML = `<strong style="color:red;">QUOTA EXCEEDED:</strong> ${data.message}`;
        } else if (response.ok) {
            outputDiv.innerText = data.explanation; 
            document.getElementById('usage-display').innerText = `Remaining Free Uses: ${data.remaining_free_uses}`;
        } else {
            outputDiv.innerText = `API Error (${response.status}): Could not process request.`;
        }

    } catch (error) {
        outputDiv.innerText = 'Network connection failed. Check your console.';
        console.error('API call failed:', error);
    }
}

// Check auth status when the page loads
window.onload = checkUserStatus;