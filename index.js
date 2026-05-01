import path from "node:path";
import http from "node:http";

// inbuilt ko upar, third party modules niche
import express from "express";
import { Server } from "socket.io";

const CHECKBOX_COUNT = 100;

const state = {
    checkbox: new Array(CHECKBOX_COUNT).fill(false),
};
async function main() {
    const PORT = process.env.PORT ?? 9000;

    const app = express();
    const server = http.createServer(app);

    const io = new Server();
    io.attach(server);

    // SOCKET IO HANDLER
    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on("client:checkbox:change", (data) => {
            console.log(data);
            io.emit("server:checkbox:change", data);
            //updating server state after refresh
            state.checkbox[data.index] = data.checked;
        });
    });

    // EXPRESS
    app.use(express.static(path.resolve("./public")));

    app.get("/health", (req, res) => {
        return res.json({ message: "Still Alive" });
    });

    app.get("/checkbox", (req, res) => {
        return res.json({
            checkboxes: state.checkbox,
        });
    });

    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

main();
