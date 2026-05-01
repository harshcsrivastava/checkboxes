import path from "node:path";
import http from "node:http";

// inbuilt ko upar, third party modules niche
import express from "express";
import { Server } from "socket.io";

import { redis, publisher, subscriber } from "./redis-connection.js";

const CHECKBOX_COUNT = 50;
const CHECKBOX_STATE_KEY = "checkbox-state";

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
            return res.json({checkboxes: remoteData})
        }
        return res.json({
            checkboxes: new Array(CHECKBOX_COUNT).fill(false)
        });
    });

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

main();
