import "express-session";

declare module "express-session" {
    interface SessionData {
        userId?: string;
        oauthState?: string;
        accessToken?: string;
        refresh_token?: string;
        accessTokenExpiresAt?: number;
    }
}
