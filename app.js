// ==========================================================
// 1. AWS CONFIGURATION (Your Verified IDS)
// ==========================================================
const awsConfig = {
    Auth: {
        region: 'us-east-2',
        userPoolId: 'us-east-2_oqwdFbFdN',
        userPoolWebClientId: '186msa18odo5mbg1rfr5sg0akv',
        oauth: {
            domain: 'us-east-2oqwdfbfdn.auth.us-east-2.amazoncognito.com',
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
    // Normalize common UMD shapes so returned object exposes .configure and .Auth
    // Try explicit globals first
    if (window.Amplify && typeof window.Amplify.configure === 'function' && window.Amplify.Auth) {
        return window.Amplify;
    }
    const wa = window.aws_amplify || window['aws_amplify'] || window['AWSAmplify'] || null;
    if (!wa) return null;
    // aws_amplify may expose Amplify or default or configure directly
    if (wa.Amplify && typeof wa.Amplify.configure === 'function' && wa.Amplify.Auth) return wa.Amplify;
    if (wa.default && typeof wa.default.configure === 'function' && wa.default.Auth) return wa.default;
    if (typeof wa.configure === 'function' && wa.Auth) return wa;
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

        // NOTE: removed blocking alert on page load. Validation still runs but only logs warnings.
        // This prevents the "Cannot start Hosted UI redirect..." popup appearing immediately.
        const cfgIssues = _validateAwsConfig();
        if (cfgIssues.length) {
            console.warn('Cognito config issues (will not block page load):\n' + cfgIssues.map((s,i) => `${i+1}. ${s}`).join('\n'));
            // Do not return here — allow page to load. Validation will run again when user clicks Log In.
        }

        // listen for Amplify Auth/Hub events so we can show clearer guidance for oauth errors
        if (Amp.Hub && typeof Amp.Hub.listen === 'function') {
            Amp.Hub.listen('auth', (data) => {
                const payload = data && data.payload ? data.payload : {};
                // hosted UI returns errors in payload.data (e.g. { error: 'unauthorized_client', error_description: '...' })
                if (payload.event === 'cognitoHostedUI' && payload.data && payload.data.error) {
                    console.error('OAuth error from Hosted UI:', payload.data);

                    // Specific handling for unauthorized_client to give actionable steps
                    if (String(payload.data.error).toLowerCase() === 'unauthorized_client') {
                        alert(
                            'OAuth error: unauthorized_client\n\n' +
                            'Likely causes and fixes:\n' +
                            '1) In Cognito Console → App client settings, enable the OAuth flow that matches awsConfig.Auth.oauth.responseType:\n' +
                            (awsConfig.Auth.oauth.responseType === 'token' ? '   - Enable "Implicit grant"\n' : '   - Enable "Authorization code grant"\n') +
                            '2) Ensure the Callback URL(s) (Redirect URIs) include this origin: ' + window.location.origin + '\n' +
                            '3) Ensure the App client does NOT require a client secret for browser-based (implicit) flows. If it has a secret, use server-side code exchange or create a client without secret.\n' +
                            '4) Confirm Allowed OAuth Scopes include openid (and email/profile if needed).\n\n' +
                            'Open the Cognito App client settings and fix the configuration, then retry.'
                        );
                        return;
                    }

                    // Generic message for other hosted UI errors
                    alert('OAuth error from Cognito Hosted UI: ' + (payload.data.error_description || payload.data.error) +
                          '\n\nCommon causes: app client not enabled for the selected OAuth flow, redirect URI mismatch, or client secret required for this client. Check the Cognito App client and Hosted UI settings.');
                }
                // generic failure events
                if (String(payload.event || '').toLowerCase().includes('failure')) {
                    console.error('Auth failure event:', payload);
                    // show less verbose message to user
                    alert('Authentication failed. See console for details.');
                }
            });
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
    const Amp = window.__AMPLIFY_INSTANCE__ || _detectAmplifyGlobal();

    // run quick validation and abort with a clear message if config looks wrong
    const cfgIssues = _validateAwsConfig();
    if (cfgIssues.length) {
        const msg = 'Cannot start Hosted UI redirect. Fix configuration first:\n' + cfgIssues.map((s,i) => `${i+1}. ${s}`).join('\n');
        console.error(msg);
        alert(msg);
        return;
    }

    if (Amp && Amp.Auth && typeof Amp.Auth.federatedSignIn === 'function') {
        Amp.Auth.federatedSignIn();
    } else {
        console.error('Amplify.Auth.federatedSignIn is not available.');
        alert('Authentication not available. See console for details.');
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
    const Amp = window.__AMPLIFY_INSTANCE__ || _detectAmplifyGlobal();
    if (!Amp || !Amp.Auth) {
        console.warn('checkUserStatus invoked but Amplify.Auth is not available.');
        return;
    }

    try {
        const user = await Amp.Auth.currentAuthenticatedUser();
        const session = await Amp.Auth.currentSession();
        const idToken = session.getIdToken().getJwtToken();

        // UI Updates
        const authSection = document.getElementById('auth-section');
        const appSection = document.getElementById('app-section');
        if (authSection) authSection.classList.add('hidden');
        if (appSection) appSection.classList.remove('hidden');

        const displayName = (user.attributes && user.attributes.email) || user.username || 'User';
        const userInfoEl = document.getElementById('user-info');
        if (userInfoEl) userInfoEl.innerText = `Welcome, ${displayName}!`;

        window.ID_TOKEN = idToken;

    } catch (e) {
        const authSection = document.getElementById('auth-section');
        const appSection = document.getElementById('app-section');
        if (authSection) authSection.classList.remove('hidden');
        if (appSection) appSection.classList.add('hidden');
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

// quick validation for common Cognito Hosted UI misconfigurations
function _validateAwsConfig() {
    const issues = [];
    const cfg = awsConfig && awsConfig.Auth && awsConfig.Auth.oauth;
    const domain = cfg && cfg.domain ? String(cfg.domain).trim() : '';
    const clientId = awsConfig && awsConfig.Auth && awsConfig.Auth.userPoolWebClientId;
    const redirect = cfg && cfg.redirectSignIn;
    const responseType = cfg && cfg.responseType;

    if (!clientId) issues.push('Missing awsConfig.Auth.userPoolWebClientId (App client ID).');
    if (!domain || domain.includes('REPLACE_WITH') || domain.startsWith('your-') || domain.indexOf('amazoncognito.com') === -1) {
        issues.push('Hosted UI domain looks incorrect. Set awsConfig.Auth.oauth.domain to your Cognito hosted UI hostname (no https://).');
    }
    if (!redirect || redirect !== window.location.origin) {
        issues.push(`Redirect URI mismatch. awsConfig.Auth.oauth.redirectSignIn should match the app origin: ${window.location.origin}`);
    }
    if (!responseType || (responseType !== 'token' && responseType !== 'code')) {
        issues.push('oauth.responseType should be "token" (implicit) or "code" (authorization code).');
    } else {
        // Add guidance tied to chosen responseType
        if (responseType === 'token') {
            issues.push('Using responseType "token" (implicit). Ensure the App client is enabled for "Implicit grant" and does NOT have a client secret (browser JS cannot use clients with secret).');
        } else if (responseType === 'code') {
            issues.push('Using responseType "code" (authorization code). Ensure the App client is enabled for "Authorization code grant" and the Callback URL is configured; server-side code is required to exchange the code for tokens if the client uses a secret.');
        }
    }
    return issues;
}