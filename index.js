import path from "node:path";
import http from "node:http";

// inbuilt ko upar, third party modules niche
import express from "express";
import { Server } from "socket.io";
import "dotenv/config";
import session from "express-session";

import { redis, publisher, subscriber } from "./redis-connection.js";
import { error } from "node:console";

import authRoute from "./src/modules/auth/auth.route.js";
import { requireAuth } from "./src/modules/auth/auth.middleware.js";
import ApiError from "./src/utils/api-error.js";

const CHECKBOX_COUNT = 1000;
const CHECKBOX_STATE_KEY = "checkbox-state-v3";
const CHECKED_COUNT_KEY = "checked-count-v3";
const INTERACTIONS_KEY = "interactions-count";

async function getCheckboxState() {
    const existingState = await redis.get(CHECKBOX_STATE_KEY);
    if (existingState) {
        return JSON.parse(existingState);
    }

    const initialState = new Array(CHECKBOX_COUNT).fill(false);
    await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(initialState));
    await redis.set(CHECKED_COUNT_KEY, "0");
    return initialState;
}

async function getCheckboxSnapshot() {
    const checkboxes = await getCheckboxState();
    const interactions = parseInt((await redis.get(INTERACTIONS_KEY)) || "0");
    const checkedCountRaw = await redis.get(CHECKED_COUNT_KEY);
    const checkedCount =
        checkedCountRaw === null
            ? checkboxes.filter(Boolean).length
            : parseInt(checkedCountRaw, 10);

    if (checkedCountRaw === null) {
        await redis.set(CHECKED_COUNT_KEY, String(checkedCount));
    }

    return {
        checkboxes,
        total: checkboxes.length,
        checkedCount,
        uncheckedCount: checkboxes.length - checkedCount,
        interactions,
    };
}

async function main() {
    const PORT = process.env.PORT ?? process.env.CLIENT_SERVER_PORT ?? 7777;

    const app = express();
    const server = http.createServer(app);

    const io = new Server();
    io.attach(server);

    await subscriber.subscribe("internal-server:checkbox:change"); // is channel ko subscribe kiya
    subscriber.on("message", (channel, message) => {
        if (channel === "internal-server:checkbox:change") {
            const payload = JSON.parse(message);
            // state.checkbox[index] = checked; //updating state
            io.emit("server:checkbox:change", payload);

            //problem ye thi jo baad me join karega vapas usme state nhi rahegi, therefor state ko bhi publish krdo on redis
            // Make redis single-source of TRUTH
            // so set the data in redis using GET and SET
        }
    });

    // SOCKET IO HANDLER
    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on("client:checkbox:change", async (data, ack) => {
            //user.sub : user id pe lagate hai OIDC pe
            const lastOperationTime = await redis.get(
                `rate-limit:${socket.id}`,
            );

            if (lastOperationTime) {
                const timeElapsed = Date.now() - lastOperationTime;
                if (timeElapsed < 2.5 * 1000) {
                    if (typeof ack === "function") {
                        ack({
                            accepted: false,
                            error: "Wait for few seconds.",
                        });
                    }
                    // update hoga still although prevent message kr rhe, and ek baar refresh hone ke baad dubara error nhi dikhayega
                    // we have to give a cooldown

                    return;
                }
            }
            await redis.set(`rate-limit:${socket.id}`, Date.now());

            const remoteData = await getCheckboxState();
            const previousValue = Boolean(remoteData[data.index]);
            remoteData[data.index] = data.checked;
            await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteData));

            const checkedCountRaw = await redis.get(CHECKED_COUNT_KEY);
            const checkedCount =
                checkedCountRaw === null
                    ? remoteData.filter(Boolean).length
                    : (() => {
                          const nextCount = parseInt(checkedCountRaw, 10);
                          if (!previousValue && data.checked)
                              return nextCount + 1;
                          if (previousValue && !data.checked)
                              return nextCount - 1;
                          return nextCount;
                      })();

            await redis.set(CHECKED_COUNT_KEY, String(checkedCount));

            // Increment interactions count in Redis
            const interactions = await redis.incr(INTERACTIONS_KEY);

            const snapshot = {
                index: data.index,
                checked: data.checked,
                total: remoteData.length,
                checkedCount,
                uncheckedCount: remoteData.length - checkedCount,
                interactions,
            };

            // user kuch bhi batayega to use REDIS ko batao rathher than emiting, forward it to redis
            // publish kar diya
            publisher.publish(
                "internal-server:checkbox:change",
                JSON.stringify(snapshot),
            );

            if (typeof ack === "function") {
                ack({
                    accepted: true,
                    snapshot,
                });
            }
        });
    });

    // EXPRESS
    app.use(
        session({
            secret: process.env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
            },
        }),
    );

    // Protect root route and serve index after auth
    app.get("/", requireAuth, (req, res) => {
        return res.sendFile(path.resolve("./public/index.html"));
    });

    app.use(express.static(path.resolve("./public")));
    app.get("/health", (req, res) => {
        return res.json({ message: "Still Alive" });
    });

    app.get("/checkbox", async (req, res) => {
        const snapshot = await getCheckboxSnapshot();
        return res.json(snapshot);
    });

    app.use("/auth", authRoute);
    // Global Error Handler
    app.use((err, req, res, next) => {
        if (err instanceof ApiError) {
            return res.status(err.statusCode).json({
                success: false,
                message: err.message,
                statusCode: err.statusCode,
            });
        }

        // Unexpected error
        console.error("Unexpected error:", err);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            statusCode: 500,
        });
    });
    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(
                `Port ${PORT} is already in use. Stop the existing process or set a different PORT.`,
            );
            process.exit(1);
        }

        throw err;
    });

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

main();
