import { Router } from "express";
import * as AuthController from "./auth.controller.js";

const router = Router();

router.get("/health", AuthController.health);

// Existing OIDC login (keeps prior behavior)
router.get("/login", (req, res) => {
    const clientId = process.env.OIDC_CLIENT_ID;
    const redirectUri = encodeURIComponent(
        `http://localhost:${process.env.CLIENT_SERVER_PORT}/auth/callback`,
    );
    const scope = encodeURIComponent("email profile");

    res.redirect(
        `http://localhost:${process.env.AUTH_SERVER_PORT}/o/authenticate?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`,
    );
});

// Simple logout endpoint
router.post("/logout", AuthController.logout);

// Session user info (for frontend)
router.get("/me", AuthController.me);

// OIDC callback token exchange
router.get("/callback", AuthController.callback);

router.get("/user-info", AuthController.userInfo);

export default router;
