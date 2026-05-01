import path from "node:path";
import http from "node:http";

// inbuilt ko upar, third party modules niche
import express from "express";
import { Server } from "socket.io";

import { redis, publisher, subscriber } from "./redis-connection.js";
import { error } from "node:console";

const CHECKBOX_COUNT = 1000;
const CHECKBOX_STATE_KEY = "checkbox-state-v3";

const rateLimitingHashMap = new Map();

async function main() {
    const PORT = process.env.PORT ?? 9000;

    const app = express();
    const server = http.createServer(app);

    const io = new Server();
    io.attach(server);

    await subscriber.subscribe("internal-server:checkbox:change"); // is channel ko subscribe kiya
    subscriber.on("message", (channel, message) => {
        if (channel === "internal-server:checkbox:change") {
            const { index, checked } = JSON.parse(message);
            // state.checkbox[index] = checked; //updating state
            io.emit("server:checkbox:change", { index, checked });

            //problem ye thi jo baad me join karega vapas usme state nhi rahegi, therefor state ko bhi publish krdo on redis
            // Make redis single-source of TRUTH
            // so set the data in redis using GET and SET
        }
    });

    // SOCKET IO HANDLER
    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on("client:checkbox:change", async (data) => {
            //user.sub : user id pe lagate hai OIDC pe
            const lastOperationTime = await redis.get(`rate-limit:${socket.id}`)

            if (lastOperationTime) {
                const timeElapsed = Date.now() - lastOperationTime;
                if (timeElapsed < 5.5 * 1000) {
                    socket.emit("server:error", {
                        error: `Wait for few seconds.`,
                    });
                    // update hoga still although prevent message kr rhe, and ek baar refresh hone ke baad dubara error nhi dikhayega
                    // we have to give a cooldown

                    return;
                }
            }
            await redis.set(`rate-limit:${socket.id}`, Date.now());

            const existingState = await redis.get(CHECKBOX_STATE_KEY);

            if (existingState) {
                const remoteData = JSON.parse(existingState);
                remoteData[data.index] = data.checked;
                await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteData));
            } else {
                await redis.set(
                    CHECKBOX_STATE_KEY,
                    JSON.stringify(new Array(CHECKBOX_COUNT).fill(false)),
                );
            }

            // user kuch bhi batayega to use REDIS ko batao rathher than emiting, forward it to redis
            // publish kar diya
            publisher.publish(
                "internal-server:checkbox:change",
                JSON.stringify(data),
            );
        });
    });

    // EXPRESS
    app.use(express.static(path.resolve("./public")));

    app.get("/health", (req, res) => {
        return res.json({ message: "Still Alive" });
    });

    app.get("/checkbox", async (req, res) => {
        const existingState = await redis.get(CHECKBOX_STATE_KEY);
        if (existingState) {
            const remoteData = JSON.parse(existingState);
            return res.json({ checkboxes: remoteData });
        }
        return res.json({
            checkboxes: new Array(CHECKBOX_COUNT).fill(false),
        });
    });

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

main();
