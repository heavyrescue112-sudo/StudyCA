// ==========================================================
// 1. AWS CONFIGURATION (Your Verified IDS)
// ==========================================================
const awsConfig = {
    Auth: {
        region: 'us-east-2', 
        userPoolId: 'us-east-2_oqwdFbFdN', 
        userPoolWebClientId: '186msa18odo5mbg1rfr5sg0akv', 
        oauth: {
            domain: 'us-east-2oqwdfbfdn.auth.us-east-2.amazoncognito.com', // MUST be the correct hostname
            scope: ['openid', 'email', 'profile'],
            redirectSignIn: window.location.origin,
            redirectSignOut: window.location.origin,
            responseType: 'token' 
        }
    }
};

const API_INVOKE_URL = 'https://qvtngqs05b.execute-api.us-east-2.amazonaws.com/prod/explain';

// ==========================================================
// 2. ROBUST INITIALIZATION: WAIT FOR Amplify GLOBAL (with timeout)
// ==========================================================
function _detectAmplifyGlobal() {
    // try common globals and normalize to an object that has configure()
    const g = window.Amplify || window.aws_amplify || window['aws_amplify'] || window['AWSAmplify'] || null;
    if (!g) return null;
    if (g.Amplify && typeof g.Amplify.configure === 'function') return g.Amplify;
    if (g.default && typeof g.default.configure === 'function') return g.default;
    if (typeof g.configure === 'function') return g;
    return null;
}

function _waitForAmplify(timeoutMs = 5000, pollMs = 100) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function poll() {
            const Amp = _detectAmplifyGlobal();
            if (Amp && Amp.Auth) return resolve(Amp);
            if (Date.now() - start >= timeoutMs) return reject(new Error('Amplify global not found within timeout'));
            setTimeout(poll, pollMs);
        })();
    });
}

_waitForAmplify(5000, 100)
    .then((Amp) => {
        // cache normalized instance; make available as window.Amplify for existing code
        window.__AMPLIFY_INSTANCE__ = Amp;
        window.Amplify = Amp;
        try {
            Amp.configure(awsConfig);
        } catch (e) {
            console.error('Amplify.configure failed:', e);
            const out = document.getElementById('output');
            if (out) out.innerText = 'Amplify configuration failed. See console.';
            return;
        }
        if (typeof checkUserStatus === 'function') checkUserStatus();
    })
    .catch((err) => {
        console.error('Fatal Error: AWS Amplify library failed to load or is undefined.', err);
        const out = document.getElementById('output');
        if (out) out.innerText = 'System initialization failed. Check browser console and Network tab for the Amplify script.';
    });

// ==========================================================
// 3. AUTHENTICATION HANDLERS
// ==========================================================

// Redirects user to the Cognito Hosted UI
function handleLoginRedirect() {
    // This call is now guaranteed to run after Amplify.configure()
    if (typeof Amplify !== 'undefined') {
        Amplify.Auth.federatedSignIn();
    } 
}

// Signs the user out and clears the session
function handleLogout() {
    if (typeof Amplify !== 'undefined') {
        Amplify.Auth.signOut()
            .then(() => {
                 window.location.reload(); 
            })
            .catch(err => console.error('Sign out error', err));
    }
}

// Runs when the page loads to check authentication status
async function checkUserStatus() {
    try {
        const user = await Amplify.Auth.currentAuthenticatedUser();
        const session = await Amplify.Auth.fetchAuthSession(); 
        const idToken = session.tokens.idToken.toString();

        // UI Updates
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');

        const displayName = (user.attributes && user.attributes.email) || user.username || 'User';
        document.getElementById('user-info').innerText = `Welcome, ${displayName}!`;

        // Set the global token variable
        window.ID_TOKEN = idToken;

    } catch (e) {
        // User is not signed in or session is invalid
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
}

// ==========================================================
// 4. API CALL LOGIC 
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