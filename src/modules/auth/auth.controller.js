import ApiResponse from "../../utils/api-response.js";
import * as AuthService from "./auth.service.js";

export function health(req, res) {
    return ApiResponse.ok(res, "Auth Up and Running");
}

export async function logout(req, res) {
    await AuthService.logout(req);
    res.clearCookie("connect.sid");
    return res.redirect("/login");
}

export async function me(req, res) {
    const user = AuthService.getMe(req);
    return res.json({ user });
}

export async function callback(req, res) {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: "No auth code" });

    try {
        await AuthService.exchangeAuthCode(req, code);
        return res.redirect("/");
    } catch (err) {
        return res.status(500).json({ error: "Token exchange failed" });
    }
}

export async function userInfo(req, res) {
    const user = await AuthService.fetchUserInfo(req);
    if (!user) return res.status(401).json({ error: "No user" });
    return res.json(user);
}
