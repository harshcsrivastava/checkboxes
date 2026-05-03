// Auth service: business logic for OIDC token exchange

export async function logout(req) {
    return new Promise((resolve) => {
        if (!req.session) return resolve();
        req.session.destroy(() => {
            resolve();
        });
    });
}

export function getMe(req) {
    return req.session && req.session.user ? req.session.user : null;
}

export async function exchangeAuthCode(req, code) {
    const tokenRes = await fetch(
        `http://localhost:${process.env.AUTH_SERVER_PORT}/o/tokeninfo`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "authorization_code",
                code,
                client_id: process.env.OIDC_CLIENT_ID,
                client_secret: process.env.OIDC_CLIENT_SECRET,
                redirect_uri: `http://localhost:${process.env.CLIENT_SERVER_PORT}/auth/callback`,
            }),
        },
    );

    if (!tokenRes.ok) {
        const payload = await tokenRes.text();
        const err = new Error("Token exchange failed: " + payload);
        err.status = tokenRes.status;
        throw err;
    }

    const tokens = await tokenRes.json();
    if (req.session) {
        req.session.accessToken = tokens.access_token;
        req.session.refreshToken = tokens.refresh_token;
    }

    const userInfo = await fetchUserInfo(req);
    if (req.session) {
        req.session.user = userInfo || { authenticated: true };
        req.session.userId =
            userInfo?.sub ||
            userInfo?.email ||
            userInfo?.preferred_username ||
            "oidc-user";
    }
    return tokens;
}

export async function fetchUserInfo(req) {
    const accessToken = req.session && req.session.accessToken;
    if (!accessToken) return null;

    const userRes = await fetch(
        `http://localhost:${process.env.AUTH_SERVER_PORT}/o/userinfo`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );

    if (!userRes.ok) return null;
    return await userRes.json();
}
