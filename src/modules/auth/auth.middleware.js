import jwt from "jsonwebtoken";

const OIDC_ISSUER = `http://localhost:${process.env.AUTH_SERVER_PORT}`;
const JWKS_URI = `${OIDC_ISSUER}/.well-known/jwks.json`;

async function fetchJwksKey(kid) {
    const response = await fetch(JWKS_URI);
    const { keys } = await response.json();

    const jwk = keys.find((key) => key.kid === kid);
    if (!jwk) throw new Error("JWK not found");

    return jwk;
}

async function verifyAccessToken(token) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid)
        throw new Error("Missing kid");

    const jwk = await fetchJwksKey(decoded.header.kid);

    return jwt.verify(token, jwk, {
        algorithms: ["RS256"],
        issuer: OIDC_ISSUER,
    });
}

export async function requireAuth(req, res, next) {
    if (req.session && (req.session.userId || req.session.user)) {
        return next();
    }

    const accessToken = req.session ? req.session.accessToken : null;
    const refreshToken = req.session ? req.session.refreshToken : null;

    if (!accessToken && !refreshToken) {
        return res.redirect("/auth/login");
    }

    if (accessToken) {
        try {
            await verifyAccessToken(accessToken);
            return next();
        } catch (error) {
            if (!error || error.name !== "TokenExpiredError") {
                if (req.session) req.session.destroy(() => {});
                return res.redirect("/auth/login");
            }
        }
    }

    if (!refreshToken) {
        if (req.session) req.session.destroy(() => {});
        return res.redirect("/auth/login");
    }

    const tokenResponse = await fetch(`${OIDC_ISSUER}/o/tokeninfo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: process.env.OIDC_CLIENT_ID,
            client_secret: process.env.OIDC_CLIENT_SECRET,
        }),
    });

    if (!tokenResponse.ok) {
        if (req.session) req.session.destroy(() => {});
        return res.redirect("/auth/login");
    }

    const tokens = await tokenResponse.json();

    if (req.session) {
        req.session.accessToken = tokens.access_token;
        req.session.accessTokenExpiresAt =
            Date.now() + tokens.expires_in * 1000;
    }
    return next();
}
